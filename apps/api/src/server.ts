// API logic with real Auth/RBAC and Postgres via Prisma

import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { authMiddleware, roleGuard } from './auth.js';
import { checkEligibility, normalizeCode, shingles, jaccardSimilarity } from '@signal/shared';
import { mockExecute } from './execution.js';

// Load env vars from .env (needed for tests that don't set them)
try {
  await import('dotenv/config');
} catch {}

// Validate Database URLs
const dbUrl = process.env.DATABASE_URL;
const dbUrlTest = process.env.DATABASE_URL_TEST;

// Remote database guard: reject non-local hosts unless ALLOW_REMOTE_DB=true
if (dbUrl && dbUrl.includes('supabase.com') && !process.env.ALLOW_REMOTE_DB) {
  console.error('FATAL: Remote Supabase database not allowed. Set ALLOW_REMOTE_DB=true to override.');
  process.exit(1);
}
if (dbUrl && !dbUrl.includes('127.0.0.1') && !dbUrl.includes('localhost') && !process.env.ALLOW_REMOTE_DB) {
  console.error('FATAL: Non-local database not allowed. Set ALLOW_REMOTE_DB=true to override.');
  process.exit(1);
}

if (!dbUrl || !dbUrlTest || dbUrl === dbUrlTest) {
  console.error('FATAL: DATABASE_URL and DATABASE_URL_TEST must be set and different');
  process.exit(1);
}

if (process.env.DEV_RETURN_VERIFICATION_TOKEN === 'true' && process.env.NODE_ENV === 'production') {
  console.error('FATAL: DEV_RETURN_VERIFICATION_TOKEN cannot be true in production');
  process.exit(1);
}

// Validate JWT_SECRET once per process import (tests that don't set it will get a clear error)
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  console.error('FATAL: JWT_SECRET must be set and >= 32 chars');
  process.exit(1);
}

/**
 * Build and return a Fastify app wired to the given PrismaClient.
 * Exported so integration tests can inject a test-db client.
 */
export function createApp(prisma: PrismaClient): FastifyInstance {
  const app = Fastify({ logger: true });

  app.register(cors, { origin: process.env.WEB_ORIGIN || 'http://localhost:5173', credentials: true });
  app.register(cookie);
  app.register(jwt, { secret: jwtSecret, sign: { expiresIn: '1h' }, cookie: { cookieName: 'token', signed: false } });

  // ── Auth routes ────────────────────────────────────────────────────────────

  // Register company (creates company + admin user + verification token)
  app.post('/api/auth/register-company', async (req, reply) => {
    const { name, domain, contactEmail, password, industry, studentsToHire, dataTermsAgreed } = req.body as any;
    if (!name || !domain || !contactEmail || !password) {
      return reply.status(400).send({ error: 'Missing required fields' });
    }

    const hash = await argon2.hash(password);

    // Check company domain not already taken
    const existing = await prisma.company.findUnique({ where: { domain } });
    if (existing) {
      return reply.status(409).send({ error: 'Domain already registered' });
    }

    // Create company with member + user in one transaction
    const company = await prisma.company.create({
      data: {
        name,
        domain,
        industry: industry || '',
        contactEmail,
        studentsToHire: studentsToHire || 0,
        dataTermsAgreed: dataTermsAgreed !== false, // default true
        members: {
          create: {
            role: 'company_admin',
            user: {
              create: {
                email: contactEmail,
                passwordHash: hash,
                name: name + ' Admin',
                role: 'company_admin',
              },
            },
          },
        },
      },
    });

    // Generate verification token
    const tokenStr = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await prisma.companyVerificationToken.create({
      data: {
        companyId: company.id,
        token: tokenStr,
        expiresAt,
      },
    });

    // Print link to console for dev
    console.log(`[Verification] Visit: http://localhost:3001/api/auth/verify-company?token=${tokenStr}`);

    const response: any = { id: company.id, name: company.name, verified: company.verified, verificationStatus: company.verificationStatus };
    if (process.env.DEV_RETURN_VERIFICATION_TOKEN === 'true') {
      response.token = tokenStr;
    }

    return reply.send(response);
  });

  // Verify company by token
  app.get('/api/auth/verify-company', async (req, reply) => {
    const { token } = req.query as any;
    if (!token) {
      return reply.status(400).send({ error: 'Missing token' });
    }

    const companyToken = await prisma.companyVerificationToken.findUnique({
      where: { token },
      include: { company: true },
    });

    if (!companyToken || companyToken.used) {
      return reply.status(404).send({ error: 'Invalid or expired token' });
    }

    if (companyToken.expiresAt < new Date()) {
      return reply.status(410).send({ error: 'Token expired' });
    }

    // Check contact email domain matches company domain
    const contactEmail = companyToken.company.contactEmail;
    const companyDomain = companyToken.company.domain;
    if (!contactEmail.endsWith('@' + companyDomain)) {
      // Domain mismatch - stay pending, don't verify
      return reply.send({ verified: false, message: 'Contact email domain does not match company domain' });
    }

    // Mark company as verified
    await prisma.company.update({
      where: { id: companyToken.companyId },
      data: { verified: true, verificationStatus: 'verified' as any },
    });

    // Mark token used
    await prisma.companyVerificationToken.update({
      where: { id: companyToken.id },
      data: { used: true },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        action: 'company.verified',
        summary: `Company ${companyToken.company.name} verified`,
        actorType: 'system',
      },
    });

    return reply.send({ verified: true });
  });

  // Login
  app.post('/api/auth/login', async (req, reply) => {
    const { email, password } = req.body as any;
    if (!email || !password) {
      return reply.status(400).send({ error: 'Missing email or password' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const token = app.jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name });

    // Set httpOnly cookie (path=/ ensures it's sent for all routes)
    reply.setCookie('token', token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 3600, // 1 hour in seconds
    });

    return reply.send({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });
  });

  // Logout
  app.post('/api/auth/logout', async (req, reply) => {
    reply.clearCookie('token');
    return reply.send({ success: true });
  });

  // ── Student routes ──────────────────────────────────────────────────────────

  // Self-registration (student creates account, status=pending)
  app.post('/api/students/register', async (req, reply) => {
    const { collegeEmail, name, batchYear, branch, cgpa, rollNo, password } = req.body as any;
    if (!collegeEmail || !name || !batchYear || !branch || cgpa === undefined || !rollNo || !password) {
      return reply.status(400).send({ error: 'Missing required fields' });
    }

    // Find college by email domain
    const collegeDomain = collegeEmail.split('@')[1];
    const college = await prisma.college.findFirst({ where: { domain: collegeDomain } });
    if (!college) {
      return reply.status(400).send({ error: 'College not found for this email domain' });
    }

    // Check student already exists
    const existing = await prisma.student.findUnique({ where: { collegeEmail } });
    if (existing) {
      return reply.status(409).send({ error: 'Student already registered' });
    }

    const hash = await argon2.hash(password);
    const user = await prisma.user.create({
      data: { email: collegeEmail, passwordHash: hash, name, role: 'student' },
    });

    const student = await prisma.student.create({
      data: {
        userId: user.id,
        name,
        collegeId: college.id,
        batchYear,
        branch,
        cgpa: parseFloat(cgpa),
        rollNo,
        collegeEmail,
        status: 'pending',
        registeredVia: 'self',
      },
    });

    return reply.send({ id: student.id, status: student.status });
  });

  // Officer approve student (same college only)
  app.post('/api/students/:id/approve', {
    preHandler: [authMiddleware, roleGuard(['college_officer'])],
  }, async (req, reply) => {
    const student = await prisma.student.findUnique({ where: { id: req.params.id as string }, include: { college: true } });
    const user = req.user as any;

    if (!student) {
      return reply.status(404).send({ error: 'Student not found' });
    }

    // Must be officer of the SAME college
    const officer = await prisma.collegeOfficer.findUnique({ where: { userId: user.id } });
    if (!officer || student.collegeId !== officer.collegeId) {
      return reply.status(403).send({ error: 'Not authorized for this college' });
    }

    await prisma.student.update({ where: { id: student.id }, data: { status: 'verified' } });

    await prisma.auditLog.create({
      data: {
        action: 'student.approved',
        summary: `Approved student ${student.name}`,
        actorId: user.id,
        actorType: user.role,
      },
    });

    return reply.send({ success: true });
  });

  // Officer reject student (same college only)
  app.post('/api/students/:id/reject', {
    preHandler: [authMiddleware, roleGuard(['college_officer'])],
  }, async (req, reply) => {
    const student = await prisma.student.findUnique({ where: { id: req.params.id as string }, include: { college: true } });
    const user = req.user as any;

    if (!student) {
      return reply.status(404).send({ error: 'Student not found' });
    }

    // Must be officer of the SAME college
    const officer = await prisma.collegeOfficer.findUnique({ where: { userId: user.id } });
    if (!officer || student.collegeId !== officer.collegeId) {
      return reply.status(403).send({ error: 'Not authorized for this college' });
    }

    await prisma.student.update({ where: { id: student.id }, data: { status: 'suspended' } });

    await prisma.auditLog.create({
      data: {
        action: 'student.rejected',
        summary: `Rejected student ${student.name}`,
        actorId: user.id,
        actorType: user.role,
      },
    });

    return reply.send({ success: true });
  });

  // ── Question routes ────────────────────────────────────────────────────────

  // Create question (company_admin only)
  app.post('/api/questions', {
    preHandler: [authMiddleware, roleGuard(['company_admin'])],
  }, async (req, reply) => {
    // ... (existing code for /api/questions)
    const user = req.user as any;
    const member = await prisma.companyMember.findUnique({ where: { userId: user.id }, include: { company: true } });
    if (!member) return reply.status(404).send({ error: 'Company member not found' });

    const { title, difficulty, topics, timeLimitSeconds, memoryLimitMb, description, inputFormat, outputFormat, constraints, mode, allowedLanguages, starterCode, referenceSolution, customChecker, examples, testCases } = req.body as any;
    if (!title || !description) return reply.status(400).send({ error: 'Missing required fields' });

    const question = await prisma.question.create({
      data: {
        companyId: member.companyId,
        title,
        difficulty: difficulty || 'medium',
        topics: topics || [],
        timeLimitSeconds: timeLimitSeconds || 60,
        memoryLimitMb: memoryLimitMb || 256,
        description,
        inputFormat: inputFormat || '',
        outputFormat: outputFormat || '',
        constraints: constraints || '',
        mode: (mode as any) || 'stdio',
        allowedLanguages: allowedLanguages || [],
        starterCode: starterCode || {},
        referenceSolution: referenceSolution || {},
        customChecker: customChecker || '',
        examples: { create: examples },
        testCases: { create: testCases },
      },
      include: { examples: true, testCases: true },
    });
    return reply.send(question);
  });

  // ── Submission routes ───────────────────────────────────────────────────────

  // Submit code (student only)
  app.post('/api/submissions', {
    preHandler: [authMiddleware, roleGuard(['student'])],
  }, async (req, reply) => {
    const user = req.user as any;
    const { code, language, questionId, testId, idempotencyKey } = req.body as any;

    const student = await prisma.student.findUnique({ where: { userId: user.id } });
    if (!student) return reply.status(404).send({ error: 'Student not found' });

    // Validate test eligibility
    const test = await prisma.test.findUnique({ where: { id: testId }, include: { audience: true, questions: { include: { question: true } } } });
    if (!test || !checkEligibility(student, { ...test, audience: test.audience as any }).allowed) {
      return reply.status(404).send({ error: 'Test not available' });
    }

    // Verify question is part of test
    const testQuestion = test.questions.find((tq) => tq.questionId === questionId);
    if (!testQuestion) return reply.status(404).send({ error: 'Question not in test' });

    // Create or get existing attempt
    let attempt = await prisma.attempt.findUnique({
      where: { testId_studentId: { testId, studentId: student.id } },
    });
    if (!attempt) {
      attempt = await prisma.attempt.create({
        data: { testId, studentId: student.id, status: 'started' },
      });
    }

    // Create submission (mocked engine)
    const question = await prisma.question.findUnique({ where: { id: questionId }, include: { testCases: true } });
    const cases = question?.testCases || [];

    // Mock run
    const results = mockExecute(code, cases.map(c => c.input), language, question?.timeLimitSeconds || 60, question?.memoryLimitMb || 256);

    const submission = await prisma.submission.create({
      data: {
        attemptId: attempt.id,
        questionId,
        language,
        code,
        codeSizeBytes: Buffer.byteLength(code),
        status: 'completed',
        verdict: results.every(r => r.verdict === 'Accepted') ? 'Accepted' : 'Wrong answer',
        cpuMs: results.reduce((acc, r) => acc + r.cpuMs, 0),
        memKb: Math.max(...results.map(r => r.memKb)),
      },
    });

    return reply.status(202).send({ id: submission.id, status: submission.status, verdict: submission.verdict });
  });

  // Get Attempt (includes submissions)
  app.get('/api/attempts/:attemptId', { preHandler: [authMiddleware] }, async (req, reply) => {
    const user = req.user as any;
    const attempt = await prisma.attempt.findUnique({
      where: { id: req.params.attemptId as string },
      include: { submissions: true }
    });
    if (!attempt) return reply.status(404).send({ error: 'Attempt not found' });

    // Only student or staff can view
    const student = await prisma.student.findUnique({ where: { userId: user.id } });
    if (student?.id !== attempt.studentId && user.role !== 'company_admin') {
      return reply.status(403).send({ error: 'Forbidden' });
    }
    return reply.send(attempt);
  });


  // ── Test routes ─────────────────────────────────────────────────────────────

  // List tests (only eligible ones for signed-in student)
  app.get('/api/tests', { preHandler: [authMiddleware] }, async (req, reply) => {
    const user = req.user as any;
    const student = await prisma.student.findUnique({ where: { userId: user.id } });

    if (!student) {
      return reply.status(404).send({ error: 'Student not found' });
    }

    // Get all published tests
    const allTests = await prisma.test.findMany({
      where: { status: 'published' },
      include: { audience: true, questions: { include: { question: true } } },
    });

    // Filter by eligibility
    const eligible = allTests.filter((test) => checkEligibility(student, { ...test, audience: test.audience as any }).allowed);

    return reply.send(eligible);
  });

  // Create test (company admin only, company must be verified)
  app.post('/api/tests', {
    preHandler: [authMiddleware, roleGuard(['company_admin'])],
  }, async (req, reply) => {
    const user = req.user as any;
    const member = await prisma.companyMember.findUnique({ where: { userId: user.id }, include: { company: true } });

    if (!member) {
      return reply.status(404).send({ error: 'Company member not found' });
    }

    if (!member.company.verified) {
      return reply.status(403).send({ error: 'Company not verified' });
    }

    const { name, type, durationMinutes, passMark, openAt, closeAt, audience, questions, requiresCamera, requiresMicrophone, cpuLimitMs, ramLimitMb, aiMonitoring, allowedLanguages } = req.body as any;

    if (!name || !openAt || !closeAt) {
      return reply.status(400).send({ error: 'Missing required fields' });
    }

    const test = await prisma.test.create({
      data: {
        companyId: member.companyId,
        name,
        type: type || 'coding',
        durationMinutes: durationMinutes || 60,
        passMark: passMark || 0,
        openAt: new Date(openAt),
        closeAt: new Date(closeAt),
        status: 'draft',
        requiresCamera: requiresCamera !== false,
        requiresMicrophone: requiresMicrophone !== false,
        cpuLimitMs: cpuLimitMs || 5000,
        ramLimitMb: ramLimitMb || 256,
        aiMonitoring: aiMonitoring || {},
        allowedLanguages: allowedLanguages || [],
        audience: audience ? {
          create: {
            collegeIds: audience.collegeIds || [],
            batches: audience.batches || [],
            branches: audience.branches || [],
            minCgpa: audience.minCgpa || 0,
          },
        } : undefined,
        questions: questions && questions.length > 0 ? {
          create: questions.map((q: any, idx: number) => ({
            questionId: q.questionId,
            order: idx,
          })),
        } : undefined,
      },
      include: { audience: true, questions: { include: { question: true } } },
    });

    return reply.send(test);
  });

  // Test Detail (Eligibility check + RBAC)
  app.get('/api/tests/:testId', { preHandler: [authMiddleware] }, async (req, reply) => {
    const user = req.user as any;
    const student = await prisma.student.findUnique({ where: { userId: user.id } });
    const test = await prisma.test.findUnique({ where: { id: req.params.testId as string }, include: { audience: true } });

    if (!student || !test || !checkEligibility(student, { ...test, audience: test.audience as any }).allowed) {
      return reply.status(404).send();
    }
    return reply.send(test);
  });

  // My student profile
  app.get('/api/me', { preHandler: [authMiddleware] }, async (req, reply) => {
    const user = req.user as any;
    const student = await prisma.student.findUnique({ where: { userId: user.id } });
    if (!student) return reply.status(404).send({ error: 'Student not found' });
    return reply.send({ id: student.id, userId: student.userId, collegeId: student.collegeId, status: student.status, name: student.name, batchYear: student.batchYear, branch: student.branch, cgpa: student.cgpa });
  });

  // Create college (company_admin only, for demo purposes)
  app.post('/api/colleges', {
    preHandler: [authMiddleware, roleGuard(['company_admin'])],
  }, async (req, reply) => {
    const user = req.user as any;
    const member = await prisma.companyMember.findUnique({ where: { userId: user.id }, include: { company: true } });
    if (!member) return reply.status(404).send({ error: 'Company member not found' });

    const { name, domain } = req.body as any;
    if (!name || !domain) return reply.status(400).send({ error: 'Missing required fields' });

    const college = await prisma.college.create({ data: { name, domain } });
    return reply.send(college);
  });

  // ── Consent routes (Phase 4) ───────────────────────────────────────────────

  // Grant consent for a test (student only)
  app.post('/api/consents', { preHandler: [authMiddleware, roleGuard(['student'])] }, async (req, reply) => {
    const user = req.user as any;
    const { testId, version, recorded } = req.body as any;
    if (!testId || !version || !recorded || !Array.isArray(recorded)) {
      return reply.status(400).send({ error: 'Missing required fields' });
    }

    const student = await prisma.student.findUnique({ where: { userId: user.id } });
    if (!student) return reply.status(404).send({ error: 'Student not found' });

    // Check existing consent
    const existing = await prisma.consent.findUnique({ where: { studentId_testId: { studentId: student.id, testId } } });
    if (existing) return reply.status(409).send({ error: 'Consent already exists for this test' });

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const consent = await prisma.consent.create({
      data: { studentId: student.id, testId, version, recorded, expiresAt },
    });

    await prisma.auditLog.create({
      data: { action: 'consent.granted', actorType: user.role, actorId: user.id, targetTable: 'consents', targetId: consent.id, summary: `Consent granted for test ${testId}` },
    });

    return reply.status(201).send(consent);
  });

  // ── Proctoring routes (Phase 4) ────────────────────────────────────────────

  // Submit proctor event (student)
  app.post('/api/sessions/:sessionId/proctor-events', { preHandler: [authMiddleware, roleGuard(['student'])] }, async (req, reply) => {
    const user = req.user as any;
    const { type, offsetMs, details, source } = req.body as any;
    if (!type || offsetMs === undefined || !source) {
      return reply.status(400).send({ error: 'Missing required fields' });
    }

    const session = await prisma.session.findUnique({ where: { id: req.params.sessionId as string } });
    if (!session) return reply.status(404).send({ error: 'Session not found' });

    const student = await prisma.student.findUnique({ where: { userId: user.id } });
    if (!student || student.id !== session.studentId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const event = await prisma.proctorEvent.create({
      data: { sessionId: session.id, type, offsetMs, details: details ?? {}, source: source ?? 'browser' },
    });

    await prisma.auditLog.create({
      data: { action: 'proctor.event.received', actorType: user.role, actorId: user.id, targetTable: 'proctor_events', targetId: event.id, summary: `Proctor event ${type} recorded for session ${session.id}` },
    });

    return reply.status(201).send(event);
  });

  // ── Similarity check (company_admin only) ────────────────────────────────
  app.post('/api/similarity', { preHandler: [authMiddleware, roleGuard(['company_admin'])] }, async (req, reply) => {
    const user = req.user as any;
    const member = await prisma.companyMember.findUnique({ where: { userId: user.id }, include: { company: true } });
    if (!member) return reply.status(404).send({ error: 'Company member not found' });

    const { submissionIdA, submissionIdB } = req.body as any;
    if (!submissionIdA || !submissionIdB) return reply.status(400).send({ error: 'Missing submission IDs' });

    const subA = await prisma.submission.findUnique({ where: { id: submissionIdA }, include: { attempt: { include: { test: true } } } });
    const subB = await prisma.submission.findUnique({ where: { id: submissionIdB }, include: { attempt: { include: { test: true } } } });
    if (!subA || !subB) return reply.status(404).send({ error: 'Submission not found' });
    if (subA.attempt.test.companyId !== member.companyId || subB.attempt.test.companyId !== member.companyId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const result = jaccardSimilarity(subA.code, subB.code);

    // Store similarity result
    const stored = await prisma.similarityResult.create({
      data: {
        submissionIdA: subA.id,
        submissionIdB: subB.id,
        questionId: subA.questionId,
        companyId: member.companyId,
        jaccard: result.jaccard,
        reading: result.reading,
      },
    });

    await prisma.auditLog.create({
      data: { action: 'similarity.reviewed', actorType: user.role, actorId: user.id, targetTable: 'similarity_results', targetId: stored.id, summary: `Similarity checked between ${subA.id} and ${subB.id}: ${result.reading}` },
    });

    return reply.send(result);
  });

  return app;
}

// Default app for unit tests (singletons are fine there since Prisma is mocked)
const prisma = new PrismaClient();
export const app = createApp(prisma);

// Start listening when run directly (not imported by tests)
const isDirectRun = process.argv[1] && (
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').replace(/^.*apps\/api\//, '')) ||
  require('path').basename(process.argv[1]) === 'server.ts'
);

if (isDirectRun) {
  const host = process.env.HOST || '127.0.0.1';
  const port = parseInt(process.env.PORT || '3001', 10);
  await app.listen({ host, port });
  console.log(`API listening on http://${host}:${port}`);
}

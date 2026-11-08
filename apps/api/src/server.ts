// API logic with real Auth/RBAC and Postgres via Prisma

import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { authMiddleware, roleGuard } from './auth.js';
import { checkEligibility } from '@signal/shared';

// Load env vars from .env (needed for tests that don't set them)
try {
  await import('dotenv/config');
} catch {}


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

  app.register(cors, { origin: true, credentials: true });
  app.register(cookie, { hook: false, parseOptions: {} });
  app.register(jwt, { secret: jwtSecret, cookie: { cookieName: 'token', signed: false } });

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
    console.log(`[Verification] Visit: http://localhost:3001/api/verify?token=${tokenStr}`);

    return reply.send({ id: company.id, name: company.name, verified: company.verified, verificationStatus: company.verificationStatus });
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
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 1000, // 1 hour
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
    const user = req.user as any;
    const member = await prisma.companyMember.findUnique({ where: { userId: user.id }, include: { company: true } });
    if (!member) return reply.status(404).send({ error: 'Company member not found' });

    const { title, difficulty, topics, timeLimitSeconds, memoryLimitMb, description, inputFormat, outputFormat, constraints, mode, allowedLanguages, starterCode, referenceSolution, customChecker } = req.body as any;
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
      },
    });
    return reply.send(question);
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
  const port = parseInt(process.env.PORT || '3001', 10);
  await app.listen({ host: '0.0.0.0', port });
  console.log(`API listening on http://localhost:${port}`);
}

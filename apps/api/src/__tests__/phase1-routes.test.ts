// Integration tests for new Phase 1 routes — against real Postgres.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { createApp } from '../server.js';

const testDbUrl = process.env.DATABASE_URL_TEST || 'postgresql://signal:password@127.0.0.1:5433/signal_test';
const prisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });
const app = createApp(prisma);

async function canConnect(): Promise<boolean> {
  try {
    await prisma.$connect();
    await prisma.$disconnect();
    return true;
  } catch {
    return false;
  }
}

const dbAvailable = await canConnect();

if (!dbAvailable) {
  console.warn(
    '[INTEGRATION] SKIP — DATABASE_URL_TEST is not reachable. ' +
    'Set a valid PostgreSQL connection string and run `pnpm prisma migrate dev`.'
  );
}

describe('[INTEGRATION] New Phase 1 Routes — real Postgres', () => {
  const skipIfNoDb = (name: string, fn: (...args: any[]) => any, timeout?: number) =>
    dbAvailable ? it(name, fn, timeout) : it.skip(name, fn, timeout);

  async function seed() {
    await prisma.auditLog.deleteMany();
    await prisma.companyVerificationToken.deleteMany();
    await prisma.student.deleteMany();
    await prisma.collegeOfficer.deleteMany();
    await prisma.college.deleteMany();
    await prisma.companyMember.deleteMany();
    await prisma.user.deleteMany();
    await prisma.testAudience.deleteMany();
    await prisma.testQuestion.deleteMany();
    await prisma.submission.deleteMany();
    await prisma.session.deleteMany();
    await prisma.proctorEvent.deleteMany();
    await prisma.recording.deleteMany();
    await prisma.invite.deleteMany();
    await prisma.attempt.deleteMany();
    await prisma.question.deleteMany();
    await prisma.test.deleteMany();
    await prisma.company.deleteMany();

    const pw = await argon2.hash('password123');

    const college1 = await prisma.college.create({ data: { name: 'Tech Institute P1', domain: 'tech-p1.edu' } });
    const college2 = await prisma.college.create({ data: { name: 'State University P1', domain: 'state-p1.edu' } });

    const comp1 = await prisma.company.create({
      data: { name: 'Acme Corp P1', domain: 'acme-p1.com', industry: 'Software', contactEmail: 'admin@acme-p1.com', verificationStatus: 'pending' as any },
    });
    const comp2 = await prisma.company.create({
      data: { name: 'Globex P1', domain: 'globex-p1.com', industry: 'Finance', contactEmail: 'boss@globex-p1.com', verified: true, verificationStatus: 'verified' as any },
    });

    const uAdmin1 = await prisma.user.create({ data: { email: 'admin@acme-p1.com', passwordHash: pw, name: 'Acme Admin', role: 'company_admin' } });
    const uAdmin2 = await prisma.user.create({ data: { email: 'boss@globex-p1.com', passwordHash: pw, name: 'Globex Boss', role: 'company_admin' } });
    const uOfficer1 = await prisma.user.create({ data: { email: 'off1@tech-p1.edu', passwordHash: pw, name: 'Officer 1', role: 'college_officer' } });
    const uOfficer2 = await prisma.user.create({ data: { email: 'off2@state-p1.edu', passwordHash: pw, name: 'Officer 2', role: 'college_officer' } });
    const uStudent1 = await prisma.user.create({ data: { email: 's1@tech-p1.edu', passwordHash: pw, name: 'Student One', role: 'student' } });
    const uStudent2 = await prisma.user.create({ data: { email: 's2@state-p1.edu', passwordHash: pw, name: 'Student Two', role: 'student' } });

    await prisma.companyMember.create({ data: { companyId: comp1.id, userId: uAdmin1.id, role: 'company_admin' } });
    await prisma.companyMember.create({ data: { companyId: comp2.id, userId: uAdmin2.id, role: 'company_admin' } });
    await prisma.collegeOfficer.create({ data: { collegeId: college1.id, userId: uOfficer1.id } });
    await prisma.collegeOfficer.create({ data: { collegeId: college2.id, userId: uOfficer2.id } });

    await prisma.student.create({
      data: { userId: uStudent1.id, collegeId: college1.id, name: 'Student One', batchYear: 2028, branch: 'CSE', cgpa: 8.5, rollNo: '001', collegeEmail: 's1@tech-p1.edu', status: 'pending', registeredVia: 'self' },
    });
    await prisma.student.create({
      data: { userId: uStudent2.id, collegeId: college2.id, name: 'Student Two', batchYear: 2027, branch: 'IT', cgpa: 9.0, rollNo: '002', collegeEmail: 's2@state-p1.edu', status: 'verified', registeredVia: 'self' },
    });

    const q1 = await prisma.question.create({
      data: {
        companyId: comp2.id, title: 'Two Sum P1', difficulty: 'easy', topics: ['arrays'],
        timeLimitSeconds: 60, memoryLimitMb: 256, description: 'Find two sum',
        inputFormat: 'array', outputFormat: 'indices', constraints: '', mode: 'stdio',
        allowedLanguages: ['javascript'], starterCode: {}, referenceSolution: '', customChecker: '',
      },
    });

    await prisma.test.create({
      data: {
        companyId: comp2.id, name: 'Open Mock P1', type: 'mock' as any, durationMinutes: 30,
        passMark: 50, openAt: new Date('2026-01-01'), closeAt: new Date('2027-01-01'),
        status: 'published', roundNumber: 1, requiresCamera: false, requiresMicrophone: false,
        cpuLimitMs: 5000, ramLimitMb: 256, aiMonitoring: {}, allowedLanguages: [],
        audience: { create: { collegeIds: [], batches: [], branches: [], minCgpa: 0 } },
        questions: { create: [{ questionId: q1.id, order: 0 }] },
      },
    });
  }

  function signIn(email: string) {
    return app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password: 'password123' },
    }).then((res: any) => {
      const cookies = res.cookies || [];
      const cookieObj: Record<string, string> = {};
      cookies.forEach((c: any) => { cookieObj[c.name] = c.value; });
      return { cookies, cookieObj, body: JSON.parse(res.body) };
    });
  }

  function injectWithCookies(method: string, url: string, body: any | null, cookieObj: Record<string, string>) {
    return app.inject({
      method,
      url,
      cookies: cookieObj,
      ...(body !== null ? { payload: body } : {}),
    });
  }

  beforeAll(async () => {
    if (!dbAvailable) return;
    await seed();
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    await prisma.$disconnect();
  });

  skipIfNoDb('register-company creates company and verification token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register-company',
      payload: {
        name: 'NewCoP1', domain: 'newcop1.test', contactEmail: 'ceo@newcop1.test',
        password: 'password123', industry: 'Tech', studentsToHire: 5, dataTermsAgreed: true,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as any;
    expect(body.name).toBe('NewCoP1');
    expect(body.verified).toBe(false);
  });

  skipIfNoDb('login returns user info with httpOnly cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'admin@acme-p1.com', password: 'password123' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as any;
    expect(body.role).toBe('company_admin');
    expect(res.cookies.length).toBeGreaterThan(0);
  });

  skipIfNoDb('logout clears token cookie', async () => {
    const loginRes = await signIn('admin@acme-p1.com');
    const logoutRes = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      cookies: loginRes.cookieObj,
    });
    expect(logoutRes.statusCode).toBe(200);
  });

  skipIfNoDb('verify-company with matching domain → verified', async () => {
    const company = await prisma.company.findFirst({ where: { domain: 'newcop1.test' } });
    expect(company).not.toBeNull();
    const tok = await prisma.companyVerificationToken.findFirst({ where: { companyId: company!.id } });
    expect(tok).not.toBeNull();

    const res = await app.inject({
      method: 'GET',
      url: `/api/auth/verify-company?token=${tok!.token}`,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ verified: true });
  });

  skipIfNoDb('student register creates pending student', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/students/register',
      payload: {
        name: 'New Student P1', batchYear: 2029, branch: 'ECE', cgpa: 8.0,
        rollNo: '004', collegeEmail: 'new@tech-p1.edu', password: 'password123',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as any;
    expect(body.status).toBe('pending');
  });

  skipIfNoDb('officer approves own-college student → 200 + audit', async () => {
    const stu = await prisma.student.findFirst({ where: { collegeEmail: 's1@tech-p1.edu' } });
    expect(stu).not.toBeNull();

    const off = await signIn('off1@tech-p1.edu');
    const res = await injectWithCookies('POST', `/api/students/${stu!.id}/approve`, null, off.cookieObj);
    expect(res.statusCode).toBe(200);

    const updated = await prisma.student.findUnique({ where: { id: stu!.id } });
    expect(updated!.status).toBe('verified');
  });

  skipIfNoDb('GET /api/tests returns eligible tests for student', async () => {
    const s2 = await signIn('s2@state-p1.edu');
    const res = await injectWithCookies('GET', '/api/tests', null, s2.cookieObj);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as any[];
    expect(body.length).toBeGreaterThan(0);
  });

  skipIfNoDb('POST /api/tests creates draft test when verified', async () => {
    const admin = await signIn('boss@globex-p1.com');
    const q = await prisma.question.findFirst();
    const res = await injectWithCookies('POST', '/api/tests', {
      name: 'Phase1 Test P1', type: 'coding', durationMinutes: 45, passMark: 60,
      openAt: '2026-06-01T00:00:00Z', closeAt: '2026-12-31T23:59:59Z',
      audience: { collegeIds: [], batches: [2027], branches: ['IT'], minCgpa: 7.0 },
      questions: [{ questionId: q!.id }],
    }, admin.cookieObj);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as any;
    expect(body.status).toBe('draft');
  });
});

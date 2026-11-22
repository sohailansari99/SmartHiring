// Integration tests against a real Postgres database.
// Requires DATABASE_URL_TEST to point to a reachable PostgreSQL instance on localhost.
// Fail fast if missing or unreachable — do not silently skip.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { createApp } from '../server.js';

const rawUrl = process.env.DATABASE_URL_TEST;
if (!rawUrl) throw new Error('[INTEGRATION] DATABASE_URL_TEST environment variable is required');
if (!rawUrl.includes('127.0.0.1') && !rawUrl.includes('localhost')) throw new Error('[INTEGRATION] DATABASE_URL_TEST must point to a local PostgreSQL instance');

const prisma = new PrismaClient({ datasources: { db: { url: rawUrl } } });
const app = createApp(prisma);

try {
  await prisma.$connect();
} catch (err) {
  console.error('[INTEGRATION] DATABASE_URL_TEST is reachable but cannot connect:', err);
  process.exit(1);
}

describe('[INTEGRATION] API Access Rules — real Postgres', () => {
  // ─── Helpers ──────────────────────────────────────────────────────────────
  async function seed() {
    // Clean slate
    await prisma.auditLog.deleteMany();
    await prisma.student.deleteMany();
    await prisma.collegeOfficer.deleteMany();
    await prisma.college.deleteMany();
    await prisma.companyMember.deleteMany();
    await prisma.user.deleteMany();
    await prisma.test.deleteMany();
    await prisma.company.deleteMany();

    const pw = await argon2.hash('password123');

    // Companies
    const comp1 = await prisma.company.create({ data: { name: 'Acme', domain: 'acme.test', industry: 'tech', contactEmail: 'a@acme.test' } });
    const comp2 = await prisma.company.create({ data: { name: 'Globex', domain: 'globex.test', industry: 'tech', contactEmail: 'g@globex.test' } });

    // Users
    const uAdmin1 = await prisma.user.create({ data: { email: 'admin@acme.test', passwordHash: pw, name: 'Acme Admin', role: 'company_admin' } });
    const uAdmin2 = await prisma.user.create({ data: { email: 'admin@globex.test', passwordHash: pw, name: 'Globex Admin', role: 'company_admin' } });
    const uOfficer = await prisma.user.create({ data: { email: 'off@tech.edu', passwordHash: pw, name: 'College Officer', role: 'college_officer' } });
    const uStudentElig = await prisma.user.create({ data: { email: 'good@tech.edu', passwordHash: pw, name: 'Good Student', role: 'student' } });
    const uStudentInel = await prisma.user.create({ data: { email: 'bad@tech.edu', passwordHash: pw, name: 'Bad Student', role: 'student' } });
    const uStudentPending = await prisma.user.create({ data: { email: 'pending@tech.edu', passwordHash: pw, name: 'Pending Student', role: 'student' } });

    // Colleges
    const college1 = await prisma.college.create({ data: { name: 'Tech Institute', domain: 'tech.edu' } });
    const college2 = await prisma.college.create({ data: { name: 'Other University', domain: 'other.edu' } });

    // Company members
    await prisma.companyMember.create({ data: { companyId: comp1.id, userId: uAdmin1.id, role: 'company_admin' } });
    await prisma.companyMember.create({ data: { companyId: comp2.id, userId: uAdmin2.id, role: 'company_admin' } });

    // College officer (college1)
    await prisma.collegeOfficer.create({ data: { collegeId: college1.id, userId: uOfficer.id } });

    // Students — college1
    await prisma.student.create({ data: { userId: uStudentElig.id, collegeId: college1.id, name: 'Good Student', batchYear: 2028, branch: 'CSE', cgpa: 8.5, rollNo: '001', collegeEmail: 'good@tech.edu', status: 'verified', registeredVia: 'self' } });
    await prisma.student.create({ data: { userId: uStudentInel.id, collegeId: college1.id, name: 'Bad Student', batchYear: 2028, branch: 'CSE', cgpa: 5.5, rollNo: '002', collegeEmail: 'bad@tech.edu', status: 'verified', registeredVia: 'self' } });
    await prisma.student.create({ data: { userId: uStudentPending.id, collegeId: college1.id, name: 'Pending Student', batchYear: 2028, branch: 'CSE', cgpa: 8.5, rollNo: '003', collegeEmail: 'pending@tech.edu', status: 'pending', registeredVia: 'self' } });

    // Student — college2
    const uStudentOther = await prisma.user.create({ data: { email: 'other@other.edu', passwordHash: pw, name: 'Other Student', role: 'student' } });
    await prisma.student.create({ data: { userId: uStudentOther.id, collegeId: college2.id, name: 'Other Student', batchYear: 2028, branch: 'CSE', cgpa: 8.5, rollNo: '004', collegeEmail: 'other@other.edu', status: 'pending', registeredVia: 'self' } });

    // Test from company1 (college1 is in audience)
    await prisma.test.create({
      data: {
        companyId: comp1.id, name: 'Acme Coding Test', type: 'coding', durationMinutes: 60,
        passMark: 70, openAt: '2026-01-01T00:00:00Z', closeAt: '2026-12-31T23:59:59Z',
        status: 'published', roundNumber: 1, requiresCamera: true, requiresMicrophone: true,
        cpuLimitMs: 5000, ramLimitMb: 256, aiMonitoring: {}, allowedLanguages: [],
        audience: { create: { collegeIds: [college1.id], batches: [2028], branches: ['CSE'], minCgpa: 7.0 } },
      },
    });

    // Test from company2 (different company)
    await prisma.test.create({
      data: {
        companyId: comp2.id, name: 'Globex Test', type: 'coding', durationMinutes: 60,
        passMark: 70, openAt: '2026-01-01T00:00:00Z', closeAt: '2026-12-31T23:59:59Z',
        status: 'published', roundNumber: 1, requiresCamera: true, requiresMicrophone: true,
        cpuLimitMs: 5000, ramLimitMb: 256, aiMonitoring: {}, allowedLanguages: [],
        audience: { create: { collegeIds: [], batches: [], branches: [], minCgpa: 0 } },
      },
    });
  }

  function createToken(user: { id: string; email: string; role: string; name: string }) {
    return app.jwt.sign(user);
  }

  function injectWithToken(token: string, method: string, url: string, body?: any) {
    return app.inject({ method, url, headers: { Authorization: `Bearer ${token}` }, payload: body });
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────
  beforeAll(async () => {
    await seed();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ── 1. Anonymous → 401 ─────────────────────────────────────────────────────
  it('GET /api/tests/:testId without token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/tests/nonexistent' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/students/:id/approve without token → 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/students/s1/approve' });
    expect(res.statusCode).toBe(401);
  });

  // ── 2. Wrong role → 403 ────────────────────────────────────────────────────
  it('company_admin calling /students/:id/approve → 403', async () => {
    const token = createToken({ id: 'dummy', email: 'admin@acme.test', role: 'company_admin', name: 'Admin' });
    const res = await injectWithToken(token, 'POST', '/api/students/some-id/approve');
    expect(res.statusCode).toBe(403);
  });

  // ── 3. Ineligible student → 404 ────────────────────────────────────────────
  it('pending student → 404', async () => {
    const pendingUser = await prisma.user.findFirst({ where: { email: 'pending@tech.edu' } });
    expect(pendingUser).not.toBeNull();
    const t = createToken({ id: pendingUser!.id, email: 'pending@tech.edu', role: 'student', name: 'Pending' });
    const testId = (await prisma.test.findFirst({ where: { name: 'Acme Coding Test' } }))!.id;
    const res = await injectWithToken(t, 'GET', `/api/tests/${testId}`);
    expect(res.statusCode).toBe(404);
  });

  it('student below min CGPA → 404', async () => {
    const badUser = await prisma.user.findFirst({ where: { email: 'bad@tech.edu' } });
    expect(badUser).not.toBeNull();
    const t = createToken({ id: badUser!.id, email: 'bad@tech.edu', role: 'student', name: 'Bad' });
    const testId = (await prisma.test.findFirst({ where: { name: 'Acme Coding Test' } }))!.id;
    const res = await injectWithToken(t, 'GET', `/api/tests/${testId}`);
    expect(res.statusCode).toBe(404);
  });

  // ── 4. Eligible student → 200 ──────────────────────────────────────────────
  it('verified eligible student → 200 with test data', async () => {
    const goodUser = await prisma.user.findFirst({ where: { email: 'good@tech.edu' } });
    expect(goodUser).not.toBeNull();
    const t = createToken({ id: goodUser!.id, email: 'good@tech.edu', role: 'student', name: 'Good' });
    const testId = (await prisma.test.findFirst({ where: { name: 'Acme Coding Test' } }))!.id;
    const res = await injectWithToken(t, 'GET', `/api/tests/${testId}`);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as any;
    expect(body.id).toBe(testId);
    expect(body.name).toBe('Acme Coding Test');
  });

  // ── 5. Officer approves only own-college students ──────────────────────────
  it('officer approves student from same college → 200', async () => {
    const officerUser = await prisma.user.findFirst({ where: { email: 'off@tech.edu' } });
    expect(officerUser).not.toBeNull();
    const t = createToken({ id: officerUser!.id, email: 'off@tech.edu', role: 'college_officer', name: 'Officer' });

    const officer = await prisma.collegeOfficer.findUnique({ where: { userId: officerUser!.id }, include: { college: true } });
    expect(officer).not.toBeNull();
    const pendingStudent = await prisma.student.findFirst({ where: { collegeId: officer!.collegeId, status: 'pending' } });
    expect(pendingStudent).not.toBeNull();

    const res = await injectWithToken(t, 'POST', `/api/students/${pendingStudent!.id}/approve`);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ success: true });

    // Verify student is now verified
    const updated = await prisma.student.findUnique({ where: { id: pendingStudent!.id } });
    expect(updated!.status).toBe('verified');
  });

  it('officer from different college → 403', async () => {
    const officerUser = await prisma.user.findFirst({ where: { email: 'off@tech.edu' } });
    expect(officerUser).not.toBeNull();
    const t = createToken({ id: officerUser!.id, email: 'off@tech.edu', role: 'college_officer', name: 'Officer' });

    const officer = await prisma.collegeOfficer.findUnique({ where: { userId: officerUser!.id }, include: { college: true } });
    const otherStudent = await prisma.student.findFirst({ where: { collegeId: { not: officer!.collegeId } } });
    expect(otherStudent).not.toBeNull();

    const res = await injectWithToken(t, 'POST', `/api/students/${otherStudent!.id}/approve`);
    expect(res.statusCode).toBe(403);
  });

  // ── 6. Cross-company admin → 404 ───────────────────────────────────────────
  it('company_admin from another company → 404', async () => {
    const otherAdmin = await prisma.user.findFirst({ where: { email: 'admin@globex.test' } });
    expect(otherAdmin).not.toBeNull();
    const t = createToken({ id: otherAdmin!.id, email: 'admin@globex.test', role: 'company_admin', name: 'OtherAdmin' });
    const testId = (await prisma.test.findFirst({ where: { name: 'Acme Coding Test' } }))!.id;
    const res = await injectWithToken(t, 'GET', `/api/tests/${testId}`);
    expect(res.statusCode).toBe(404);
  });
});

// Phase 3 Unit Tests: Submission API — mocked Prisma, no real database required.
// Tests validation rules, RBAC, and business logic for code submissions.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock @prisma/client ─────────────────────────────────────────────────────
const mockedState = vi.hoisted(() => ({ store: {} as Record<string, any> }));

vi.mock('@prisma/client', () => {
  const { store } = mockedState;
  const MockPrismaClient = function () { return store; };
  return { PrismaClient: MockPrismaClient };
});

vi.mock('argon2', () => ({
  default: { hash: vi.fn().mockResolvedValue('hashed-password') },
}));

import { app } from '../server.js';

// ─── helpers ─────────────────────────────────────────────────────────────────
function createToken(user: { id: string; email: string; role: string; name: string }) {
  return app.jwt.sign(user);
}

function injectWithToken(token: string, method: string, url: string, body?: any) {
  return app.inject({ method, url, headers: { Authorization: `Bearer ${token}` }, payload: body });
}

function getStore() {
  return mockedState.store;
}

function seedMocks() {
  mockedState.store.submission = { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() };
  mockedState.store.attempt = { create: vi.fn(), findUnique: vi.fn() };
  mockedState.store.student = { findUnique: vi.fn() };
  mockedState.store.user = { findUnique: vi.fn() };
  mockedState.store.test = { findUnique: vi.fn() };
  mockedState.store.question = { findUnique: vi.fn() };
  mockedState.store.companyMember = { findUnique: vi.fn() };
  mockedState.store.auditLog = { create: vi.fn() };
}

const testQuestion = {
  id: 'q1', companyId: 'comp1', title: 'Array Flip', difficulty: 'easy' as const,
  timeLimitSeconds: 60, memoryLimitMb: 256, description: 'Flip an array',
  mode: 'stdio' as const, allowedLanguages: ['python', 'cpp'], version: 1,
};

const testCases = [
  { id: 'tc1', questionId: 'q1', input: '1 2 3', expectedOutput: '3 2 1', hidden: false, order: 0 },
  { id: 'tc2', questionId: 'q1', input: '4 5', expectedOutput: '5 4', hidden: true, order: 1 },
];

describe('[UNIT] Phase 3 — Submission API Rules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockedState.store).forEach(k => delete mockedState.store[k]);
    seedMocks();
  });

  // ── 1. Anonymous → 401 ─────────────────────────────────────────────────────
  describe('Anonymous access → 401', () => {
    it('POST /api/submissions without token → 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/submissions',
        payload: { code: 'print(1)', language: 'python', questionId: 'q1', testId: 't1', idempotencyKey: 'k1' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('GET /api/attempts/:id without token → 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/attempts/a1' });
      expect(res.statusCode).toBe(401);
    });
  });

  // ── 2. Wrong role → 403 ────────────────────────────────────────────────────
  describe('Wrong role → 403', () => {
    it('company_admin calling POST /api/submissions → 403', async () => {
      const token = createToken({ id: 'u1', email: 'admin@co.com', role: 'company_admin', name: 'Admin' });
      const res = await injectWithToken(token, 'POST', '/api/submissions', {
        code: 'print(1)', language: 'python', questionId: 'q1', testId: 't1', idempotencyKey: 'k1',
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ── 3. Student missing → 404 ────────────────────────────────────────────────
  describe('Student not found → 404', () => {
    it('submitting student with no student record → 404', async () => {
      getStore().student.findUnique.mockResolvedValue(null);
      const token = createToken({ id: 'u1', email: 'stu@co.com', role: 'student', name: 'Student' });
      const res = await injectWithToken(token, 'POST', '/api/submissions', {
        code: 'print(1)', language: 'python', questionId: 'q1', testId: 't1', idempotencyKey: 'k1',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── 4. Test eligibility check ──────────────────────────────────────────────
  describe('Test eligibility → 404 if ineligible', () => {
    it('test not found → 404', async () => {
      getStore().student.findUnique.mockResolvedValue({ id: 's1', userId: 'u1' });
      getStore().test.findUnique.mockResolvedValue(null);
      const token = createToken({ id: 'u1', email: 'stu@co.com', role: 'student', name: 'Student' });
      const res = await injectWithToken(token, 'POST', '/api/submissions', {
        code: 'print(1)', language: 'python', questionId: 'q1', testId: 'nonexistent', idempotencyKey: 'k1',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── 5. Question not in test ────────────────────────────────────────────────
  describe('Question not in test → 404', () => {
    it('questionId not matching any test question → 404', async () => {
      getStore().student.findUnique.mockResolvedValue({ id: 's1', userId: 'u1' });
      getStore().test.findUnique.mockResolvedValue({
        questions: [{ questionId: 'q99' }]  // q99 ≠ q1
      });
      const token = createToken({ id: 'u1', email: 'stu@co.com', role: 'student', name: 'Student' });
      const res = await injectWithToken(token, 'POST', '/api/submissions', {
        code: 'print(1)', language: 'python', questionId: 'q1', testId: 't1', idempotencyKey: 'k1',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── 6. Successful submission → 202 ─────────────────────────────────────────
  describe('Successful submission → 202', () => {
    it('valid submission returns 202 with submission id', async () => {
      getStore().student.findUnique.mockResolvedValue({
        id: 's1', userId: 'u1', status: 'verified', collegeId: 'c1', batchYear: 2028, branch: 'CSE', cgpa: 8.0
      });
      const now = new Date().toISOString();
      getStore().test.findUnique.mockResolvedValue({
        questions: [{ questionId: 'q1' }],
        audience: { collegeIds: ['c1'], batches: [2028], branches: ['CSE'], minCgpa: 7.0 },
        status: 'published',
        openAt: now,
        closeAt: new Date(Date.now() + 86400000).toISOString(),
      });
      getStore().question.findUnique.mockResolvedValue({ ...testQuestion, testCases });
      getStore().attempt.findUnique.mockResolvedValue(null);
      getStore().attempt.create.mockResolvedValue({ id: 'a1', status: 'started' });
      getStore().submission.create.mockResolvedValue({
        id: 'sub1', attemptId: 'a1', questionId: 'q1', language: 'python',
        status: 'completed', verdict: 'Accepted', cpuMs: 50, memKb: 1024
      });

      const token = createToken({ id: 'u1', email: 'stu@co.com', role: 'student', name: 'Student' });
      const res = await injectWithToken(token, 'POST', '/api/submissions', {
        code: 'print(1)', language: 'python', questionId: 'q1', testId: 't1', idempotencyKey: 'key1',
      });
      expect(res.statusCode).toBe(202);
      const body = JSON.parse(res.body);
      expect(body.id).toBe('sub1');
      expect(body.status).toBe('completed');
    });
  });

  // ── 7. Attempt retrieval ───────────────────────────────────────────────────
  describe('GET /api/attempts/:id access control', () => {
    it('owner student can view attempt → 200', async () => {
      getStore().attempt.findUnique.mockResolvedValue({ id: 'a1', studentId: 's1', status: 'submitted', submissions: [] });
      getStore().student.findUnique.mockResolvedValue({ id: 's1', userId: 'u1' });
      const token = createToken({ id: 'u1', email: 'stu@co.com', role: 'student', name: 'Student' });
      const res = await injectWithToken(token, 'GET', '/api/attempts/a1');
      expect(res.statusCode).toBe(200);
    });

    it('company_admin can view any attempt → 200', async () => {
      getStore().attempt.findUnique.mockResolvedValue({ id: 'a1', studentId: 's99', status: 'submitted', submissions: [] });
      const token = createToken({ id: 'u1', email: 'admin@co.com', role: 'company_admin', name: 'Admin' });
      const res = await injectWithToken(token, 'GET', '/api/attempts/a1');
      expect(res.statusCode).toBe(200);
    });

    it('other student cannot view → 403', async () => {
      getStore().attempt.findUnique.mockResolvedValue({ id: 'a1', studentId: 's1', status: 'submitted', submissions: [] });
      getStore().student.findUnique.mockResolvedValue({ id: 's2', userId: 'u2' });
      const token = createToken({ id: 'u2', email: 'other@co.com', role: 'student', name: 'Other' });
      const res = await injectWithToken(token, 'GET', '/api/attempts/a1');
      expect(res.statusCode).toBe(403);
    });
  });
});

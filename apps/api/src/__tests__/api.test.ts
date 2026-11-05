import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock @prisma/client ─────────────────────────────────────────────────────
// vi.mock is hoisted — use vi.hoisted to create shared state that survives hoisting
const mockedState = vi.hoisted(() => ({
  store: {} as Record<string, any>,
}));

vi.mock('@prisma/client', () => {
  const { store } = mockedState;
  const mockFn = vi.fn(() => store);
  return { PrismaClient: mockFn };
});

// Mock argon2
vi.mock('argon2', () => ({
  default: { hash: vi.fn().mockResolvedValue('hashed-password') },
}));

// Now import the app (server module loads after mocks are in place)
import { app } from '../server.js';

// Helper: create a JWT token for a given user
function createToken(user: { id: string; email: string; role: string; name: string }) {
  return app.jwt.sign(user);
}

// Helper: build Fastify inject options with optional JWT
function injectWithToken(token: string, method: string, url: string, body?: any) {
  return app.inject({
    method,
    url,
    headers: { Authorization: `Bearer ${token}` },
    payload: body,
  });
}

describe('API Access Rules - RBAC & Eligibility', () => {
  // Reset the singleton mock store before each test
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockedState.store).forEach((k) => delete mockedState.store[k]);
    // Populate the prisma instance that server.ts captured
    mockedState.store.company = { create: vi.fn() };
    mockedState.store.user = { create: vi.fn(), findUnique: vi.fn() };
    mockedState.store.student = { findUnique: vi.fn(), update: vi.fn(), createMany: vi.fn() };
    mockedState.store.college = { create: vi.fn(), findUnique: vi.fn() };
    mockedState.store.collegeOfficer = { findUnique: vi.fn() };
    mockedState.store.test = { findUnique: vi.fn() };
    mockedState.store.auditLog = { create: vi.fn() };
    mockedState.store.attempt = { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() };
    mockedState.store.submission = { create: vi.fn(), findMany: vi.fn() };
  });

  // Helper to get the current prisma instance
  function getPrisma() {
    return mockedState.store;
  }

  // ─── 1. Anonymous user → 401 ────────────────────────────────────────────────
  describe('Anonymous access (no token) → 401', () => {
    it('GET /api/tests/:testId returns 401 without token', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/tests/t1' });
      expect(res.statusCode).toBe(401);
    });

    it('POST /api/students/:id/approve returns 401 without token', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/students/s1/approve' });
      expect(res.statusCode).toBe(401);
    });
  });

  // ─── 2. Wrong role → 403 ────────────────────────────────────────────────────
  describe('Wrong role → 403', () => {
    it('company_admin cannot approve students (needs college_officer) → 403', async () => {
      const token = createToken({ id: 'u1', email: 'admin@co.com', role: 'company_admin', name: 'Admin' });
      const res = await injectWithToken(token, 'POST', '/api/students/s1/approve');
      expect(res.statusCode).toBe(403);
    });

    it('student role cannot approve students → 403', async () => {
      const token = createToken({ id: 'u2', email: 'student@co.com', role: 'student', name: 'Student' });
      const res = await injectWithToken(token, 'POST', '/api/students/s1/approve');
      expect(res.statusCode).toBe(403);
    });
  });

  // ─── 3. Ineligible student → 404 ────────────────────────────────────────────
  describe('Ineligible student → 404', () => {
    const baseTest = {
      id: 't1', companyId: 'comp1', name: 'Test', type: 'coding' as const,
      durationMinutes: 60, passMark: 70,
      openAt: '2026-01-01T00:00:00Z', closeAt: '2026-12-31T23:59:59Z',
      status: 'published' as const, roundNumber: 1,
      requiresCamera: true, requiresMicrophone: true, cpuLimitMs: 5000,
      ramLimitMb: 256, aiMonitoring: {}, allowedLanguages: [], createdAt: new Date(),
      audience: { id: 'ta1', testId: 't1', collegeIds: ['c1'], batches: [2028], branches: ['CSE'], minCgpa: 7.0 },
    };

    const baseStudent = (overrides: Partial<any> = {}) => ({
      id: 's1', userId: 'u3', collegeId: 'c1', name: 'Student',
      batchYear: 2028, branch: 'CSE', cgpa: 8.0, rollNo: '123',
      collegeEmail: 'stu@co.com', status: 'verified' as const, registeredVia: 'self' as const,
      createdAt: new Date(),
      ...overrides,
    });

    it('pending student cannot access test → 404', async () => {
      const p = getPrisma();
      p.student.findUnique.mockResolvedValue(baseStudent({ status: 'pending' }));
      p.test.findUnique.mockResolvedValue(baseTest);

      const token = createToken({ id: 'u3', email: 'stu@co.com', role: 'student', name: 'Pending Student' });
      const res = await injectWithToken(token, 'GET', '/api/tests/t1');
      expect(res.statusCode).toBe(404);
    });

    it('student from non-matching college → 404', async () => {
      const p = getPrisma();
      p.student.findUnique.mockResolvedValue(baseStudent({ collegeId: 'c99', status: 'verified' }));
      p.test.findUnique.mockResolvedValue(baseTest);

      const token = createToken({ id: 'u4', email: 'stu2@co.com', role: 'student', name: 'Other College Student' });
      const res = await injectWithToken(token, 'GET', '/api/tests/t1');
      expect(res.statusCode).toBe(404);
    });

    it('student with cgpa below minimum → 404', async () => {
      const p = getPrisma();
      p.student.findUnique.mockResolvedValue(baseStudent({ cgpa: 5.5 }));
      p.test.findUnique.mockResolvedValue(baseTest);

      const token = createToken({ id: 'u5', email: 'stu3@co.com', role: 'student', name: 'Low CGPA Student' });
      const res = await injectWithToken(token, 'GET', '/api/tests/t1');
      expect(res.statusCode).toBe(404);
    });
  });

  // ─── 4. Eligible student → 200 ──────────────────────────────────────────────
  describe('Eligible student → 200', () => {
    const baseTest = {
      id: 't1', companyId: 'comp1', name: 'Coding Test', type: 'coding' as const,
      durationMinutes: 60, passMark: 70,
      openAt: '2026-01-01T00:00:00Z', closeAt: '2026-12-31T23:59:59Z',
      status: 'published' as const, roundNumber: 1,
      requiresCamera: true, requiresMicrophone: true, cpuLimitMs: 5000,
      ramLimitMb: 256, aiMonitoring: {}, allowedLanguages: [], createdAt: new Date(),
      audience: { id: 'ta1', testId: 't1', collegeIds: ['c1'], batches: [2028], branches: ['CSE'], minCgpa: 7.0 },
    };

    it('verified student matching audience gets test data → 200', async () => {
      const p = getPrisma();
      p.student.findUnique.mockResolvedValue({
        id: 's4', userId: 'u6', collegeId: 'c1', name: 'Good Student',
        batchYear: 2028, branch: 'CSE', cgpa: 8.5, rollNo: '001',
        collegeEmail: 'good@co.com', status: 'verified', registeredVia: 'self', createdAt: new Date(),
      });
      p.test.findUnique.mockResolvedValue(baseTest);

      const token = createToken({ id: 'u6', email: 'good@co.com', role: 'student', name: 'Good Student' });
      const res = await injectWithToken(token, 'GET', '/api/tests/t1');
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toMatchObject({ id: 't1', name: 'Coding Test' });
    });
  });

  // ─── 5. Placement officer approves only their own college students ──────────
  describe('College officer approval — own college only', () => {
    it('officer approves student from same college → 200', async () => {
      const p = getPrisma();
      p.collegeOfficer.findUnique.mockResolvedValue({ id: 'co1', collegeId: 'c1', userId: 'u7', createdAt: new Date() });
      p.student.findUnique.mockResolvedValue({
        id: 's5', userId: 'u8', collegeId: 'c1', name: 'Student A',
        batchYear: 2028, branch: 'CSE', cgpa: 8.0, rollNo: '10',
        collegeEmail: 'a@tech.edu', status: 'pending', registeredVia: 'portal', createdAt: new Date(),
      });
      p.student.update.mockResolvedValue({
        id: 's5', userId: 'u8', collegeId: 'c1', name: 'Student A',
        batchYear: 2028, branch: 'CSE', cgpa: 8.0, rollNo: '10',
        collegeEmail: 'a@tech.edu', status: 'verified', registeredVia: 'portal', createdAt: new Date(),
      });
      p.auditLog.create.mockResolvedValue({ id: 'al1' });

      const token = createToken({ id: 'u7', email: 'officer@tech.edu', role: 'college_officer', name: 'Officer' });
      const res = await injectWithToken(token, 'POST', '/api/students/s5/approve');
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ success: true });
    });

    it('officer from another college gets 403 when approving different college student', async () => {
      const p = getPrisma();
      p.collegeOfficer.findUnique.mockResolvedValue({ id: 'co2', collegeId: 'c2', userId: 'u9', createdAt: new Date() });
      p.student.findUnique.mockResolvedValue({
        id: 's6', userId: 'u10', collegeId: 'c1', name: 'Student B',
        batchYear: 2028, branch: 'CSE', cgpa: 8.0, rollNo: '20',
        collegeEmail: 'b@tech.edu', status: 'pending', registeredVia: 'portal', createdAt: new Date(),
      });

      const token = createToken({ id: 'u9', email: 'officer2@other.edu', role: 'college_officer', name: 'Other Officer' });
      const res = await injectWithToken(token, 'POST', '/api/students/s6/approve');
      expect(res.statusCode).toBe(403);
    });
  });

  // ─── 6. Another company's admin → 404 (no student record) ───────────────────
  describe('Cross-company access → 404', () => {
    it('company_admin from different company cannot access another company test → 404', async () => {
      const p = getPrisma();
      // company_admin has no student record
      p.student.findUnique.mockResolvedValue(null);
      p.test.findUnique.mockResolvedValue({
        id: 't2', companyId: 'comp_other', name: 'Other Company Test', type: 'coding' as const,
        durationMinutes: 60, passMark: 70,
        openAt: '2026-01-01T00:00:00Z', closeAt: '2026-12-31T23:59:59Z',
        status: 'published' as const, roundNumber: 1,
        requiresCamera: true, requiresMicrophone: true, cpuLimitMs: 5000,
        ramLimitMb: 256, aiMonitoring: {}, allowedLanguages: [], createdAt: new Date(),
        audience: { id: 'ta2', testId: 't2', collegeIds: [], batches: [], branches: [], minCgpa: 0 },
      });

      const token = createToken({ id: 'u11', email: 'admin2@other.com', role: 'company_admin', name: 'Other Admin' });
      const res = await injectWithToken(token, 'GET', '/api/tests/t2');
      expect(res.statusCode).toBe(404);
    });
  });
});

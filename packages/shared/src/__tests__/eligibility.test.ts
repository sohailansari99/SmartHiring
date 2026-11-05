import { describe, it, expect } from 'vitest';
import { checkEligibility, type EligibilityStudent, type EligibilityTest } from '../eligibility.js';

describe('checkEligibility - Core Access Rule', () => {
  const baseStudent: EligibilityStudent = {
    id: 's1',
    status: 'verified',
    collegeId: 'c1',
    batchYear: 2028,
    branch: 'CSE',
    cgpa: 8.5,
  };

  const baseTest: EligibilityTest = {
    id: 't1',
    status: 'published',
    openAt: '2026-01-01T00:00:00Z',
    closeAt: '2026-12-31T23:59:59Z',
    audience: {
      collegeIds: ['c1', 'c2'],
      batches: [2028],
      branches: ['CSE', 'IT'],
      minCgpa: 7.0,
    },
    roundNumber: 1,
    previousRoundPassed: true,
  };

  const now = new Date('2026-06-01T12:00:00Z');

  it('allows verified student matching all criteria', () => {
    const res = checkEligibility(baseStudent, baseTest, now);
    expect(res.allowed).toBe(true);
  });

  it('rejects null student', () => {
    const res = checkEligibility(null, baseTest, now);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('no_student');
  });

  it('rejects unverified student', () => {
    const res = checkEligibility({ ...baseStudent, status: 'pending' }, baseTest, now);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('student_not_verified');
  });

  it('rejects draft test', () => {
    const res = checkEligibility(baseStudent, { ...baseTest, status: 'draft' }, now);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('test_not_published');
  });

  it('rejects test before open window', () => {
    const early = new Date('2025-12-31T23:59:59Z');
    const res = checkEligibility(baseStudent, baseTest, early);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('test_not_yet_open');
  });

  it('rejects test after close window', () => {
    const late = new Date('2027-01-01T00:00:00Z');
    const res = checkEligibility(baseStudent, baseTest, late);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('test_closed');
  });

  it('rejects student outside college list', () => {
    const res = checkEligibility({ ...baseStudent, collegeId: 'c99' }, baseTest, now);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('college_not_in_audience');
  });

  it('rejects student outside batch list', () => {
    const res = checkEligibility({ ...baseStudent, batchYear: 2026 }, baseTest, now);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('batch_not_in_audience');
  });

  it('rejects student outside branch list', () => {
    const res = checkEligibility({ ...baseStudent, branch: 'ECE' }, baseTest, now);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('branch_not_in_audience');
  });

  it('rejects student below min CGPA', () => {
    const res = checkEligibility({ ...baseStudent, cgpa: 6.8 }, baseTest, now);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('cgpa_below_minimum');
  });

  it('allows student with empty audience lists (open to all)', () => {
    const openTest: EligibilityTest = {
      ...baseTest,
      audience: { collegeIds: [], batches: [], branches: [], minCgpa: 0 },
    };
    const res = checkEligibility(baseStudent, openTest, now);
    expect(res.allowed).toBe(true);
  });

  it('rejects round 2 if round 1 not passed', () => {
    const round2Test: EligibilityTest = {
      ...baseTest,
      roundNumber: 2,
      previousRoundPassed: false,
    };
    const res = checkEligibility(baseStudent, round2Test, now);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('previous_round_not_passed');
  });
});
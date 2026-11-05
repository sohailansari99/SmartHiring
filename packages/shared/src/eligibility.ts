// THE CORE ACCESS RULE.
// A student may see, open or start a test only if every one of these is true:
//   1. The student is verified.
//   2. The test is published and inside its open window.
//   3. The test audience matches the student (colleges, batches, branches, CGPA).
//   4. For later rounds, the student passed the previous round.
//
// Every endpoint that returns or starts a test must call this function.
// On failure it returns { allowed: false } and the endpoint returns 404,
// never 403, so a test's existence is never leaked.
//
// The function is pure and framework-agnostic so it can be unit-tested
// directly and reused by the API, the worker and the room service.

export interface EligibilityStudent {
  id: string;
  status: 'pending' | 'verified' | 'suspended';
  collegeId: string;
  batchYear: number;
  branch: string;
  cgpa: number;
}

export interface EligibilityTest {
  id: string;
  status: 'draft' | 'published' | 'closed' | 'archived';
  openAt: string;
  closeAt: string;
  audience: {
    collegeIds: string[];
    batches: number[];
    branches: string[];
    minCgpa: number;
  };
  roundNumber: number;
  previousRoundPassed: boolean;
}

export interface EligibilityResult {
  allowed: boolean;
  reason?: string;
}

const NOW = Symbol('now');

/**
 * Evaluate whether a student may access a test.
 *
 * @param student  - the candidate record
 * @param test     - the test record (with audience + round info)
 * @param now      - the current time as a Date; defaults to real now
 */
export function checkEligibility(
  student: EligibilityStudent | null,
  test: EligibilityTest | null,
  now: Date = new Date(),
): EligibilityResult {
  // No student, no access. (404, not 403.)
  if (!student) {
    return { allowed: false, reason: 'no_student' };
  }

  // 1. Student must be verified.
  if (student.status !== 'verified') {
    return { allowed: false, reason: 'student_not_verified' };
  }

  // 2. Test must exist and be published.
  if (!test) {
    return { allowed: false, reason: 'test_not_found' };
  }
  if (test.status !== 'published') {
    return { allowed: false, reason: 'test_not_published' };
  }

  // 3. Test must be open.
  const openAt = new Date(test.openAt).getTime();
  const closeAt = new Date(test.closeAt).getTime();
  const t = now.getTime();
  if (t < openAt) {
    return { allowed: false, reason: 'test_not_yet_open' };
  }
  if (t > closeAt) {
    return { allowed: false, reason: 'test_closed' };
  }

  // 4. Audience: colleges. An empty list means all partner colleges.
  if (test.audience.collegeIds.length > 0) {
    if (!test.audience.collegeIds.includes(student.collegeId)) {
      return { allowed: false, reason: 'college_not_in_audience' };
    }
  }

  // 5. Audience: batches. An empty list means all batches.
  if (test.audience.batches.length > 0) {
    if (!test.audience.batches.includes(student.batchYear)) {
      return { allowed: false, reason: 'batch_not_in_audience' };
    }
  }

  // 6. Audience: branches. An empty list means all branches.
  if (test.audience.branches.length > 0) {
    if (!test.audience.branches.includes(student.branch)) {
      return { allowed: false, reason: 'branch_not_in_audience' };
    }
  }

  // 7. Audience: minimum CGPA.
  if (student.cgpa < test.audience.minCgpa) {
    return { allowed: false, reason: 'cgpa_below_minimum' };
  }

  // 8. Round progression: round 1 is always open to eligible students.
  //    Round N (N > 1) requires the previous round to have been passed.
  if (test.roundNumber > 1 && !test.previousRoundPassed) {
    return { allowed: false, reason: 'previous_round_not_passed' };
  }

  return { allowed: true };
}

export { NOW };
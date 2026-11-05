// Canonical constants for the Signal platform.
// These are the single source of truth for enums used across services.

// --- Roles (RBAC) ----------------------------------------------------------
export const ROLES = {
  COMPANY_ADMIN: 'company_admin',
  INTERVIEWER: 'interviewer',
  COLLEGE_OFFICER: 'college_officer',
  STUDENT: 'student',
  PLATFORM_ADMIN: 'platform_admin',
} as const;
export type Role = (typeof ROLES)[keyof typeof ROLES];

// --- Student status --------------------------------------------------------
export const STUDENT_STATUS = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  SUSPENDED: 'suspended',
} as const;
export type StudentStatus = (typeof STUDENT_STATUS)[keyof typeof STUDENT_STATUS];

// --- Test status -----------------------------------------------------------
export const TEST_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  CLOSED: 'closed',
  ARCHIVED: 'archived',
} as const;
export type TestStatus = (typeof TEST_STATUS)[keyof typeof TEST_STATUS];

// --- Test type -------------------------------------------------------------
export const TEST_TYPES = {
  CODING: 'coding',
  APTITUDE: 'aptitude',
  MOCK: 'mock',
  AI_INTERVIEW: 'ai_interview',
} as const;
export type TestType = (typeof TEST_TYPES)[keyof typeof TEST_TYPES];

// --- Question difficulty ---------------------------------------------------
export const DIFFICULTY = {
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard',
} as const;
export type Difficulty = (typeof DIFFICULTY)[keyof typeof DIFFICULTY];

// --- Question modes --------------------------------------------------------
export const QUESTION_MODE = {
  STDIO: 'stdio',
  FUNCTION: 'function',
} as const;
export type QuestionMode = (typeof QUESTION_MODE)[keyof typeof QUESTION_MODE];

// --- Submission verdicts ---------------------------------------------------
export const VERDICT = {
  ACCEPTED: 'Accepted',
  WRONG_ANSWER: 'Wrong answer',
  TIME_LIMIT: 'Time limit',
  MEMORY_LIMIT: 'Memory limit',
  RUNTIME_ERROR: 'Runtime error',
  OUTPUT_LIMIT: 'Output limit',
  COMPILE_ERROR: 'Compile error',
  INTERNAL_ERROR: 'Internal error',
} as const;
export type Verdict = (typeof VERDICT)[keyof typeof VERDICT];

// --- Attempt / candidate lifecycle -----------------------------------------
export const ATTEMPT_STATUS = {
  INVITED: 'invited',
  STARTED: 'started',
  SUBMITTED: 'submitted',
  PASSED: 'passed',
  FAILED: 'failed',
  ADVANCED: 'advanced',
  HELD: 'held',
  REJECTED: 'rejected',
} as const;
export type AttemptStatus = (typeof ATTEMPT_STATUS)[keyof typeof ATTEMPT_STATUS];

// --- Review priority (signals only, never a decision) ----------------------
export const RISK_LEVEL = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
} as const;
export type RiskLevel = (typeof RISK_LEVEL)[keyof typeof RISK_LEVEL];

// --- Proctor event types ---------------------------------------------------
export const PROCTOR_EVENT_TYPES = {
  FACE_CHECK: 'face_check',
  CAMERA_COVERED: 'camera_covered',
  DARK_FRAME: 'dark_frame',
  MOVEMENT: 'movement',
  SUSTAINED_SPEECH: 'sustained_speech',
  TAB_SWITCH: 'tab_switch',
  WINDOW_SWITCH: 'window_switch',
  FULLSCREEN_EXIT: 'fullscreen_exit',
  PASTE: 'paste',
  COPY: 'copy',
  CUT: 'cut',
  NETWORK_DROP: 'network_drop',
  DEVICE_CHANGE: 'device_change',
  PERMISSION_LOST: 'permission_lost',
  STREAM_LOST: 'stream_lost',
} as const;
export type ProctorEventType = (typeof PROCTOR_EVENT_TYPES)[keyof typeof PROCTOR_EVENT_TYPES];

// --- Similarity reading ----------------------------------------------------
export const SIMILARITY_READING = {
  DISTINCT: 'Distinct',
  SOME_OVERLAP: 'Some overlap',
  REVIEW_CLOSELY: 'Review closely',
} as const;
export type SimilarityReading = (typeof SIMILARITY_READING)[keyof typeof SIMILARITY_READING];

// --- Audit action categories -----------------------------------------------
export const AUDIT_ACTIONS = {
  COMPANY_REGISTERED: 'company.registered',
  COMPANY_VERIFIED: 'company.verified',
  STUDENT_REGISTERED: 'student.registered',
  STUDENT_VERIFIED: 'student.verified',
  TEST_CREATED: 'test.created',
  TEST_PUBLISHED: 'test.published',
  TEST_CLOSED: 'test.closed',
  TEST_AUDIENCE_CHANGED: 'test.audience_changed',
  ATTEMPT_STARTED: 'attempt.started',
  ATTEMPT_SUBMITTED: 'attempt.submitted',
  ATTEMPT_DECIDED: 'attempt.decided',
  RECORDING_VIEWED: 'recording.viewed',
  SIMILARITY_REVIEWED: 'similarity.reviewed',
  EVALUATION_SAVED: 'evaluation.saved',
  INVITE_SENT: 'invite.sent',
  AI_SUGGESTION_ACCEPTED: 'ai.suggestion.accepted',
  AI_SUGGESTION_REJECTED: 'ai.suggestion.rejected',
} as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

// --- Default retention (days) ----------------------------------------------
export const DEFAULT_RECORDING_RETENTION_DAYS = 30;

// --- Pagination ------------------------------------------------------------
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

// --- Rate limits (requests per window) -------------------------------------
export const RATE_LIMITS = {
  SUBMIT_PER_USER_PER_MIN: 30,
  RUN_PER_USER_PER_MIN: 60,
  REGISTER_PER_IP_PER_HOUR: 5,
} as const;
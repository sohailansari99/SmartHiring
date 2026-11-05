// Shared TypeScript types. These are the in-memory shapes used across
// services. They stay close to the Prisma model but strip internal fields.
import type { Role, StudentStatus, TestStatus, TestType, Verdict, RiskLevel, SimilarityReading } from './constants.js';

export interface Company {
  id: string;
  name: string;
  domain: string;
  industry: string;
  contactEmail: string;
  studentsToHire: number;
  verified: boolean;
  verificationStatus: 'pending' | 'verified' | 'rejected';
  createdAt: string;
}

export interface College {
  id: string;
  name: string;
  domain: string;
  createdAt: string;
}

export interface Student {
  id: string;
  name: string;
  collegeId: string;
  batchYear: number;
  branch: string;
  cgpa: number;
  rollNo: string;
  collegeEmail: string;
  status: StudentStatus;
  registeredVia: 'portal' | 'self';
  createdAt: string;
}

export interface Test {
  id: string;
  name: string;
  type: TestType;
  durationMinutes: number;
  passMark: number;
  openAt: string;
  closeAt: string;
  status: TestStatus;
  audience: {
    collegeIds: string[];
    batches: number[];
    branches: string[];
    minCgpa: number;
  };
  aiMonitoring: {
    faceCheck: boolean;
    cameraCovered: boolean;
    speechInRoom: boolean;
    tabSwitch: boolean;
    pasteCopy: boolean;
  };
  requiresCamera: boolean;
  requiresMicrophone: boolean;
  createdAt: string;
}

export interface Question {
  id: string;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  topics: string[];
  timeLimitSeconds: number;
  memoryLimitMb: number;
  description: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  examples: { input: string; output: string; explanation: string }[];
  mode: 'stdio' | 'function';
  allowedLanguages: string[];
  version: number;
  createdAt: string;
}

export interface Submission {
  id: string;
  attemptId: string;
  language: string;
  codeSizeBytes: number;
  status: 'queued' | 'running' | 'completed' | 'failed';
  verdict: Verdict | null;
  createdAt: string;
}

export interface Attempt {
  id: string;
  testId: string;
  studentId: string;
  status: 'invited' | 'started' | 'submitted' | 'passed' | 'failed' | 'advanced' | 'held' | 'rejected';
  score: number | null;
  startedAt: string | null;
  submittedAt: string | null;
}

export interface Session {
  id: string;
  attemptId: string;
  studentId: string;
  testId: string;
  ip: string | null;
  userAgent: string | null;
  device: string | null;
  browser: string | null;
  timezone: string | null;
  startedAt: string;
}

export interface ProctorEvent {
  id: string;
  sessionId: string;
  type: string;
  offsetMs: number;
  details: Record<string, unknown>;
  confidence: number;
  source: string;
  createdAt: string;
}

export interface Recording {
  id: string;
  sessionId: string;
  kind: 'webcam' | 'screen' | 'audio';
  storageKey: string;
  sizeBytes: number | null;
  retentionDays: number;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  actorType: string;
  actorId: string | null;
  summary: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface AiRun {
  id: string;
  feature: string;
  promptVersion: string;
  inputHash: string;
  output: string;
  accepted: boolean | null;
  acceptedBy: string | null;
  costCents: number | null;
  createdAt: string;
}

export interface EligibilityResult {
  allowed: boolean;
  reason?: string;
}

export interface RiskResult {
  level: RiskLevel;
  reasons: string[];
  score: number;
}

export interface SimilarityMatch {
  otherSubmissionId: string;
  otherStudentName: string;
  jaccard: number;
  reading: SimilarityReading;
}
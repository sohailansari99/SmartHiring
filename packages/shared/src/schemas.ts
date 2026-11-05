// Zod schemas for API contracts. These are the single source of truth for
// request validation across the API. Keep them in sync with the Prisma schema.
import { z } from 'zod';

// --- Auth -----------------------------------------------------------------
export const RegisterCompanySchema = z.object({
  name: z.string().min(2, 'Company name must be at least 2 characters'),
  domain: z
    .string()
    .min(2, 'Domain is required')
    .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i, 'Enter a valid domain like acme.com'),
  industry: z.string().min(1, 'Industry is required'),
  contactEmail: z.string().email('Enter a valid email'),
  studentsToHire: z.number().int().min(0).default(0),
  dataTermsAgreed: z.literal(true, {
    errorMap: () => ({ message: 'You must agree to the candidate-data terms' }),
  }),
});

export type RegisterCompanyInput = z.infer<typeof RegisterCompanySchema>;

export const LoginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export type LoginInput = z.infer<typeof LoginSchema>;

// --- Student --------------------------------------------------------------
export const RegisterStudentSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  collegeId: z.string().min(1, 'Select your college'),
  batchYear: z.number().int().min(2020).max(2035),
  branch: z.string().min(1, 'Branch is required'),
  cgpa: z.number().min(0).max(10),
  rollNo: z.string().min(1, 'Roll number is required'),
  collegeEmail: z.string().email('Enter your college email'),
});

export type RegisterStudentInput = z.infer<typeof RegisterStudentSchema>;

// --- Test audience --------------------------------------------------------
export const TestAudienceSchema = z.object({
  collegeIds: z.array(z.string()).default([]),
  batches: z.array(z.number().int()).default([]),
  branches: z.array(z.string()).default([]),
  minCgpa: z.number().min(0).max(10).default(0),
});

export type TestAudience = z.infer<typeof TestAudienceSchema>;

// --- Test -----------------------------------------------------------------
export const CreateTestSchema = z.object({
  name: z.string().min(2, 'Test name must be at least 2 characters'),
  type: z.enum(['coding', 'aptitude', 'mock', 'ai_interview']),
  durationMinutes: z.number().int().min(5).max(480),
  passMark: z.number().int().min(0).max(100).default(0),
  openAt: z.string().datetime({ offset: true }),
  closeAt: z.string().datetime({ offset: true }),
  questionIds: z.array(z.string()).default([]),
  audience: TestAudienceSchema,
  aiMonitoring: z
    .object({
      faceCheck: z.boolean().default(true),
      cameraCovered: z.boolean().default(true),
      speechInRoom: z.boolean().default(true),
      tabSwitch: z.boolean().default(true),
      pasteCopy: z.boolean().default(true),
    })
    .default({}),
  allowedLanguages: z.array(z.string()).default([]),
  requiresCamera: z.boolean().default(true),
  requiresMicrophone: z.boolean().default(true),
  cpuLimitMs: z.number().int().min(100).default(5000),
  ramLimitMb: z.number().int().min(64).default(256),
});

export type CreateTestInput = z.infer<typeof CreateTestSchema>;

// --- Question -------------------------------------------------------------
export const QuestionExampleSchema = z.object({
  input: z.string(),
  output: z.string(),
  explanation: z.string().optional().default(''),
});

export const QuestionTestCaseSchema = z.object({
  input: z.string(),
  expectedOutput: z.string(),
  hidden: z.boolean().default(true),
});

export const CreateQuestionSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters'),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  topics: z.array(z.string()).default([]),
  timeLimitSeconds: z.number().int().min(1).default(60),
  memoryLimitMb: z.number().int().min(16).default(256),
  description: z.string().min(10, 'Description is required'),
  inputFormat: z.string().default(''),
  outputFormat: z.string().default(''),
  constraints: z.string().default(''),
  examples: z.array(QuestionExampleSchema).min(1, 'At least one example is required'),
  testCases: z.array(QuestionTestCaseSchema).min(2, 'At least 2 test cases are required'),
  mode: z.enum(['stdio', 'function']).default('stdio'),
  allowedLanguages: z.array(z.string()).default([]),
  starterCode: z.record(z.string(), z.string()).default({}),
  referenceSolution: z.record(z.string(), z.string()).default({}),
  customChecker: z.string().optional().default(''),
  floatingPointTolerance: z.number().min(0).max(1e-6).optional(),
});

export type CreateQuestionInput = z.infer<typeof CreateQuestionSchema>;

// --- Submission -----------------------------------------------------------
export const SubmitSchema = z.object({
  code: z.string().max(65536, 'Code must be 64 KB or less'),
  language: z.string().min(1),
  questionId: z.string().min(1),
  testId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

export type SubmitInput = z.infer<typeof SubmitSchema>;

// --- Proctor event --------------------------------------------------------
export const ProctorEventSchema = z.object({
  sessionId: z.string().min(1),
  type: z.string().min(1),
  offsetMs: z.number().int().min(0),
  details: z.record(z.string, z.unknown()).default({}),
  confidence: z.number().min(0).max(1).default(1),
  source: z.literal('browser'),
});

export type ProctorEventInput = z.infer<typeof ProctorEventSchema>;

// --- Decision -------------------------------------------------------------
export const DecisionSchema = z.object({
  status: z.enum(['advanced', 'held', 'rejected']),
  note: z.string().max(2000).optional().default(''),
});

export type DecisionInput = z.infer<typeof DecisionSchema>;
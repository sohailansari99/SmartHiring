// Mock execution engine for Phase 3.
// Simulates sandboxed code execution for Python and C++ stubs.
// Deterministic: given the same (code, input, language), returns the same verdict.
// NOT a real sandbox — used only for testing and development until real workers are built.

import { VERDICT } from '@signal/shared';

export type ExecutionVerdict = typeof VERDICT[keyof typeof VERDICT];

export interface ExecutionResult {
  verdict: ExecutionVerdict;
  stdout: string;
  cpuMs: number;
  memKb: number;
}

// ─── Language profiles ──────────────────────────────────────────────────────
// Each language gets a time multiplier and memory profile.
// Real sandbox will replace these with actual compile/run calls.
const LANGUAGE_PROFILES: Record<string, { timeoutMs: number; memLimitKb: number }> = {
  python:   { timeoutMs: 5000,  memLimitKb: 256000  },
  python3:  { timeoutMs: 5000,  memLimitKb: 256000  },
  cpp:      { timeoutMs: 3000,  memLimitKb: 512000  },
  c:        { timeoutMs: 3000,  memLimitKb: 512000  },
  java:     { timeoutMs: 10000, memLimitKb: 512000  },
  javascript: { timeoutMs: 5000, memLimitKb: 256000 },
  typescript: { timeoutMs: 5000, memLimitKb: 256000 },
  go:       { timeoutMs: 5000,  memLimitKb: 256000  },
  rust:     { timeoutMs: 5000,  memLimitKb: 256000  },
};

// ─── Deterministic mock execution ───────────────────────────────────────────
// This is a PLACEHOLDER — replaces real compiler/runtime calls.
// In production, this function is replaced by the judge worker service.

export function mockExecute(
  code: string,
  inputs: string[],
  language: string,
  questionTimeLimitSec: number,
  questionMemLimitMb: number,
): ExecutionResult[] {
  const langKey = language.toLowerCase().trim();
  const profile = LANGUAGE_PROFILES[langKey] || LANGUAGE_PROFILES['python'];
  const effectiveTimeoutMs = Math.min(profile.timeoutMs, questionTimeLimitSec * 1000);
  const effectiveMemKb = Math.min(profile.memLimitKb, questionMemLimitMb * 1024);

  // Deterministic heuristic:
  // 1. If code is empty → Compile error
  // 2. If code length > 64KB → Runtime error
  // 3. Simple pattern matching for "correct solution" signatures
  //    (In real system, this would be actual test case comparison)

  const results: ExecutionResult[] = [];

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];

    // Check 1: Empty code
    if (!code.trim()) {
      results.push({
        verdict: VERDICT.COMPILE_ERROR,
        stdout: '',
        cpuMs: 0,
        memKb: 0,
      });
      continue;
    }

    // Check 2: Code too large
    if (code.length > 65536) {
      results.push({
        verdict: VERDICT.RUNTIME_ERROR,
        stdout: 'Code exceeds 64KB limit',
        cpuMs: 1,
        memKb: 0,
      });
      continue;
    }

    // Check 3: Heuristic simulation
    // In production, real compiler/runtime produces actual output
    // Here we simulate deterministic behavior based on code characteristics

    const codeLower = code.toLowerCase();
    const inputTrimmed = input.trim();

    // Simulate: if code contains common patterns associated with correct solutions
    const hasCorrectLogic =
      codeLower.includes('print') && inputTrimmed.length > 0 &&
      !codeLower.includes('error') && !codeLower.includes('exception');

    if (hasCorrectLogic) {
      // Deterministic pseudo-random based on input + code length so identical inputs always produce same result
      const seed = (code.length + input.length * 31) % 100;
      const cpuMs = seed % 40 + 10;
      const memKb = seed % 80 + 512;
      results.push({
        verdict: VERDICT.ACCEPTED,
        stdout: inputTrimmed, // Echo input as output for simple stdio problems
        cpuMs,
        memKb,
      });
    } else {
      const seed = (code.length + input.length * 31 + 50) % 100;
      const cpuMs = seed % 60 + 5;
      const memKb = seed % 120 + 256;
      // Simulate some non-accepted cases hitting limits
      const finalVerdict = seed > 70 ? VERDICT.TIME_LIMIT : VERDICT.WRONG_ANSWER;
      results.push({
        verdict: finalVerdict,
        stdout: '',
        cpuMs,
        memKb,
      });
    }
  }

  return results;
}

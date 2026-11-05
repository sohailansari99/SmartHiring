// Append-only audit log helper.
// Every call here writes a single row to audit_log. It is the only place
// that may write to audit_log. Nothing in the app writes to it directly.
//
// The log is append-only: rows are inserted, never updated or deleted by
// application code. Deletion is a separate, separately-approved process.

import type { PrismaClient } from '@signal/db';
import { AUDIT_ACTIONS, type AuditAction } from './constants.js';

export interface AuditEntry {
  action: AuditAction | (string & {});
  actorType: 'user' | 'system' | 'student' | 'officer' | 'admin';
  actorId: string | null;
  deviceId?: string | null;
  company?: string | null;
  targetTable?: string | null;
  targetId?: string | null;
  summary: string;
  details?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
}

function validateSummary(summary: string): string {
  if (typeof summary !== 'string' || summary.trim().length === 0) {
    throw new Error('audit summary must be a non-empty string');
  }
  return summary.trim();
}

function validateAction(action: string): string {
  if (typeof action !== 'string' || action.trim().length === 0) {
    throw new Error('audit action must be a non-empty string');
  }
  return action.trim();
}

export function createAuditLogger(db: PrismaClient) {
  return async function logAudit(entry: AuditEntry): Promise<void> {
    const action = validateAction(entry.action);
    const summary = validateSummary(entry.summary);

    await db.auditLog.create({
      data: {
        action,
        actorType: entry.actorType,
        actorId: entry.actorId ?? null,
        deviceId: entry.deviceId ?? null,
        company: entry.company ?? null,
        targetTable: entry.targetTable ?? null,
        targetId: entry.targetId ?? null,
        summary,
        details: entry.details ?? null,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
      },
    });
  };
}

export type AuditLogger = ReturnType<typeof createAuditLogger>;

// Convenience: build a summary sentence from a structured decision.
export function decisionSummary(action: AuditAction, who: string, what: string): string {
  return `${who} ${action.replace(/\./g, ' ')}: ${what}`;
}

export { AUDIT_ACTIONS };
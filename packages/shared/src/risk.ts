// Proctoring risk scoring.
// Signals are weighted into a transparent score. The score decides a review
// PRIORITY (Low / Medium / High) only. It never ends a test and never
// rejects a candidate. A person always makes the decision.
//
// Weights are intentionally small and documented. Tunable per company
// in a later phase; for now they live here as constants.

import type { RiskLevel, ProctorEventType } from './constants.js';

export interface RiskEvent {
  type: ProctorEventType | (string & {});
  details?: Record<string, unknown>;
}

export interface RiskWeights {
  faceCheck: number;
  multiFace: number;
  cameraCovered: number;
  darkFrame: number;
  movement: number;
  sustainedSpeech: number;
  tabSwitch: number;
  windowSwitch: number;
  fullscreenExit: number;
  paste: number;
  copy: number;
  cut: number;
  networkDrop: number;
  deviceChange: number;
  permissionLost: number;
  streamLost: number;
}

export const DEFAULT_RISK_WEIGHTS: RiskWeights = {
  faceCheck: 2,
  multiFace: 3,
  cameraCovered: 3,
  darkFrame: 2,
  movement: 1,
  sustainedSpeech: 1,
  tabSwitch: 1,
  fullscreenExit: 1,
  paste: 1,
  copy: 1,
  cut: 1,
  networkDrop: 1,
  deviceChange: 2,
  permissionLost: 2,
  streamLost: 3,
};

export const RISK_THRESHOLDS = {
  LOW_MAX: 2,
  MEDIUM_MAX: 6,
} as const;

export interface RiskResult {
  level: RiskLevel;
  reasons: string[];
  score: number;
}

/**
 * Compute a review priority from a list of proctor events.
 *
 * The score is a simple weighted sum. The level buckets are:
 *   0-2   Low
 *   3-6   Medium
 *   7+    High
 *
 * Reasons are human-readable sentences shown next to the level in the UI.
 */
export function scoreRisk(events: RiskEvent[], weights: RiskWeights = DEFAULT_RISK_WEIGHTS): RiskResult {
  const score = events.reduce((acc, e) => {
    const w = (weights as Record<string, number>)[e.type] ?? 0;
    return acc + w;
  }, 0);

  const reasons = events
    .map((e) => reasonForEvent(e, weights))
    .filter((r): r is string => r !== null);

  let level: RiskLevel;
  if (score <= RISK_THRESHOLDS.LOW_MAX) level = 'Low';
  else if (score <= RISK_THRESHOLDS.MEDIUM_MAX) level = 'Medium';
  else level = 'High';

  return { level, reasons, score };
}

function reasonForEvent(event: RiskEvent, weights: RiskWeights): string | null {
  const w = (weights as Record<string, number>)[event.type] ?? 0;
  if (w === 0) return null;

  const detail = (event.details ?? {}) as Record<string, unknown>;
  switch (event.type) {
    case 'face_check':
      if (detail.faces === 0) return `No face detected in frame (weight ${w})`;
      if ((detail.faces as number) > 1) return `${detail.faces} faces detected in frame (weight ${w})`;
      return null;
    case 'camera_covered':
      return `Camera appears covered (weight ${w})`;
    case 'dark_frame':
      return `Frame too dark to see the candidate (weight ${w})`;
    case 'movement':
      return `Sudden large movement detected (weight ${w})`;
    case 'sustained_speech':
      return `Sustained speech detected in the room (weight ${w})`;
    case 'tab_switch':
      return `Switched away from the test tab (weight ${w})`;
    case 'window_switch':
      return `Switched to another window (weight ${w})`;
    case 'fullscreen_exit':
      return `Exited fullscreen (weight ${w})`;
    case 'paste':
      return `Pasted ${detail.lines ?? '?'} lines into the editor (weight ${w})`;
    case 'copy':
      return `Copied text inside the test (weight ${w})`;
    case 'cut':
      return `Cut text inside the test (weight ${w})`;
    case 'network_drop':
      return `Network connection dropped (weight ${w})`;
    case 'device_change':
      return `Device or browser changed mid-test (weight ${w})`;
    case 'permission_lost':
      return `Camera or microphone permission lost (weight ${w})`;
    case 'stream_lost':
      return `Camera or microphone stream lost (weight ${w})`;
    default:
      return null;
  }
}
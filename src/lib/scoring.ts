import {
  MAX_SPEED_BONUS,
  POINTS_CORRECT,
  SPEED_BONUS_WINDOW,
  type Decision,
} from "./types";

/**
 * Server-side scoring. Correctness dominates: a wrong answer scores zero
 * no matter how fast it was, and the speed bonus is capped at half the
 * value of being right.
 */
export function computePoints(params: {
  isCorrect: boolean;
  msTaken: number;
  windowMs: number;
}): number {
  if (!params.isCorrect) return 0;
  if (params.windowMs <= 0) return POINTS_CORRECT;

  const bonusWindow = params.windowMs * SPEED_BONUS_WINDOW;
  if (params.msTaken <= 0) return POINTS_CORRECT + MAX_SPEED_BONUS;
  if (params.msTaken >= bonusWindow) return POINTS_CORRECT;

  const fraction = 1 - params.msTaken / bonusWindow;
  return POINTS_CORRECT + Math.round(MAX_SPEED_BONUS * fraction);
}

/**
 * Deterministic tie-break for the leaderboard:
 * higher score, then fewer total milliseconds spent voting (faster),
 * then earlier join time, then player id. Always returns a stable order.
 */
export function comparePlayers(
  a: { score: number; joinedAt: string; id: string; msTotal?: number },
  b: { score: number; joinedAt: string; id: string; msTotal?: number },
): number {
  if (b.score !== a.score) return b.score - a.score;
  const at = a.msTotal ?? 0;
  const bt = b.msTotal ?? 0;
  if (at !== bt) return at - bt;
  const aj = Date.parse(a.joinedAt);
  const bj = Date.parse(b.joinedAt);
  if (aj !== bj) return aj - bj;
  return a.id.localeCompare(b.id);
}

export function sanitizeNickname(raw: string): string {
  const cleaned = (raw ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, 24);
  return cleaned;
}

export function isValidDecision(value: unknown): value is Decision {
  return value === "APPROVE" || value === "DENY";
}

export const NICKNAME_MIN = 1;
export const NICKNAME_MAX = 24;
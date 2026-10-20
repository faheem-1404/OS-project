/**
 * CampusLock — shared domain types.
 *
 * Nothing in this file may contain the answer key (`correctDecision`,
 * `explanation`, `principle`). Those live on the server only and are
 * attached to a public payload *after* the host reveals a round.
 */

export type Decision = "APPROVE" | "DENY";

export type RoomStatus =
  | "waiting"
  | "countdown"
  | "active"
  | "revealing"
  | "paused"
  | "finished";

export type RoundStatus = "pending" | "open" | "closed" | "revealed";

export type Transport = "supabase" | "local";

/** Scenario as shown to players — no answer information. */
export interface PublicScenario {
  roundIndex: number;
  title: string;
  description: string;
  resourceType: string;
  requesterRole: string;
  accessRequest: string;
}

/** Answer key fragment, only ever sent after a reveal. */
export interface RevealPayload {
  roundIndex: number;
  correctDecision: Decision;
  explanation: string;
  principle: string;
}

export interface EmergencyAccessRequest {
  id: string;
  playerId: string;
  playerNickname: string;
  playerRole: string;
  resourceId: string;
  resourceName: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: number;
}

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  actor: string;
  action: string;
  targetResource?: string;
  outcome: "GRANTED" | "DENIED" | "REVOKED" | "PROMOTED" | "DEMOTED" | "EMERGENCY_APPROVED" | "EMERGENCY_REJECTED";
  detail: string;
}

export interface PlayerView {
  id: string;
  nickname: string;
  score: number;
  isBot: boolean;
  isConnected: boolean;
  joinedAt: string;
  roleId: string;
  badgeStatus: "active" | "revoked";
  temporaryGrants: Array<{ resourceId: string; expiresAt: number }>;
}

export interface VoteTally {
  approve: number;
  deny: number;
  total: number;
}

/** A round as exposed to host / screen / player clients. */
export interface RoundView {
  roundIndex: number;
  status: RoundStatus;
  /** Server timestamp (epoch ms) when voting opened — null until then. */
  openedAt: number | null;
  /** Server timestamp (epoch ms) when voting auto-closes — null until then. */
  endsAt: number | null;
  tally: VoteTally;
  /** Populated only once status === "revealed". */
  reveal: RevealPayload | null;
}

/** The complete, authoritative room snapshot every client renders from. */
export interface RoomSnapshot {
  code: string;
  transport: Transport;
  status: RoomStatus;
  currentRound: number;
  totalRounds: number;
  questionDuration: number;
  isDemo: boolean;
  /** Server clock, epoch ms. Clients compute offsets from this. */
  serverNow: number;
  round: RoundView | null;
  /** The live scenario, without any answer information. */
  scenario: PublicScenario | null;
  players: PlayerView[];
  leaderboard: PlayerView[];
  accessRequests?: EmergencyAccessRequest[];
  auditLogs?: AuditLogEntry[];
  /** Set by the API/SSE routes when the caller holds a valid player token. */
  me?: {
    id: string;
    vote: MyVote | null;
    roleId?: string;
    badgeStatus?: "active" | "revoked";
    temporaryGrants?: Array<{ resourceId: string; expiresAt: number }>;
  } | null;
  /** Present only for the authenticated host. */
  isHost?: boolean;
}

/** The current player's own vote on the active round. */
export interface MyVote {
  roundIndex: number;
  decision: Decision;
  points: number | null;
}

export interface ActionResult<T = void> {
  ok: boolean;
  error?: string;
  data?: T;
}

export const POINTS_CORRECT = 100;
export const MAX_SPEED_BONUS = 50;
/** Bonus decays linearly across the first 70% of the question window. */
export const SPEED_BONUS_WINDOW = 0.7;

export const DECISIONS: Decision[] = ["APPROVE", "DENY"];
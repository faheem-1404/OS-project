import type {
  MyVote,
  RoomSnapshot,
  Transport,
} from "@/lib/types";

/**
 * Every game mutation in CampusLock goes through this interface.
 *
 * Two implementations exist:
 *   - SupabaseStore : Postgres + RLS, durable, for real deployments.
 *   - LocalStore    : in-process store with an SSE bus, for offline
 *                     development, automated tests and demo mode.
 *
 * Both enforce identical server-side rules:
 *   - host transitions require a valid host token (no client trust)
 *   - one vote per (round, player), idempotent
 *   - votes rejected once the round is closed / revealed or past endsAt
 *   - scores are computed and written by the server only
 *   - answers are withheld until reveal
 */

export interface CreateRoomInput {
  questionDuration: number;
  totalRounds: number;
  isDemo: boolean;
}

export interface CreateRoomResult {
  snapshot: RoomSnapshot;
  hostToken: string;
}

export interface JoinResult {
  playerId: string;
  playerToken: string;
  snapshot: RoomSnapshot;
}

export interface HostOps {
  createRoom(input: CreateRoomInput): Promise<CreateRoomResult>;
  setQuestionDuration(code: string, hostToken: string, seconds: number): Promise<void>;

  startGame(code: string, hostToken: string): Promise<void>;
  startRound(code: string, hostToken: string): Promise<void>;
  pause(code: string, hostToken: string): Promise<void>;
  resume(code: string, hostToken: string): Promise<void>;
  closeVoting(code: string, hostToken: string): Promise<void>;
  reveal(code: string, hostToken: string): Promise<void>;
  nextRound(code: string, hostToken: string): Promise<void>;
  skipRound(code: string, hostToken: string): Promise<void>;
  restartRound(code: string, hostToken: string): Promise<void>;
  updateUserRole(code: string, hostToken: string, playerId: string, newRole: string): Promise<void>;
  toggleUserRevocation(code: string, hostToken: string, playerId: string): Promise<void>;
  resolveAccessRequest(code: string, hostToken: string, requestId: string, decision: "approve" | "reject"): Promise<void>;
}

export interface PlayerOps {
  join(code: string, nickname: string): Promise<JoinResult>;
  snapshotFor(code: string, playerToken: string | null): Promise<RoomSnapshot>;
  touch(code: string, playerToken: string): Promise<void>;
  submitVote(
    code: string,
    playerToken: string,
    decision: unknown,
  ): Promise<{ vote: MyVote; snapshot: RoomSnapshot }>;
  myVote(code: string, playerToken: string): Promise<MyVote | null>;
  identifyPlayer(code: string, playerToken: string | null): Promise<string | null>;
  attemptAccess(code: string, playerToken: string, resourceId: string): Promise<{ granted: boolean; reason: string }>;
  requestEmergencyAccess(code: string, playerToken: string, resourceId: string, reason: string): Promise<void>;
}

export interface GameStore extends HostOps, PlayerOps {
  transport: Transport;
  snapshot(code: string, opts?: { isHost?: boolean }): Promise<RoomSnapshot | null>;
  /** Advance any time-based transitions (auto-close rounds). */
  tick(code: string): Promise<void>;
  isHost(code: string, hostToken: string): Promise<boolean>;
}

export class GameError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "GameError";
  }
}

export const HOST_ONLY = "This action requires the host session.";
export const NOT_FOUND = "Room not found or expired.";
export const ROOM_FINISHED = "This session has already ended.";
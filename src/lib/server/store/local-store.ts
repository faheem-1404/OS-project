import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { computePoints, isValidDecision, sanitizeNickname } from "@/lib/scoring";
import { CAMPUS_ROLES, evaluateAccess, getResource, getRole } from "@/lib/rbac-rules";
import type {
  AuditLogEntry,
  Decision,
  EmergencyAccessRequest,
  MyVote,
  PlayerView,
  RoomSnapshot,
  RoundView,
} from "@/lib/types";
import { SCENARIOS, scenarioFor, TOTAL_ROUNDS } from "../scenarios";
import { GameError, HOST_ONLY, NOT_FOUND, ROOM_FINISHED } from "./types";

/* ------------------------------------------------------------------ */
/* internal record shapes                                             */
/* ------------------------------------------------------------------ */

interface RoundRecord {
  roundIndex: number;
  status: "pending" | "open" | "closed" | "revealed";
  startsAt: number | null;
  endsAt: number | null;
  closedAt: number | null;
  revealedAt: number | null;
  /** Remaining voting time captured when the host pauses. */
  pausedRemainingMs: number | null;
  skipped: boolean;
}

interface TemporaryGrantRecord {
  resourceId: string;
  expiresAt: number;
}

interface PlayerRecord {
  id: string;
  nickname: string;
  tokenHash: string;
  score: number;
  isBot: boolean;
  isConnected: boolean;
  joinedAt: number;
  lastSeenAt: number;
  /** Total milliseconds spent voting — used for deterministic tie-breaks. */
  msTotal: number;
  roleId: string;
  badgeStatus: "active" | "revoked";
  temporaryGrants: TemporaryGrantRecord[];
  admissionStatus: "pending" | "approved" | "rejected";
}

interface VoteRecord {
  roundIndex: number;
  playerId: string;
  decision: Decision;
  outcome: "correct" | "incorrect";
  msTaken: number;
  points: number;
  submittedAt: number;
}

interface RoomRecord {
  id: string;
  code: string;
  hostTokenHash: string;
  status: RoomSnapshot["status"];
  currentRound: number;
  questionDuration: number;
  totalRounds: number;
  isDemo: boolean;
  createdAt: number;
  expiresAt: number;
  rounds: RoundRecord[];
  players: PlayerRecord[];
  votes: VoteRecord[];
  accessRequests: EmergencyAccessRequest[];
  auditLogs: AuditLogEntry[];
}

/* ------------------------------------------------------------------ */
/* constants                                                          */
/* ------------------------------------------------------------------ */

const COUNTDOWN_MS = 5_000;
const MIN_DURATION = 5;
const MAX_DURATION = 180;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DATA_DIR = process.env.CAMPUSLOCK_DATA_DIR
  ? join(/*turbopackIgnore: true*/ process.cwd(), process.env.CAMPUSLOCK_DATA_DIR)
  : join(process.cwd(), ".data");
const DATA_FILE = join(DATA_DIR, "rooms.json");

/* ------------------------------------------------------------------ */
/* persistence + event bus                                            */
/* ------------------------------------------------------------------ */

interface StoreState {
  rooms: Record<string, RoomRecord>;
}

type Listener = (code: string) => void;

function globalRef<T>(key: string, make: () => T): T {
  const g = globalThis as unknown as Record<string, T | undefined>;
  if (!g[key]) g[key] = make();
  return g[key] as T;
}

function loadState(): StoreState {
  const cached = globalRef<StoreState | null>("__campuslock_state", () => null);
  if (cached) return cached;
  let state: StoreState = { rooms: {} };
  try {
    if (existsSync(DATA_FILE)) {
      state = JSON.parse(readFileSync(DATA_FILE, "utf8")) as StoreState;
    }
  } catch {
    state = { rooms: {} };
  }
  globalRef<StoreState | null>("__campuslock_state", () => state);
  return state;
}

let saveTimer: NodeJS.Timeout | null = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(DATA_FILE, JSON.stringify(loadState()));
    } catch {
      /* best effort */
    }
  }, 250);
}

function listeners(): Set<Listener> {
  return globalRef<Set<Listener>>("__campuslock_listeners", () => new Set());
}

export function subscribeRoom(code: string, fn: Listener): () => void {
  const set = listeners();
  set.add(fn);
  return () => set.delete(fn);
}

function emit(code: string) {
  for (const fn of listeners()) {
    try {
      fn(code);
    } catch {
      /* ignore listener errors */
    }
  }
}

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * The host passphrase is what lets a host reopen their session on a new
 * device. It is human-readable on purpose: 32 random bytes are impossible
 * to retype, and this value is the ONLY thing standing between a stranger
 * and control of a live room.
 */
function newPassphrase(): string {
  const bytes = randomBytes(10);
  let out = "";
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

function newCode(taken: Set<string>): string {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const bytes = randomBytes(6);
    let code = "";
    for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
    if (!taken.has(code)) return code;
  }
  throw new GameError("Could not allocate a room code. Try again.", 503);
}

function tokenMatches(provided: string | null, hash: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(sha256(provided), "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function emptyRound(roundIndex: number): RoundRecord {
  return {
    roundIndex,
    status: "pending",
    startsAt: null,
    endsAt: null,
    closedAt: null,
    revealedAt: null,
    pausedRemainingMs: null,
    skipped: false,
  };
}

/* ------------------------------------------------------------------ */
/* the store                                                          */
/* ------------------------------------------------------------------ */

export class LocalStore {
  readonly transport = "local" as const;

  private get state(): StoreState {
    return loadState();
  }

  private getRoom(code: string): RoomRecord {
    const room = this.state.rooms[code.toUpperCase()];
    if (!room) throw new GameError(NOT_FOUND, 404);
    if (room.expiresAt < Date.now()) throw new GameError(NOT_FOUND, 404);
    return room;
  }

  private findRoom(code: string): RoomRecord | null {
    return this.state.rooms[code.toUpperCase()] ?? null;
  }

  private requireHost(code: string, hostToken: string): RoomRecord {
    const room = this.getRoom(code);
    if (!tokenMatches(hostToken, room.hostTokenHash)) {
      throw new GameError(HOST_ONLY, 403);
    }
    return room;
  }

  private requirePlayer(code: string, playerToken: string | null): {
    room: RoomRecord;
    player: PlayerRecord;
  } {
    const room = this.getRoom(code);
    if (!playerToken) throw new GameError("Join the room first.", 401);
    const player = room.players.find((p) => tokenMatches(playerToken, p.tokenHash));
    if (!player) throw new GameError("Your session expired. Re-join the room.", 401);
    player.isConnected = true;
    player.lastSeenAt = Date.now();
    return { room, player };
  }

  private roundOf(room: RoomRecord, index: number): RoundRecord {
    let round = room.rounds.find((r) => r.roundIndex === index);
    if (!round) {
      round = emptyRound(index);
      room.rounds.push(round);
    }
    return round;
  }

  private activeRound(room: RoomRecord): RoundRecord | null {
    if (room.currentRound <= 0) return null;
    return this.roundOf(room, room.currentRound);
  }

  /** Auto-close a round whose voting window has elapsed. */
  async tick(code: string): Promise<void> {
    const room = this.findRoom(code.toUpperCase());
    if (!room) return;
    const now = Date.now();
    let changed = false;
    for (const round of room.rounds) {
      if (round.status === "open" && round.endsAt !== null && now >= round.endsAt) {
        round.status = "closed";
        round.closedAt = now;
        round.endsAt = null;
        changed = true;
      }
    }
    if (changed) {
      this.recomputeStatus(room, now);
      scheduleSave();
      emit(room.code);
    }
  }

  private recomputeStatus(room: RoomRecord, now: number) {
    if (room.status === "finished") return;
    const round = this.activeRound(room);
    if (!round) return;
    if (round.status === "revealed") {
      room.status = "revealing";
      return;
    }
    if (round.status === "closed") {
      room.status = "active";
      return;
    }
    if (round.startsAt !== null && now < round.startsAt) {
      room.status = "countdown";
      return;
    }
    if (room.status === "paused") return;
    room.status = "active";
  }

  /* ---------------------------- host ops --------------------------- */

  async createRoom(input: {
    questionDuration: number;
    totalRounds: number;
    isDemo: boolean;
  }): Promise<{ snapshot: RoomSnapshot; hostToken: string }> {
    const taken = new Set(Object.keys(this.state.rooms));
    const code = newCode(taken);
    const hostToken = newPassphrase();
    const now = Date.now();
    const totalRounds = Math.min(
      Math.max(1, input.totalRounds || TOTAL_ROUNDS),
      SCENARIOS.length,
    );

    const room: RoomRecord = {
      id: randomUUID(),
      code,
      hostTokenHash: sha256(hostToken),
      status: "waiting",
      currentRound: 0,
      questionDuration: Math.min(
        Math.max(MIN_DURATION, Math.round(input.questionDuration) || 25),
        MAX_DURATION,
      ),
      totalRounds,
      isDemo: input.isDemo,
      createdAt: now,
      expiresAt: now + 6 * 60 * 60 * 1000,
      rounds: [],
      players: [],
      votes: [],
      accessRequests: [],
      auditLogs: [
        {
          id: randomUUID(),
          timestamp: now,
          actor: "SYSTEM",
          action: "ROOM_INITIALIZED",
          outcome: "GRANTED",
          detail: `CampusLock RBAC Security Engine initialized for room ${code}. Standard policy profiles active.`,
        },
      ],
    };

    for (let i = 1; i <= totalRounds; i += 1) room.rounds.push(emptyRound(i));
    this.state.rooms[code] = room;

    // Demo players are seeded here and vote when each round opens, so a
    // rehearsal looks alive without any real phones. They are always
    // flagged `isBot` and never touch production rooms.
    if (input.isDemo) this.seedDemoPlayers(room);

    scheduleSave();
    emit(code);
    return { snapshot: this.toSnapshot(room, true), hostToken };
  }

  private seedDemoPlayers(room: RoomRecord) {
    const names = [
      "Aisha", "Ben", "Chloe", "Dev", "Elif", "Farhan", "Grace", "Hugo",
      "Ines", "Jonas", "Kavya", "Liam", "Maya", "Noah", "Omar", "Priya",
      "Quinn", "Ravi", "Sara", "Tomas", "Uma", "Vikram", "Wendy", "Xavi",
      "Yara", "Zane",
    ];
    const now = Date.now();
    names.forEach((nickname, i) => {
      const role = CAMPUS_ROLES[i % CAMPUS_ROLES.length];
      const player: PlayerRecord = {
        id: randomUUID(),
        nickname,
        tokenHash: sha256(`bot:${room.code}:${nickname}`),
        score: 0,
        isBot: true,
        isConnected: true,
        joinedAt: now + i,
        lastSeenAt: now,
        msTotal: 0,
        roleId: role.id,
        badgeStatus: "active",
        temporaryGrants: [],
        admissionStatus: "approved",
      };
      room.players.push(player);
      this.castBotVote(room, player);
    });
  }

  /**
   * Demo-only. Bot answers are generated at round start with a spread of
   * reaction times so the live vote bars actually move. Demo rooms never
   * mix bots into a real class session.
   */
  private castBotVote(room: RoomRecord, player: PlayerRecord, openAt = Date.now()) {
    const round = this.activeRound(room);
    if (!round || round.status !== "open" || !player.isBot) return;
    if (room.votes.some((v) => v.roundIndex === round.roundIndex && v.playerId === player.id)) return;
    const scenario = scenarioFor(round.roundIndex);
    if (!scenario) return;
    const start = round.startsAt ?? openAt;
    const span = Math.max(1, (round.endsAt ?? start) - start);
    const msTaken = Math.floor(Math.random() ** 1.7 * span);
    const decision: Decision =
      Math.random() < 0.72 ? scenario.correctDecision : scenario.correctDecision === "DENY" ? "APPROVE" : "DENY";
    room.votes.push({
      roundIndex: round.roundIndex,
      playerId: player.id,
      decision,
      outcome: decision === scenario.correctDecision ? "correct" : "incorrect",
      msTaken,
      points: 0,
      submittedAt: start + msTaken,
    });
  }

  async isHost(code: string, hostToken: string): Promise<boolean> {
    const room = this.findRoom(code.toUpperCase());
    if (!room) return false;
    return tokenMatches(hostToken, room.hostTokenHash);
  }

  async setQuestionDuration(code: string, hostToken: string, seconds: number): Promise<void> {
    const room = this.requireHost(code, hostToken);
    if (room.status !== "waiting") throw new GameError("Duration can only change before the game starts.", 409);
    room.questionDuration = Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.round(seconds)));
    scheduleSave();
    emit(room.code);
  }

  async startGame(code: string, hostToken: string): Promise<void> {
    const room = this.requireHost(code, hostToken);
    if (room.status === "finished") throw new GameError(ROOM_FINISHED, 409);
    if (room.currentRound !== 0) throw new GameError("The game has already started.", 409);
    this.openRound(room, 1);
  }

  async startRound(code: string, hostToken: string): Promise<void> {
    const room = this.requireHost(code, hostToken);
    if (room.status === "finished") throw new GameError(ROOM_FINISHED, 409);
    if (room.currentRound !== 0) throw new GameError("Round already in progress.", 409);
    this.openRound(room, 1);
  }

  private openRound(room: RoomRecord, roundIndex: number) {
    const now = Date.now();
    const round = this.roundOf(room, roundIndex);
    if (round.status !== "pending") {
      throw new GameError("That round has already been played.", 409);
    }
    if (!scenarioFor(roundIndex)) throw new GameError("No scenario for that round.", 400);

    const startsAt = now + COUNTDOWN_MS;
    round.status = "open";
    round.startsAt = startsAt;
    round.endsAt = startsAt + room.questionDuration * 1000;
    round.pausedRemainingMs = null;
    round.skipped = false;
    room.currentRound = roundIndex;
    room.status = "countdown";

    if (room.isDemo) {
      for (const player of room.players) this.castBotVote(room, player, startsAt);
    }

    scheduleSave();
    emit(room.code);
  }

  async pause(code: string, hostToken: string): Promise<void> {
    const room = this.requireHost(code, hostToken);
    const round = this.activeRound(room);
    if (!round || round.status !== "open") throw new GameError("Nothing to pause.", 409);
    round.pausedRemainingMs = Math.max(0, (round.endsAt ?? Date.now()) - Date.now());
    round.endsAt = null;
    room.status = "paused";
    scheduleSave();
    emit(room.code);
  }

  async resume(code: string, hostToken: string): Promise<void> {
    const room = this.requireHost(code, hostToken);
    const round = this.activeRound(room);
    if (!round || round.status !== "open") throw new GameError("Nothing to resume.", 409);
    round.endsAt = Date.now() + (round.pausedRemainingMs ?? room.questionDuration * 1000);
    round.pausedRemainingMs = null;
    room.status = "active";
    scheduleSave();
    emit(room.code);
  }

  async closeVoting(code: string, hostToken: string): Promise<void> {
    const room = this.requireHost(code, hostToken);
    const round = this.activeRound(room);
    if (!round || round.status !== "open") throw new GameError("Voting is not open.", 409);
    round.status = "closed";
    round.closedAt = Date.now();
    round.endsAt = null;
    room.status = "active";
    scheduleSave();
    emit(room.code);
  }

  private settleRound(room: RoomRecord, round: RoundRecord, award: boolean) {
    const scenario = scenarioFor(round.roundIndex);
    if (!scenario) return;
    const windowMs = room.questionDuration * 1000;

    for (const vote of room.votes) {
      if (vote.roundIndex !== round.roundIndex) continue;
      if (vote.points !== 0 && !award) continue;
      const isCorrect = vote.decision === scenario.correctDecision;
      vote.outcome = isCorrect ? "correct" : "incorrect";
      vote.points = award
        ? computePoints({ isCorrect, msTaken: vote.msTaken, windowMs })
        : 0;
      const player = room.players.find((p) => p.id === vote.playerId);
      if (player && award) {
        player.score += vote.points;
        player.msTotal += vote.msTaken;
      }
    }
  }

  async reveal(code: string, hostToken: string): Promise<void> {
    const room = this.requireHost(code, hostToken);
    const round = this.activeRound(room);
    if (!round) throw new GameError("No active round.", 409);
    if (round.status !== "open" && round.status !== "closed") {
      throw new GameError("This round has already been revealed.", 409);
    }
    if (round.endsAt !== null && Date.now() >= round.endsAt) {
      round.status = "closed";
    }
    round.status = "revealed";
    round.revealedAt = Date.now();
    round.closedAt = round.closedAt ?? Date.now();
    round.endsAt = null;
    this.settleRound(room, round, true);
    room.status = "revealing";
    scheduleSave();
    emit(room.code);
  }

  async skipRound(code: string, hostToken: string): Promise<void> {
    const room = this.requireHost(code, hostToken);
    const round = this.activeRound(room);
    if (!round) throw new GameError("No active round.", 409);
    if (round.status !== "open" && round.status !== "closed") {
      throw new GameError("This round is already resolved.", 409);
    }
    round.status = "revealed";
    round.skipped = true;
    round.revealedAt = Date.now();
    round.closedAt = round.closedAt ?? Date.now();
    round.endsAt = null;
    this.settleRound(room, round, false);
    room.status = "revealing";
    scheduleSave();
    emit(room.code);
  }

  async nextRound(code: string, hostToken: string): Promise<void> {
    const room = this.requireHost(code, hostToken);
    if (room.status === "finished") throw new GameError(ROOM_FINISHED, 409);
    const round = this.activeRound(room);
    if (!round) throw new GameError("No active round.", 409);
    if (round.status !== "revealed") {
      throw new GameError("Reveal the answer before moving on.", 409);
    }
    const next = room.currentRound + 1;
    if (next > room.totalRounds) {
      await this.endGame(code, hostToken);
      return;
    }
    this.openRound(room, next);
  }

  async restartRound(code: string, hostToken: string): Promise<void> {
    const room = this.requireHost(code, hostToken);
    const round = this.activeRound(room);
    if (!round) throw new GameError("No active round.", 409);
    if (round.status === "revealed") throw new GameError("This round is already scored.", 409);
    const cast = room.votes.filter((v) => v.roundIndex === round.roundIndex).length;
    if (cast > 0) throw new GameError("Votes have already been cast for this round.", 409);

    const fresh = emptyRound(round.roundIndex);
    const idx = room.rounds.findIndex((r) => r.roundIndex === round.roundIndex);
    if (idx >= 0) room.rounds[idx] = fresh;
    room.votes = room.votes.filter((v) => v.roundIndex !== round.roundIndex);
    const startsAt = Date.now() + COUNTDOWN_MS;
    fresh.status = "open";
    fresh.startsAt = startsAt;
    fresh.endsAt = startsAt + room.questionDuration * 1000;
    room.status = "countdown";
    scheduleSave();
    emit(room.code);
  }

  async endGame(code: string, hostToken: string): Promise<void> {
    const room = this.requireHost(code, hostToken);
    room.status = "finished";
    room.currentRound = Math.max(room.currentRound, room.totalRounds);
    scheduleSave();
    emit(room.code);
  }

  async updateUserRole(
    code: string,
    hostToken: string,
    playerId: string,
    newRole: string,
  ): Promise<void> {
    const room = this.requireHost(code, hostToken);
    const player = room.players.find((p) => p.id === playerId);
    if (!player) throw new GameError("Player not found.", 404);
    const role = getRole(newRole);
    const oldRole = getRole(player.roleId ?? "undergrad");
    const isPromotion = role.level >= oldRole.level;
    player.roleId = role.id;
    const now = Date.now();
    if (!room.auditLogs) room.auditLogs = [];
    room.auditLogs.unshift({
      id: randomUUID(),
      timestamp: now,
      actor: "ADMIN",
      action: isPromotion ? "ROLE_PROMOTED" : "ROLE_DEMOTED",
      outcome: isPromotion ? "PROMOTED" : "DEMOTED",
      detail: `Admin ${isPromotion ? "promoted" : "demoted"} ${player.nickname} to "${role.name}" (Level ${role.level}).`,
    });
    if (room.auditLogs.length > 100) room.auditLogs.pop();
    scheduleSave();
    emit(room.code);
  }

  async toggleUserRevocation(code: string, hostToken: string, playerId: string): Promise<void> {
    const room = this.requireHost(code, hostToken);
    const player = room.players.find((p) => p.id === playerId);
    if (!player) throw new GameError("Player not found.", 404);
    const wasRevoked = player.badgeStatus === "revoked";
    player.badgeStatus = wasRevoked ? "active" : "revoked";
    const now = Date.now();
    if (!room.auditLogs) room.auditLogs = [];
    room.auditLogs.unshift({
      id: randomUUID(),
      timestamp: now,
      actor: "ADMIN",
      action: "REVOCATION_TOGGLE",
      outcome: wasRevoked ? "GRANTED" : "REVOKED",
      detail: `Admin ${wasRevoked ? "RESTORED" : "REVOKED"} credential badge for ${player.nickname}.`,
    });
    if (room.auditLogs.length > 100) room.auditLogs.pop();
    scheduleSave();
    emit(room.code);
  }

  async resolveAccessRequest(
    code: string,
    hostToken: string,
    requestId: string,
    decision: "approve" | "reject",
  ): Promise<void> {
    const room = this.requireHost(code, hostToken);
    if (!room.accessRequests) room.accessRequests = [];
    const req = room.accessRequests.find((r) => r.id === requestId);
    if (!req) throw new GameError("Request not found.", 404);
    if (req.status !== "pending") throw new GameError("Request has already been processed.", 409);

    const now = Date.now();
    req.status = decision === "approve" ? "approved" : "rejected";
    const player = room.players.find((p) => p.id === req.playerId);

    if (!room.auditLogs) room.auditLogs = [];
    if (decision === "approve" && player) {
      if (!player.temporaryGrants) player.temporaryGrants = [];
      const expiresAt = now + 60 * 1000;
      player.temporaryGrants.push({
        resourceId: req.resourceId,
        expiresAt,
      });
      room.auditLogs.unshift({
        id: randomUUID(),
        timestamp: now,
        actor: "ADMIN",
        action: "EMERGENCY_APPROVED",
        targetResource: req.resourceName,
        outcome: "EMERGENCY_APPROVED",
        detail: `Admin APPROVED 60s emergency pass for ${req.playerNickname} (${req.playerRole}) to enter ${req.resourceName}.`,
      });
    } else {
      room.auditLogs.unshift({
        id: randomUUID(),
        timestamp: now,
        actor: "ADMIN",
        action: "EMERGENCY_REJECTED",
        targetResource: req.resourceName,
        outcome: "EMERGENCY_REJECTED",
        detail: `Admin REJECTED emergency access request from ${req.playerNickname} for ${req.resourceName}.`,
      });
    }
    if (room.auditLogs.length > 100) room.auditLogs.pop();
    scheduleSave();
    emit(room.code);
  }

  async resolveAdmission(
    code: string,
    hostToken: string,
    playerId: string,
    decision: "approve" | "reject",
  ): Promise<void> {
    const room = this.requireHost(code, hostToken);

    const player = room.players.find((p) => p.id === playerId);
    if (!player) throw new GameError(NOT_FOUND, 404);

    player.admissionStatus = decision === "approve" ? "approved" : "rejected";

    if (!room.auditLogs) room.auditLogs = [];
    room.auditLogs.unshift({
      id: randomUUID(),
      timestamp: Date.now(),
      actor: "Security Host",
      action: "ADMISSION_DECISION",
      outcome: decision === "approve" ? "ADMISSION_APPROVED" : "ADMISSION_REJECTED",
      detail: `${player.nickname}'s campus entry was ${decision === "approve" ? "approved" : "declined"}.`,
    });
    if (room.auditLogs.length > 100) room.auditLogs.pop();

    scheduleSave();
    emit(room.code);
  }

  async approveAllAdmissions(code: string, hostToken: string): Promise<void> {
    const room = this.requireHost(code, hostToken);

    let count = 0;
    for (const p of room.players) {
      if (p.admissionStatus === "pending") {
        p.admissionStatus = "approved";
        count++;
      }
    }

    if (count > 0) {
      if (!room.auditLogs) room.auditLogs = [];
      room.auditLogs.unshift({
        id: randomUUID(),
        timestamp: Date.now(),
        actor: "Security Host",
        action: "BATCH_ADMISSION",
        outcome: "ADMISSION_APPROVED",
        detail: `Host approved admission for ${count} student(s).`,
      });
      if (room.auditLogs.length > 100) room.auditLogs.pop();
    }

    scheduleSave();
    emit(room.code);
  }

  /* --------------------------- player ops -------------------------- */

  async join(code: string, nicknameRaw: string): Promise<{
    playerId: string;
    playerToken: string;
    snapshot: RoomSnapshot;
  }> {
    const room = this.getRoom(code);
    if (room.status === "finished") throw new GameError(ROOM_FINISHED, 409);

    const nickname = sanitizeNickname(nicknameRaw);
    if (nickname.length < 1) throw new GameError("Pick a nickname of 1–24 characters.");
    if (room.players.length >= 200) throw new GameError("This room is full.", 409);

    const taken = new Set(
      room.players.map((p) => p.nickname.toLowerCase()),
    );
    if (taken.has(nickname.toLowerCase())) {
      throw new GameError("That nickname is already taken in this room.", 409);
    }

    const role = CAMPUS_ROLES[room.players.length % CAMPUS_ROLES.length];
    const playerToken = newToken();
    const now = Date.now();
    const player: PlayerRecord = {
      id: randomUUID(),
      nickname,
      tokenHash: sha256(playerToken),
      score: 0,
      isBot: false,
      isConnected: true,
      joinedAt: now,
      lastSeenAt: now,
      msTotal: 0,
      roleId: role.id,
      badgeStatus: "active",
      temporaryGrants: [],
      admissionStatus: "pending",
    };
    room.players.push(player);
    if (!room.auditLogs) room.auditLogs = [];
    room.auditLogs.unshift({
      id: randomUUID(),
      timestamp: now,
      actor: nickname,
      action: "IDENTITY_ISSUED",
      outcome: "GRANTED",
      detail: `Digital badge assigned: ${nickname} as "${role.name}" (Level ${role.level}).`,
    });
    if (room.auditLogs.length > 100) room.auditLogs.pop();
    scheduleSave();
    emit(room.code);

    return {
      playerId: player.id,
      playerToken,
      snapshot: this.toSnapshot(room, false),
    };
  }

  async snapshotFor(code: string, playerToken: string | null): Promise<RoomSnapshot> {
    const room = this.getRoom(code);
    if (playerToken) {
      const player = room.players.find((p) => tokenMatches(playerToken, p.tokenHash));
      if (player) {
        player.isConnected = true;
        player.lastSeenAt = Date.now();
      }
    }
    return this.toSnapshot(room, false);
  }

  async snapshot(code: string, opts?: { isHost?: boolean }): Promise<RoomSnapshot | null> {
    const room = this.findRoom(code.toUpperCase());
    if (!room) return null;
    if (room.expiresAt < Date.now()) return null;
    return this.toSnapshot(room, opts?.isHost ?? false);
  }

  async touch(code: string, playerToken: string): Promise<void> {
    const room = this.getRoom(code);
    const player = room.players.find((p) => tokenMatches(playerToken, p.tokenHash));
    if (!player) return;
    const wasDisconnected = !player.isConnected;
    player.isConnected = true;
    player.lastSeenAt = Date.now();
    if (wasDisconnected) emit(room.code);
  }

  async identifyPlayer(code: string, playerToken: string | null): Promise<string | null> {
    if (!playerToken) return null;
    try {
      const room = this.getRoom(code);
      const player = room.players.find((p) => tokenMatches(playerToken, p.tokenHash));
      return player?.id ?? null;
    } catch {
      return null;
    }
  }

  async myVote(code: string, playerToken: string): Promise<MyVote | null> {
    const room = this.getRoom(code);
    const player = room.players.find((p) => tokenMatches(playerToken, p.tokenHash));
    if (!player) return null;
    const round = this.activeRound(room);
    if (!round) return null;
    const vote = room.votes.find(
      (v) => v.roundIndex === round.roundIndex && v.playerId === player.id,
    );
    if (!vote) return null;
    return {
      roundIndex: round.roundIndex,
      decision: vote.decision,
      points: round.status === "revealed" ? vote.points : null,
    };
  }

  async submitVote(
    code: string,
    playerToken: string,
    decision: unknown,
  ): Promise<{ vote: MyVote; snapshot: RoomSnapshot }> {
    if (!isValidDecision(decision)) throw new GameError("Invalid decision.");
    const { room, player } = this.requirePlayer(code, playerToken);
    if (room.status === "finished") throw new GameError(ROOM_FINISHED, 409);

    const round = this.activeRound(room);
    if (!round) throw new GameError("No question is active right now.", 409);
    if (round.status !== "open") throw new GameError("Voting is closed for this round.", 409);
    if (room.status === "paused") throw new GameError("The host has paused this round.", 409);

    const now = Date.now();
    if (round.startsAt !== null && now < round.startsAt) {
      throw new GameError("Wait for the countdown to finish.", 409);
    }
    if (round.endsAt !== null && now >= round.endsAt) {
      round.status = "closed";
      round.closedAt = now;
      round.endsAt = null;
      room.status = "active";
      scheduleSave();
      emit(room.code);
      throw new GameError("Time is up for this round.", 409);
    }

    const existing = room.votes.find(
      (v) => v.roundIndex === round.roundIndex && v.playerId === player.id,
    );
    if (existing) {
      return {
        vote: {
          roundIndex: round.roundIndex,
          decision: existing.decision,
          points: null,
        },
        snapshot: this.toSnapshot(room, false),
      };
    }

    const msTaken = Math.max(0, now - (round.startsAt ?? now));
    room.votes.push({
      roundIndex: round.roundIndex,
      playerId: player.id,
      decision,
      outcome: "incorrect",
      msTaken,
      points: 0,
      submittedAt: now,
    });
    player.lastSeenAt = now;
    scheduleSave();
    emit(room.code);

    return {
      vote: { roundIndex: round.roundIndex, decision, points: null },
      snapshot: this.toSnapshot(room, false),
    };
  }

  async attemptAccess(
    code: string,
    playerToken: string,
    resourceId: string,
  ): Promise<{ granted: boolean; reason: string }> {
    const { room, player } = this.requirePlayer(code, playerToken);
    const now = Date.now();
    player.lastSeenAt = now;
    if (!player.temporaryGrants) player.temporaryGrants = [];
    player.temporaryGrants = player.temporaryGrants.filter((g) => g.expiresAt > now);

    const res = evaluateAccess(
      player.roleId ?? "undergrad",
      resourceId,
      player.badgeStatus === "revoked",
      player.temporaryGrants,
    );

    const resource = getResource(resourceId);
    const resourceName = resource?.name ?? resourceId;
    const role = getRole(player.roleId ?? "undergrad");

    if (!room.auditLogs) room.auditLogs = [];
    room.auditLogs.unshift({
      id: randomUUID(),
      timestamp: now,
      actor: player.nickname,
      action: "ACCESS_ATTEMPT",
      targetResource: resourceName,
      outcome: res.granted ? "GRANTED" : "DENIED",
      detail: `${player.nickname} (${role.name}) attempted entry to ${resourceName}. Result: ${res.granted ? "PERMITTED" : "DENIED"} (${res.reason}).`,
    });
    if (room.auditLogs.length > 100) room.auditLogs.pop();

    scheduleSave();
    emit(room.code);
    return res;
  }

  async requestEmergencyAccess(
    code: string,
    playerToken: string,
    resourceId: string,
    reason: string,
  ): Promise<void> {
    const { room, player } = this.requirePlayer(code, playerToken);
    const now = Date.now();
    player.lastSeenAt = now;
    const resource = getResource(resourceId);
    const resourceName = resource?.name ?? resourceId;
    const role = getRole(player.roleId ?? "undergrad");

    if (!room.accessRequests) room.accessRequests = [];
    const existing = room.accessRequests.find(
      (r) => r.playerId === player.id && r.resourceId === resourceId && r.status === "pending",
    );
    if (existing) {
      throw new GameError("An emergency request for this door is already pending admin review.", 409);
    }

    const req: EmergencyAccessRequest = {
      id: randomUUID(),
      playerId: player.id,
      playerNickname: player.nickname,
      playerRole: role.name,
      resourceId,
      resourceName,
      reason: reason.trim() || "Urgent access requested",
      status: "pending",
      requestedAt: now,
    };

    room.accessRequests.unshift(req);
    if (room.accessRequests.length > 50) room.accessRequests.pop();

    if (!room.auditLogs) room.auditLogs = [];
    room.auditLogs.unshift({
      id: randomUUID(),
      timestamp: now,
      actor: player.nickname,
      action: "EMERGENCY_REQUEST",
      targetResource: resourceName,
      outcome: "DENIED",
      detail: `${player.nickname} (${role.name}) submitted emergency access petition for ${resourceName}: "${req.reason}".`,
    });
    if (room.auditLogs.length > 100) room.auditLogs.pop();

    scheduleSave();
    emit(room.code);
  }

  /* --------------------------- projection -------------------------- */

  private toSnapshot(room: RoomRecord, isHost: boolean): RoomSnapshot {
    const now = Date.now();
    this.recomputeStatus(room, now);

    const round = this.activeRound(room);
    let roundView: RoundView | null = null;

    if (round) {
      const scenario = scenarioFor(round.roundIndex);
      const votes = room.votes.filter((v) => v.roundIndex === round.roundIndex);
      roundView = {
        roundIndex: round.roundIndex,
        status: round.status,
        openedAt: round.startsAt,
        endsAt: round.endsAt,
        tally: {
          approve: votes.filter((v) => v.decision === "APPROVE").length,
          deny: votes.filter((v) => v.decision === "DENY").length,
          total: votes.length,
        },
        reveal:
          round.status === "revealed" && scenario
            ? {
                roundIndex: round.roundIndex,
                correctDecision: scenario.correctDecision,
                explanation: scenario.explanation,
                principle: scenario.principle,
              }
            : null,
      };
    }

    const scenario =
      round && round.status !== "pending"
        ? scenarioFor(round.roundIndex)
        : null;

    const players: PlayerView[] = room.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      score: p.score,
      isBot: p.isBot,
      isConnected: p.isConnected,
      joinedAt: new Date(p.joinedAt).toISOString(),
      roleId: p.roleId ?? "undergrad",
      badgeStatus: p.badgeStatus ?? "active",
      temporaryGrants: (p.temporaryGrants ?? []).filter((g) => g.expiresAt > now),
      admissionStatus: p.admissionStatus ?? "approved",
    }));

    const leaderboard = [...players].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const at = Date.parse(a.joinedAt);
      const bt = Date.parse(b.joinedAt);
      if (at !== bt) return at - bt;
      return a.id.localeCompare(b.id);
    });

    return {
      code: room.code,
      transport: "local",
      status: room.status,
      currentRound: room.currentRound,
      totalRounds: room.totalRounds,
      questionDuration: room.questionDuration,
      isDemo: room.isDemo,
      serverNow: now,
      round: roundView,
      scenario: scenario
        ? {
            roundIndex: scenario.roundIndex,
            title: scenario.title,
            description: scenario.description,
            resourceType: scenario.resourceType,
            requesterRole: scenario.requesterRole,
            accessRequest: scenario.accessRequest,
          }
        : null,
      players,
      leaderboard,
      accessRequests: (room.accessRequests ?? []).map((r) => ({ ...r })),
      auditLogs: (room.auditLogs ?? []).slice(0, 50),
      isHost,
    };
  }
}
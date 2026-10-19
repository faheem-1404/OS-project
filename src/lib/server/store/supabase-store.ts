import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { computePoints, isValidDecision, sanitizeNickname } from "@/lib/scoring";
import type {
  Decision,
  RoundStatus,
  MyVote,
  PlayerView,
  PublicScenario,
  RoomSnapshot,
  RoundView,
} from "@/lib/types";
import { GameError, HOST_ONLY, NOT_FOUND, ROOM_FINISHED } from "./types";

/**
 * Supabase-backed store. All mutations run through the service-role key
 * (server-only, never exposed to the browser) and are therefore exempt
 * from RLS — which is exactly why every host transition below re-checks
 * the host token hash instead of trusting the caller.
 *
 * Invariants enforced here:
 *   - one vote per (round, player): enforced by a UNIQUE constraint and
 *     by an upsert-with-ignore, so retries are idempotent
 *   - votes rejected unless the round is open and inside its window
 *   - scores written only here, only at reveal time
 *   - correct answers never selected into any player-facing projection
 */

const COUNTDOWN_MS = 5_000;
const MIN_DURATION = 5;
const MAX_DURATION = 180;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

interface RoomRow {
  id: string;
  code: string;
  host_token_hash: string;
  status: string;
  current_round: number;
  question_duration: number;
  total_rounds: number;
  is_demo: boolean;
  paused_remaining_ms: number | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

interface RoundRow {
  id: string;
  room_id: string;
  scenario_id: number;
  round_index: number;
  status: RoundStatus;
  question_opened_at: string | null;
  question_ends_at: string | null;
  closed_at: string | null;
  revealed_at: string | null;
}

interface PlayerRow {
  id: string;
  room_id: string;
  nickname: string;
  token_hash: string;
  score: number;
  is_bot: boolean;
  is_connected: boolean;
  joined_at: string;
  last_seen_at: string;
}

interface VoteRow {
  id: string;
  round_id: string;
  player_id: string;
  decision: Decision;
  outcome: "correct" | "incorrect";
  ms_taken: number;
  points: number;
  submitted_at: string;
}

interface ScenarioRow {
  id: number;
  round_index: number;
  title: string;
  description: string;
  resource_type: string;
  requester_role: string;
  access_request: string;
  correct_decision: Decision;
  explanation: string;
  principle: string;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function newToken() {
  return randomBytes(32).toString("base64url");
}

/** Human-readable host passphrase — see LocalStore for rationale. */
function newPassphrase(): string {
  const bytes = randomBytes(10);
  let out = "";
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

function tokenMatches(provided: string | null, hash: string) {
  if (!provided) return false;
  const a = Buffer.from(sha256(provided), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function expect<T>(result: { data: unknown; error: { message: string } | null }): T {
  if (result.error) throw new GameError(result.error.message, 500);
  return result.data as T;
}

export class SupabaseStore {
  readonly transport = "supabase" as const;
  private readonly db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { "x-application-name": "campuslock" } },
    });
  }

  /* --------------------------- helpers --------------------------- */

  private async roomRow(code: string): Promise<RoomRow> {
    const data = expect<RoomRow[]>(
      await this.db
        .from("rooms")
        .select("*")
        .eq("code", code.toUpperCase())
        .gt("expires_at", new Date().toISOString())
        .limit(1),
    );
    const room = data[0];
    if (!room) throw new GameError(NOT_FOUND, 404);
    return room;
  }

  private async requireHost(code: string, hostToken: string): Promise<RoomRow> {
    const room = await this.roomRow(code);
    if (!tokenMatches(hostToken, String(room.host_token_hash))) {
      throw new GameError(HOST_ONLY, 403);
    }
    return room;
  }

  private async roundRow(roomId: string, roundIndex: number): Promise<RoundRow | null> {
    const data = expect<RoundRow[]>(
      await this.db
        .from("rounds")
        .select("*")
        .eq("room_id", roomId)
        .eq("round_index", roundIndex)
        .limit(1),
    );
    return data[0] ?? null;
  }

  private async playerRow(roomId: string, playerToken: string): Promise<PlayerRow | null> {
    if (!playerToken) return null;
    const data = expect<PlayerRow[]>(
      await this.db
        .from("players")
        .select("*")
        .eq("room_id", roomId)
        .eq("token_hash", sha256(playerToken))
        .limit(1),
    );
    return data[0] ?? null;
  }

  private async playerById(roomId: string, playerId: string): Promise<PlayerRow | null> {
    const data = expect<PlayerRow[]>(
      await this.db
        .from("players")
        .select("*")
        .eq("room_id", roomId)
        .eq("id", playerId)
        .limit(1),
    );
    return data[0] ?? null;
  }

  private async bumpRoom(roomId: string, patch: Partial<RoomRow>) {
    expect<RoomRow[]>(
      await this.db
        .from("rooms")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", roomId)
        .select()
        .limit(1),
    );
  }

  /* --------------------------- host ops --------------------------- */

  async createRoom(input: {
    questionDuration: number;
    totalRounds: number;
    isDemo: boolean;
  }): Promise<{ snapshot: RoomSnapshot; hostToken: string }> {
    const hostToken = newPassphrase();
    const code = await this.allocateCode();
    const totalRounds = Math.min(Math.max(1, input.totalRounds || 5), 5);

    const inserted = expect<RoomRow[]>(
      await this.db
        .from("rooms")
        .insert({
          code,
          host_token_hash: sha256(hostToken),
          status: "waiting",
          current_round: 0,
          question_duration: Math.min(
            MAX_DURATION,
            Math.max(MIN_DURATION, Math.round(input.questionDuration) || 25),
          ),
          total_rounds: totalRounds,
          is_demo: input.isDemo,
          expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        })
        .select()
        .limit(1),
    );

    const room = inserted[0];
    const rounds = Array.from({ length: totalRounds }, (_, i) => ({
      room_id: room.id,
      round_index: i + 1,
      scenario_id: i + 1,
      status: "pending",
    }));
    expect<RoundRow[]>(await this.db.from("rounds").insert(rounds).select());

    const snapshot = (await this.snapshot(code, { isHost: true }))!;
    return { snapshot, hostToken };
  }

  private async allocateCode(): Promise<string> {
    for (let i = 0; i < 25; i += 1) {
      const bytes = randomBytes(6);
      let code = "";
      for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
      const existing = expect<RoomRow[]>(
        await this.db.from("rooms").select("id").eq("code", code).limit(1),
      );
      if (existing.length === 0) return code;
    }
    throw new GameError("Could not allocate a room code. Try again.", 503);
  }

  async isHost(code: string, hostToken: string): Promise<boolean> {
    try {
      const room = await this.roomRow(code);
      return tokenMatches(hostToken, String(room.host_token_hash));
    } catch {
      return false;
    }
  }

  async setQuestionDuration(code: string, hostToken: string, seconds: number) {
    const room = await this.requireHost(code, hostToken);
    if (room.status !== "waiting") {
      throw new GameError("Duration can only change before the game starts.", 409);
    }
    await this.bumpRoom(room.id, {
      question_duration: Math.min(
        MAX_DURATION,
        Math.max(MIN_DURATION, Math.round(seconds)),
      ),
    });
  }

  async startGame(code: string, hostToken: string) {
    await this.startRound(code, hostToken);
  }

  async startRound(code: string, hostToken: string) {
    const room = await this.requireHost(code, hostToken);
    if (room.status === "finished") throw new GameError(ROOM_FINISHED, 409);
    if (Number(room.current_round) !== 0) {
      throw new GameError("Round already in progress.", 409);
    }
    await this.openRound(room, 1);
  }

  private async openRound(room: RoomRow, roundIndex: number) {
    const round = await this.roundRow(room.id, roundIndex);
    if (!round) throw new GameError("No scenario for that round.", 404);
    if (round.status !== "pending") {
      throw new GameError("That round has already been played.", 409);
    }
    const startsAt = Date.now() + COUNTDOWN_MS;
    const endsAt = startsAt + Number(room.question_duration) * 1000;

    expect<RoundRow[]>(
      await this.db
        .from("rounds")
        .update({
          status: "open",
          question_opened_at: new Date(startsAt).toISOString(),
          question_ends_at: new Date(endsAt).toISOString(),
        })
        .eq("id", round.id)
        .eq("status", "pending")
        .select(),
    );
    await this.bumpRoom(room.id, { current_round: roundIndex, status: "countdown" });
  }

  async pause(code: string, hostToken: string) {
    const room = await this.requireHost(code, hostToken);
    const round = await this.roundRow(room.id, Number(room.current_round));
    if (!round || round.status !== "open") throw new GameError("Nothing to pause.", 409);
    const remaining = Math.max(
      0,
      new Date(String(round.question_ends_at)).getTime() - Date.now(),
    );
    expect<RoundRow[]>(
      await this.db
        .from("rounds")
        .update({ status: "open", question_ends_at: null })
        .eq("id", round.id)
        .select(),
    );
    await this.bumpRoom(room.id, { status: "paused", paused_remaining_ms: remaining });
  }

  async resume(code: string, hostToken: string) {
    const room = await this.requireHost(code, hostToken);
    const round = await this.roundRow(room.id, Number(room.current_round));
    if (!round || round.status !== "open") throw new GameError("Nothing to resume.", 409);
    const remaining = Number(room.paused_remaining_ms ?? room.question_duration) * 1000;
    expect<RoundRow[]>(
      await this.db
        .from("rounds")
        .update({ question_ends_at: new Date(Date.now() + remaining).toISOString() })
        .eq("id", round.id)
        .select(),
    );
    await this.bumpRoom(room.id, { status: "active", paused_remaining_ms: null });
  }

  async closeVoting(code: string, hostToken: string) {
    const room = await this.requireHost(code, hostToken);
    const round = await this.roundRow(room.id, Number(room.current_round));
    if (!round || round.status !== "open") throw new GameError("Voting is not open.", 409);
    await this.db
      .from("rounds")
      .update({ status: "closed", closed_at: new Date().toISOString(), question_ends_at: null })
      .eq("id", round.id);
    await this.bumpRoom(room.id, { status: "active" });
  }

  async tick(code: string) {
    const room = await this.roomRow(code);
    await this.db
      .from("rounds")
      .update({ status: "closed", closed_at: new Date().toISOString(), question_ends_at: null })
      .eq("room_id", room.id)
      .eq("status", "open")
      .lte("question_ends_at", new Date().toISOString());
  }

  private async settle(room: RoomRow, round: RoundRow, award: boolean) {
    const votes = expect<VoteRow[]>(
      await this.db.from("votes").select("*").eq("round_id", round.id),
    );
    const scenario = expect<ScenarioRow[]>(
      await this.db.from("scenarios").select("*").eq("id", round.scenario_id).limit(1),
    );
    const correct = scenario[0]?.correct_decision;
    const windowMs = Number(room.question_duration) * 1000;

    for (const vote of votes) {
      const openedAt = round.question_opened_at
        ? new Date(String(round.question_opened_at)).getTime()
        : Date.now();
      const msTaken = Math.max(
        0,
        new Date(String(vote.submitted_at)).getTime() - openedAt,
      );
      const isCorrect = vote.decision === correct;
      const points = award
        ? computePoints({ isCorrect, msTaken, windowMs })
        : 0;

      await this.db
        .from("votes")
        .update({
          outcome: isCorrect ? "correct" : "incorrect",
          ms_taken: msTaken,
          points,
        })
        .eq("id", vote.id);

      if (award) {
        // UNIQUE (round_id, player_id) makes scoring idempotent even if
        // reveal is somehow invoked twice.
        const { data: event, error } = await this.db
          .from("score_events")
          .insert({
            room_id: room.id,
            player_id: vote.player_id,
            round_id: round.id,
            points,
            reason: isCorrect ? "correct_answer" : "incorrect_answer",
          })
          .select("id")
          .limit(1);
        if (error || !event || event.length === 0) continue;

        await this.db
          .from("players")
          .update({ score: (await this.playerScore(room.id, vote.player_id)) + points })
          .eq("id", vote.player_id);
      }
    }
  }

  private async playerScore(roomId: string, playerId: string): Promise<number> {
    const rows = expect<PlayerRow[]>(
      await this.db.from("players").select("score").eq("id", playerId).limit(1),
    );
    void roomId;
    return Number(rows[0]?.score ?? 0);
  }

  async reveal(code: string, hostToken: string) {
    const room = await this.requireHost(code, hostToken);
    const round = await this.roundRow(room.id, Number(room.current_round));
    if (!round) throw new GameError("No active round.", 409);
    if (round.status !== "open" && round.status !== "closed") {
      throw new GameError("This round has already been revealed.", 409);
    }
    if (round.question_ends_at && Date.now() >= new Date(String(round.question_ends_at)).getTime()) {
      await this.db.from("rounds").update({ status: "closed" }).eq("id", round.id);
    }
    await this.settle(room, round, true);
    await this.db
      .from("rounds")
      .update({
        status: "revealed",
        revealed_at: new Date().toISOString(),
        closed_at: round.closed_at ?? new Date().toISOString(),
        question_ends_at: null,
      })
      .eq("id", round.id);
    await this.bumpRoom(room.id, { status: "revealing" });
  }

  async skipRound(code: string, hostToken: string) {
    const room = await this.requireHost(code, hostToken);
    const round = await this.roundRow(room.id, Number(room.current_round));
    if (!round || (round.status !== "open" && round.status !== "closed")) {
      throw new GameError("This round is already resolved.", 409);
    }
    await this.db
      .from("rounds")
      .update({
        status: "revealed",
        revealed_at: new Date().toISOString(),
        closed_at: new Date().toISOString(),
        question_ends_at: null,
      })
      .eq("id", round.id);
    await this.bumpRoom(room.id, { status: "revealing" });
  }

  async nextRound(code: string, hostToken: string) {
    const room = await this.requireHost(code, hostToken);
    if (room.status === "finished") throw new GameError(ROOM_FINISHED, 409);
    const round = await this.roundRow(room.id, Number(room.current_round));
    if (!round || round.status !== "revealed") {
      throw new GameError("Reveal the answer before moving on.", 409);
    }
    const next = Number(room.current_round) + 1;
    if (next > Number(room.total_rounds)) {
      await this.endGame(code, hostToken);
      return;
    }
    await this.openRound(room, next);
  }

  async restartRound(code: string, hostToken: string) {
    const room = await this.requireHost(code, hostToken);
    const round = await this.roundRow(room.id, Number(room.current_round));
    if (!round || round.status === "revealed") {
      throw new GameError("This round is already scored.", 409);
    }
    const cast = expect<VoteRow[]>(
      await this.db.from("votes").select("id").eq("round_id", round.id).limit(1),
    );
    if (cast.length > 0) {
      throw new GameError("Votes have already been cast for this round.", 409);
    }
    const startsAt = Date.now() + COUNTDOWN_MS;
    await this.db
      .from("rounds")
      .update({
        status: "open",
        question_opened_at: new Date(startsAt).toISOString(),
        question_ends_at: new Date(
          startsAt + Number(room.question_duration) * 1000,
        ).toISOString(),
      })
      .eq("id", round.id);
    await this.bumpRoom(room.id, { status: "countdown" });
  }

  async endGame(code: string, hostToken: string) {
    const room = await this.requireHost(code, hostToken);
    await this.bumpRoom(room.id, { status: "finished" });
  }

  /* -------------------------- player ops -------------------------- */

  async join(code: string, nicknameRaw: string) {
    const room = await this.roomRow(code);
    if (room.status === "finished") throw new GameError(ROOM_FINISHED, 409);

    const nickname = sanitizeNickname(nicknameRaw);
    if (nickname.length < 1) throw new GameError("Pick a nickname of 1–24 characters.");

    const count = expect<PlayerRow[]>(
      await this.db.from("players").select("id").eq("room_id", room.id).limit(500),
    );
    if (count.length >= 200) throw new GameError("This room is full.", 409);

    const clash = expect<PlayerRow[]>(
      await this.db
        .from("players")
        .select("id")
        .eq("room_id", room.id)
        .ilike("nickname", nickname)
        .limit(1),
    );
    if (clash.length > 0) {
      throw new GameError("That nickname is already taken in this room.", 409);
    }

    const playerToken = newToken();
    const inserted = expect<PlayerRow[]>(
      await this.db
        .from("players")
        .insert({
          room_id: room.id,
          nickname,
          token_hash: sha256(playerToken),
        })
        .select("id")
        .limit(1),
    );

    return {
      playerId: String(inserted[0].id),
      playerToken,
      snapshot: await this.snapshotFor(code),
    };
  }

  async touch(code: string, playerToken: string) {
    const room = await this.roomRow(code);
    const player = await this.playerRow(room.id, playerToken);
    if (!player) return;
    await this.db
      .from("players")
      .update({ is_connected: true, last_seen_at: new Date().toISOString() })
      .eq("id", player.id);
  }

  async identifyPlayer(code: string, playerToken: string | null): Promise<string | null> {
    if (!playerToken) return null;
    try {
      const room = await this.roomRow(code);
      const player = await this.playerRow(room.id, playerToken);
      return player ? String(player.id) : null;
    } catch {
      return null;
    }
  }

  async myVote(code: string, playerToken: string): Promise<MyVote | null> {
    const room = await this.roomRow(code);
    const player = await this.playerRow(room.id, playerToken);
    if (!player) return null;
    const round = await this.roundRow(room.id, Number(room.current_round));
    if (!round) return null;
    const votes = expect<VoteRow[]>(
      await this.db
        .from("votes")
        .select("*")
        .eq("round_id", round.id)
        .eq("player_id", player.id)
        .limit(1),
    );
    const vote = votes[0];
    if (!vote) return null;
    return {
      roundIndex: Number(round.round_index),
      decision: vote.decision as Decision,
      points: round.status === "revealed" ? Number(vote.points) : null,
    };
  }

  async submitVote(code: string, playerToken: string, decision: unknown) {
    if (!isValidDecision(decision)) throw new GameError("Invalid decision.");
    const room = await this.roomRow(code);
    if (room.status === "finished") throw new GameError(ROOM_FINISHED, 409);
    const player = await this.playerRow(room.id, playerToken);
    if (!player) throw new GameError("Your session expired. Re-join the room.", 401);

    const round = await this.roundRow(room.id, Number(room.current_round));
    if (!round) throw new GameError("No question is active right now.", 409);
    if (round.status !== "open") throw new GameError("Voting is closed for this round.", 409);
    // A paused round has no end time, so the window check alone would let
    // votes through. Pausing must freeze participation too.
    if (room.status === "paused") throw new GameError("The host has paused this round.", 409);

    const now = Date.now();
    const startsAt = round.question_opened_at
      ? new Date(String(round.question_opened_at)).getTime()
      : now;
    const endsAt = round.question_ends_at
      ? new Date(String(round.question_ends_at)).getTime()
      : null;

    if (now < startsAt) throw new GameError("Wait for the countdown to finish.", 409);
    if (endsAt !== null && now >= endsAt) {
      await this.db
        .from("rounds")
        .update({ status: "closed", closed_at: new Date().toISOString(), question_ends_at: null })
        .eq("id", round.id);
      throw new GameError("Time is up for this round.", 409);
    }

    const existing = expect<VoteRow[]>(
      await this.db
        .from("votes")
        .select("*")
        .eq("round_id", round.id)
        .eq("player_id", player.id)
        .limit(1),
    );
    if (existing[0]) {
      return {
        vote: {
          roundIndex: Number(round.round_index),
          decision: existing[0].decision,
          // Only reachable while the round is still open; points pending.
          points: null,
        },
        snapshot: await this.snapshotFor(code),
      };
    }

    // Upsert on (round_id, player_id) → a duplicate submit is a no-op.
    const { error } = await this.db.from("votes").upsert(
      {
        round_id: round.id,
        player_id: player.id,
        decision,
        outcome: "incorrect",
        ms_taken: Math.max(0, now - startsAt),
        points: 0,
      },
      { onConflict: "round_id,player_id", ignoreDuplicates: true },
    );
    if (error) throw new GameError(error.message, 500);

    return {
      vote: {
        roundIndex: Number(round.round_index),
        decision: decision as Decision,
        points: null,
      },
      snapshot: await this.snapshotFor(code),
    };
  }

  async snapshotFor(code: string): Promise<RoomSnapshot> {
    const snap = await this.snapshot(code);
    if (!snap) throw new GameError(NOT_FOUND, 404);
    return snap;
  }

  /* -------------------------- projection -------------------------- */

  async snapshot(code: string, opts?: { isHost?: boolean }): Promise<RoomSnapshot | null> {
    let room: RoomRow;
    try {
      room = await this.roomRow(code);
    } catch {
      return null;
    }
    await this.tick(code);
    room = await this.roomRow(code);

    const roundIdx = Number(room.current_round);
    const round = roundIdx > 0 ? await this.roundRow(room.id, roundIdx) : null;

    const [playersRows, votesRows, scenarioRows] = await Promise.all([
      expect<PlayerRow[]>(
        await this.db
          .from("players")
          .select("id, nickname, score, is_bot, is_connected, joined_at")
          .eq("room_id", room.id),
      ),
      round
        ? expect<VoteRow[]>(await this.db.from("votes").select("decision").eq("round_id", round.id))
        : Promise.resolve([] as VoteRow[]),
      round
        ? expect<ScenarioRow[]>(
            await this.db
              .from("scenarios")
              .select(
                "round_index, title, description, resource_type, requester_role, access_request, correct_decision, explanation, principle",
              )
              .eq("id", round.scenario_id)
              .limit(1),
          )
        : Promise.resolve([] as ScenarioRow[]),
    ]);

    const scenario = scenarioRows[0];
    const players: PlayerView[] = playersRows.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      score: p.score ?? 0,
      isBot: p.is_bot ?? false,
      isConnected: p.is_connected ?? true,
      joinedAt: p.joined_at,
    }));
    const leaderboard = [...players].sort(
      (a, b) => b.score - a.score || Date.parse(a.joinedAt) - Date.parse(b.joinedAt),
    );

    let roundView: RoundView | null = null;
    if (round) {
      const votes = votesRows;
      const revealed = round.status === "revealed";
      roundView = {
        roundIndex: Number(round.round_index),
        status: round.status,
        openedAt: round.question_opened_at
          ? new Date(String(round.question_opened_at)).getTime()
          : null,
        endsAt: round.question_ends_at
          ? new Date(String(round.question_ends_at)).getTime()
          : null,
        tally: {
          approve: votes.filter((v) => v.decision === "APPROVE").length,
          deny: votes.filter((v) => v.decision === "DENY").length,
          total: votes.length,
        },
        // The answer key is only ever read after the round is revealed.
        reveal:
          revealed && scenario
            ? {
                roundIndex: Number(round.round_index),
                correctDecision: scenario.correct_decision as Decision,
                explanation: String(scenario.explanation),
                principle: String(scenario.principle),
              }
            : null,
      };
    }

    const publicScenario: PublicScenario | null = scenario
      ? {
          roundIndex: Number(scenario.round_index),
          title: String(scenario.title),
          description: String(scenario.description),
          resourceType: String(scenario.resource_type),
          requesterRole: String(scenario.requester_role),
          accessRequest: String(scenario.access_request),
        }
      : null;

    let status = room.status as RoomSnapshot["status"];
    if (status !== "finished" && round) {
      if (round.status === "revealed") status = "revealing";
      else if (round.status === "closed") status = "active";
      else if (
        round.question_opened_at &&
        Date.now() < new Date(String(round.question_opened_at)).getTime()
      )
        status = "countdown";
      else if (status !== "paused") status = "active";
    }

    return {
      code: String(room.code),
      transport: "supabase",
      status,
      currentRound: roundIdx,
      totalRounds: Number(room.total_rounds),
      questionDuration: Number(room.question_duration),
      isDemo: Boolean(room.is_demo),
      serverNow: Date.now(),
      round: roundView,
      scenario: publicScenario,
      players,
      leaderboard,
      isHost: opts?.isHost ?? false,
    };
  }
}
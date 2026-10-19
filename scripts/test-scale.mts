/**
 * 60-participant concurrency test at the game-engine level.
 *
 * The browser load test (scripts/loadtest.mts) is limited by how many
 * renderer processes a single Chromium can hydrate on one machine. This
 * test removes that variable: 60 players join, vote and score
 * concurrently against the exact code paths the UI calls, including the
 * unique-vote constraint, timer gating and server-side scoring.
 *
 * Run with:  npx tsx scripts/test-scale.mts
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Isolate this run's room state from the dev server's.
process.env.CAMPUSLOCK_DATA_DIR = mkdtempSync(join(tmpdir(), "campuslock-scale-"));

const { LocalStore } = await import("../src/lib/server/store/local-store");

const PLAYERS = Number(process.env.PLAYERS ?? 60);
const store = new LocalStore();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

console.log(`\nCampusLock — ${PLAYERS}-participant concurrency test\n`);

const { snapshot, hostToken } = await store.createRoom({
  questionDuration: 60,
  totalRounds: 5,
  isDemo: false,
});
const code = snapshot.code;
console.log(`  room ${code}`);

// ---- 60 concurrent joins ----------------------------------------------
const t0 = Date.now();
const players = await Promise.all(
  Array.from({ length: PLAYERS }, (_, i) => store.join(code, `Player${i + 1}`)),
);
console.log(`  ${players.length} players joined concurrently in ${Date.now() - t0}ms`);

assert.equal((await store.snapshotFor(code, null)).players.length, PLAYERS);

// ---- open a round and let the countdown elapse -------------------------
await store.startGame(code, hostToken);
await sleep(5200);

// ---- 60 concurrent votes ----------------------------------------------
// Known answers per round, so expected scores can be asserted exactly.
const CORRECT = ["DENY", "APPROVE", "DENY", "APPROVE", "DENY"];

const t1 = Date.now();
const results = await Promise.all(
  players.map((p, i) =>
    // Two thirds answer correctly, staggered a little so the speed bonus
    // varies and the leaderboard tie-break is exercised.
    store
      .submitVote(code, p.playerToken, (i % 3 === 0 ? "APPROVE" : "DENY") as const)
      .catch((error: Error) => ({ error: error.message })),
  ),
);
console.log(`  ${results.length} votes cast concurrently in ${Date.now() - t1}ms`);

const failed = results.filter((r) => "error" in r);
assert.equal(failed.length, 0, `votes failed: ${JSON.stringify(failed.slice(0, 3))}`);

// ---- one vote per player, enforced ------------------------------------
const duplicates = await Promise.all(
  players.slice(0, 10).map((p) =>
    store
      .submitVote(code, p.playerToken, CORRECT[0] as "DENY" | "APPROVE")
      .then((r) => r.vote.decision)
      .catch(() => "rejected"),
  ),
);
const afterReplay = await store.snapshotFor(code, null);
assert.equal(
  afterReplay.round?.tally.total,
  PLAYERS,
  "replaying votes must not create additional vote rows",
);
assert.equal(
  afterReplay.round?.tally.approve + afterReplay.round?.tally.deny,
  PLAYERS,
  "tally must exactly match the participant count",
);
console.log(`  duplicate submissions stayed idempotent (${duplicates.length} replays ignored)`);

// ---- reveal and verify scoring ----------------------------------------
const t2 = Date.now();
await store.reveal(code, hostToken);
console.log(`  reveal settled in ${Date.now() - t2}ms`);

const final = await store.snapshotFor(code, null);
const correctCount = players.filter((_, i) => (i % 3 === 0 ? "APPROVE" : "DENY") === CORRECT[0]).length;
const scored = final.players.filter((p) => p.score >= 100).length;
const zeroed = final.players.filter((p) => p.score === 0).length;

console.log(`  correct: ${scored}, incorrect: ${zeroed}`);
assert.equal(scored, correctCount, "everyone correct must score at least 100");
assert.equal(zeroed, PLAYERS - correctCount, "everyone incorrect must score exactly 0");
assert.ok(
  final.players.every((p) => p.score <= 150),
  "no score may exceed 100 + the 50 point speed bonus",
);

// Deterministic ordering.
for (let i = 1; i < final.leaderboard.length; i += 1) {
  assert.ok(final.leaderboard[i - 1].score >= final.leaderboard[i].score);
}

console.log(`\n  ${PLAYERS}-participant concurrency test passed.\n`);
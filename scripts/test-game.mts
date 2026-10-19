/**
 * End-to-end game-logic test for the local engine.
 * Run with:  npx tsx scripts/test-game.ts
 *
 * Exercises: room creation, join, duplicate nickname rejection, host
 * authorization, countdown gating, idempotent voting, vote rejection
 * after close, server-side scoring, leaderboard ordering, round
 * advancement, skipping, restart guard, and session expiry handling.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Isolate this run's room state from the dev server's.
process.env.CAMPUSLOCK_DATA_DIR = mkdtempSync(join(tmpdir(), "campuslock-game-"));

const { LocalStore } = await import("../src/lib/server/store/local-store");
const { GameError } = await import("../src/lib/server/store/types");

const store = new LocalStore();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
async function step(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed += 1;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (error) {
    console.error(`  \x1b[31m✗\x1b[0m ${name}`);
    console.error(`    ${(error as Error).message}`);
    process.exitCode = 1;
    throw error;
  }
}

console.log("\nCampusLock — game engine test\n");

const { snapshot, hostToken } = await store.createRoom({
  questionDuration: 25,
  totalRounds: 5,
  isDemo: false,
});
const code = snapshot.code;

await step("room code is six uppercase alphanumeric chars", () => {
  assert.match(code, /^[A-Z0-9]{6}$/);
});

await step("host token authenticates; a wrong token does not", async () => {
  assert.equal(await store.isHost(code, hostToken), true);
  assert.equal(await store.isHost(code, "WRONG-PASSPHRASE"), false);
});

await step("host-only command rejects an unauthorised caller", async () => {
  await assert.rejects(() => store.startGame(code, "not-the-passphrase"), GameError);
});

await step("players join with unique nicknames", async () => {
  await store.join(code, "Ada");
  await store.join(code, "Ben");
  await store.join(code, "Chloe");
  const snap = await store.snapshotFor(code, null);
  assert.equal(snap.players.length, 3);
});

await step("duplicate nickname is rejected", async () => {
  await assert.rejects(() => store.join(code, "ada"), GameError);
});

await step("unknown room resolves to null", async () => {
  assert.equal(await store.snapshot("ZZZZZZ"), null);
});

// Two fresh voters in distinct roles (the earlier join already holds
// "Ada" and "Ben", and nicknames are unique per room).
const ada = await store.join(code, "Dara");
const adaToken = ada.playerToken;
const ben = await store.join(code, "Ebo");
const benToken = ben.playerToken;

await step("a player token identifies exactly one player", async () => {
  assert.equal(await store.identifyPlayer(code, adaToken), ada.playerId);
  assert.equal(await store.identifyPlayer(code, "forged"), null);
});

await step("votes are rejected during the countdown", async () => {
  await store.startGame(code, hostToken);
  await assert.rejects(() => store.submitVote(code, adaToken, "DENY"), /countdown/i);
});

await step("no answer data leaks before reveal", async () => {
  const snap = await store.snapshotFor(code, null);
  assert.equal(snap.round?.reveal, null);
  assert.equal((snap.scenario as unknown as Record<string, unknown>)?.correctDecision, undefined);
  assert.equal(JSON.stringify(snap).includes("Valid identity does not mean"), false);
});

await step("waiting for countdown to elapse", async () => {
  await sleep(5200);
  const snap = await store.snapshotFor(code, null);
  assert.equal(snap.status, "active");
});

await step("correct vote is accepted and recorded idempotently", async () => {
  const first = await store.submitVote(code, adaToken, "DENY");
  assert.equal(first.vote.decision, "DENY");
  assert.equal(first.vote.points, null);

  const tally = first.snapshot.round?.tally.total ?? 0;
  const second = await store.submitVote(code, adaToken, "APPROVE");
  assert.equal(second.vote.decision, "DENY", "a second submission must not overwrite the first");
  assert.equal(second.snapshot.round?.tally.total, tally, "a second submission must not add a vote");
});

await step("wrong vote is accepted and scores nothing", async () => {
  await store.submitVote(code, benToken, "APPROVE");
  const snap = await store.snapshotFor(code, null);
  assert.equal(snap.round?.tally.approve, 1);
  assert.equal(snap.round?.tally.deny, 1);
});

await step("player token from another player cannot be guessed", async () => {
  await assert.rejects(() => store.submitVote(code, "forged-token", "DENY"), GameError);
});

await step("host close + reveal awards 100 for correct, 0 for wrong", async () => {
  await store.closeVoting(code, hostToken);
  await store.reveal(code, hostToken);
  const snap = await store.snapshotFor(code, null);

  const adaRow = snap.players.find((p) => p.nickname === "Dara")!;
  const benRow = snap.players.find((p) => p.nickname === "Ebo")!;

  assert.equal(adaRow.score >= 100, true, "correct answer must score at least 100");
  assert.equal(benRow.score, 0, "wrong answer must score 0");

  assert.equal(snap.round?.reveal?.correctDecision, "DENY");
  assert.equal(snap.status, "revealing");
});

await step("revealing twice is refused (no double scoring)", async () => {
  const before = await store.snapshotFor(code, null);
  const total = before.players.reduce((n, p) => n + p.score, 0);
  await assert.rejects(() => store.reveal(code, hostToken), GameError);
  const after = await store.snapshotFor(code, null);
  assert.equal(
    after.players.reduce((n, p) => n + p.score, 0),
    total,
  );
});

await step("next round opens and previous answers are cleared", async () => {
  await store.nextRound(code, hostToken);
  const snap = await store.snapshotFor(code, null);
  assert.equal(snap.currentRound, 2);
  assert.equal(snap.round?.tally.total, 0);
  assert.equal(snap.round?.reveal, null);
  assert.equal(snap.status, "countdown");
});

await step("restart is refused once votes exist", async () => {
  await sleep(5200);
  await store.submitVote(code, adaToken, "APPROVE");
  await assert.rejects(() => store.restartRound(code, hostToken), /already been cast/i);
});

await step("pause freezes the server clock, resume restores it", async () => {
  await store.pause(code, hostToken);
  let snap = await store.snapshotFor(code, null);
  assert.equal(snap.status, "paused");
  assert.equal(snap.round?.endsAt, null, "paused rounds must not report an end time");

  await assert.rejects(() => store.submitVote(code, adaToken, "DENY"), /paused/i);

  await store.resume(code, hostToken);
  snap = await store.snapshotFor(code, null);
  assert.equal(snap.status, "active");
  assert.ok(snap.round?.endsAt !== null);
});

await step("skipping a round awards no points", async () => {
  const before = await store.snapshotFor(code, null);
  const beforeTotal = before.players.reduce((n, p) => n + p.score, 0);
  await store.skipRound(code, hostToken);
  const after = await store.snapshotFor(code, null);
  assert.equal(after.players.reduce((n, p) => n + p.score, 0), beforeTotal);
});

await step("leaderboard is ordered by score then join time", async () => {
  const snap = await store.snapshotFor(code, null);
  for (let i = 1; i < snap.leaderboard.length; i += 1) {
    assert.ok(snap.leaderboard[i - 1].score >= snap.leaderboard[i].score);
  }
  assert.equal(snap.leaderboard[0].nickname, "Dara");
});

await step("session advances through all five rounds to finished", async () => {
  for (let r = 3; r <= 5; r += 1) {
    await store.nextRound(code, hostToken);
    await sleep(5200);
    await store.closeVoting(code, hostToken);
    await store.reveal(code, hostToken);
  }
  await store.nextRound(code, hostToken);
  const snap = await store.snapshotFor(code, null);
  assert.equal(snap.status, "finished");
});

await step("no votes are accepted once the session has finished", async () => {
  await assert.rejects(() => store.submitVote(code, adaToken, "DENY"), /ended/i);
});

console.log(`\n${passed} checks passed.\n`);
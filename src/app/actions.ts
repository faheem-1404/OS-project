"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  clientKey,
  JOIN_LIMIT,
  rateLimit,
  VOTE_LIMIT,
} from "@/lib/server/rate-limit";
import { store } from "@/lib/server/store";
import { GameError } from "@/lib/server/store/types";
import {
  clearPlayerToken,
  readHostToken,
  readPlayerToken,
  writeHostToken,
  writePlayerToken,
} from "@/lib/server/session";
import type { ActionResult } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

async function requireHostToken(code: string): Promise<string> {
  const token = await readHostToken(code);
  if (!token) throw new GameError("Host session missing for this room.", 403);
  return token;
}

function fail(error: unknown): { ok: false; error: string } {
  if (error instanceof GameError) return { ok: false, error: error.message };
  console.error("[campuslock]", error);
  return { ok: false, error: "Something went wrong. Please try again." };
}

/* ------------------------------------------------------------------ */
/* host                                                               */
/* ------------------------------------------------------------------ */

export async function createRoomAction(input: {
  questionDuration: number;
  totalRounds: number;
  isDemo: boolean;
}): Promise<ActionResult<{ code: string; hostPassphrase: string }>> {
  try {
    const { snapshot, hostToken } = await store().createRoom(input);
    await writeHostToken(snapshot.code, hostToken);
    revalidatePath("/host");
    return {
      ok: true,
      data: { code: snapshot.code, hostPassphrase: hostToken },
    };
  } catch (error) {
    return fail(error);
  }
}

export async function hostCommandAction(
  code: string,
  command:
    | "start"
    | "pause"
    | "resume"
    | "close"
    | "reveal"
    | "next"
    | "skip"
    | "restart"
    | "end",
): Promise<ActionResult<{ code: string }>> {
  try {
    const hostToken = await requireHostToken(code);
    const s = store();
    const target = code.toUpperCase();

    switch (command) {
      case "start":
        await s.startGame(target, hostToken);
        break;
      case "pause":
        await s.pause(target, hostToken);
        break;
      case "resume":
        await s.resume(target, hostToken);
        break;
      case "close":
        await s.closeVoting(target, hostToken);
        break;
      case "reveal":
        await s.reveal(target, hostToken);
        break;
      case "next":
        await s.nextRound(target, hostToken);
        break;
      case "skip":
        await s.skipRound(target, hostToken);
        break;
      case "restart":
        await s.restartRound(target, hostToken);
        break;
      case "end":
        await s.endGame(target, hostToken);
        break;
      default:
        throw new GameError("Unknown command.");
    }
    revalidatePath(`/host/${target}`);
    return { ok: true, data: { code: target } };
  } catch (error) {
    return fail(error);
  }
}

export async function setDurationAction(code: string, seconds: number): Promise<ActionResult> {
  try {
    const hostToken = await requireHostToken(code);
    await store().setQuestionDuration(code.toUpperCase(), hostToken, seconds);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/* ------------------------------------------------------------------ */
/* player                                                             */
/* ------------------------------------------------------------------ */

export async function joinRoomAction(
  code: string,
  nickname: string,
): Promise<ActionResult<{ code: string }>> {
  try {
    const ip = clientKey(await headers());
    if (!rateLimit(`join:${ip}`, JOIN_LIMIT)) {
      throw new GameError("Too many join attempts. Wait a moment and retry.", 429);
    }
    const target = code.toUpperCase();
    const { playerToken } = await store().join(target, nickname);
    await writePlayerToken(target, playerToken);
    return { ok: true, data: { code: target } };
  } catch (error) {
    return fail(error);
  }
}

export async function leaveRoomAction(code: string): Promise<ActionResult> {
  await clearPlayerToken(code.toUpperCase());
  return { ok: true };
}

export async function castVoteAction(code: string, decision: string): Promise<ActionResult> {
  try {
    const ip = clientKey(await headers());
    if (!rateLimit(`vote:${ip}`, VOTE_LIMIT)) {
      throw new GameError("Slow down — your answer was not submitted.", 429);
    }
    const target = code.toUpperCase();
    const token = await readPlayerToken(target);
    await store().submitVote(target, token ?? "", decision);
    revalidatePath(`/play/${target}`);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function heartbeatAction(code: string): Promise<ActionResult> {
  try {
    const target = code.toUpperCase();
    const token = await readPlayerToken(target);
    if (token) await store().touch(target, token);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/* ------------------------------------------------------------------ */
/* host bootstrap (join by code, proves ownership out of band)        */
/* ------------------------------------------------------------------ */

/**
 * A host can re-open a session they already own on another device by
 * entering the room code together with the host passphrase that was
 * issued at creation time. Without the passphrase this is refused — the
 * route itself is not a secret.
 */
export async function reclaimHostAction(
  code: string,
  passphrase: string,
): Promise<ActionResult<{ code: string }>> {
  try {
    const target = code.toUpperCase();
    const valid = await store().isHost(target, passphrase.trim());
    if (!valid) throw new GameError("That host passphrase is not valid for this room.", 403);
    await writeHostToken(target, passphrase.trim());
    return { ok: true, data: { code: target } };
  } catch (error) {
    return fail(error);
  }
}

export async function goToPlay(code: string): Promise<never> {
  redirect(`/play/${code.toUpperCase()}`);
}
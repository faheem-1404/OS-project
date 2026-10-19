import "server-only";

import { cookies } from "next/headers";

const HOST_PREFIX = "cl_host_";
const PLAYER_PREFIX = "cl_player_";
const MAX_AGE = 60 * 60 * 6;

export function hostCookieName(code: string) {
  return `${HOST_PREFIX}${code.toUpperCase()}`;
}

export function playerCookieName(code: string) {
  return `${PLAYER_PREFIX}${code.toUpperCase()}`;
}

export async function readHostToken(code: string): Promise<string | null> {
  const jar = await cookies();
  return jar.get(hostCookieName(code))?.value ?? null;
}

export async function writeHostToken(code: string, token: string) {
  const jar = await cookies();
  jar.set(hostCookieName(code), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: `/`,
    maxAge: MAX_AGE,
  });
}

export async function readPlayerToken(code: string): Promise<string | null> {
  const jar = await cookies();
  return jar.get(playerCookieName(code))?.value ?? null;
}

export async function writePlayerToken(code: string, token: string) {
  const jar = await cookies();
  jar.set(playerCookieName(code), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: `/`,
    maxAge: MAX_AGE,
  });
}

export async function clearPlayerToken(code: string) {
  const jar = await cookies();
  jar.delete(playerCookieName(code));
}
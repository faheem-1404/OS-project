import { redirect } from "next/navigation";

import { PlayerView } from "@/components/player-view";
import { store } from "@/lib/server/store";
import { readPlayerToken } from "@/lib/server/session";
import { connection } from "next/server";

// These routes read request-time state (cookies / live room data), so they
// are rendered per request rather than prerendered at build time.
export const dynamic = "force-dynamic";

export default async function PlayPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  // Mark this route request-time: the snapshot contains live server clock
  // values that must never be prerendered.
  await connection();

  const { roomCode } = await params;
  const code = roomCode.toUpperCase();
  const s = store();

  const snapshot = await s.snapshot(code);
  if (!snapshot) redirect(`/join?room=${code}`);

  const token = await readPlayerToken(code);
  const playerId = await s.identifyPlayer(code, token);

  // No valid player session for this room → send them through the normal
  // join flow. The room code alone never grants a player identity.
  if (!playerId) redirect(`/join?room=${code}`);

  const mePlayer = snapshot.players.find((p) => p.id === playerId);
  snapshot.me = {
    id: playerId,
    vote: token ? await s.myVote(code, token) : null,
    roleId: mePlayer?.roleId,
    badgeStatus: mePlayer?.badgeStatus,
    temporaryGrants: mePlayer?.temporaryGrants,
  };

  return <PlayerView initial={snapshot} />;
}
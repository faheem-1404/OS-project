import { store } from "@/lib/server/store";
import { readHostToken, readPlayerToken } from "@/lib/server/session";

/**
 * Snapshot read endpoint. Every client (host, player, projector) renders
 * from this projection, so it is the single definition of "what the room
 * looks like right now".
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const target = code.toUpperCase();
  const s = store();

  const hostToken = await readHostToken(target);
  const isHost = hostToken ? await s.isHost(target, hostToken) : false;

  const snapshot = await s.snapshot(target, { isHost });
  if (!snapshot) return Response.json({ error: "Room not found" }, { status: 404 });

  const playerToken = await readPlayerToken(target);
  const playerId = await s.identifyPlayer(target, playerToken);
  snapshot.me = playerId
    ? { id: playerId, vote: playerToken ? await s.myVote(target, playerToken) : null }
    : null;

  return Response.json(snapshot, {
    headers: { "Cache-Control": "no-store" },
  });
}
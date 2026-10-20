import { subscribeRoom } from "@/lib/server/store/local-store";
import { store } from "@/lib/server/store";
import { readHostToken, readPlayerToken } from "@/lib/server/session";

export const maxDuration = 60;

/**
 * Server-Sent Events channel used when CampusLock runs on the local
 * store. On Supabase, clients subscribe to Postgres changes directly and
 * never hit this route.
 *
 * The stream pushes the full authoritative snapshot on every mutation,
 * which keeps host, players and projector trivially in sync without any
 * client-side reconciliation.
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
  const playerToken = await readPlayerToken(target);
  const playerId = await s.identifyPlayer(target, playerToken);

  async function project() {
    const snap = await s.snapshot(target, { isHost });
    if (!snap) return null;
    const mePlayer = playerId ? snap.players.find((p) => p.id === playerId) : null;
    snap.me = playerId
      ? {
          id: playerId,
          // Recomputed on every frame so a just-cast vote is reflected
          // immediately rather than at the next unrelated mutation.
          vote: playerToken ? await s.myVote(target, playerToken) : null,
          roleId: mePlayer?.roleId,
          badgeStatus: mePlayer?.badgeStatus,
          temporaryGrants: mePlayer?.temporaryGrants,
        }
      : null;
    return snap;
  }

  const initial = await project();
  if (!initial) return new Response("Room not found", { status: 404 });

  const encoder = new TextEncoder();

  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let timer: ReturnType<typeof setInterval> | null = null;
      let unsubscribe: (() => void) | null = null;
      let pushing = false;
      let queued = false;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const push = async () => {
        if (pushing) {
          queued = true;
          return;
        }
        pushing = true;
        try {
          const snap = await project();
          if (snap) send("snapshot", snap);
        } catch {
          /* ignore */
        } finally {
          pushing = false;
          if (queued) {
            queued = false;
            void push();
          }
        }
      };

      send("snapshot", initial);

      // Local store broadcasts in-process; the interval also acts as a
      // safety net if the bus is unavailable (multiple server instances).
      if (s.transport === "local") {
        unsubscribe = subscribeRoom(target, () => void push());
      }

      timer = setInterval(() => {
        if (closed) return;
        send("ping", { t: Date.now() });
        void push();
      }, 10_000);

      cleanup = () => {
        closed = true;
        if (timer) clearInterval(timer);
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
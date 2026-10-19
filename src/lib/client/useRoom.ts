"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { browserSupabase } from "@/lib/client/supabase";
import type { RoomSnapshot } from "@/lib/types";

export type ConnectionState = "connecting" | "live" | "reconnecting" | "offline";

interface UseRoomResult {
  snapshot: RoomSnapshot | null;
  connection: ConnectionState;
  /** Server-clock offset in ms: serverNow - clientNow. */
  skew: number;
  error: string | null;
  refresh: () => void;
}

/**
 * Live room subscription.
 *
 * Two transports, one behaviour:
 *   local    → Server-Sent Events from the in-process store
 *   supabase → postgres_changes used purely as an invalidation signal,
 *              then a re-fetch of the server projection
 *
 * Timers are NEVER derived from a local countdown: clients read
 * `startsAt` / `endsAt` as absolute server timestamps and subtract the
 * measured clock skew, so every device agrees regardless of clock drift.
 */
export function useRoom(code: string, initial: RoomSnapshot | null): UseRoomResult {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(initial);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [skew, setSkew] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const skewRef = useRef(0);
  const snapshotRef = useRef<RoomSnapshot | null>(initial);

  const apply = useCallback((next: RoomSnapshot) => {
    const offset = next.serverNow - Date.now();
    skewRef.current = offset;
    setSkew(offset);
    setSnapshot(next);
    snapshotRef.current = next;
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/rooms/${code}`, { cache: "no-store" });
      if (!res.ok) throw new Error("not-found");
      apply((await res.json()) as RoomSnapshot);
      setConnection("live");
    } catch {
      setConnection((c) => (c === "live" ? "reconnecting" : c));
    }
  }, [apply, code]);

  useEffect(() => {
    let disposed = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let close: (() => void) | null = null;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- the transport resets when the room code changes.
    setConnection("connecting");

    const connect = () => {
      if (disposed) return;
      const current = snapshot?.transport ?? "local";

      if (current === "supabase") {
        const sb = browserSupabase();
        if (!sb) {
          timer = setTimeout(connect, 1000);
          return;
        }
        const channel = sb
          .channel(`room:${code}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", filter: `code=eq.${code}` },
            () => void refresh(),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "votes" },
            () => void refresh(),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "players" },
            () => void refresh(),
          )
          .subscribe((status) => {
            if (disposed) return;
            if (status === "SUBSCRIBED") {
              retry = 0;
              setConnection("live");
              void refresh();
            } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              setConnection("reconnecting");
            } else if (status === "CLOSED") {
              setConnection("offline");
            }
          });
        close = () => {
          void sb.removeChannel(channel);
        };
        return;
      }

      // Local transport: EventSource with exponential backoff.
      const source = new EventSource(`/api/rooms/${code}/stream`);
      source.addEventListener("open", () => {
        retry = 0;
        setConnection("live");
      });
      source.addEventListener("snapshot", (ev) => {
        try {
          apply(JSON.parse((ev as MessageEvent).data) as RoomSnapshot);
          setConnection("live");
        } catch {
          /* ignore malformed frame */
        }
      });
      source.addEventListener("error", () => {
        if (disposed) return;
        setConnection(source.readyState === EventSource.CLOSED ? "reconnecting" : "reconnecting");
        source.close();
        retry = Math.min(retry + 1, 6);
        timer = setTimeout(connect, Math.min(500 * 2 ** retry, 10_000));
      });
      close = () => source.close();
    };

    connect();

    const onOnline = () => void refresh();
    window.addEventListener("online", onOnline);

    // Safety net: if a stream dies silently, keep polling.
    const poller = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 5_000);

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      clearInterval(poller);
      window.removeEventListener("online", onOnline);
      close?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, apply, refresh]);

  // Recompute skew on an interval so a drifting device clock self-corrects.
  useEffect(() => {
    const id = setInterval(() => {
      const current = snapshotRef.current;
      if (current) setSkew(current.serverNow - Date.now());
    }, 10_000);
    return () => clearInterval(id);
  }, []);

  return useMemo(
    () => ({ snapshot, connection, skew, error, refresh }),
    [snapshot, connection, skew, error, refresh],
  );
}

/** Milliseconds left on the server clock, or null when not counting. */
export function useServerTimer(
  snapshot: RoomSnapshot | null,
  skew: number,
): { msLeft: number | null; totalMs: number | null } {
  const endsAt = snapshot?.round?.status === "open" ? (snapshot?.round?.endsAt ?? null) : null;
  const totalMs = Math.max(0, (snapshot?.questionDuration ?? 25) * 1000);
  const [msLeft, setMsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (endsAt === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing a stale timer is a side effect of the snapshot changing.
      setMsLeft(null);
      return;
    }
    const update = () => setMsLeft(Math.max(0, endsAt - (Date.now() + skew)));
    update();
    const id = setInterval(update, 200);
    return () => clearInterval(id);
  }, [endsAt, skew]);

  return { msLeft, totalMs };
}

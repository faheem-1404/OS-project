"use client";

import { ArrowRight, Check, Loader2, Search, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { joinRoomAction } from "@/app/actions";
import { Ambient, ErrorNote, Logo, Panel } from "@/components/ui";
import type { RoomSnapshot } from "@/lib/types";

export function JoinForm({
  initialCode,
  initialRoom = null,
}: {
  initialCode: string;
  initialRoom?: RoomSnapshot | null;
}) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const nicknameRef = useRef<HTMLInputElement>(null);
  const [checking, setChecking] = useState(false);
  const [room, setRoom] = useState<RoomSnapshot | null>(initialRoom);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Focus nickname field if room code is already filled
  useEffect(() => {
    if (initialCode.length === 6 && nicknameRef.current) {
      nicknameRef.current.focus();
    }
  }, [initialCode]);

  // Verify the code if user types or changes it
  useEffect(() => {
    if (code.length < 4) {
      setRoom(null);
      setError(null);
      return;
    }
    if (room && room.code === code) return;

    let cancelled = false;
    setChecking(true);
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/rooms/${code}`, { cache: "no-store" });
        if (!res.ok) throw new Error("bad");
        const snap = (await res.json()) as RoomSnapshot;
        if (!cancelled) {
          setRoom(snap);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setRoom(null);
          setError("No active room with that code.");
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [code, room]);

  function join(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const cleanNick = (nicknameRef.current?.value ?? "").trim();
    if (!cleanNick) {
      setError("Please choose a nickname.");
      nicknameRef.current?.focus();
      return;
    }
    if (!code || code.length < 4) {
      setError("Please enter a room code.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await joinRoomAction(code, cleanNick);
      if (!res.ok || !res.data) {
        setError(res.error ?? "Could not join.");
        return;
      }
      router.push(`/play/${res.data.code}`);
    });
  }

  const isFinished = room?.status === "finished";
  const canSubmit = code.length >= 4 && !pending && !isFinished;

  return (
    <>
      <Ambient />
      <main className="relative z-10 mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-10 pt-8">
        <Logo />

        <div className="flex flex-1 flex-col justify-center py-10">
          <div>
            <p className="label">CampusLock</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Join the session</h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-dim">
              No account, no email. Just a nickname for the leaderboard.
            </p>

            <form onSubmit={join}>
              <Panel className="mt-7 space-y-5 p-6">
                <div>
                  <label htmlFor="code" className="label">
                    Room code
                  </label>
                  <div className="relative mt-1.5">
                    <input
                      id="code"
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          nicknameRef.current?.focus();
                        }
                      }}
                      inputMode="text"
                      autoCapitalize="characters"
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={6}
                      placeholder="XXXXXX"
                      className="mono w-full rounded-xl bg-black/40 px-4 py-4 text-center text-3xl font-black tracking-[0.35em] text-ink ring-1 ring-white/10 outline-none transition focus:ring-cyan-glow/50"
                    />
                    {checking && (
                      <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-cyan-glow" />
                    )}
                    {!checking && room && (
                      <Check className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-granted" />
                    )}
                  </div>
                </div>

                {room && (
                  <div className="overflow-hidden transition-all duration-300">
                    <div className="flex items-center justify-between rounded-xl bg-white/[0.04] px-4 py-3 ring-1 ring-white/8">
                      <div>
                        <p className="label">Room status</p>
                        <p className="text-sm font-bold capitalize text-ink">{room.status}</p>
                      </div>
                      <div className="text-right">
                        <p className="label">Players</p>
                        <p className="tabular text-sm font-bold text-ink">{room.players.length}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="nick" className="label">
                    Your nickname
                  </label>
                  <div className="relative mt-1.5">
                    <UserRound className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                    <input
                      id="nick"
                      ref={nicknameRef}
                      maxLength={24}
                      autoComplete="nickname"
                      placeholder="e.g. Ada"
                      className="w-full rounded-xl bg-black/40 py-3.5 pl-11 pr-4 text-base font-semibold text-ink ring-1 ring-white/10 outline-none transition focus:ring-cyan-glow/50"
                    />
                  </div>
                  <p className="mt-1.5 text-[0.7rem] text-ink-faint">
                    Shown on the leaderboard. Nothing else is collected.
                  </p>
                </div>

                {error && <ErrorNote>{error}</ErrorNote>}

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-glow py-4 font-bold text-void transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  Join room
                </button>

                {isFinished && (
                  <p className="text-center text-sm text-denied">
                    This session has ended. Ask the host for a new room.
                  </p>
                )}
              </Panel>
            </form>

            <p className="mt-6 flex items-center justify-center gap-2 text-xs text-ink-faint">
              <Search className="h-3.5 w-3.5" />
              Scanned the QR at the door? The room code is already filled in.
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
"use client";

import { ArrowRight, Check, Loader2, UserRound } from "lucide-react";
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
          setError("No active room found with that code.");
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
      setError("Please choose your student name or nickname.");
      nicknameRef.current?.focus();
      return;
    }
    if (!code || code.length < 4) {
      setError("Please enter a valid room code.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await joinRoomAction(code, cleanNick);
      if (!res.ok || !res.data) {
        setError(res.error ?? "Could not join this room.");
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
            <span className="inline-block rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-700/10">
              Campus Access Pass
            </span>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900">
              Join Session
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Enter the session room code and your name to receive your campus digital pass.
            </p>

            <form onSubmit={join}>
              <Panel className="mt-6 space-y-5 p-6 shadow-sm border border-slate-200 bg-white">
                <div>
                  <label htmlFor="code" className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                    Room Code
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
                      placeholder="e.g. 529EUJ"
                      className="mono w-full rounded-xl bg-slate-50 border border-slate-200 px-4 py-3.5 text-center text-3xl font-extrabold tracking-[0.25em] text-slate-900 outline-none transition focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                    />
                    {checking && (
                      <Loader2 className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-blue-600" />
                    )}
                    {!checking && room && (
                      <Check className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-emerald-600" />
                    )}
                  </div>
                </div>

                {room && (
                  <div className="rounded-xl bg-blue-50/70 border border-blue-100 p-3.5 text-xs text-blue-900">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">Session Status</span>
                      <span className="rounded-md bg-white px-2 py-0.5 font-bold uppercase tracking-wider text-blue-700 shadow-2xs">
                        {room.status}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-blue-700/80">Students Joined</span>
                      <span className="font-bold text-blue-950">{room.players.length} online</span>
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="nick" className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                    Your Name or Nickname
                  </label>
                  <div className="relative mt-1.5">
                    <UserRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="nick"
                      ref={nicknameRef}
                      maxLength={24}
                      autoComplete="nickname"
                      placeholder="e.g. Alex Chen"
                      className="w-full rounded-xl bg-slate-50 border border-slate-200 py-3 pl-10 pr-4 text-sm font-semibold text-slate-900 outline-none transition focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">
                    This will appear on your campus pass and on the session leaderboard.
                  </p>
                </div>

                {error && <ErrorNote>{error}</ErrorNote>}

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 font-bold text-white shadow-sm transition hover:bg-blue-700 active:scale-98 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Connecting…
                    </>
                  ) : (
                    <>
                      Join Session
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>

                {isFinished && (
                  <p className="text-center text-xs text-red-600 font-medium">
                    This room session has already concluded.
                  </p>
                )}
              </Panel>
            </form>
          </div>
        </div>
      </main>
    </>
  );
}
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Beaker, KeyRound, Loader2, Plus, Sparkles } from "lucide-react";

import { createRoomAction, reclaimHostAction } from "@/app/actions";
import { Ambient, ErrorNote, Logo, Panel } from "@/components/ui";

export function HostEntry() {
  const router = useRouter();
  const [duration, setDuration] = useState(25);
  const [isDemo, setIsDemo] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [roomCode, setRoomCode] = useState("");
  const [passphrase, setPassphrase] = useState("");

  function create() {
    setBusy(true);
    setError(null);
    startTransition(async () => {
      const res = await createRoomAction({
        questionDuration: duration,
        totalRounds: 5,
        isDemo,
      });
      if (!res.ok || !res.data) {
        setError(res.error ?? "Could not create the room.");
        setBusy(false);
        return;
      }
      // The passphrase is the ONLY way back into this room from another
      // device. Keep it in sessionStorage for this browser and show it once.
      try {
        sessionStorage.setItem(`cl_pass:${res.data.code}`, res.data.hostPassphrase);
      } catch {
        /* storage may be unavailable */
      }
      router.push(`/host/${res.data.code}`);
    });
  }

  function reclaim() {
    setBusy(true);
    setError(null);
    startTransition(async () => {
      const res = await reclaimHostAction(roomCode, passphrase);
      if (!res.ok || !res.data) {
        setError(res.error ?? "Could not verify that passphrase.");
        setBusy(false);
        return;
      }
      router.push(`/host/${res.data.code}`);
    });
  }

  return (
    <>
      <Ambient />
      <main className="relative z-10 mx-auto max-w-5xl px-5 pb-24 pt-6 sm:px-8">
        <header className="py-4">
          <Logo />
        </header>

        <div className="mt-10 grid gap-5 lg:grid-cols-[1.15fr_1fr]">
          {/* Create */}
          <Panel className="p-6 sm:p-8" glow>
            <p className="label">Host console</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Create a session</h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-dim">
              You get a six-character room code, a join QR code and a projector screen. Everything
              after this happens in real time — no page refreshes.
            </p>

            <div className="mt-7 space-y-6">
              <div>
                <div className="mb-2 flex items-baseline justify-between">
                  <label htmlFor="dur" className="label">
                    Seconds per scenario
                  </label>
                  <span className="tabular text-lg font-bold text-cyan-glow">{duration}s</span>
                </div>
                <input
                  id="dur"
                  type="range"
                  min={10}
                  max={90}
                  step={5}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[color:var(--color-cyan-glow)]"
                />
                <div className="mt-1.5 flex justify-between text-[0.65rem] text-ink-faint">
                  <span>10s · brisk</span>
                  <span>90s · discussion</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsDemo((v) => !v)}
                className={`flex w-full items-start gap-3 rounded-xl p-4 text-left ring-1 transition ${
                  isDemo ? "bg-violet/10 ring-violet/30" : "bg-white/[0.03] ring-white/10"
                }`}
              >
                <Beaker
                  className={`mt-0.5 h-5 w-5 shrink-0 ${isDemo ? "text-violet" : "text-ink-faint"}`}
                />
                <span className="flex-1">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    Demo mode
                    {isDemo && (
                      <span className="rounded bg-violet/20 px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-wider text-violet">
                        sample players
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-dim">
                    Seeds clearly-labelled bot players who vote alongside your class, so you can
                    rehearse the full flow alone. Bot scores are reset when the game starts.
                  </span>
                </span>
              </button>

              {error && <ErrorNote>{error}</ErrorNote>}

              <button
                onClick={create}
                disabled={busy || pending}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-glow px-6 py-3.5 font-bold text-void transition hover:brightness-110 disabled:opacity-60"
              >
                {busy || pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Create room
              </button>
            </div>
          </Panel>

          {/* Reclaim */}
          <Panel className="p-6 sm:p-8">
            <p className="label">Returning host</p>
            <h2 className="mt-2 text-xl font-bold tracking-tight">Re-open an existing room</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-dim">
              Room codes are not secret. Control is. Enter the host passphrase you were shown when
              the room was created.
            </p>

            <div className="mt-6 space-y-3">
              <div>
                <label htmlFor="rc" className="label">
                  Room code
                </label>
                <input
                  id="rc"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="e.g. K4M2XQ"
                  maxLength={6}
                  className="mono mt-1.5 w-full rounded-xl bg-black/30 px-4 py-3 text-lg font-bold uppercase tracking-[0.2em] text-ink ring-1 ring-white/10 outline-none transition focus:ring-cyan-glow/50"
                />
              </div>
              <div>
                <label htmlFor="pp" className="label">
                  Host passphrase
                </label>
                <input
                  id="pp"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value.toUpperCase())}
                  placeholder="XXXXX-XXXXX"
                  className="mono mt-1.5 w-full rounded-xl bg-black/30 px-4 py-3 text-base font-bold uppercase tracking-[0.14em] text-ink ring-1 ring-white/10 outline-none transition focus:ring-cyan-glow/50"
                />
              </div>

              <button
                onClick={reclaim}
                disabled={busy || pending || !roomCode || !passphrase}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/5 px-6 py-3 font-semibold text-ink ring-1 ring-white/12 transition hover:bg-white/10 disabled:opacity-40"
              >
                <KeyRound className="h-4 w-4" />
                Re-open room
              </button>
            </div>

            <div className="mt-8 rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/8">
              <p className="flex items-center gap-2 text-xs font-semibold text-ink-dim">
                <Sparkles className="h-3.5 w-3.5 text-cyan-glow" />
                Presenting in a hall?
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-faint">
                Keep the passphrase in a second device or a note. Without it nobody — including the
                room-code holder — can pause, reveal or end the session.
              </p>
            </div>
          </Panel>
        </div>
      </main>
    </>
  );
}
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

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_1fr]">
          {/* Create */}
          <Panel className="p-6 sm:p-8 bg-white border border-slate-200 shadow-sm" glow>
            <p className="label text-slate-500">Instructor & Host Console</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Create a New Session</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Generate a session room code and QR code for your classroom or presentation. Students connect instantly on their phones.
            </p>

            <div className="mt-7 space-y-6">
              <div>
                <div className="mb-2 flex items-baseline justify-between">
                  <label htmlFor="dur" className="label text-slate-600">
                    Seconds per scenario
                  </label>
                  <span className="tabular text-lg font-bold text-blue-600">{duration}s</span>
                </div>
                <input
                  id="dur"
                  type="range"
                  min={10}
                  max={90}
                  step={5}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-blue-600"
                />
                <div className="mt-1.5 flex justify-between text-[0.68rem] text-slate-500 font-medium">
                  <span>10s · fast-paced</span>
                  <span>90s · class discussion</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsDemo((v) => !v)}
                className={`flex w-full items-start gap-3 rounded-2xl p-4 text-left border transition ${
                  isDemo
                    ? "bg-indigo-50 border-indigo-300 shadow-xs"
                    : "bg-slate-50 border-slate-200 hover:bg-slate-100/70"
                }`}
              >
                <Beaker
                  className={`mt-0.5 h-5 w-5 shrink-0 ${isDemo ? "text-indigo-600" : "text-slate-400"}`}
                />
                <span className="flex-1">
                  <span className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    Simulation Demo Mode
                    {isDemo && (
                      <span className="rounded bg-indigo-100 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-indigo-700">
                        sample bots
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-slate-600">
                    Seeds simulated student bots who swipe doors and vote alongside you, so you can rehearse the whole session solo.
                  </span>
                </span>
              </button>

              {error && <ErrorNote>{error}</ErrorNote>}

              <button
                onClick={create}
                disabled={busy || pending}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
              >
                {busy || pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Create Session Room
              </button>
            </div>
          </Panel>

          {/* Reclaim */}
          <Panel className="p-6 sm:p-8 bg-white border border-slate-200 shadow-sm">
            <p className="label text-slate-500">Returning Host</p>
            <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900">Re-open an Existing Room</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Enter your room code and the secret host passphrase generated when the session was created.
            </p>

            <div className="mt-6 space-y-4">
              <div>
                <label htmlFor="rc" className="label text-slate-600">
                  Room code
                </label>
                <input
                  id="rc"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="e.g. K4M2XQ"
                  maxLength={6}
                  className="font-mono mt-1.5 w-full rounded-xl bg-white px-4 py-3 text-lg font-bold uppercase tracking-widest text-slate-900 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
                />
              </div>
              <div>
                <label htmlFor="pp" className="label text-slate-600">
                  Host passphrase
                </label>
                <input
                  id="pp"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value.toUpperCase())}
                  placeholder="XXXXX-XXXXX"
                  className="font-mono mt-1.5 w-full rounded-xl bg-white px-4 py-3 text-base font-bold uppercase tracking-wider text-slate-900 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
                />
              </div>

              <button
                onClick={reclaim}
                disabled={busy || pending || !roomCode || !passphrase}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-40"
              >
                <KeyRound className="h-4 w-4" />
                Re-open Room
              </button>
            </div>

            <div className="mt-7 rounded-xl bg-slate-50 p-4 border border-slate-200">
              <p className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                Teaching in a lecture hall?
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Keep the passphrase on your mobile phone or notes. It allows you to pause or manage scenarios while the room projector runs on the main screen.
              </p>
            </div>
          </Panel>
        </div>
      </main>
    </>
  );
}
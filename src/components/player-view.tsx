"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  Hourglass,
  LogOut,
  Radio,
  Send,
  Trophy,
  Users,
  WifiOff,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { castVoteAction, heartbeatAction, leaveRoomAction } from "@/app/actions";
import { useSfx } from "@/components/prefs";
import {
  ConnectionBadge,
  CountdownOverlay,
  DecisionButtons,
  Leaderboard,
  PointsBadge,
  RevealPanel,
  RoundTrack,
  ScenarioCard,
  VoteBars,
} from "@/components/game";
import { ErrorNote, Logo, Panel, SectionTitle, StatusPill } from "@/components/ui";
import { useRoom, useServerTimer } from "@/lib/client/useRoom";
import type { Decision, RoomSnapshot } from "@/lib/types";

export function PlayerView({ initial }: { initial: RoomSnapshot }) {
  const router = useRouter();
  const { snapshot, connection, skew } = useRoom(initial.code, initial);
  const sfx = useSfx();
  const { msLeft } = useServerTimer(snapshot, skew);

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [optimisticVote, setOptimisticVote] = useState<Decision | null>(null);
  const lastRoundRef = useRef<number>(-1);

  const snap = snapshot ?? initial;
  const round = snap.round;
  const myVote = snap.me?.vote ?? null;
  const revealed = round?.status === "revealed";

  // Reset optimistic vote whenever round changes or session ends
  useEffect(() => {
    setOptimisticVote(null);
  }, [round?.roundIndex, snap.status]);

  const effectiveVote = myVote ?? (optimisticVote ? {
    roundIndex: round?.roundIndex ?? 0,
    decision: optimisticVote,
    outcome: "correct" as const,
    points: null,
    submittedAt: Date.now(),
  } : null);

  // 5-second pre-roll overlay.
  const [countdown, setCountdown] = useState<number | null>(null);
  useEffect(() => {
    if (snap.status !== "countdown" || !round?.openedAt) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing a finished countdown when server state changes.
      setCountdown(null);
      return;
    }
    const serverNow = Date.now() + skew;
    const remaining = Math.ceil((round.openedAt - serverNow) / 1000);
    if (remaining <= 0) {
      setCountdown(null);
      return;
    }
    setCountdown(remaining);
    const id = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(id);
  }, [snap.status, round?.openedAt, skew]);

  // Keep the server informed this device is still here (reconnect UX).
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void heartbeatAction(snap.code);
    }, 20_000);
    return () => clearInterval(id);
  }, [snap.code]);

  // Lock-in feedback exactly once per round.
  useEffect(() => {
    if (myVote && lastRoundRef.current !== myVote.roundIndex) {
      lastRoundRef.current = myVote.roundIndex;
      sfx("lock");
    }
  }, [myVote, sfx]);

  useEffect(() => {
    if (revealed) {
      sfx(myVote && myVote.points && myVote.points > 0 ? "granted" : "denied");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed]);

  const canVote =
    snap.status === "active" &&
    round?.status === "open" &&
    msLeft !== null &&
    !effectiveVote;

  function choose(decision: Decision) {
    if (!canVote || submitting || optimisticVote) return;
    setOptimisticVote(decision);
    setSubmitting(true);
    sfx("lock");
    setError(null);
    startTransition(async () => {
      try {
        const res = await castVoteAction(snap.code, decision);
        if (!res.ok) {
          setOptimisticVote(null);
          setError(res.error ?? "Could not record your vote.");
        }
      } catch {
        setOptimisticVote(null);
        setError("Network error. Please try again.");
      } finally {
        setSubmitting(false);
      }
    });
  }

  async function leave() {
    await leaveRoomAction(snap.code);
    router.push("/");
  }

  return (
    <>
      <CountdownOverlay value={countdown} />

      <main className="relative z-10 mx-auto flex min-h-dvh max-w-xl flex-col px-4 pb-8 pt-5">
        {/* Header */}
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Logo compact />
            <div>
              <p className="mono text-sm font-black tracking-[0.25em] text-cyan-glow">
                {snap.code}
              </p>
              <p className="text-[0.6rem] uppercase tracking-[0.18em] text-ink-faint">
                {snap.me?.id ? "you are in" : "spectating"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill status={snap.status} />
            <ConnectionBadge state={connection} />
          </div>
        </header>

        <div className="mt-4">
          <RoundTrack current={snap.currentRound || 0} total={snap.totalRounds} />
        </div>

        <AnimatePresence>
          {connection === "reconnecting" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-warn/10 px-4 py-2.5 text-sm text-warn ring-1 ring-warn/25">
                <WifiOff className="h-4 w-4" />
                Connection lost — your vote is safe, we&apos;re retrying.
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Lobby */}
        {snap.status === "waiting" && (
          <Panel className="mt-6 p-6 text-center" glow>
            <motion.div
              animate={{ scale: [1, 1.03, 1] }}
              transition={{ duration: 2.4, repeat: Infinity }}
              className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-cyan-glow/10 ring-1 ring-cyan-glow/30"
            >
              <Radio className="h-7 w-7 text-cyan-glow" />
            </motion.div>
            <h1 className="mt-5 text-2xl font-black tracking-tight">You&apos;re in the lobby</h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-dim">
              Keep this page open. The scenario will appear here for everyone at the same moment.
            </p>
            <div className="mt-6 flex items-center justify-center gap-6">
              <Stat icon={<Users className="h-4 w-4" />} value={snap.players.length} label="players" />
              <Stat icon={<Radio className="h-4 w-4" />} value={snap.totalRounds} label="rounds" />
            </div>
          </Panel>
        )}

        {/* Waiting between rounds */}
        {snap.status === "revealing" && revealed && (
          <div className="mt-4">
            <Panel className="flex items-center gap-3 px-4 py-3">
              <Hourglass className="h-4 w-4 shrink-0 text-ink-faint" />
              <p className="text-sm text-ink-dim">
                Next scenario starts when the host is ready.
              </p>
            </Panel>
          </div>
        )}

        {/* Scenario */}
        {snap.scenario && snap.status !== "waiting" && (
          <>
            <Panel className="mt-4 p-5" glow={snap.status === "active"}>
              <ScenarioCard snapshot={snap} />
            </Panel>

            {/* Decision */}
            <Panel className="mt-4 p-5">
              {revealed ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="label">Your answer</span>
                    {myVote ? (
                      <span
                        className={`rounded-lg px-3 py-1 text-sm font-bold tracking-wider ${
                          myVote.decision === "APPROVE"
                            ? "bg-granted/12 text-granted ring-1 ring-granted/25"
                            : "bg-denied/12 text-denied ring-1 ring-denied/25"
                        }`}
                      >
                        {myVote.decision}
                      </span>
                    ) : (
                      <span className="text-sm text-ink-faint">No answer</span>
                    )}
                  </div>
                  <div className="flex justify-center py-1">
                    {myVote?.points !== null && myVote?.points !== undefined ? (
                      <PointsBadge points={myVote.points} />
                    ) : (
                      <span className="text-sm text-ink-faint">No points this round</span>
                    )}
                  </div>
                  <RevealPanel reveal={round?.reveal ?? null} />
                </div>
              ) : effectiveVote ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="py-4 text-center"
                >
                  <CheckCircle2 className="mx-auto h-12 w-12 text-granted" />
                  <p className="mt-3 text-lg font-bold">Answer locked in</p>
                  <p className="mt-1 text-sm text-ink-dim">
                    You chose <span className="font-bold text-ink">{effectiveVote.decision}</span>. Sit
                    tight — the host will reveal when the room has answered.
                  </p>
                </motion.div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="label">Your decision</span>
                    {msLeft !== null && (
                      <span className="tabular text-sm font-bold text-warn">
                        {Math.ceil(msLeft / 1000)}s
                      </span>
                    )}
                  </div>
                  <DecisionButtons
                    disabled={!canVote}
                    locked={false}
                    chosen={null}
                    onChoose={choose}
                  />
                  {snap.status === "countdown" && (
                    <p className="text-center text-sm text-ink-faint">
                      Hold on — voting opens in a moment.
                    </p>
                  )}
                  {snap.status === "paused" && (
                    <p className="text-center text-sm font-bold uppercase tracking-widest text-warn">
                      Host paused the round
                    </p>
                  )}
                  {(submitting || pending) && (
                    <p className="flex items-center justify-center gap-2 text-xs text-ink-faint">
                      <Send className="h-3 w-3 animate-pulse" /> recording…
                    </p>
                  )}
                </div>
              )}
              {error && (
                <div className="mt-4">
                  <ErrorNote>{error}</ErrorNote>
                </div>
              )}
            </Panel>
          </>
        )}

        {/* Live feedback */}
        {snap.status === "active" && round?.status === "open" && (
          <Panel className="mt-4 p-5">
            <SectionTitle>Live room</SectionTitle>
            <VoteBars snapshot={snap} />
          </Panel>
        )}

        {/* Leaderboard */}
        <Panel className="mt-4 p-5">
          <SectionTitle icon={<Trophy className="h-3.5 w-3.5" />}>Leaderboard</SectionTitle>
          <Leaderboard players={snap.leaderboard} limit={8} highlightId={snap.me?.id ?? null} />
        </Panel>

        <button
          onClick={leave}
          className="mx-auto mt-6 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-faint transition hover:text-denied"
        >
          <LogOut className="h-3.5 w-3.5" />
          Leave this room
        </button>
      </main>
    </>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-center gap-1.5 text-ink-dim">
        {icon}
        <span className="tabular text-2xl font-black text-ink">{value}</span>
      </div>
      <p className="label mt-0.5">{label}</p>
    </div>
  );
}
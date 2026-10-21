"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Clock, ShieldX, Trophy, Users } from "lucide-react";
import { useEffect, useState } from "react";

import {
  Confetti,
  CountdownOverlay,
  Leaderboard,
  RevealPanel,
  ScenarioCard,
  TimerRing,
  VoteBars,
} from "@/components/game";
import { Logo } from "@/components/ui";
import { useRoom, useServerTimer } from "@/lib/client/useRoom";
import type { Decision, RoomSnapshot } from "@/lib/types";

/**
 * Audience / projector view. Optimised for a 16:9 wall display: large
 * type, high contrast, clean human college styling, minimal chrome,
 * and NO answer information until the host reveals it.
 */
export function ProjectorScreen({ initial }: { initial: RoomSnapshot }) {
  const { snapshot, connection, skew } = useRoom(initial.code, initial);
  const snap = snapshot ?? initial;
  const { msLeft, totalMs } = useServerTimer(snap, skew);

  const [countdown, setCountdown] = useState<number | null>(null);
  useEffect(() => {
    if (snap.status !== "countdown" || !snap.round?.openedAt) {
      setCountdown(null);
      return;
    }
    const remaining = Math.ceil((snap.round.openedAt - (Date.now() + skew)) / 1000);
    if (remaining <= 0) {
      setCountdown(null);
      return;
    }
    setCountdown(remaining);
    const id = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(id);
  }, [snap.status, snap.round?.openedAt, skew]);

  const revealed = snap.round?.status === "revealed";
  const finished = snap.status === "finished";
  const suspended = snap.status === "paused";
  const roundOpen =
    snap.round?.status === "open" && snap.status !== "countdown" && !suspended;

  return (
    <div className="relative z-10 flex min-h-dvh flex-col bg-slate-50 px-[2.2vw] py-[1.6vw] text-slate-900">
      <CountdownOverlay value={countdown} />
      <Confetti run={finished} />

      {/* Top bar */}
      <header className="flex shrink-0 items-center justify-between gap-4 bg-white p-[1.2vw] rounded-[1.2vw] border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <Logo />
          <span className="font-mono rounded-xl bg-blue-50 px-4 py-1.5 text-[1.5vw] font-bold tracking-widest text-blue-600 border border-blue-200">
            {snap.code}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <BigStat icon={<Users className="h-[1.6vw] w-[1.6vw]" />} value={snap.players.length} label="students" />
          <BigStat
            icon={<Clock className="h-[1.6vw] w-[1.6vw]" />}
            value={snap.status === "waiting" ? 0 : snap.currentRound}
            label={`of ${snap.totalRounds} rounds`}
          />
          <StatusLamp status={snap.status} />
        </div>
      </header>

      {/* Body */}
      <div className="mt-[1.6vw] flex min-h-0 flex-1 gap-[1.8vw]">
        <main className="flex min-w-0 flex-1 flex-col gap-[1.4vw]">
          {snap.status === "waiting" ? (
            <Lobby snap={snap} />
          ) : finished ? (
            <Podium snap={snap} />
          ) : snap.scenario ? (
            <>
              <motion.section
                key={snap.scenario.roundIndex}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45 }}
                className="min-h-0 flex-1 overflow-hidden rounded-[1.4vw] bg-white px-[2vw] py-[1.8vw] border border-slate-200 shadow-sm"
              >
                <ScenarioCard snapshot={snap} size="lg" />
              </motion.section>

              {!revealed && roundOpen && <ChoiceGate snapshot={snap} />}

              <AnimatePresence mode="wait">
                {revealed ? (
                  <motion.div
                    key="reveal"
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    className="shrink-0 bg-white p-[1.6vw] rounded-[1.4vw] border border-slate-200 shadow-sm"
                  >
                    <RevealPanel reveal={snap.round?.reveal ?? null} size="lg" />
                  </motion.div>
                ) : snap.round?.status === "closed" ? (
                  <motion.div
                    key="suspense"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-[1.2vw] rounded-2xl bg-indigo-50 px-[2vw] py-[1.4vw] border border-indigo-200 shadow-sm"
                  >
                    <span className="relative grid h-[4vw] w-[4vw] place-items-center">
                      <span className="absolute inset-0 rounded-full border-2 border-indigo-300" />
                      <motion.span
                        className="absolute inset-0 rounded-full border-2 border-indigo-600"
                        animate={{ scale: [1, 1.25], opacity: [0.8, 0] }}
                        transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
                      />
                      <span className="h-[1.6vw] w-[1.6vw] rounded-full bg-indigo-600" />
                    </span>
                    <div>
                      <p className="text-[2.2vw] font-bold text-indigo-900">Voting Closed</p>
                      <p className="text-[1.3vw] text-slate-600">
                        {snap.round?.tally.total ?? 0} answers submitted — awaiting host reveal.
                      </p>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </>
          ) : null}
        </main>

        {/* Right rail: timer + live distribution + top 3 */}
        <aside className="flex w-[28vw] shrink-0 flex-col gap-[1.2vw]">
          <div className="flex items-center justify-center rounded-[1.4vw] bg-white px-[1.2vw] py-[1.4vw] border border-slate-200 shadow-sm">
            <TimerRing msLeft={msLeft} totalMs={totalMs} size={200} stroke={12} />
          </div>

          <div className="rounded-[1.4vw] bg-white px-[1.6vw] py-[1.4vw] border border-slate-200 shadow-sm">
            {snap.status === "waiting" ? (
              <>
                <p className="text-[0.8vw] font-bold uppercase tracking-wider text-slate-500">Live Vote Distribution</p>
                <p className="mt-2 text-[1.2vw] text-slate-400">
                  Live responses appear as students submit their choices.
                </p>
              </>
            ) : (
              <VoteBars snapshot={snap} size="lg" />
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-hidden rounded-[1.4vw] bg-white px-[1.6vw] py-[1.4vw] border border-slate-200 shadow-sm">
            <p className="text-[0.8vw] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
              <Trophy className="h-[1.4vw] w-[1.4vw] text-amber-500" />
              Top Participants
            </p>
            <div className="mt-2">
              <Leaderboard players={snap.leaderboard} size="lg" limit={3} />
            </div>
          </div>
        </aside>
      </div>

      {/* Footer */}
      <footer className="mt-[1.2vw] flex shrink-0 items-center justify-between text-[1vw] text-slate-500">
        <span>
          {suspended
            ? "PAUSED BY INSTRUCTOR"
            : connection === "live"
              ? "Live Server Sync Active"
              : "Connecting…"}
        </span>
        <span className="hidden sm:block font-medium">
          CampusLock · University Security Lab (OS Final Project)
        </span>
      </footer>
    </div>
  );
}

/**
 * The two enormous, colour-coded choices, sized for the back of the room.
 */
function ChoiceGate({ snapshot }: { snapshot: RoomSnapshot }) {
  const tally = snapshot.round?.tally ?? { approve: 0, deny: 0, total: 0 };
  const total = Math.max(1, tally.total);

  const gates: { label: Decision; count: number; bg: string; text: string; border: string; bar: string }[] = [
    {
      label: "APPROVE",
      count: tally.approve,
      bg: "bg-emerald-50",
      text: "text-emerald-800",
      border: "border-emerald-300",
      bar: "bg-emerald-100",
    },
    {
      label: "DENY",
      count: tally.deny,
      bg: "bg-rose-50",
      text: "text-rose-800",
      border: "border-rose-300",
      bar: "bg-rose-100",
    },
  ];

  return (
    <div className="grid shrink-0 grid-cols-2 gap-[1.4vw]">
      {gates.map((g) => (
        <div
          key={g.label}
          className={`relative flex min-h-[9vw] flex-col items-center justify-center overflow-hidden rounded-[1.4vw] px-[1.5vw] py-[1.4vw] border-2 shadow-sm ${g.bg} ${g.text} ${g.border}`}
        >
          <span
            className={`absolute inset-y-0 left-0 transition-[width] duration-500 ease-out ${g.bar}`}
            style={{
              width: `${(g.count / total) * 100}%`,
            }}
          />
          <span className="relative z-10 text-[4.5vw] font-bold leading-none tracking-tight">
            {g.label}
          </span>
          <span className="relative z-10 mt-[0.4vw] tabular text-[1.8vw] font-semibold opacity-90">
            {g.count} {g.count === 1 ? "student" : "students"}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Lobby({ snap }: { snap: RoomSnapshot }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-1 flex-col items-center justify-center rounded-[1.4vw] bg-white p-[3vw] border border-slate-200 shadow-sm text-center"
    >
      <motion.div
        animate={{ scale: [1, 1.04, 1] }}
        transition={{ duration: 3, repeat: Infinity }}
        className="grid h-[8vw] w-[8vw] place-items-center rounded-[2vw] bg-blue-50 text-blue-600 border border-blue-200"
      >
        <Users className="h-[4vw] w-[4vw] text-blue-600" />
      </motion.div>
      <h1 className="mt-[2vw] text-[4vw] font-bold leading-tight tracking-tight text-slate-900">
        Scan QR Code on Phone
        <span className="block text-blue-600">
          to join the campus access simulation.
        </span>
      </h1>
      <p className="mt-[1.2vw] max-w-[55vw] text-[1.5vw] leading-relaxed text-slate-600">
        {snap.players.length === 0
          ? "No students have joined yet. Scan the code to receive your student clearance badge."
          : `${snap.players.length} ${snap.players.length === 1 ? "student is" : "students are"} connected. The instructor will begin shortly.`}
      </p>
      <div className="mt-[2.5vw] flex gap-[2vw]">
        <Pill label="Room Code" value={snap.code} />
        <Pill label="Connected Students" value={String(snap.players.length)} />
        <Pill label="Quiz Scenarios" value={String(snap.totalRounds)} />
      </div>
    </motion.div>
  );
}

function Podium({ snap }: { snap: RoomSnapshot }) {
  const top = snap.leaderboard.slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean) as typeof top;
  const heights = ["h-[10vw]", "h-[14vw]", "h-[8vw]"];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-1 flex-col items-center justify-center rounded-[1.4vw] bg-white p-[3vw] border border-slate-200 shadow-sm"
    >
      <p className="text-[1vw] font-bold uppercase tracking-wider text-blue-600">Session Complete</p>
      <h1 className="mt-[0.6vw] text-[4vw] font-bold leading-none tracking-tight text-slate-900">
        Campus Access Decisions, <span className="text-amber-600">Evaluated.</span>
      </h1>

      <div className="mt-[3vw] flex items-end justify-center gap-[2vw]">
        {order.map((p, i) => {
          const place = top.indexOf(p) + 1;
          const isFirst = place === 1;
          return (
            <motion.div
              key={p.id}
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15 * i, type: "spring", stiffness: 140, damping: 16 }}
              className="flex w-[16vw] flex-col items-center"
            >
              {isFirst && <Trophy className="mb-[0.8vw] h-[3vw] w-[3vw] text-amber-500" />}
              <span
                className={`mb-[0.8vw] max-w-full truncate font-bold ${
                  isFirst ? "text-[2.2vw] text-slate-900" : "text-[1.8vw] text-slate-700"
                }`}
              >
                {p.nickname}
              </span>
              <div
                className={`flex w-full flex-col items-center justify-center rounded-t-[1.4vw] border ${
                  isFirst
                    ? "bg-amber-100 border-amber-300 shadow-sm"
                    : "bg-slate-100 border-slate-200"
                } ${heights[i]}`}
              >
                <span
                  className={`tabular font-bold ${
                    isFirst ? "text-[3.5vw] text-amber-900" : "text-[2.6vw] text-slate-700"
                  }`}
                >
                  {p.score}
                </span>
                <span className="text-[0.9vw] font-bold uppercase text-slate-500 mt-[0.4vw]">#{place} Place</span>
              </div>
            </motion.div>
          );
        })}
      </div>

      {top.length === 0 && (
        <p className="mt-[2vw] text-[1.4vw] text-slate-400">No students scored this session.</p>
      )}
    </motion.div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-[1.6vw] py-[1vw] border border-slate-200 shadow-xs">
      <p className="text-[0.7vw] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="font-mono mt-1 text-[2vw] font-bold tracking-wider text-blue-600">{value}</p>
    </div>
  );
}

function BigStat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-[0.6vw] rounded-xl bg-slate-50 px-[1.2vw] py-[0.7vw] border border-slate-200 shadow-xs">
      <span className="text-blue-600">{icon}</span>
      <span className="tabular text-[1.6vw] font-bold text-slate-900">{value}</span>
      <span className="text-[0.9vw] text-slate-500 font-medium">{label}</span>
    </div>
  );
}

const LAMP: Record<string, { text: string; border: string; bg: string; dot: string }> = {
  waiting: { text: "LOBBY", border: "border-slate-200", bg: "bg-slate-100 text-slate-700", dot: "bg-slate-400" },
  countdown: { text: "STAND BY", border: "border-amber-200", bg: "bg-amber-50 text-amber-800", dot: "bg-amber-500" },
  active: { text: "VOTING OPEN", border: "border-blue-200", bg: "bg-blue-50 text-blue-700", dot: "bg-blue-500" },
  paused: { text: "PAUSED", border: "border-amber-200", bg: "bg-amber-50 text-amber-800", dot: "bg-amber-500" },
  revealing: { text: "REVEALED", border: "border-indigo-200", bg: "bg-indigo-50 text-indigo-700", dot: "bg-indigo-500" },
  finished: { text: "FINISHED", border: "border-emerald-200", bg: "bg-emerald-50 text-emerald-800", dot: "bg-emerald-500" },
};

function StatusLamp({ status }: { status: string }) {
  const tone = LAMP[status] ?? LAMP.waiting;
  return (
    <span
      className={`flex items-center gap-[0.6vw] rounded-xl px-[1.2vw] py-[0.7vw] text-[1vw] font-bold uppercase tracking-wider border shadow-xs ${tone.bg} ${tone.border}`}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${tone.dot} animate-pulse`} />
      {tone.text}
    </span>
  );
}
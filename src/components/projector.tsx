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
 * type, high contrast, minimal chrome, and NO answer information until
 * the host reveals it.
 */
export function ProjectorScreen({ initial }: { initial: RoomSnapshot }) {
  const { snapshot, connection, skew } = useRoom(initial.code, initial);
  const snap = snapshot ?? initial;
  const { msLeft, totalMs } = useServerTimer(snap, skew);

  const [countdown, setCountdown] = useState<number | null>(null);
  useEffect(() => {
    if (snap.status !== "countdown" || !snap.round?.openedAt) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing a finished countdown when server state changes.
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
    <div className="screen-mode relative z-10 flex min-h-dvh flex-col px-[2.2vw] py-[1.6vw]">
      <CountdownOverlay value={countdown} />
      <Confetti run={finished} />

      {/* Top bar */}
      <header className="flex shrink-0 items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Logo />
          <span className="mono rounded-lg bg-white/5 px-4 py-1.5 text-[1.5vw] font-black tracking-[0.3em] text-cyan-glow ring-1 ring-cyan-glow/25">
            {snap.code}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <BigStat icon={<Users className="h-[1.6vw] w-[1.6vw]" />} value={snap.players.length} label="players" />
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
                className="min-h-0 flex-1 overflow-hidden rounded-[1.2vw] bg-white/[0.02] px-[1.8vw] py-[1.6vw] ring-1 ring-white/8"
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
                    className="shrink-0"
                  >
                    <RevealPanel reveal={snap.round?.reveal ?? null} size="lg" />
                  </motion.div>
                ) : snap.round?.status === "closed" ? (
                  <motion.div
                    key="suspense"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-[1.2vw] rounded-3xl bg-violet/10 px-[2vw] py-[1.4vw] ring-1 ring-violet/30"
                  >
                    <span className="relative grid h-[4vw] w-[4vw] place-items-center">
                      <span className="absolute inset-0 rounded-full border-2 border-violet/40" />
                      <motion.span
                        className="absolute inset-0 rounded-full border-2 border-violet"
                        animate={{ scale: [1, 1.25], opacity: [0.8, 0] }}
                        transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
                      />
                      <span className="h-[1.6vw] w-[1.6vw] rounded-full bg-violet" />
                    </span>
                    <div>
                      <p className="text-[2.6vw] font-black text-violet">Voting closed</p>
                      <p className="text-[1.4vw] text-ink-dim">
                        {snap.round?.tally.total ?? 0} answers in — waiting for the host to reveal.
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
          <div className="flex items-center justify-center rounded-3xl bg-white/[0.03] px-[1.2vw] py-[1.4vw] ring-1 ring-white/8">
            <TimerRing msLeft={msLeft} totalMs={totalMs} size={200} stroke={12} />
          </div>

          <div className="rounded-3xl bg-white/[0.03] px-[1.4vw] py-[1.4vw] ring-1 ring-white/8">
            {snap.status === "waiting" ? (
              <>
                <p className="label">Live distribution</p>
                <p className="mt-2 text-[1.4vw] text-ink-faint">
                  Results appear here the moment voting opens.
                </p>
              </>
            ) : (
              <VoteBars snapshot={snap} size="lg" />
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-hidden rounded-3xl bg-white/[0.03] px-[1.4vw] py-[1.4vw] ring-1 ring-white/8">
            <p className="label flex items-center gap-2">
              <Trophy className="h-[1.4vw] w-[1.4vw]" />
              Top three
            </p>
            <div className="mt-2">
              <Leaderboard players={snap.leaderboard} size="lg" limit={3} />
            </div>
          </div>
        </aside>
      </div>

      {/* Footer */}
      <footer className="mt-[1.2vw] flex shrink-0 items-center justify-between text-[1vw] text-ink-faint">
        <span>
          {suspended
            ? "PAUSED BY HOST"
            : connection === "live"
              ? "Live · server-synchronised"
              : "Reconnecting…"}
        </span>
        <span className="hidden sm:block">
          CampusLock · Smart University Access Management Simulation
        </span>
      </footer>
    </div>
  );
}

/**
 * The two enormous, colour-coded choices, sized for the back of the room.
 * They show the shape of the split only — never which one is correct.
 */
function ChoiceGate({ snapshot }: { snapshot: RoomSnapshot }) {
  const tally = snapshot.round?.tally ?? { approve: 0, deny: 0, total: 0 };
  const total = Math.max(1, tally.total);

  const gates: { label: Decision; count: number; color: string }[] = [
    { label: "APPROVE", count: tally.approve, color: "var(--color-granted)" },
    { label: "DENY", count: tally.deny, color: "var(--color-denied)" },
  ];

  return (
    <div className="grid shrink-0 grid-cols-2 gap-[1.4vw]">
      {gates.map((g) => (
        <div
          key={g.label}
          className="relative flex min-h-[9vw] flex-col items-center justify-center overflow-hidden rounded-[1.2vw] px-[1.5vw] py-[1.4vw] ring-2"
          style={{
            color: g.color,
            borderColor: `color-mix(in srgb, ${g.color} 38%, transparent)`,
            backgroundColor: `color-mix(in srgb, ${g.color} 7%, transparent)`,
          }}
        >
          <span
            className="absolute inset-y-0 left-0 transition-[width] duration-500 ease-out"
            style={{
              width: `${(g.count / total) * 100}%`,
              backgroundColor: `color-mix(in srgb, ${g.color} 14%, transparent)`,
            }}
          />
          <span className="relative z-10 text-[5vw] font-black leading-none tracking-tight">
            {g.label}
          </span>
          <span className="relative z-10 mt-[0.4vw] tabular text-[2vw] font-bold opacity-80">
            {g.count} {g.count === 1 ? "vote" : "votes"}
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
      className="flex flex-1 flex-col items-center justify-center text-center"
    >
      <motion.div
        animate={{ scale: [1, 1.04, 1] }}
        transition={{ duration: 3, repeat: Infinity }}
        className="grid h-[9vw] w-[9vw] place-items-center rounded-[2vw] bg-cyan-glow/10 ring-2 ring-cyan-glow/30"
      >
        <Users className="h-[4vw] w-[4vw] text-cyan-glow" />
      </motion.div>
      <h1 className="mt-[2vw] text-[5vw] font-black leading-[1.05] tracking-tight">
        Scan. Join.
        <span className="block bg-gradient-to-r from-cyan-glow to-granted bg-clip-text text-transparent">
          Then watch the room decide.
        </span>
      </h1>
      <p className="mt-[1.6vw] max-w-[60vw] text-[1.8vw] leading-relaxed text-ink-dim">
        {snap.players.length === 0
          ? "Nobody has joined yet. Keep this screen open — players appear the moment they scan the code."
          : `${snap.players.length} ${snap.players.length === 1 ? "player is" : "players are"} in the room. The host will start shortly.`}
      </p>
      <div className="mt-[3vw] flex gap-[2vw]">
        <Pill label="Room" value={snap.code} />
        <Pill label="Players" value={String(snap.players.length)} />
        <Pill label="Rounds" value={String(snap.totalRounds)} />
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
      className="flex flex-1 flex-col items-center justify-center"
    >
      <p className="label text-cyan-glow">Session complete</p>
      <h1 className="mt-[0.6vw] text-[4.5vw] font-black leading-none tracking-tight">
        Access Governance, <span className="text-warn">decided.</span>
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
              {isFirst && <Trophy className="mb-[0.8vw] h-[3vw] w-[3vw] text-warn" />}
              <span
                className={`mb-[0.8vw] max-w-full truncate font-black ${
                  isFirst ? "text-[2.4vw] text-ink" : "text-[1.9vw] text-ink-dim"
                }`}
              >
                {p.nickname}
              </span>
              <div
                className={`flex w-full flex-col items-center justify-center rounded-t-[1.4vw] ${
                  isFirst
                    ? "bg-gradient-to-b from-warn/35 to-warn/10 ring-2 ring-warn/40"
                    : "bg-white/[0.05] ring-1 ring-white/10"
                } ${heights[i]}`}
              >
                <span
                  className={`tabular font-black ${
                    isFirst ? "text-[4vw] text-warn" : "text-[3vw] text-ink-dim"
                  }`}
                >
                  {p.score}
                </span>
                <span className="label mt-[0.4vw]">#{place}</span>
              </div>
            </motion.div>
          );
        })}
      </div>

      {top.length === 0 && (
        <p className="mt-[2vw] text-[1.6vw] text-ink-faint">No players scored this session.</p>
      )}
    </motion.div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.04] px-[1.6vw] py-[1vw] ring-1 ring-white/10">
      <p className="label">{label}</p>
      <p className="mono mt-1 text-[2.2vw] font-black tracking-[0.2em] text-cyan-glow">{value}</p>
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
    <div className="flex items-center gap-[0.6vw] rounded-2xl bg-white/[0.04] px-[1.2vw] py-[0.7vw] ring-1 ring-white/10">
      <span className="text-cyan-glow">{icon}</span>
      <span className="tabular text-[1.8vw] font-black text-ink">{value}</span>
      <span className="text-[1vw] text-ink-faint">{label}</span>
    </div>
  );
}

const LAMP: Record<string, { text: string; ring: string; bg: string }> = {
  waiting: { text: "LOBBY", ring: "ring-white/12", bg: "bg-white/5 text-ink-dim" },
  countdown: { text: "STAND BY", ring: "ring-warn/35", bg: "bg-warn/12 text-warn" },
  active: { text: "VOTING", ring: "ring-cyan-glow/35", bg: "bg-cyan-glow/12 text-cyan-glow" },
  paused: { text: "PAUSED", ring: "ring-warn/35", bg: "bg-warn/12 text-warn" },
  revealing: { text: "REVEALED", ring: "ring-violet/35", bg: "bg-violet/12 text-violet" },
  finished: { text: "FINISHED", ring: "ring-granted/35", bg: "bg-granted/12 text-granted" },
};

function StatusLamp({ status }: { status: string }) {
  const tone = LAMP[status] ?? LAMP.waiting;
  const Icon =
    status === "active" ? CheckCircle2 : status === "revealing" ? CheckCircle2 : ShieldX;
  return (
    <span
      className={`flex items-center gap-[0.6vw] rounded-2xl px-[1.2vw] py-[0.7vw] text-[1.2vw] font-black uppercase tracking-[0.2em] ring-1 ${tone.bg} ${tone.ring}`}
    >
      <Icon className="h-[1.4vw] w-[1.4vw]" />
      {tone.text}
    </span>
  );
}
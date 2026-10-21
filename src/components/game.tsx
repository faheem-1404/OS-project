"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ShieldX, Trophy, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { usePrefs } from "@/components/prefs";
import type { ConnectionState } from "@/lib/client/useRoom";
import type { Decision, PlayerView, RevealPayload, RoomSnapshot } from "@/lib/types";
import { Meter } from "@/components/ui";

/* ------------------------------------------------------------------ */
/* Connection                                                          */
/* ------------------------------------------------------------------ */

export function ConnectionBadge({ state }: { state: ConnectionState }) {
  const tone =
    state === "live"
      ? "text-emerald-700 border-emerald-200 bg-emerald-50"
      : state === "connecting"
        ? "text-slate-600 border-slate-200 bg-slate-50"
        : "text-rose-700 border-rose-200 bg-rose-50";
  const text =
    state === "live" ? "Live" : state === "connecting" ? "Connecting" : "Reconnecting";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wider border ${tone}`}
    >
      {state === "live" ? (
        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
      ) : (
        <WifiOff className="h-3 w-3" />
      )}
      {text}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Timer ring                                                          */
/* ------------------------------------------------------------------ */

export function TimerRing({
  msLeft,
  totalMs,
  size = 132,
  stroke = 8,
}: {
  msLeft: number | null;
  totalMs: number | null;
  size?: number;
  stroke?: number;
}) {
  const { reducedMotion } = usePrefs();
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = msLeft !== null && totalMs ? Math.max(0, Math.min(1, msLeft / totalMs)) : 0;
  const seconds = msLeft === null ? null : Math.ceil(msLeft / 1000);
  const urgent = seconds !== null && seconds <= 5;

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={urgent ? "#dc2626" : "#2563eb"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          style={{
            transition: reducedMotion ? "none" : "stroke-dashoffset 240ms linear, stroke 300ms linear",
          }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        {seconds === null ? (
          <span className="label text-slate-400">—</span>
        ) : (
          <motion.span
            key={urgent ? "urgent" : "calm"}
            animate={urgent && !reducedMotion ? { scale: [1, 1.12, 1] } : {}}
            transition={{ duration: 0.5, repeat: urgent ? Infinity : 0 }}
            className={`tabular text-4xl font-bold ${urgent ? "text-rose-600" : "text-slate-900"}`}
          >
            {seconds}
          </motion.span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Scenario                                                            */
/* ------------------------------------------------------------------ */

export function ScenarioCard({
  snapshot,
  size = "md",
}: {
  snapshot: RoomSnapshot;
  size?: "md" | "lg";
}) {
  const s = snapshot.scenario;
  if (!s) return null;
  const lg = size === "lg";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-blue-50 px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-wider text-blue-700 border border-blue-200">
          Round {s.roundIndex} / {snapshot.totalRounds}
        </span>
        <span className="rounded-md bg-slate-100 px-2.5 py-1 text-[0.68rem] font-semibold text-slate-700 border border-slate-200">
          {snapshot.round?.status ?? "pending"}
        </span>
      </div>

      <h1
        className={`font-bold leading-[1.12] tracking-tight text-slate-900 ${lg ? "text-4xl sm:text-5xl lg:text-6xl" : "text-2xl sm:text-3xl"}`}
      >
        {s.title}
      </h1>

      <p className={`leading-relaxed text-slate-600 ${lg ? "text-2xl leading-relaxed" : "text-sm sm:text-base"}`}>
        {s.description}
      </p>

      <dl className="grid gap-3 sm:grid-cols-3">
        {[
          { k: "Campus Resource", v: s.resourceType },
          { k: "Requester Role", v: s.requesterRole },
          { k: "Access Request", v: s.accessRequest },
        ].map((item) => (
          <div key={item.k} className="rounded-xl bg-slate-50 p-3.5 border border-slate-200 shadow-xs">
            <dt className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">{item.k}</dt>
            <dd className={`mt-1 font-semibold text-slate-900 ${lg ? "text-lg" : "text-sm"}`}>{item.v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Vote distribution                                                   */
/* ------------------------------------------------------------------ */

export function VoteBars({
  snapshot,
  size = "md",
}: {
  snapshot: RoomSnapshot;
  size?: "md" | "lg";
}) {
  const tally = snapshot.round?.tally ?? { approve: 0, deny: 0, total: 0 };
  const total = Math.max(1, tally.total);
  const lg = size === "lg";

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <span className="text-[0.7rem] font-bold uppercase tracking-wider text-slate-500">Votes Cast</span>
        <span className="tabular text-2xl font-bold text-slate-900">
          {tally.total}
          <span className="text-sm font-medium text-slate-400"> / {snapshot.players.length}</span>
        </span>
      </div>

      <div className="space-y-3">
        <VoteBar
          label="APPROVE"
          count={tally.approve}
          total={total}
          tone="granted"
          big={lg}
        />
        <VoteBar label="DENY" count={tally.deny} total={total} tone="denied" big={lg} />
      </div>
    </div>
  );
}

function VoteBar({
  label,
  count,
  total,
  tone,
  big = false,
}: {
  label: Decision;
  count: number;
  total: number;
  tone: "granted" | "denied";
  big?: boolean;
}) {
  const pct = (count / total) * 100;
  const isGrant = tone === "granted";
  const textColor = isGrant ? "text-emerald-700" : "text-rose-700";
  const barBg = isGrant ? "bg-emerald-600" : "bg-rose-600";

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span
          className={`font-bold tracking-wider ${big ? "text-2xl" : "text-sm"} ${textColor}`}
        >
          {label}
        </span>
        <span className={`tabular font-bold ${big ? "text-3xl" : "text-lg"} ${textColor}`}>
          {count} ({Math.round(pct)}%)
        </span>
      </div>
      <div className={`w-full overflow-hidden rounded-full bg-slate-100 border border-slate-200 ${big ? "h-7" : "h-3"}`}>
        <motion.div
          className={`h-full rounded-full ${barBg}`}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Reveal                                                              */
/* ------------------------------------------------------------------ */

export function RevealPanel({
  reveal,
  size = "md",
}: {
  reveal: RevealPayload | null;
  size?: "md" | "lg";
}) {
  if (!reveal) return null;
  const granted = reveal.correctDecision === "APPROVE";
  const lg = size === "lg";

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-3.5"
    >
      <div
        className={`flex items-center gap-3.5 rounded-2xl px-5 py-4 border ${
          granted
            ? "bg-emerald-50 text-emerald-900 border-emerald-300"
            : "bg-rose-50 text-rose-900 border-rose-300"
        }`}
      >
        {granted ? (
          <CheckCircle2 className={`text-emerald-600 ${lg ? "h-10 w-10" : "h-7 w-7"}`} />
        ) : (
          <ShieldX className={`text-rose-600 ${lg ? "h-10 w-10" : "h-7 w-7"}`} />
        )}
        <div>
          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">
            Correct Decision
          </p>
          <p className={`font-bold tracking-tight ${lg ? "text-4xl" : "text-2xl"}`}>
            {reveal.correctDecision}
          </p>
        </div>
      </div>

      <div className="rounded-xl bg-slate-50 p-4 border border-slate-200 space-y-1">
        <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">Reasoning</p>
        <p className={`leading-relaxed text-slate-700 ${lg ? "text-xl" : "text-sm"}`}>
          {reveal.explanation}
        </p>
      </div>

      <div className="rounded-xl bg-blue-50 px-4 py-3 border border-blue-200">
        <p className="text-[0.65rem] font-bold uppercase tracking-wider text-blue-700">Security Principle</p>
        <p className={`mt-0.5 font-semibold text-slate-900 ${lg ? "text-2xl" : "text-sm"}`}>
          {reveal.principle}
        </p>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Leaderboard                                                         */
/* ------------------------------------------------------------------ */

export function Leaderboard({
  players,
  size = "md",
  limit,
  highlightId,
}: {
  players: PlayerView[];
  size?: "md" | "lg";
  limit?: number;
  highlightId?: string | null;
}) {
  const rows = limit ? players.slice(0, limit) : players;
  const lg = size === "lg";

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-xs text-slate-400">
        No participants yet.
      </div>
    );
  }

  return (
    <ol className="space-y-2">
      {rows.map((p, i) => {
        const rank = i + 1;
        const medal = rank <= 3;
        return (
          <motion.li
            key={p.id}
            layout={!lg}
            className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 border transition-colors shadow-xs ${
              p.id === highlightId
                ? "bg-blue-50/80 border-blue-300 font-bold"
                : medal
                  ? "bg-amber-50/60 border-amber-200"
                  : "bg-white border-slate-200 hover:bg-slate-50"
            }`}
          >
            <span
              className={`grid shrink-0 place-items-center rounded-lg font-bold tabular ${
                lg ? "h-11 w-11 text-xl" : "h-7 w-7 text-xs"
              } ${medal ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}
            >
              {medal ? <Trophy className={lg ? "h-6 w-6" : "h-3.5 w-3.5 text-amber-600"} /> : rank}
            </span>
            <span className={`min-w-0 flex-1 truncate font-semibold text-slate-900 ${lg ? "text-2xl" : "text-sm"}`}>
              {p.nickname}
              {p.isBot && (
                <span className="ml-2 rounded bg-indigo-50 px-1.5 py-0.5 text-[0.55rem] font-bold uppercase text-indigo-700 border border-indigo-200">
                  bot
                </span>
              )}
              {!p.isConnected && (
                <span className="ml-2 text-[0.65rem] font-medium text-rose-600">offline</span>
              )}
            </span>
            <span className={`tabular shrink-0 font-bold text-blue-600 ${lg ? "text-3xl" : "text-sm"}`}>
              {p.score} pts
            </span>
          </motion.li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* Confetti (final podium)                                             */
/* ------------------------------------------------------------------ */

function scatter(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function Confetti({ run }: { run: boolean }) {
  const { reducedMotion } = usePrefs();
  const pieces = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => ({
        id: i,
        left: scatter(i + 1) * 100,
        delay: scatter(i + 7) * 1.6,
        duration: 2.6 + scatter(i + 19) * 2,
        color: ["#2563eb", "#059669", "#d97706", "#4f46e5", "#dc2626"][i % 5],
        size: 6 + scatter(i + 31) * 6,
      })),
    [],
  );

  if (!run || reducedMotion) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-[-5vh] rounded-sm"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 1.6,
            backgroundColor: p.color,
            animation: `fall ${p.duration}s ${p.delay}s linear forwards`,
          }}
        />
      ))}
      <style>{`@keyframes fall{to{transform:translateY(115vh) rotate(720deg);opacity:.1}}`}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Round progression strip                                             */
/* ------------------------------------------------------------------ */

export function RoundTrack({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Round ${current} of ${total}`}>
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <span
            key={n}
            className={`h-2 flex-1 rounded-full transition-colors ${
              done ? "bg-emerald-500" : active ? "bg-blue-600" : "bg-slate-200"
            }`}
          />
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Vote buttons                                                        */
/* ------------------------------------------------------------------ */

export function DecisionButtons({
  disabled,
  locked,
  chosen,
  onChoose,
  size = "md",
}: {
  disabled?: boolean;
  locked?: boolean;
  chosen?: Decision | null;
  onChoose: (d: Decision) => void;
  size?: "md" | "lg";
}) {
  const lg = size === "lg";
  return (
    <div className={`grid gap-3 ${lg ? "sm:grid-cols-2" : "grid-cols-2"}`}>
      {(["APPROVE", "DENY"] as Decision[]).map((d) => {
        const isApprove = d === "APPROVE";
        const active = chosen === d;

        return (
          <motion.button
            key={d}
            type="button"
            disabled={disabled}
            onClick={() => onChoose(d)}
            whileTap={disabled ? undefined : { scale: 0.96 }}
            className={`relative flex items-center justify-center rounded-2xl font-bold tracking-wider border-2 transition-all select-none touch-manipulation cursor-pointer disabled:cursor-not-allowed disabled:opacity-45 shadow-sm ${
              lg ? "px-8 py-10 text-3xl sm:text-5xl" : "px-4 py-5 text-base sm:text-lg"
            } ${
              isApprove
                ? active
                  ? "bg-emerald-600 text-white border-emerald-700 shadow-md"
                  : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                : active
                ? "bg-rose-600 text-white border-rose-700 shadow-md"
                : "bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100"
            }`}
          >
            <span className="relative z-10">{d}</span>
            {locked && (
              <span className="absolute right-3 top-3 text-[0.6rem] font-bold uppercase tracking-wider text-slate-500">
                locked
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Countdown overlay (5 → 1)                                           */
/* ------------------------------------------------------------------ */

export function CountdownOverlay({ value }: { value: number | null }) {
  const { reducedMotion } = usePrefs();
  return (
    <AnimatePresence>
      {value !== null && value > 0 && (
        <motion.div
          key={value}
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.25 }}
          transition={{ duration: reducedMotion ? 0.01 : 0.3 }}
          className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-slate-900/60 backdrop-blur-xs"
        >
          <span className="tabular text-[20vw] font-black leading-none text-white drop-shadow-xl">
            {value}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/* Points badge                                                        */
/* ------------------------------------------------------------------ */

export function PointsBadge({ points }: { points: number | null }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (points === null) return;
    const start = performance.now();
    let raf = 0;
    const from = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 900);
      setShown(Math.round(from + (points - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [points]);

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-emerald-800 border border-emerald-200 shadow-xs"
    >
      <Trophy className="h-4 w-4 text-emerald-600" />
      <span className="tabular text-lg font-bold">
        {points === null ? "—" : `+${shown}`}
      </span>
      {points !== null && <span className="text-xs font-semibold text-emerald-700">points</span>}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Join / vote progress meter                                          */
/* ------------------------------------------------------------------ */

export function ResponseRate({ voted, total }: { voted: number; total: number }) {
  const pct = total > 0 ? Math.round((voted / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-slate-500">
        <span>Response rate</span>
        <span className="tabular font-semibold text-slate-800">{pct}%</span>
      </div>
      <Meter value={voted} max={Math.max(1, total)} />
    </div>
  );
}
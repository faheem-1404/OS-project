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
      ? "text-granted ring-granted/30 bg-granted/10"
      : state === "connecting"
        ? "text-ink-dim ring-white/10 bg-white/5"
        : "text-denied ring-denied/30 bg-denied/10";
  const text =
    state === "live" ? "Live" : state === "connecting" ? "Connecting" : "Reconnecting";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.16em] ring-1 ${tone}`}
    >
      {state === "live" ? (
        <span className="pulse-dot bg-granted" />
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
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={urgent ? "var(--color-denied)" : "var(--color-cyan-glow)"}
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
          <span className="label">—</span>
        ) : (
          <motion.span
            key={urgent ? "urgent" : "calm"}
            animate={urgent && !reducedMotion ? { scale: [1, 1.12, 1] } : {}}
            transition={{ duration: 0.5, repeat: urgent ? Infinity : 0 }}
            className={`tabular text-4xl font-bold ${urgent ? "text-denied" : "text-ink"}`}
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-cyan-glow/10 px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-cyan-glow ring-1 ring-cyan-glow/25">
          Round {s.roundIndex} / {snapshot.totalRounds}
        </span>
        <span className="rounded-md bg-white/5 px-2.5 py-1 text-[0.65rem] font-medium text-ink-dim ring-1 ring-white/10">
          {snapshot.round?.status ?? "pending"}
        </span>
      </div>

      <h1
        className={`font-bold leading-[1.08] tracking-tight text-ink ${lg ? "text-4xl sm:text-5xl lg:text-6xl" : "text-2xl sm:text-3xl"}`}
      >
        {s.title}
      </h1>

      <p className={`leading-relaxed text-ink-dim ${lg ? "text-2xl leading-relaxed" : "text-base"}`}>
        {s.description}
      </p>

      <dl className="grid gap-3 sm:grid-cols-3">
        {[
          { k: "Resource", v: s.resourceType },
          { k: "Requester role", v: s.requesterRole },
          { k: "Request", v: s.accessRequest },
        ].map((item) => (
          <div key={item.k} className="panel-tight px-3.5 py-3">
            <dt className="label">{item.k}</dt>
            <dd className={`mt-1 font-semibold text-ink ${lg ? "text-lg" : "text-sm"}`}>{item.v}</dd>
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
        <span className="label">Votes cast</span>
        <span className="tabular text-2xl font-bold text-ink">
          {tally.total}
          <span className="text-sm font-medium text-ink-faint"> / {snapshot.players.length}</span>
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
  const color = tone === "granted" ? "var(--color-granted)" : "var(--color-denied)";
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span
          className={`font-bold tracking-[0.18em] ${big ? "text-2xl" : "text-sm"}`}
          style={{ color }}
        >
          {label}
        </span>
        <span className={`tabular font-bold ${big ? "text-3xl" : "text-lg"}`} style={{ color }}>
          {count}
        </span>
      </div>
      <div className={`w-full overflow-hidden rounded-full bg-white/8 ${big ? "h-8" : "h-3"}`}>
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
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
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={`space-y-4 ${granted ? "" : ""}`}
    >
      <div
        className={`flex items-center gap-3 rounded-2xl px-5 py-4 ring-1 ${
          granted
            ? "bg-granted/12 text-granted ring-granted/35"
            : "bg-denied/12 text-denied ring-denied/35"
        }`}
      >
        {granted ? <CheckCircle2 className={lg ? "h-10 w-10" : "h-7 w-7"} /> : <ShieldX className={lg ? "h-10 w-10" : "h-7 w-7"} />}
        <div>
          <p className="label" style={{ color: "inherit" }}>
            Correct decision
          </p>
          <p className={`font-bold tracking-tight ${lg ? "text-5xl" : "text-3xl"}`}>
            {reveal.correctDecision}
          </p>
        </div>
      </div>

      <div className="panel-tight space-y-2 p-4">
        <p className="label">Why</p>
        <p className={`leading-relaxed text-ink-dim ${lg ? "text-2xl" : "text-sm"}`}>
          {reveal.explanation}
        </p>
      </div>

      <div className="rounded-2xl bg-violet/10 px-5 py-4 ring-1 ring-violet/30">
        <p className="label text-violet">Security principle</p>
        <p className={`mt-1 font-semibold leading-snug text-ink ${lg ? "text-3xl" : "text-base"}`}>
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
      <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-ink-faint">
        No players yet.
      </div>
    );
  }

  return (
    <ol className="space-y-1.5">
      {rows.map((p, i) => {
        const rank = i + 1;
        const medal = rank <= 3;
        return (
          <motion.li
            key={p.id}
            layout={!lg}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1 transition-colors ${
              p.id === highlightId
                ? "bg-cyan-glow/10 ring-cyan-glow/30"
                : medal
                  ? "bg-white/[0.04] ring-white/10"
                  : "bg-transparent ring-transparent"
            }`}
          >
            <span
              className={`grid shrink-0 place-items-center rounded-lg font-bold tabular ${
                lg ? "h-11 w-11 text-xl" : "h-8 w-8 text-sm"
              } ${medal ? "bg-warn/15 text-warn ring-1 ring-warn/30" : "bg-white/5 text-ink-faint"}`}
            >
              {medal ? <Trophy className={lg ? "h-6 w-6" : "h-4 w-4"} /> : rank}
            </span>
            <span className={`min-w-0 flex-1 truncate font-semibold ${lg ? "text-3xl" : "text-sm"}`}>
              {p.nickname}
              {p.isBot && (
                <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 align-middle text-[0.6rem] font-semibold uppercase tracking-wider text-ink-faint">
                  demo
                </span>
              )}
              {!p.isConnected && (
                <span className="ml-2 align-middle text-[0.65rem] font-medium text-denied">offline</span>
              )}
            </span>
            <span className={`tabular shrink-0 font-bold text-cyan-glow ${lg ? "text-4xl" : "text-sm"}`}>
              {p.score}
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

/**
 * Deterministic scatter — a hash of the piece index rather than
 * Math.random, so the burst is identical on every render pass and the
 * component stays pure.
 */
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
        color: ["#22d3ee", "#2ee6a0", "#ffb020", "#8b7cff", "#ff4d6d"][i % 5],
        size: 5 + scatter(i + 31) * 7,
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
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              done ? "bg-granted" : active ? "bg-cyan-glow" : "bg-white/10"
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
        const granted = d === "APPROVE";
        const active = chosen === d;
        const color = granted ? "var(--color-granted)" : "var(--color-denied)";
        return (
          <motion.button
            key={d}
            type="button"
            disabled={disabled}
            onClick={() => onChoose(d)}
            whileTap={disabled ? undefined : { scale: 0.97 }}
            className={`relative overflow-hidden rounded-2xl font-bold tracking-[0.1em] ring-1 transition-all select-none touch-manipulation cursor-pointer active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 ${
              lg ? "px-8 py-10 text-4xl sm:text-6xl" : "px-4 py-6 text-lg"
            }`}
            style={{
              color,
              backgroundColor: active ? `color-mix(in srgb, ${color} 16%, transparent)` : "transparent",
              borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
              boxShadow: active ? `0 0 40px -8px ${color}` : "none",
            }}
          >
            <span className="relative z-10">{d}</span>
            <span
              className="absolute inset-x-0 -bottom-10 h-24 opacity-25 blur-2xl"
              style={{ backgroundColor: color }}
            />
            {locked && (
              <span className="absolute right-3 top-3 text-[0.55rem] font-semibold uppercase tracking-[0.18em] text-ink-faint">
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
          className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-void/70 backdrop-blur-sm"
        >
          <span className="tabular text-[22vw] font-black leading-none text-cyan-glow drop-shadow-[0_0_60px_rgba(34,211,238,0.6)]">
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
      className="inline-flex items-center gap-2 rounded-full bg-granted/12 px-4 py-2 text-granted ring-1 ring-granted/30"
    >
      <Trophy className="h-4 w-4" />
      <span className="tabular text-lg font-bold">
        {points === null ? "—" : `+${shown}`}
      </span>
      {points !== null && <span className="text-xs font-medium text-ink-faint">points</span>}
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
      <div className="flex justify-between text-xs text-ink-faint">
        <span>Response rate</span>
        <span className="tabular">{pct}%</span>
      </div>
      <Meter value={voted} max={Math.max(1, total)} />
    </div>
  );
}
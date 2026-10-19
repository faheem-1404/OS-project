import type { ReactNode } from "react";

/* ------------------------------------------------------------------ */
/* Ambient background                                                  */
/* ------------------------------------------------------------------ */

export function Ambient() {
  return (
    <div className="campuslock-bg" aria-hidden="true">
      <div className="campuslock-grid absolute inset-0" />
      <div className="campuslock-vignette absolute inset-0" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-glow/40 to-transparent" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Brand                                                               */
/* ------------------------------------------------------------------ */

export function Logo({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-cyan-glow/10 ring-1 ring-cyan-glow/40">
        <span className="absolute inset-0 rounded-xl bg-cyan-glow/20 blur-md" aria-hidden="true" />
        <svg viewBox="0 0 24 24" className="relative h-5 w-5 text-cyan-glow" fill="none" aria-hidden="true">
          <path
            d="M7 10V7a5 5 0 0 1 10 0v3M5 10h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <circle cx="12" cy="15" r="1.6" fill="currentColor" />
        </svg>
      </span>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="text-[0.95rem] font-bold tracking-tight text-ink">CampusLock</span>
          <span className="text-[0.58rem] font-medium uppercase tracking-[0.22em] text-ink-faint">
            Access Governance
          </span>
        </span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

const STATUS_TONE: Record<string, { text: string; bg: string; ring: string; dot: string }> = {
  waiting: { text: "text-ink-dim", bg: "bg-white/5", ring: "ring-white/10", dot: "bg-ink-dim" },
  countdown: { text: "text-warn", bg: "bg-warn/10", ring: "ring-warn/30", dot: "bg-warn" },
  active: { text: "text-cyan-glow", bg: "bg-cyan-glow/10", ring: "ring-cyan-glow/30", dot: "bg-cyan-glow" },
  revealing: { text: "text-violet", bg: "bg-violet/10", ring: "ring-violet/30", dot: "bg-violet" },
  paused: { text: "text-warn", bg: "bg-warn/10", ring: "ring-warn/30", dot: "bg-warn" },
  finished: { text: "text-granted", bg: "bg-granted/10", ring: "ring-granted/30", dot: "bg-granted" },
};

export function StatusPill({ status, className = "" }: { status: string; className?: string }) {
  const tone = STATUS_TONE[status] ?? STATUS_TONE.waiting;
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.16em] ring-1 ${tone.text} ${tone.bg} ${tone.ring} ${className}`}
    >
      <span className={`pulse-dot ${tone.dot}`} style={{ backgroundColor: "currentColor" }} />
      {status}
    </span>
  );
}

export function LiveCount({
  value,
  label = "connected",
  className = "",
}: {
  value: number;
  label?: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-baseline gap-1.5 ${className}`}>
      <span className="tabular text-2xl font-bold text-ink">{value}</span>
      <span className="label">{label}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

export function Panel({
  children,
  className = "",
  glow = false,
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return <div className={`panel ${glow ? "edge-glow" : ""} ${className}`}>{children}</div>;
}

export function SectionTitle({
  icon,
  children,
  right,
}: {
  icon?: ReactNode;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="label flex items-center gap-2">
        {icon}
        {children}
      </h2>
      {right}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-ink-faint">
      {children}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-denied/30 bg-denied/10 px-4 py-3 text-sm text-denied">
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Progress                                                            */
/* ------------------------------------------------------------------ */

export function Meter({
  value,
  max,
  tone = "cyan",
  className = "",
}: {
  value: number;
  max: number;
  tone?: "cyan" | "granted" | "denied" | "warn";
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const bg =
    tone === "granted"
      ? "bg-granted"
      : tone === "denied"
        ? "bg-denied"
        : tone === "warn"
          ? "bg-warn"
          : "bg-cyan-glow";
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-white/8 ${className}`}>
      <div
        className={`h-full rounded-full ${bg} transition-[width] duration-500 ease-out`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
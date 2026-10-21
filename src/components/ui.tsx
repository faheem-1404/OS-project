import type { ReactNode } from "react";

/* ------------------------------------------------------------------ */
/* Ambient background                                                  */
/* ------------------------------------------------------------------ */

export function Ambient() {
  return (
    <div className="campuslock-bg" aria-hidden="true" />
  );
}

/* ------------------------------------------------------------------ */
/* Brand                                                               */
/* ------------------------------------------------------------------ */

export function Logo({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white shadow-sm ring-1 ring-blue-700/20">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
          <path
            d="M7 10V7a5 5 0 0 1 10 0v3M5 10h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="12" cy="15" r="1.5" fill="currentColor" />
        </svg>
      </span>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="text-[1rem] font-bold tracking-tight text-slate-900">CampusLock</span>
          <span className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-blue-600">
            University Access
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
  waiting: { text: "text-slate-600", bg: "bg-slate-100", ring: "ring-slate-200", dot: "bg-slate-400" },
  countdown: { text: "text-amber-800", bg: "bg-amber-50", ring: "ring-amber-200", dot: "bg-amber-500" },
  active: { text: "text-blue-700", bg: "bg-blue-50", ring: "ring-blue-200", dot: "bg-blue-600" },
  revealing: { text: "text-indigo-700", bg: "bg-indigo-50", ring: "ring-indigo-200", dot: "bg-indigo-600" },
  paused: { text: "text-amber-800", bg: "bg-amber-50", ring: "ring-amber-200", dot: "bg-amber-500" },
  finished: { text: "text-emerald-700", bg: "bg-emerald-50", ring: "ring-emerald-200", dot: "bg-emerald-600" },
};

export function StatusPill({ status, className = "" }: { status: string; className?: string }) {
  const tone = STATUS_TONE[status] ?? STATUS_TONE.waiting;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.7rem] font-bold uppercase tracking-[0.12em] ring-1 ${tone.text} ${tone.bg} ${tone.ring} ${className}`}
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
      <span className="tabular text-2xl font-bold text-slate-900">{value}</span>
      <span className="label text-slate-500">{label}</span>
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
  return <div className={`panel ${glow ? "ring-2 ring-blue-500/20" : ""} ${className}`}>{children}</div>;
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
      <h2 className="label flex items-center gap-2 text-slate-600 font-bold">
        {icon}
        {children}
      </h2>
      {right}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
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
      ? "bg-emerald-600"
      : tone === "denied"
        ? "bg-red-600"
        : tone === "warn"
          ? "bg-amber-500"
          : "bg-blue-600";
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-slate-100 ${className}`}>
      <div
        className={`h-full rounded-full ${bg} transition-[width] duration-500 ease-out`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
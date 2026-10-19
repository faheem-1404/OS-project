import Link from "next/link";
import {
  ArrowRight,
  Fingerprint,
  Gauge,
  KeyRound,
  MonitorSmartphone,
  ShieldCheck,
  ShieldX,
  Users,
} from "lucide-react";

import { Ambient, Logo, Panel } from "@/components/ui";
import { store } from "@/lib/server/store";

const PILLARS = [
  {
    icon: Fingerprint,
    title: "Authentication ≠ Authorization",
    body: "Every round separates proving who you are from deciding what you may do — the distinction most people collapse.",
  },
  {
    icon: KeyRound,
    title: "Least privilege",
    body: "Access is scoped to a room, a course, a time window. The simulation makes over-broad grants visibly wrong.",
  },
  {
    icon: ShieldX,
    title: "Revocation & sharing",
    body: "Stale identities and borrowed cards are denied. Access governance is a lifecycle, not a one-time check.",
  },
];

const FLOW = [
  { step: "01", title: "Host creates a room", body: "A six-character code and a QR code are generated instantly." },
  { step: "02", title: "60 students scan and join", body: "Anonymous, nickname-only, one tap on a phone. No accounts, no installs." },
  { step: "03", title: "Scenario drops, votes fly in", body: "APPROVE or DENY within a fixed window. Tally animates live on the projector." },
  { step: "04", title: "Reveal, explain, rank", body: "The answer, the principle and the leaderboard update together for everyone." },
];

export default async function LandingPage() {
  const transport = store().transport;

  return (
    <>
      <Ambient />
      <main className="relative z-10 mx-auto max-w-6xl px-5 pb-24 pt-6 sm:px-8">
        <header className="flex items-center justify-between py-4">
          <Logo />
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full bg-white/5 px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-ink-faint ring-1 ring-white/10 sm:inline-flex">
              {transport === "supabase" ? "Supabase connected" : "Local engine"}
            </span>
            <Link
              href="/host"
              className="rounded-lg bg-cyan-glow/12 px-4 py-2 text-sm font-semibold text-cyan-glow ring-1 ring-cyan-glow/30 transition hover:bg-cyan-glow/20"
            >
              Host console
            </Link>
          </div>
        </header>

        {/* Hero */}
        <section className="pt-16 text-center sm:pt-24">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-cyan-glow/8 px-4 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-cyan-glow ring-1 ring-cyan-glow/25">
            <span className="pulse-dot bg-cyan-glow" />
            Smart University Access Management
          </div>

          <h1 className="mx-auto mt-7 max-w-4xl text-balance text-4xl font-black leading-[1.03] tracking-tight sm:text-6xl lg:text-7xl">
            Approve or deny.
            <span className="mt-2 block bg-gradient-to-r from-cyan-glow via-granted to-cyan-glow bg-clip-text text-transparent">
              Access is earned, not assumed.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-balance text-base leading-relaxed text-ink-dim sm:text-lg">
            CampusLock turns access governance into a live security operations exercise.
            Five real-world scenarios, sixty players on their own phones, one projector —
            everyone decides, the system decides who was right.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/host"
              className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-glow px-7 py-3.5 font-bold text-void transition hover:brightness-110 sm:w-auto"
            >
              Start a session
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/join"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white/5 px-7 py-3.5 font-semibold text-ink ring-1 ring-white/12 transition hover:bg-white/10 sm:w-auto"
            >
              I have a room code
            </Link>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-7 gap-y-2 text-xs text-ink-faint">
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> 60+ concurrent players
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Gauge className="h-3.5 w-3.5" /> server-synchronised timers
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MonitorSmartphone className="h-3.5 w-3.5" /> projector-first display
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" /> anonymous participation
            </span>
          </div>
        </section>

        {/* Pillars */}
        <section className="mt-24 grid gap-4 md:grid-cols-3">
          {PILLARS.map((p) => (
            <Panel key={p.title} className="p-6">
              <p.icon className="h-6 w-6 text-cyan-glow" />
              <h2 className="mt-4 text-lg font-bold tracking-tight">{p.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-dim">{p.body}</p>
            </Panel>
          ))}
        </section>

        {/* Flow */}
        <section className="mt-24">
          <p className="label">How a session runs</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Four moves, ninety seconds.
          </h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FLOW.map((f) => (
              <li key={f.step} className="panel relative overflow-hidden p-5">
                <span className="mono text-xs font-bold text-cyan-glow/60">{f.step}</span>
                <h3 className="mt-2 font-bold tracking-tight">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-dim">{f.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Scenarios */}
        <section className="mt-24">
          <p className="label">The five rounds</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Every answer is a real governance mistake.
          </h2>
          <div className="mt-8 overflow-hidden rounded-2xl ring-1 ring-white/8">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/[0.03]">
                <tr>
                  {["Round", "Scenario", "Resource", "Correct"].map((h) => (
                    <th key={h} className="label px-4 py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {[
                  ["01", "Valid ID, wrong person", "Server Room", "DENY"],
                  ["02", "Time-boxed examiner pass", "Examination Hall B", "APPROVE"],
                  ["03", "Graduated, still active", "Library after hours", "DENY"],
                  ["04", "Professor edits own grades", "Gradebook", "APPROVE"],
                  ["05", "Borrowed ID card", "Genomics Lab", "DENY"],
                ].map(([n, title, res, ans]) => (
                  <tr key={n} className="transition-colors hover:bg-white/[0.02]">
                    <td className="mono px-4 py-3.5 text-ink-faint">{n}</td>
                    <td className="px-4 py-3.5 font-semibold">{title}</td>
                    <td className="px-4 py-3.5 text-ink-dim">{res}</td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-bold tracking-wider ${
                          ans === "DENY"
                            ? "bg-denied/12 text-denied ring-1 ring-denied/25"
                            : "bg-granted/12 text-granted ring-1 ring-granted/25"
                        }`}
                      >
                        {ans}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="mt-24 flex flex-col items-center justify-between gap-4 border-t border-white/6 pt-8 text-xs text-ink-faint sm:flex-row">
          <Logo />
          <p>
            Server-authoritative scoring · one vote per player per round · nicknames only, no
            personal data collected.
          </p>
        </footer>
      </main>
    </>
  );
}
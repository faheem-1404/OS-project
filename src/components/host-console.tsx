"use client";

import { motion } from "framer-motion";
import {
  CircleStop,
  Copy,
  ExternalLink,
  Eye,
  FastForward,
  Loader2,
  Lock,
  MonitorUp,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  SkipForward,
  Square,
  Trophy,
  Unlock,
  Users,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";

import { hostCommandAction } from "@/app/actions";
import { usePrefs, useSfx } from "@/components/prefs";
import {
  ConnectionBadge,
  Leaderboard,
  ResponseRate,
  RevealPanel,
  RoundTrack,
  ScenarioCard,
  VoteBars,
} from "@/components/game";
import { ErrorNote, Logo, Panel, SectionTitle, StatusPill } from "@/components/ui";
import { useRoom, useServerTimer } from "@/lib/client/useRoom";
import type { RoomSnapshot } from "@/lib/types";

interface Props {
  initial: RoomSnapshot;
  joinUrl: string;
  qr: React.ReactNode;
  screenUrl: string;
  playUrl: string;
}

export function HostConsole({ initial, joinUrl, qr, screenUrl, playUrl }: Props) {
  const { snapshot, connection } = useRoom(initial.code, initial);
  const sfx = useSfx();
  const { reducedMotion, sound, setSound, setReducedMotion } = usePrefs();
  const { msLeft } = useServerTimer(snapshot, 0);

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState<string | null>(null);

  const code = initial.code;

  // The passphrase is shown once, from this browser only.
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(`cl_pass:${code}`);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- the passphrase is read from session storage once, on mount.
      if (stored) setPassphrase(stored);
    } catch {
      /* storage unavailable */
    }
  }, [code]);

  const status = snapshot?.status ?? "waiting";
  const round = snapshot?.round ?? null;
  const revealed = round?.status === "revealed";

  // Suspense + result sounds, driven purely by server state transitions.
  const prevRevealed = useMemo(() => revealed, [revealed]);
  useEffect(() => {
    if (prevRevealed && revealed) {
      sfx("reveal");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prevRevealed]);

  function run(command: Parameters<typeof hostCommandAction>[1]) {
    setError(null);
    startTransition(async () => {
      const res = await hostCommandAction(code, command);
      if (!res.ok) setError(res.error ?? "Command failed.");
    });
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      setError("Clipboard unavailable — select the text manually.");
    }
  }

  const connected = snapshot?.players.filter((p) => p.isConnected).length ?? 0;
  const total = snapshot?.players.length ?? 0;

  return (
    <main className="relative z-10 mx-auto max-w-[1600px] px-4 pb-16 pt-5 sm:px-6">
      {/* Top bar */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="hidden h-6 w-px bg-white/10 sm:block" />
          <div className="flex items-center gap-2">
            <span className="label">Room</span>
            <button
              onClick={() => copy(code, "code")}
              className="mono rounded-lg bg-white/5 px-3 py-1.5 text-lg font-black tracking-[0.28em] text-cyan-glow ring-1 ring-cyan-glow/25 transition hover:bg-cyan-glow/10"
              title="Copy room code"
            >
              {code}
            </button>
            {copied === "code" && <span className="text-xs font-semibold text-granted">copied</span>}
          </div>
          <StatusPill status={status} />
        </div>

        <div className="flex items-center gap-2">
          <ConnectionBadge state={connection} />
          <Toggle
            on={sound}
            onClick={() => setSound(!sound)}
            icon={sound ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            label="Sound"
          />
          <Toggle
            on={reducedMotion}
            onClick={() => setReducedMotion(!reducedMotion)}
            icon={<Zap className="h-3.5 w-3.5" />}
            label="Motion"
          />
          <a
            href={screenUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet/12 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-violet ring-1 ring-violet/30 transition hover:bg-violet/20"
          >
            <MonitorUp className="h-3.5 w-3.5" />
            Projector
          </a>
        </div>
      </header>

      {error && (
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      {passphrase && !revealed && status !== "finished" && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-warn/10 px-4 py-3 ring-1 ring-warn/30">
          <p className="flex items-center gap-2 text-sm text-warn">
            <Lock className="h-4 w-4" />
            Host passphrase — save it now. It is not shown again.
          </p>
          <div className="flex items-center gap-3">
            <code className="mono rounded bg-black/30 px-3 py-1.5 font-bold tracking-[0.2em] text-warn">
              {passphrase}
            </code>
            <button
              onClick={() => copy(passphrase, "pp")}
              className="text-xs font-bold uppercase tracking-wider text-warn/80 hover:text-warn"
            >
              {copied === "pp" ? "copied" : "copy"}
            </button>
            <button
              onClick={() => {
                try {
                  sessionStorage.removeItem(`cl_pass:${code}`);
                } catch {
                  /* noop */
                }
                setPassphrase(null);
              }}
              className="text-xs font-bold uppercase tracking-wider text-ink-faint hover:text-ink-dim"
            >
              hide
            </button>
          </div>
        </div>
      )}

      {snapshot && (
        <div className="mt-4">
          <RoundTrack current={snapshot.currentRound || 0} total={snapshot.totalRounds} />
        </div>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)_340px]">
        {/* ---------------- LEFT: join + controls ---------------- */}
        <div className="space-y-4">
          <Panel className="p-5">
            <SectionTitle icon={<Users className="h-3.5 w-3.5" />}>Join this room</SectionTitle>

            <div className="rounded-xl bg-black/25 px-4 py-3 ring-1 ring-cyan-glow/20">
              <p className="label">Room code</p>
              <button
                onClick={() => copy(code, "code")}
                title="Copy room code"
                className="mono mt-1 block text-[2.4rem] leading-none font-black tracking-[0.24em] text-cyan-glow"
              >
                {code}
              </button>
            </div>

            <div className="mt-4 flex items-start gap-4">
              <div className="shrink-0">{qr}</div>
              <div className="min-w-0 flex-1 space-y-3">
                <p className="text-xs leading-relaxed text-ink-faint">
                  Point a phone camera here. Students land straight on the join screen with the room
                  code already filled in.
                </p>
                <button
                  onClick={() => copy(joinUrl, "url")}
                  title={joinUrl}
                  className="flex w-full items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-2 text-left text-[0.7rem] text-ink-dim ring-1 ring-white/10 transition hover:bg-white/10"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {joinUrl.replace(/^https?:\/\//, "")}
                  </span>
                  {copied === "url" ? (
                    <span className="shrink-0 text-[0.6rem] font-bold uppercase tracking-wider text-granted">
                      copied
                    </span>
                  ) : (
                    <Copy className="h-3 w-3 shrink-0 opacity-70" />
                  )}
                </button>
              </div>
            </div>
          </Panel>

          <Panel className="p-5">
            <SectionTitle>Controls</SectionTitle>
            <div className="space-y-2">
              {status === "waiting" && (
                <Control
                  primary
                  icon={<Play className="h-4 w-4" />}
                  label="Start round 1"
                  hint={total === 0 ? "No players yet — starting anyway" : `${total} players ready`}
                  disabled={pending}
                  onClick={() => run("start")}
                />
              )}

              {status === "countdown" && (
                <Control
                  primary
                  icon={<Unlock className="h-4 w-4" />}
                  label="Opening in a moment…"
                  hint="players are pre-reading"
                  disabled
                />
              )}

              {(status === "active" || status === "countdown") && round?.status === "open" && (
                <>
                  {status === "active" ? (
                    <Control
                      icon={<Pause className="h-4 w-4" />}
                      label="Pause voting"
                      disabled={pending}
                      onClick={() => run("pause")}
                    />
                  ) : null}
                  <Control
                    icon={<Square className="h-4 w-4" />}
                    label="Close voting now"
                    hint="Use if the class has answered"
                    disabled={pending}
                    onClick={() => run("close")}
                  />
                  <Control
                    icon={<RotateCcw className="h-4 w-4" />}
                    label="Restart round"
                    hint="Only while no votes are in"
                    disabled={pending || (round?.tally.total ?? 0) > 0}
                    onClick={() => run("restart")}
                  />
                </>
              )}

              {status === "paused" && (
                <Control
                  primary
                  icon={<Play className="h-4 w-4" />}
                  label="Resume voting"
                  disabled={pending}
                  onClick={() => run("resume")}
                />
              )}

              {(status === "active" || status === "paused") && !revealed && (
                <Control
                  primary
                  icon={<Eye className="h-4 w-4" />}
                  label="Reveal answer"
                  hint="Scores are awarded now"
                  disabled={pending}
                  onClick={() => run("reveal")}
                />
              )}

              {status === "revealing" && revealed && (
                <Control
                  primary
                  icon={
                    snapshot && snapshot.currentRound >= snapshot.totalRounds ? (
                      <Trophy className="h-4 w-4" />
                    ) : (
                      <FastForward className="h-4 w-4" />
                    )
                  }
                  label={
                    snapshot && snapshot.currentRound >= snapshot.totalRounds
                      ? "Finish & show podium"
                      : `Next round (${(snapshot?.currentRound ?? 0) + 1})`
                  }
                  disabled={pending}
                  onClick={() => run("next")}
                />
              )}

              {status !== "finished" && status !== "waiting" && (
                <Control
                  icon={<SkipForward className="h-4 w-4" />}
                  label="Skip this scenario"
                  hint="No points awarded"
                  disabled={pending || status === "revealing"}
                  onClick={() => run("skip")}
                />
              )}

              {status !== "finished" && (
                <Control
                  danger
                  icon={<CircleStop className="h-4 w-4" />}
                  label="End session"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm("End this session for everyone?")) run("end");
                  }}
                />
              )}

              {status === "finished" && (
                <Link
                  href={`/results/${code}`}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-granted/12 px-4 py-3 font-bold text-granted ring-1 ring-granted/30 transition hover:bg-granted/20"
                >
                  <Trophy className="h-4 w-4" />
                  Open final results
                </Link>
              )}
            </div>

            {pending && (
              <p className="mt-3 flex items-center gap-2 text-xs text-ink-faint">
                <Loader2 className="h-3 w animate-spin" /> syncing with server…
              </p>
            )}
          </Panel>
          <Panel className="p-5">
            <SectionTitle>Players</SectionTitle>
            <div className="flex items-end justify-between">
              <div>
                <span className="tabular text-5xl font-black leading-none text-ink">{connected}</span>
                <span className="ml-2 text-sm font-medium text-ink-faint">online</span>
              </div>
              <div className="text-right">
                <span className="tabular text-xl font-bold text-ink-dim">{total}</span>
                <p className="label">joined</p>
              </div>
            </div>

            <div className="mt-4 max-h-44 space-y-1 overflow-y-auto pr-1">
              {snapshot?.players.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-faint">
                  Nobody yet. Project the QR code and students can join from the door.
                </p>
              ) : (
                snapshot?.players.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm"
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        p.isConnected ? "bg-granted" : "bg-denied"
                      }`}
                    />
                    <span className="min-w-0 flex-1 truncate text-ink-dim">{p.nickname}</span>
                    {p.isBot && (
                      <span className="rounded bg-violet/15 px-1.5 text-[0.55rem] font-bold uppercase tracking-wider text-violet">
                        demo
                      </span>
                    )}
                    <span className="tabular text-xs font-bold text-ink-faint">{p.score}</span>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4">
              <ResponseRate voted={round?.tally.total ?? 0} total={Math.max(1, total)} />
            </div>
          </Panel>

        </div>

        {/* ---------------- CENTRE: scenario + reveal ---------------- */}
        <div className="space-y-4">
          <Panel className="p-6 sm:p-7" glow={status === "active"}>
            {snapshot?.scenario ? (
              <ScenarioCard snapshot={snapshot} />
            ) : (
              <div className="py-10 text-center">
                <p className="text-lg font-semibold text-ink-dim">
                  Waiting for the host to start the first scenario.
                </p>
                <p className="mt-1 text-sm text-ink-faint">
                  The audience screen is showing the lobby right now.
                </p>
              </div>
            )}
          </Panel>

          <Panel className="p-6 sm:p-7">
            {revealed && round?.reveal ? (
              <RevealPanel reveal={round.reveal} />
            ) : round?.status === "closed" ? (
              <Suspense
                votes={round?.tally.total ?? 0}
                players={total}
                onReveal={() => run("reveal")}
                pending={pending}
              />
            ) : (
              <div className="flex items-center gap-3 py-6 text-sm text-ink-faint">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Waiting for votes…
              </div>
            )}
          </Panel>
        </div>

        {/* ---------------- RIGHT: tallies + leaderboard ---------------- */}
        <div className="space-y-4">
          <Panel className="p-5">
            <SectionTitle>Live distribution</SectionTitle>
            {snapshot ? (
              <VoteBars snapshot={snapshot} />
            ) : (
              <p className="text-sm text-ink-faint">—</p>
            )}
            {msLeft !== null && round?.status === "open" && status !== "paused" && (
              <p className="mt-4 border-t border-white/6 pt-3 text-center text-xs text-ink-faint">
                <span className="tabular font-bold text-warn">{Math.ceil(msLeft / 1000)}s</span>{" "}
                remaining on the server clock
              </p>
            )}
            {status === "paused" && (
              <p className="mt-4 border-t border-white/6 pt-3 text-center text-xs font-bold uppercase tracking-widest text-warn">
                Paused
              </p>
            )}
          </Panel>

          <Panel className="p-5">
            <SectionTitle icon={<Trophy className="h-3.5 w-3.5" />}>Leaderboard</SectionTitle>
            <Leaderboard players={snapshot?.leaderboard ?? []} limit={12} />
          </Panel>

          <Panel className="p-5">
            <SectionTitle>Share</SectionTitle>
            <div className="space-y-2">
              <LinkRow href={screenUrl} label="Projector screen" icon={<MonitorUp className="h-3.5 w-3.5" />} />
              <LinkRow href={playUrl} label="Player view" icon={<Users className="h-3.5 w-3.5" />} />
              <LinkRow
                href={`/results/${code}`}
                label="Final results"
                icon={<Trophy className="h-3.5 w-3.5" />}
              />
            </div>
          </Panel>
        </div>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */

function Toggle({
  on,
  onClick,
  icon,
  label,
}: {
  on: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      title={`${label}: ${on ? "on" : "off"}`}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[0.65rem] font-bold uppercase tracking-[0.14em] ring-1 transition ${
        on
          ? "bg-cyan-glow/12 text-cyan-glow ring-cyan-glow/30"
          : "bg-white/5 text-ink-faint ring-white/10 hover:text-ink-dim"
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function Control({
  label,
  icon,
  onClick,
  disabled,
  hint,
  primary = false,
  danger = false,
}: {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  hint?: string;
  primary?: boolean;
  danger?: boolean;
}) {
  const tone = danger
    ? "text-denied ring-denied/25 hover:bg-denied/12"
    : primary
      ? "bg-cyan-glow text-void ring-transparent hover:brightness-110 font-bold"
      : "bg-white/5 text-ink ring-white/10 hover:bg-white/10";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm ring-1 transition disabled:cursor-not-allowed disabled:opacity-40 ${tone}`}
    >
      <span className="flex items-center gap-2 font-semibold">
        {icon}
        {label}
      </span>
      {hint && <span className="text-[0.65rem] font-medium opacity-60">{hint}</span>}
    </button>
  );
}

function Suspense({
  votes,
  players,
  onReveal,
  pending,
}: {
  votes: number;
  players: number;
  onReveal: () => void;
  pending: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center py-6 text-center"
    >
      <div className="relative grid h-20 w-20 place-items-center">
        <span className="absolute inset-0 rounded-full border-2 border-violet/30" />
        <motion.span
          className="absolute inset-0 rounded-full border-2 border-violet"
          animate={{ scale: [1, 1.18], opacity: [0.7, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
        />
        <Lock className="h-8 w-8 text-violet" />
      </div>
      <p className="mt-5 text-lg font-bold">Voting is closed</p>
      <p className="mt-1 text-sm text-ink-dim">
        <span className="tabular font-bold text-ink">{votes}</span> of {players} players have
        answered. Reveal when the room is ready.
      </p>
      <button
        onClick={onReveal}
        disabled={pending}
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-violet/12 px-6 py-3 font-bold text-violet ring-1 ring-violet/30 transition hover:bg-violet/20 disabled:opacity-50"
      >
        <Eye className="h-4 w-4" />
        Reveal now
      </button>
    </motion.div>
  );
}

function LinkRow({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2.5 text-sm font-semibold text-ink-dim ring-1 ring-white/10 transition hover:bg-white/10 hover:text-ink"
    >
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
      <ExternalLink className="h-3.5 w-3.5 opacity-60" />
    </a>
  );
}
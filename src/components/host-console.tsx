"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  BadgeAlert,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleStop,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  FastForward,
  IdCard,
  Key,
  Layers,
  Loader2,
  Lock,
  MonitorUp,
  Pause,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SkipForward,
  Sparkles,
  Square,
  Terminal,
  Trophy,
  Unlock,
  UserCheck,
  Users,
  UserX,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";

import {
  approveAllAdmissionsAction,
  hostCommandAction,
  resolveAccessRequestAction,
  resolveAdmissionAction,
  toggleUserRevocationAction,
  updateUserRoleAction,
} from "@/app/actions";
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
import { CAMPUS_RESOURCES, CAMPUS_ROLES, getRole } from "@/lib/rbac-rules";
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

  // Admin view tab: "rbac" (Command Center) vs "scenarios" (Quiz)
  const [adminTab, setAdminTab] = useState<"rbac" | "scenarios">("rbac");
  const [auditFilter, setAuditFilter] = useState<"all" | "denials" | "promotions" | "emergency">("all");

  const code = initial.code;

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(`cl_pass:${code}`);
      if (stored) setPassphrase(stored);
    } catch {
      /* storage unavailable */
    }
  }, [code]);

  const snap = snapshot ?? initial;
  const status = snap.status ?? "waiting";
  const round = snap.round ?? null;
  const revealed = round?.status === "revealed";

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

  async function handleRoleChange(playerId: string, newRole: string) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await updateUserRoleAction(code, playerId, newRole);
        if (res.ok) {
          sfx("lock");
        } else {
          setError(res.error ?? "Failed to update role.");
        }
      } catch {
        setError("Network error updating role.");
      }
    });
  }

  async function handleToggleRevocation(playerId: string) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await toggleUserRevocationAction(code, playerId);
        if (res.ok) {
          sfx("denied");
        } else {
          setError(res.error ?? "Failed to toggle badge status.");
        }
      } catch {
        setError("Network error toggling badge status.");
      }
    });
  }

  async function handleResolveRequest(requestId: string, decision: "approve" | "reject") {
    setError(null);
    startTransition(async () => {
      try {
        const res = await resolveAccessRequestAction(code, requestId, decision);
        if (res.ok) {
          sfx(decision === "approve" ? "granted" : "denied");
        } else {
          setError(res.error ?? "Failed to process emergency request.");
        }
      } catch {
        setError("Network error processing emergency request.");
      }
    });
  }

  async function handleResolveAdmission(playerId: string, decision: "approve" | "reject") {
    setError(null);
    startTransition(async () => {
      try {
        const res = await resolveAdmissionAction(code, playerId, decision);
        if (res.ok) {
          sfx(decision === "approve" ? "granted" : "denied");
        } else {
          setError(res.error ?? "Failed to process admission request.");
        }
      } catch {
        setError("Network error processing admission.");
      }
    });
  }

  async function handleApproveAllAdmissions() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await approveAllAdmissionsAction(code);
        if (res.ok) {
          sfx("granted");
        } else {
          setError(res.error ?? "Failed to admit all.");
        }
      } catch {
        setError("Network error admitting all.");
      }
    });
  }

  const connected = snap.players.filter((p) => p.isConnected).length;
  const total = snap.players.length;

  // Pending student admissions
  const pendingAdmissions = snap.players.filter((p) => p.admissionStatus === "pending");

  // Pending emergency requests
  const pendingRequests = (snap.accessRequests ?? []).filter((r) => r.status === "pending");

  // Filtered audit logs
  const auditLogs = (snap.auditLogs ?? []).filter((log) => {
    if (auditFilter === "denials") return log.outcome === "DENIED";
    if (auditFilter === "promotions") return log.outcome === "PROMOTED" || log.outcome === "DEMOTED";
    if (auditFilter === "emergency")
      return (
        log.action === "EMERGENCY_REQUEST" ||
        log.outcome === "EMERGENCY_APPROVED" ||
        log.outcome === "EMERGENCY_REJECTED"
      );
    return true;
  });

  return (
    <main className="relative z-10 mx-auto max-w-[1700px] px-4 pb-16 pt-5 sm:px-6">
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
          {/* Main Host Navigation Switcher */}
          <div className="flex items-center rounded-xl bg-white/[0.04] p-1 ring-1 ring-white/10">
            <button
              onClick={() => setAdminTab("rbac")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
                adminTab === "rbac"
                  ? "bg-cyan-glow/20 text-cyan-glow shadow-sm ring-1 ring-cyan-glow/40"
                  : "text-ink-faint hover:text-white"
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Campus & Door Control
              {pendingAdmissions.length > 0 && (
                <span className="ml-1 rounded-full bg-cyan-glow px-2 py-0.5 text-[0.65rem] font-bold text-black animate-pulse">
                  {pendingAdmissions.length} new
                </span>
              )}
              {pendingRequests.length > 0 && (
                <span className="ml-1 rounded-full bg-amber-500 px-1.5 py-0.2 text-[0.65rem] font-black text-black animate-pulse">
                  {pendingRequests.length} key req
                </span>
              )}
            </button>
            <button
              onClick={() => setAdminTab("scenarios")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
                adminTab === "scenarios"
                  ? "bg-cyan-glow/20 text-cyan-glow shadow-sm ring-1 ring-cyan-glow/40"
                  : "text-ink-faint hover:text-white"
              }`}
            >
              <Radio className="h-3.5 w-3.5" />
              Quiz Scenarios
            </button>
          </div>

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

      {/* Pending Student Admissions Banner */}
      {pendingAdmissions.length > 0 && (
        <div className="mt-4 rounded-2xl border border-cyan-glow/30 bg-cyan-glow/[0.08] p-5 shadow-lg backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-glow/20 text-cyan-glow">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">
                  {pendingAdmissions.length} Student{pendingAdmissions.length > 1 ? "s" : ""} Waiting for Admission
                </h2>
                <p className="text-xs text-ink-dim">
                  These participants scanned the QR code and are requesting entry to the session.
                </p>
              </div>
            </div>
            <button
              onClick={handleApproveAllAdmissions}
              disabled={pending}
              className="flex items-center gap-2 rounded-xl bg-granted px-4 py-2 text-xs font-bold text-black shadow-md transition hover:brightness-110 active:scale-95"
            >
              <Check className="h-4 w-4" />
              Admit All ({pendingAdmissions.length})
            </button>
          </div>

          <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {pendingAdmissions.map((player) => {
              const pRole = getRole(player.roleId ?? "undergrad");
              return (
                <div
                  key={player.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/40 p-3"
                >
                  <div>
                    <p className="font-bold text-white text-sm">{player.nickname}</p>
                    <p className="text-xs text-ink-dim">
                      Role: <span className="text-cyan-glow font-medium">{pRole.name}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleResolveAdmission(player.id, "reject")}
                      disabled={pending}
                      className="rounded-lg bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-ink-dim hover:bg-denied/20 hover:text-denied transition"
                      title="Decline entry"
                    >
                      Decline
                    </button>
                    <button
                      onClick={() => handleResolveAdmission(player.id, "approve")}
                      disabled={pending}
                      className="rounded-lg bg-granted/20 px-3 py-1.5 text-xs font-bold text-granted ring-1 ring-granted/30 hover:bg-granted/30 transition"
                    >
                      Admit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        {/* ---------------- LEFT: QR + Room Controls ---------------- */}
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
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-xs text-ink-dim leading-relaxed">
                  Have students scan with any phone camera. Each student is automatically assigned one of 10 campus roles.
                </p>
                <div className="flex flex-col gap-1.5 pt-1">
                  <button
                    onClick={() => copy(joinUrl, "join")}
                    className="flex items-center gap-1.5 text-xs font-bold text-cyan-glow hover:underline"
                  >
                    <Copy className="h-3 w-3" />
                    {copied === "join" ? "Copied direct link!" : "Copy mobile join link"}
                  </button>
                </div>
              </div>
            </div>
          </Panel>

          {/* Session Lifecycle Controls */}
          <Panel className="p-5">
            <SectionTitle icon={<Lock className="h-3.5 w-3.5" />}>Governance Session Controls</SectionTitle>
            <div className="space-y-2">
              {status === "waiting" && (
                <Control
                  primary
                  icon={<Play className="h-4 w-4" />}
                  label="Start game / scenarios"
                  hint="opens Round 1"
                  disabled={pending}
                  onClick={() => run("start")}
                />
              )}

              {status === "active" && round?.status === "open" && (
                <>
                  <Control
                    icon={<Pause className="h-4 w-4" />}
                    label="Pause timer"
                    hint="freezes submissions"
                    disabled={pending}
                    onClick={() => run("pause")}
                  />
                  <Control
                    danger
                    icon={<Square className="h-4 w-4" />}
                    label="Close voting early"
                    hint="proceed to reveal"
                    disabled={pending}
                    onClick={() => run("close")}
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

              {round?.status === "closed" && !revealed && (
                <Control
                  primary
                  icon={<Eye className="h-4 w-4" />}
                  label="Reveal answer & principles"
                  disabled={pending}
                  onClick={() => run("reveal")}
                />
              )}

              {revealed && status !== "finished" && (
                <Control
                  primary
                  icon={<FastForward className="h-4 w-4" />}
                  label={
                    snap.currentRound >= snap.totalRounds ? "Complete session" : "Next scenario"
                  }
                  disabled={pending}
                  onClick={() => run("next")}
                />
              )}

              {status !== "waiting" && status !== "finished" && (
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
            </div>

            {pending && (
              <p className="mt-3 flex items-center gap-2 text-xs text-ink-faint">
                <Loader2 className="h-3 w-3 animate-spin" /> syncing with server…
              </p>
            )}
          </Panel>

          {/* Quick links */}
          <Panel className="p-5">
            <SectionTitle>Display links</SectionTitle>
            <div className="space-y-2">
              <LinkRow href={screenUrl} label="Projector screen" icon={<MonitorUp className="h-3.5 w-3.5" />} />
              <LinkRow href={playUrl} label="Student mobile view" icon={<Users className="h-3.5 w-3.5" />} />
              <LinkRow href={`/results/${code}`} label="Final scores & audit" icon={<Trophy className="h-3.5 w-3.5" />} />
            </div>
          </Panel>
        </div>

        {/* ---------------- RIGHT: TABBED VIEW ---------------- */}
        <div className="space-y-4">
          {/* TAB 1: RBAC COMMAND CENTER */}
          {adminTab === "rbac" && (
            <>
              {/* Emergency Access Requests Queue */}
              <Panel className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="grid h-8 w-8 place-items-center rounded-lg bg-amber-500/20 text-amber-400">
                      <ShieldAlert className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-white">Door Key Requests</h2>
                      <p className="text-xs text-ink-dim">
                        Students requesting one-time passes to restricted campus rooms
                      </p>
                    </div>
                  </div>
                  {pendingRequests.length > 0 && (
                    <span className="flex items-center gap-1.5 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-black text-amber-400 ring-1 ring-amber-500/40 animate-pulse">
                      <span className="h-2 w-2 rounded-full bg-amber-400" />
                      {pendingRequests.length} PENDING
                    </span>
                  )}
                </div>

                <div className="mt-4">
                  {pendingRequests.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-xs text-ink-faint">
                      No pending door requests. When students tap locked doors on their phone and ask for a key, they will appear here.
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {pendingRequests.map((req) => (
                        <div
                          key={req.id}
                          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] p-4 transition"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-sm">{req.playerNickname}</span>
                              <span className="rounded bg-white/10 px-2 py-0.5 text-[0.65rem] font-bold text-ink-dim">
                                {req.playerRole}
                              </span>
                              <span className="text-xs text-ink-faint">wants entry to</span>
                              <span className="rounded bg-cyan-glow/15 px-2 py-0.5 text-xs font-bold text-cyan-glow">
                                {req.resourceName}
                              </span>
                            </div>
                            <p className="mt-1.5 text-xs text-amber-200">
                              <span className="font-bold text-amber-400">Reason:</span> &ldquo;{req.reason}&rdquo;
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleResolveRequest(req.id, "reject")}
                              disabled={pending}
                              className="flex items-center gap-1 rounded-xl bg-white/5 px-3 py-1.5 text-xs font-bold text-ink-dim ring-1 ring-white/10 hover:bg-denied/20 hover:text-denied transition"
                            >
                              <X className="h-3.5 w-3.5" /> Decline
                            </button>
                            <button
                              onClick={() => handleResolveRequest(req.id, "approve")}
                              disabled={pending}
                              className="flex items-center gap-1.5 rounded-xl bg-granted/20 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-granted ring-1 ring-granted/40 hover:bg-granted/30 active:scale-95 transition"
                            >
                              <Check className="h-3.5 w-3.5" /> Approve 60s Key
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Panel>

              {/* Campus Roster & Role Control */}
              <Panel className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="grid h-8 w-8 place-items-center rounded-lg bg-cyan-glow/20 text-cyan-glow">
                      <IdCard className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-white">Students & Campus Roles</h2>
                      <p className="text-xs text-ink-dim">
                        {connected} online of {total} admitted. Change roles or suspend badges in real time.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-[0.68rem] uppercase tracking-wider text-ink-faint">
                        <th className="pb-3 font-bold">Student</th>
                        <th className="pb-3 font-bold">Assigned Role</th>
                        <th className="pb-3 font-bold">Clearance</th>
                        <th className="pb-3 font-bold">Badge Status</th>
                        <th className="pb-3 font-bold">Change Role</th>
                        <th className="pb-3 font-bold text-right">Access Control</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {snap.players.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-ink-faint">
                            No students connected yet. Have students scan the QR code to join.
                          </td>
                        </tr>
                      ) : (
                        snap.players.map((player) => {
                          const playerRole = getRole(player.roleId ?? "undergrad");
                          const isRevoked = player.badgeStatus === "revoked";
                          const isPendingAdmission = player.admissionStatus === "pending";
                          const grants = (player.temporaryGrants ?? []).filter((g) => g.expiresAt > Date.now());

                          return (
                            <tr
                              key={player.id}
                              className={`transition ${
                                isRevoked ? "bg-denied/[0.05]" : "hover:bg-white/[0.02]"
                              }`}
                            >
                              {/* Student name */}
                              <td className="py-3">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`h-2 w-2 rounded-full ${
                                      isPendingAdmission
                                        ? "bg-amber-400"
                                        : player.isConnected
                                        ? "bg-granted"
                                        : "bg-ink-faint"
                                    }`}
                                  />
                                  <span className="font-bold text-white text-sm">{player.nickname}</span>
                                  {player.isBot && (
                                    <span className="rounded bg-violet/20 px-1.5 py-0.5 text-[0.55rem] font-bold uppercase text-violet">
                                      demo bot
                                    </span>
                                  )}
                                  {isPendingAdmission && (
                                    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[0.6rem] font-bold text-amber-300">
                                      waiting
                                    </span>
                                  )}
                                </div>
                                {grants.length > 0 && (
                                  <span className="mt-1 inline-flex items-center gap-1 text-[0.65rem] font-bold text-amber-400">
                                    <Zap className="h-3 w-3" /> 1-Time Key Active
                                  </span>
                                )}
                              </td>

                              {/* Role */}
                              <td className="py-3 font-medium text-ink-dim">
                                {playerRole.name}
                              </td>

                              {/* Clearance level */}
                              <td className="py-3">
                                <span className="rounded bg-white/10 px-2 py-0.5 text-[0.7rem] font-bold text-cyan-glow">
                                  Level {playerRole.level}
                                </span>
                              </td>

                              {/* Badge status */}
                              <td className="py-3">
                                {isRevoked ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-denied/20 px-2 py-0.5 text-[0.65rem] font-black uppercase tracking-wider text-denied ring-1 ring-denied/40">
                                    <ShieldAlert className="h-3 w-3" /> Suspended
                                  </span>
                                ) : isPendingAdmission ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 px-2 py-0.5 text-[0.65rem] font-black uppercase tracking-wider text-amber-300 ring-1 ring-amber-500/40">
                                    Pending
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded bg-granted/20 px-2 py-0.5 text-[0.65rem] font-black uppercase tracking-wider text-granted ring-1 ring-granted/40">
                                    <ShieldCheck className="h-3 w-3" /> Active
                                  </span>
                                )}
                              </td>

                              {/* Role switcher dropdown */}
                              <td className="py-3">
                                <select
                                  value={player.roleId ?? "undergrad"}
                                  disabled={pending}
                                  onChange={(e) => handleRoleChange(player.id, e.target.value)}
                                  className="rounded-lg bg-black/60 px-2.5 py-1.5 text-xs text-white ring-1 ring-white/15 focus:outline-none focus:ring-2 focus:ring-cyan-glow"
                                >
                                  {CAMPUS_ROLES.map((r) => (
                                    <option key={r.id} value={r.id} className="bg-neutral-900 text-white">
                                      {r.name} (L{r.level})
                                    </option>
                                  ))}
                                </select>
                              </td>

                              {/* Revoke / Restore button */}
                              <td className="py-3 text-right">
                                {isPendingAdmission ? (
                                  <button
                                    onClick={() => handleResolveAdmission(player.id, "approve")}
                                    disabled={pending}
                                    className="rounded-lg bg-granted/20 px-3 py-1.5 text-xs font-bold text-granted ring-1 ring-granted/40 hover:bg-granted/30 transition"
                                  >
                                    Admit Student
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleToggleRevocation(player.id)}
                                    disabled={pending}
                                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition active:scale-95 ${
                                      isRevoked
                                        ? "bg-granted/20 text-granted ring-1 ring-granted/40 hover:bg-granted/30"
                                        : "bg-denied/20 text-denied ring-1 ring-denied/40 hover:bg-denied/30"
                                    }`}
                                  >
                                    {isRevoked ? "Restore Badge" : "Suspend Badge"}
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </Panel>

              {/* Live Door Swipe Activity Feed */}
              <Panel className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-cyan-glow">
                      <Terminal className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-white">Live Door Swipe Activity</h2>
                      <p className="text-xs text-ink-dim">
                        Real-time feed of participants testing doors on their mobile phones
                      </p>
                    </div>
                  </div>

                  {/* Filter buttons */}
                  <div className="flex items-center gap-1.5 rounded-lg bg-black/40 p-1 ring-1 ring-white/10 text-[0.65rem] font-bold uppercase">
                    {(["all", "denials", "promotions", "emergency"] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setAuditFilter(f)}
                        className={`rounded px-2.5 py-1 transition ${
                          auditFilter === f ? "bg-cyan-glow/20 text-cyan-glow" : "text-ink-faint hover:text-white"
                        }`}
                      >
                        {f === "all" ? "All Activity" : f === "denials" ? "Denied Only" : f === "promotions" ? "Roles" : "Key Requests"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 max-h-72 overflow-y-auto rounded-xl bg-black/40 p-3 text-xs leading-relaxed ring-1 ring-white/10">
                  {auditLogs.length === 0 ? (
                    <p className="text-center text-ink-faint py-4">No events yet. As students swipe doors or request keys, activity shows here.</p>
                  ) : (
                    <div className="space-y-2">
                      {auditLogs.map((log) => {
                        const time = new Date(log.timestamp).toLocaleTimeString();
                        let badgeBg = "bg-granted/20 text-granted ring-1 ring-granted/30";
                        if (log.outcome === "DENIED" || log.outcome === "REVOKED" || log.outcome === "EMERGENCY_REJECTED") {
                          badgeBg = "bg-denied/20 text-denied ring-1 ring-denied/30";
                        } else if (log.outcome === "PROMOTED" || log.outcome === "DEMOTED") {
                          badgeBg = "bg-violet/20 text-violet ring-1 ring-violet/30";
                        } else if (log.outcome === "EMERGENCY_APPROVED" || log.outcome === "ADMISSION_REQUESTED") {
                          badgeBg = "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30";
                        }

                        return (
                          <div key={log.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.02] p-2 hover:bg-white/[0.04] transition">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className={`rounded-md px-2 py-0.5 text-[0.65rem] font-bold shrink-0 ${badgeBg}`}>
                                {log.outcome.replace("_", " ")}
                              </span>
                              <span className="font-semibold text-white shrink-0">{log.actor}</span>
                              <span className="text-ink-dim truncate text-xs">{log.detail}</span>
                            </div>
                            <span className="text-ink-faint text-[0.7rem] shrink-0">{time}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </Panel>
            </>
          )}

          {/* TAB 2: SCENARIOS / QUIZ (Retaining existing quiz mechanics) */}
          {adminTab === "scenarios" && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-4">
                <RoundTrack current={snap.currentRound || 0} total={snap.totalRounds} />
                <Panel className="p-6" glow={status === "active"}>
                  {snap.scenario ? (
                    <ScenarioCard snapshot={snap} />
                  ) : (
                    <div className="py-10 text-center">
                      <p className="text-lg font-semibold text-ink-dim">
                        Start the game to display the first scenario.
                      </p>
                    </div>
                  )}
                </Panel>

                <Panel className="p-6">
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
                      Waiting for student votes…
                    </div>
                  )}
                </Panel>
              </div>

              <div className="space-y-4">
                <Panel className="p-5">
                  <SectionTitle>Live distribution</SectionTitle>
                  <VoteBars snapshot={snap} />
                  {msLeft !== null && round?.status === "open" && status !== "paused" && (
                    <p className="mt-4 border-t border-white/6 pt-3 text-center text-xs text-ink-faint">
                      <span className="tabular font-bold text-warn">{Math.ceil(msLeft / 1000)}s</span>{" "}
                      remaining on the clock
                    </p>
                  )}
                </Panel>

                <Panel className="p-5">
                  <SectionTitle icon={<Trophy className="h-3.5 w-3.5" />}>Leaderboard</SectionTitle>
                  <Leaderboard players={snap.leaderboard} limit={10} />
                </Panel>
              </div>
            </div>
          )}
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
      className={`flex w-full items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm ring-1 transition select-none touch-manipulation cursor-pointer active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${tone}`}
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
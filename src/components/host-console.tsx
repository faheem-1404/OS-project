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
      if (!res.ok) {
        setError(res.error ?? "Failed to execute host command.");
      }
    });
  }

  function copy(text: string, label: string) {
    void navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied((c) => (c === label ? null : c)), 2000);
  }

  // RBAC management handlers
  function handleRoleChange(playerId: string, newRoleId: string) {
    setError(null);
    startTransition(async () => {
      const res = await updateUserRoleAction(code, playerId, newRoleId);
      if (!res.ok) {
        setError(res.error ?? "Failed to update role.");
      } else {
        sfx("lock");
      }
    });
  }

  function handleToggleRevocation(playerId: string) {
    setError(null);
    startTransition(async () => {
      const res = await toggleUserRevocationAction(code, playerId);
      if (!res.ok) {
        setError(res.error ?? "Failed to toggle badge status.");
      } else {
        sfx("lock");
      }
    });
  }

  function handleResolveRequest(requestId: string, decision: "approve" | "reject") {
    setError(null);
    startTransition(async () => {
      const res = await resolveAccessRequestAction(code, requestId, decision);
      if (!res.ok) {
        setError(res.error ?? "Failed to resolve door key request.");
      } else {
        sfx(decision === "approve" ? "granted" : "denied");
      }
    });
  }

  function handleResolveAdmission(playerId: string, decision: "approve" | "reject") {
    setError(null);
    startTransition(async () => {
      const res = await resolveAdmissionAction(code, playerId, decision);
      if (!res.ok) {
        setError(res.error ?? "Failed to resolve student admission.");
      } else {
        sfx(decision === "approve" ? "granted" : "denied");
      }
    });
  }

  function handleApproveAllAdmissions() {
    setError(null);
    startTransition(async () => {
      const res = await approveAllAdmissionsAction(code);
      if (!res.ok) {
        setError(res.error ?? "Failed to approve all student admissions.");
      } else {
        sfx("granted");
      }
    });
  }

  const total = snap.players.length;
  const connected = snap.players.filter((p) => p.isConnected).length;
  const pendingRequests = (snap.accessRequests ?? []).filter((r) => r.status === "pending");
  const pendingAdmissions = snap.players.filter((p) => p.admissionStatus === "pending");

  const auditLogs = (snap.auditLogs ?? []).filter((log) => {
    if (auditFilter === "denials") return log.outcome === "DENIED" || log.outcome === "EMERGENCY_REJECTED";
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
      <header className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="hidden h-6 w-px bg-slate-200 sm:block" />
          <div className="flex items-center gap-2">
            <span className="label text-slate-500">Room</span>
            <button
              onClick={() => copy(code, "code")}
              className="font-mono rounded-lg bg-blue-50 px-3 py-1 text-base font-bold tracking-wider text-blue-600 border border-blue-200 transition hover:bg-blue-100"
              title="Copy room code"
            >
              {code}
            </button>
            {copied === "code" && <span className="text-xs font-semibold text-emerald-600">Copied!</span>}
          </div>
          <StatusPill status={status} />
        </div>

        <div className="flex items-center gap-2">
          {/* Main Host Navigation Switcher */}
          <div className="flex items-center rounded-xl bg-slate-100 p-1 border border-slate-200">
            <button
              onClick={() => setAdminTab("rbac")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition shadow-xs ${
                adminTab === "rbac"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Campus & Door Access
              {pendingAdmissions.length > 0 && (
                <span className="ml-1 rounded-full bg-blue-600 px-2 py-0.5 text-[0.65rem] font-bold text-white animate-pulse">
                  {pendingAdmissions.length} waiting
                </span>
              )}
              {pendingRequests.length > 0 && (
                <span className="ml-1 rounded-full bg-amber-500 px-1.5 py-0.2 text-[0.65rem] font-black text-white animate-pulse">
                  {pendingRequests.length} key req
                </span>
              )}
            </button>
            <button
              onClick={() => setAdminTab("scenarios")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition shadow-xs ${
                adminTab === "scenarios"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
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
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 border border-indigo-200 transition hover:bg-indigo-100 shadow-sm"
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
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50 px-5 py-3.5 border border-amber-200 shadow-sm">
          <p className="flex items-center gap-2 text-sm text-amber-900 font-medium">
            <Lock className="h-4 w-4 text-amber-600" />
            Host passphrase — save this to re-open this session from another device:
          </p>
          <div className="flex items-center gap-3">
            <code className="font-mono rounded-lg bg-white px-3 py-1.5 font-bold tracking-wider text-amber-900 border border-amber-300 shadow-xs">
              {passphrase}
            </code>
            <button
              onClick={() => copy(passphrase, "pp")}
              className="text-xs font-bold text-amber-800 hover:underline"
            >
              {copied === "pp" ? "Copied!" : "Copy Passphrase"}
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
              className="text-xs font-semibold text-slate-500 hover:text-slate-700"
            >
              Hide
            </button>
          </div>
        </div>
      )}

      {/* Pending Student Admissions Banner */}
      {pendingAdmissions.length > 0 && (
        <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/70 p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {pendingAdmissions.length} Student{pendingAdmissions.length > 1 ? "s" : ""} Waiting for Admission
                </h2>
                <p className="text-xs text-slate-600">
                  These participants scanned the QR code and are waiting for your approval to enter the room.
                </p>
              </div>
            </div>
            <button
              onClick={handleApproveAllAdmissions}
              disabled={pending}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 active:scale-95"
            >
              <Check className="h-4 w-4" />
              Admit All Students ({pendingAdmissions.length})
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pendingAdmissions.map((player) => {
              const pRole = getRole(player.roleId ?? "undergrad");
              return (
                <div
                  key={player.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs"
                >
                  <div>
                    <p className="font-bold text-slate-900 text-sm">{player.nickname}</p>
                    <p className="text-xs text-slate-500">
                      Role: <span className="text-blue-600 font-semibold">{pRole.name}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleResolveAdmission(player.id, "reject")}
                      disabled={pending}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 transition"
                      title="Decline entry"
                    >
                      Decline
                    </button>
                    <button
                      onClick={() => handleResolveAdmission(player.id, "approve")}
                      disabled={pending}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition"
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
          <Panel className="p-5 bg-white border border-slate-200 shadow-sm">
            <SectionTitle icon={<Users className="h-3.5 w-3.5 text-blue-600" />}>Join this room</SectionTitle>

            <div className="rounded-xl bg-slate-50 p-4 border border-slate-200 text-center">
              <p className="label text-slate-500">Session Room Code</p>
              <button
                onClick={() => copy(code, "code")}
                title="Copy room code"
                className="font-mono mt-1 block w-full text-center text-[2.2rem] leading-none font-black tracking-wider text-blue-600 hover:text-blue-700"
              >
                {code}
              </button>
            </div>

            <div className="mt-4 flex items-start gap-4">
              <div className="shrink-0 p-2 bg-white rounded-xl border border-slate-200 shadow-xs">{qr}</div>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Students scan this QR code with any phone to join. Each student receives an interactive campus pass.
                </p>
                <div className="flex flex-col gap-1.5 pt-1">
                  <button
                    onClick={() => copy(joinUrl, "join")}
                    className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {copied === "join" ? "Copied direct link!" : "Copy mobile join link"}
                  </button>
                </div>
              </div>
            </div>
          </Panel>

          {/* Session Lifecycle Controls */}
          <Panel className="p-5 bg-white border border-slate-200 shadow-sm">
            <SectionTitle icon={<Lock className="h-3.5 w-3.5 text-blue-600" />}>Session Controls</SectionTitle>
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
              <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-3 w-3 animate-spin text-blue-600" /> syncing with server…
              </p>
            )}
          </Panel>

          {/* Quick links */}
          <Panel className="p-5 bg-white border border-slate-200 shadow-sm">
            <SectionTitle>Display Links</SectionTitle>
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
              <Panel className="p-6 bg-white border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
                      <ShieldAlert className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-900">Door Key Requests</h2>
                      <p className="text-xs text-slate-500">
                        Students requesting one-time keys to restricted campus facilities
                      </p>
                    </div>
                  </div>
                  {pendingRequests.length > 0 && (
                    <span className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800 border border-amber-200 animate-pulse">
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                      {pendingRequests.length} PENDING
                    </span>
                  )}
                </div>

                <div className="mt-4">
                  {pendingRequests.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
                      No pending door requests. When students tap locked doors on their phone and ask for a key, they will appear here.
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {pendingRequests.map((req) => (
                        <div
                          key={req.id}
                          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4 transition shadow-xs"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 text-sm">{req.playerNickname}</span>
                              <span className="rounded bg-slate-100 px-2 py-0.5 text-[0.65rem] font-bold text-slate-600">
                                {req.playerRole}
                              </span>
                              <span className="text-xs text-slate-500">wants entry to</span>
                              <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700 border border-blue-200">
                                {req.resourceName}
                              </span>
                            </div>
                            <p className="mt-1.5 text-xs text-slate-700">
                              <span className="font-bold text-amber-800">Reason:</span> &ldquo;{req.reason}&rdquo;
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleResolveRequest(req.id, "reject")}
                              disabled={pending}
                              className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 transition"
                            >
                              <X className="h-3.5 w-3.5" /> Decline
                            </button>
                            <button
                              onClick={() => handleResolveRequest(req.id, "approve")}
                              disabled={pending}
                              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 active:scale-95 transition"
                            >
                              <Check className="h-3.5 w-3.5" /> Grant 60s Key
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Panel>

              {/* Campus Roster & Role Control */}
              <Panel className="p-6 bg-white border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-600 border border-blue-200">
                      <IdCard className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-900">Students & Campus Roles</h2>
                      <p className="text-xs text-slate-500">
                        {connected} online of {total} admitted. Change roles or suspend badges in real time.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[0.68rem] uppercase tracking-wider text-slate-500">
                        <th className="py-3 px-3.5 font-bold">Student</th>
                        <th className="py-3 px-3.5 font-bold">Assigned Role</th>
                        <th className="py-3 px-3.5 font-bold">Clearance</th>
                        <th className="py-3 px-3.5 font-bold">Badge Status</th>
                        <th className="py-3 px-3.5 font-bold">Change Role</th>
                        <th className="py-3 px-3.5 font-bold text-right">Access Control</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {snap.players.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-400">
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
                                isRevoked ? "bg-rose-50/50" : "hover:bg-slate-50/80"
                              }`}
                            >
                              {/* Student name */}
                              <td className="py-3.5 px-3.5">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`h-2.5 w-2.5 rounded-full ${
                                      isPendingAdmission
                                        ? "bg-amber-400"
                                        : player.isConnected
                                        ? "bg-emerald-500"
                                        : "bg-slate-300"
                                    }`}
                                  />
                                  <span className="font-bold text-slate-900 text-sm">{player.nickname}</span>
                                  {player.isBot && (
                                    <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[0.55rem] font-bold uppercase text-indigo-700 border border-indigo-200">
                                      demo bot
                                    </span>
                                  )}
                                  {isPendingAdmission && (
                                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[0.6rem] font-bold text-amber-700 border border-amber-200">
                                      waiting
                                    </span>
                                  )}
                                </div>
                                {grants.length > 0 && (
                                  <span className="mt-1 inline-flex items-center gap-1 text-[0.65rem] font-bold text-amber-700">
                                    <Zap className="h-3 w-3 text-amber-500" /> 1-Time Key Active
                                  </span>
                                )}
                              </td>

                              {/* Role */}
                              <td className="py-3.5 px-3.5 font-medium text-slate-700">
                                {playerRole.name}
                              </td>

                              {/* Clearance level */}
                              <td className="py-3.5 px-3.5">
                                <span className="rounded bg-blue-50 px-2 py-0.5 text-[0.7rem] font-bold text-blue-700 border border-blue-200">
                                  Level {playerRole.level}
                                </span>
                              </td>

                              {/* Badge status */}
                              <td className="py-3.5 px-3.5">
                                {isRevoked ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-0.5 text-[0.65rem] font-bold text-rose-700 border border-rose-200">
                                    <ShieldAlert className="h-3 w-3" /> Suspended
                                  </span>
                                ) : isPendingAdmission ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[0.65rem] font-bold text-amber-700 border border-amber-200">
                                    Pending
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[0.65rem] font-bold text-emerald-700 border border-emerald-200">
                                    <ShieldCheck className="h-3 w-3" /> Active
                                  </span>
                                )}
                              </td>

                              {/* Role switcher dropdown */}
                              <td className="py-3.5 px-3.5">
                                <select
                                  value={player.roleId ?? "undergrad"}
                                  disabled={pending}
                                  onChange={(e) => handleRoleChange(player.id, e.target.value)}
                                  className="rounded-lg bg-white px-2.5 py-1.5 text-xs text-slate-800 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
                                >
                                  {CAMPUS_ROLES.map((r) => (
                                    <option key={r.id} value={r.id}>
                                      {r.name} (L{r.level})
                                    </option>
                                  ))}
                                </select>
                              </td>

                              {/* Revoke / Restore button */}
                              <td className="py-3.5 px-3.5 text-right">
                                {isPendingAdmission ? (
                                  <button
                                    onClick={() => handleResolveAdmission(player.id, "approve")}
                                    disabled={pending}
                                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition"
                                  >
                                    Admit Student
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleToggleRevocation(player.id)}
                                    disabled={pending}
                                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition active:scale-95 shadow-xs ${
                                      isRevoked
                                        ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                        : "border border-slate-200 bg-white text-slate-700 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200"
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
              <Panel className="p-6 bg-white border border-slate-200 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-700 border border-slate-200">
                      <Terminal className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-900">Live Door Swipe Activity</h2>
                      <p className="text-xs text-slate-500">
                        Real-time feed of participants testing doors on their mobile phones
                      </p>
                    </div>
                  </div>

                  {/* Filter buttons */}
                  <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 p-1 border border-slate-200 text-[0.65rem] font-bold">
                    {(["all", "denials", "promotions", "emergency"] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setAuditFilter(f)}
                        className={`rounded px-2.5 py-1 transition ${
                          auditFilter === f ? "bg-white text-blue-600 shadow-xs" : "text-slate-600 hover:text-slate-950"
                        }`}
                      >
                        {f === "all" ? "All Activity" : f === "denials" ? "Denied Only" : f === "promotions" ? "Roles" : "Key Requests"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 max-h-72 overflow-y-auto rounded-xl bg-slate-50 p-3 text-xs leading-relaxed border border-slate-200">
                  {auditLogs.length === 0 ? (
                    <p className="text-center text-slate-400 py-6">No events recorded yet. As students swipe doors or request keys, activity shows here in real time.</p>
                  ) : (
                    <div className="space-y-2">
                      {auditLogs.map((log) => {
                        const time = new Date(log.timestamp).toLocaleTimeString();
                        let badgeBg = "bg-emerald-50 text-emerald-800 border border-emerald-200";
                        if (log.outcome === "DENIED" || log.outcome === "REVOKED" || log.outcome === "EMERGENCY_REJECTED") {
                          badgeBg = "bg-rose-50 text-rose-800 border border-rose-200";
                        } else if (log.outcome === "PROMOTED" || log.outcome === "DEMOTED") {
                          badgeBg = "bg-indigo-50 text-indigo-800 border border-indigo-200";
                        } else if (log.outcome === "EMERGENCY_APPROVED" || log.outcome === "ADMISSION_REQUESTED") {
                          badgeBg = "bg-amber-50 text-amber-800 border border-amber-200";
                        }

                        return (
                          <div key={log.id} className="flex items-center justify-between gap-3 rounded-lg bg-white p-2.5 border border-slate-200/80 shadow-xs hover:border-slate-300 transition">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className={`rounded-md px-2 py-0.5 text-[0.65rem] font-bold shrink-0 ${badgeBg}`}>
                                {log.outcome.replace("_", " ")}
                              </span>
                              <span className="font-semibold text-slate-900 shrink-0">{log.actor}</span>
                              <span className="text-slate-600 truncate text-xs">{log.detail}</span>
                            </div>
                            <span className="text-slate-400 text-[0.7rem] shrink-0 font-mono">{time}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </Panel>
            </>
          )}

          {/* TAB 2: SCENARIOS / QUIZ */}
          {adminTab === "scenarios" && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-4">
                <RoundTrack current={snap.currentRound || 0} total={snap.totalRounds} />
                <Panel className="p-6 bg-white border border-slate-200 shadow-sm" glow={status === "active"}>
                  {snap.scenario ? (
                    <ScenarioCard snapshot={snap} />
                  ) : (
                    <div className="py-10 text-center">
                      <p className="text-base font-semibold text-slate-500">
                        Start the session using the left controls to display the first scenario.
                      </p>
                    </div>
                  )}
                </Panel>

                <Panel className="p-6 bg-white border border-slate-200 shadow-sm">
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
                    <div className="flex items-center gap-3 py-6 text-sm text-slate-500">
                      <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
                      Waiting for student votes…
                    </div>
                  )}
                </Panel>
              </div>

              <div className="space-y-4">
                <Panel className="p-5 bg-white border border-slate-200 shadow-sm">
                  <SectionTitle>Live Vote Distribution</SectionTitle>
                  <VoteBars snapshot={snap} />
                  {msLeft !== null && round?.status === "open" && status !== "paused" && (
                    <p className="mt-4 border-t border-slate-100 pt-3 text-center text-xs text-slate-500">
                      <span className="tabular font-bold text-amber-700">{Math.ceil(msLeft / 1000)}s</span>{" "}
                      remaining on the clock
                    </p>
                  )}
                </Panel>

                <Panel className="p-5 bg-white border border-slate-200 shadow-sm">
                  <SectionTitle icon={<Trophy className="h-3.5 w-3.5 text-amber-500" />}>Leaderboard</SectionTitle>
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
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[0.65rem] font-bold uppercase tracking-[0.14em] transition border ${
        on
          ? "bg-blue-50 text-blue-700 border-blue-200"
          : "bg-white text-slate-600 border-slate-200 hover:text-slate-900"
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
    ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
    : primary
      ? "bg-blue-600 text-white hover:bg-blue-700 border-blue-600 shadow-sm font-bold"
      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 shadow-xs";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm border transition select-none touch-manipulation cursor-pointer active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${tone}`}
    >
      <span className="flex items-center gap-2 font-semibold">
        {icon}
        {label}
      </span>
      {hint && <span className="text-[0.65rem] font-medium opacity-70">{hint}</span>}
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
        <span className="absolute inset-0 rounded-full border-2 border-indigo-200" />
        <motion.span
          className="absolute inset-0 rounded-full border-2 border-indigo-600"
          animate={{ scale: [1, 1.18], opacity: [0.7, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
        />
        <Lock className="h-8 w-8 text-indigo-600" />
      </div>
      <p className="mt-5 text-lg font-bold text-slate-900">Voting is closed</p>
      <p className="mt-1 text-sm text-slate-600">
        <span className="tabular font-bold text-slate-900">{votes}</span> of {players} players have
        answered. Reveal when the room is ready.
      </p>
      <button
        onClick={onReveal}
        disabled={pending}
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
      >
        <Eye className="h-4 w-4" />
        Reveal Now
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
      className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-slate-700 border border-slate-200 transition hover:bg-slate-100 hover:text-slate-900 shadow-xs"
    >
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
      <ExternalLink className="h-3.5 w-3.5 opacity-60" />
    </a>
  );
}
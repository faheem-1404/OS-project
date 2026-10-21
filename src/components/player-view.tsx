"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Briefcase,
  CheckCircle2,
  Clock,
  Cpu,
  DoorClosed,
  DoorOpen,
  GraduationCap,
  Hourglass,
  IdCard,
  Key,
  Layers,
  Loader2,
  Lock,
  LogOut,
  Radio,
  Send,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trophy,
  Unlock,
  Users,
  WifiOff,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  attemptAccessAction,
  castVoteAction,
  heartbeatAction,
  leaveRoomAction,
  requestEmergencyAccessAction,
} from "@/app/actions";
import { useSfx } from "@/components/prefs";
import {
  ConnectionBadge,
  CountdownOverlay,
  DecisionButtons,
  Leaderboard,
  PointsBadge,
  RevealPanel,
  RoundTrack,
  ScenarioCard,
  VoteBars,
} from "@/components/game";
import { ErrorNote, Logo, Panel, SectionTitle, StatusPill } from "@/components/ui";
import { CAMPUS_RESOURCES, getRole } from "@/lib/rbac-rules";
import { useRoom, useServerTimer } from "@/lib/client/useRoom";
import type { Decision, RoomSnapshot } from "@/lib/types";

function ResourceIcon({ id, className = "h-5 w-5" }: { id: string; className?: string }) {
  switch (id) {
    case "server_room":
      return <Server className={className} />;
    case "research_lab":
      return <Cpu className={className} />;
    case "gradebook":
      return <GraduationCap className={className} />;
    case "hpc_cluster":
      return <Zap className={className} />;
    case "faculty_lounge":
      return <Briefcase className={className} />;
    case "library":
    default:
      return <BookOpen className={className} />;
  }
}

export function PlayerView({ initial }: { initial: RoomSnapshot }) {
  const router = useRouter();
  const { snapshot, connection, skew } = useRoom(initial.code, initial);
  const sfx = useSfx();
  const { msLeft } = useServerTimer(snapshot, skew);

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"arena" | "quiz">("arena");

  // Quiz state
  const [submitting, setSubmitting] = useState(false);
  const [optimisticVote, setOptimisticVote] = useState<Decision | null>(null);
  const lastRoundRef = useRef<number>(-1);

  // Door scan state
  const [scanningResource, setScanningResource] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<{
    resourceId: string;
    granted: boolean;
    reason: string;
  } | null>(null);

  // Emergency access request modal state
  const [emergencyModalResource, setEmergencyModalResource] = useState<string | null>(null);
  const [emergencyReason, setEmergencyReason] = useState("");
  const [submittingEmergency, setSubmittingEmergency] = useState(false);
  const [emergencyNotice, setEmergencyNotice] = useState<string | null>(null);

  // Countdown state
  const [countdown, setCountdown] = useState<number | null>(null);

  const snap = snapshot ?? initial;
  const round = snap.round ?? null;
  const revealed = round?.status === "revealed";

  // Current player from snapshot
  const mePlayer = snap.me ? snap.players.find((p) => p.id === snap.me?.id) : null;

  // Role info
  const roleId = mePlayer?.roleId ?? "undergrad";
  const role = getRole(roleId);
  const isRevoked = mePlayer?.badgeStatus === "revoked";
  const activeGrants = (mePlayer?.temporaryGrants ?? []).filter((g) => g.expiresAt > Date.now());

  // Player's vote this round
  const myVote = snap.me?.vote;
  const effectiveVote = myVote
    ? { decision: myVote.decision, submittedAt: 0 }
    : optimisticVote
    ? { decision: optimisticVote, submittedAt: Date.now() }
    : null;

  // Clear optimistic vote on round change
  const currentRoundIdx = snap.currentRound;
  useEffect(() => {
    setOptimisticVote(null);
    setError(null);
    setScanResult(null);
  }, [currentRoundIdx]);

  // Tick clock for temporary grants
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (activeGrants.length === 0) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [activeGrants.length]);

  // Sync countdown
  useEffect(() => {
    if (snap.status !== "countdown" || !round?.openedAt) {
      setCountdown(null);
      return;
    }
    const serverNow = Date.now() + skew;
    const remaining = Math.ceil((round.openedAt - serverNow) / 1000);
    if (remaining <= 0) {
      setCountdown(null);
      return;
    }
    setCountdown(remaining);
    const id = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(id);
  }, [snap.status, round?.openedAt, skew]);

  // Keep alive heartbeat
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void heartbeatAction(snap.code);
    }, 20_000);
    return () => clearInterval(id);
  }, [snap.code]);

  // Lock-in feedback
  useEffect(() => {
    if (myVote && lastRoundRef.current !== myVote.roundIndex) {
      lastRoundRef.current = myVote.roundIndex;
      sfx("lock");
    }
  }, [myVote, sfx]);

  useEffect(() => {
    if (revealed) {
      sfx(myVote && myVote.points && myVote.points > 0 ? "granted" : "denied");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed]);

  const canVote =
    snap.status === "active" &&
    round?.status === "open" &&
    msLeft !== null &&
    !effectiveVote;

  function choose(decision: Decision) {
    if (!canVote || submitting || optimisticVote) return;
    setOptimisticVote(decision);
    setSubmitting(true);
    sfx("lock");
    setError(null);
    startTransition(async () => {
      try {
        const res = await castVoteAction(snap.code, decision);
        if (!res.ok) {
          setOptimisticVote(null);
          setError(res.error ?? "Could not record your vote.");
        }
      } catch {
        setOptimisticVote(null);
        setError("Network error. Please try again.");
      } finally {
        setSubmitting(false);
      }
    });
  }

  async function handleSwipeDoor(resourceId: string) {
    if (scanningResource) return;
    setScanningResource(resourceId);
    setScanResult(null);
    try {
      const res = await attemptAccessAction(snap.code, resourceId);
      if (res.ok && res.data) {
        setScanResult({
          resourceId,
          granted: res.data.granted,
          reason: res.data.reason,
        });
        sfx(res.data.granted ? "granted" : "denied");
      } else {
        setScanResult({
          resourceId,
          granted: false,
          reason: res.error ?? "Access verification failed.",
        });
        sfx("denied");
      }
    } catch {
      setScanResult({
        resourceId,
        granted: false,
        reason: "Network connection lost during badge swipe.",
      });
      sfx("denied");
    } finally {
      setScanningResource(null);
    }
  }

  async function submitEmergencyRequest() {
    if (!emergencyModalResource) return;
    setSubmittingEmergency(true);
    try {
      const res = await requestEmergencyAccessAction(
        snap.code,
        emergencyModalResource,
        emergencyReason || "Urgent access required",
      );
      if (res.ok) {
        setEmergencyNotice(
          "Door key request sent to session host. Awaiting approval.",
        );
        setEmergencyModalResource(null);
        setEmergencyReason("");
        sfx("lock");
      } else {
        setError(res.error ?? "Could not submit door key request.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmittingEmergency(false);
    }
  }

  async function leave() {
    await leaveRoomAction(snap.code);
    router.push("/");
  }

  /* -------------------- ADMISSION GATING SCREENS -------------------- */
  if (mePlayer?.admissionStatus === "pending") {
    return (
      <main className="relative z-10 mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-12 text-center">
        <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-lg">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 border border-amber-200">
            <Clock className="h-8 w-8 animate-pulse" />
          </div>

          <span className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3.5 py-1 text-xs font-semibold text-amber-700 border border-amber-200">
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
            Waiting for Host Admission
          </span>

          <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
            Welcome, {mePlayer.nickname}!
          </h1>

          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Your admission request has been sent to the lab host. Please keep this screen open while the host admits you into room <strong className="text-slate-900 font-mono font-bold">{snap.code}</strong>.
          </p>

          <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-left border border-slate-200 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Session Room</span>
              <span className="font-mono font-bold tracking-wider text-blue-600">{snap.code}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Assigned Student Role</span>
              <span className="font-bold text-slate-900">{role.name} (Level {role.level})</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Status</span>
              <span className="font-bold text-amber-700">Waiting for Host Approval</span>
            </div>
          </div>

          <p className="mt-5 text-xs text-slate-500">
            Once admitted, your digital campus pass and door clearance will activate automatically.
          </p>

          <button
            onClick={leave}
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-sm"
          >
            <LogOut className="h-3.5 w-3.5 text-slate-500" />
            Change Nickname / Cancel
          </button>
        </div>
      </main>
    );
  }

  if (mePlayer?.admissionStatus === "rejected") {
    return (
      <main className="relative z-10 mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-12 text-center">
        <div className="rounded-3xl border border-rose-200 bg-white p-7 shadow-lg">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 border border-rose-200">
            <ShieldAlert className="h-8 w-8" />
          </div>

          <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">
            Admission Declined
          </h1>

          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            The host declined this entry request for room <strong className="text-slate-900 font-mono">{snap.code}</strong>.
          </p>

          <button
            onClick={leave}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            Return to Join Screen
          </button>
        </div>
      </main>
    );
  }

  // Fallback for spectator or missing mePlayer
  const displayName = mePlayer?.nickname ?? "Spectator";

  return (
    <>
      <CountdownOverlay value={countdown} />

      <main className="relative z-10 mx-auto flex min-h-dvh max-w-xl flex-col px-4 pb-14 pt-4">
        {/* Header */}
        <header className="flex items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2.5">
            <Logo compact />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[0.62rem] font-bold uppercase tracking-wider text-slate-400">Room</span>
                <span className="font-mono text-sm font-black tracking-wider text-blue-600">
                  {snap.code}
                </span>
              </div>
              <p className="text-[0.65rem] font-semibold text-slate-500">
                {snap.me?.id ? "Student Credential Active" : "Spectator Mode"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill status={snap.status} />
            <ConnectionBadge state={connection} />
          </div>
        </header>

        {/* Tab switcher */}
        <div className="mt-3.5 grid grid-cols-2 gap-2 rounded-2xl bg-slate-200/80 p-1.5">
          <button
            onClick={() => setActiveTab("arena")}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition shadow-sm ${
              activeTab === "arena"
                ? "bg-white text-blue-600"
                : "bg-transparent text-slate-600 hover:text-slate-900 shadow-none"
            }`}
          >
            <IdCard className="h-4 w-4" />
            My Campus Pass & Doors
          </button>
          <button
            onClick={() => setActiveTab("quiz")}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition shadow-sm ${
              activeTab === "quiz"
                ? "bg-white text-blue-600"
                : "bg-transparent text-slate-600 hover:text-slate-900 shadow-none"
            }`}
          >
            <Radio className="h-4 w-4" />
            Interactive Scenarios ({snap.totalRounds})
          </button>
        </div>

        <AnimatePresence>
          {connection === "reconnecting" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-800 border border-amber-200">
                <WifiOff className="h-4 w-4 text-amber-600" />
                Connection lost — retrying campus network connection…
              </div>
            </motion.div>
          )}

          {emergencyNotice && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-800 border border-blue-200 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 shrink-0 text-blue-600" />
                <span>{emergencyNotice}</span>
              </div>
              <button
                onClick={() => setEmergencyNotice(null)}
                className="text-blue-600 hover:text-blue-800 text-xs font-bold underline"
              >
                Dismiss
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* -------------------- TAB 1: CAMPUS PASS & DOORS -------------------- */}
        {activeTab === "arena" && (
          <div className="mt-3.5 space-y-4">
            {/* Authentic University Student ID Card */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className={`relative overflow-hidden rounded-2xl border shadow-md transition-all ${
                isRevoked
                  ? "border-rose-300 bg-white"
                  : "border-slate-200 bg-white"
              }`}
            >
              {/* ID Card Top Band */}
              <div className="flex items-center justify-between bg-slate-900 px-5 py-3 text-white">
                <div className="flex items-center gap-2">
                  <div className="grid h-6 w-6 place-items-center rounded bg-blue-600 text-white font-bold text-xs">
                    U
                  </div>
                  <span className="text-[0.68rem] font-bold uppercase tracking-[0.15em] text-slate-200">
                    Campus Digital Access Card
                  </span>
                </div>
                <span className="font-mono text-xs font-bold text-blue-300">
                  ID: #{snap.code}-{displayName.slice(0, 3).toUpperCase()}
                </span>
              </div>

              {/* ID Card Body */}
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3.5">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-700 font-bold text-xl border border-blue-200 shadow-inner">
                      {displayName.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h2 className="text-xl font-bold tracking-tight text-slate-900">
                        {displayName}
                      </h2>
                      <p className="text-xs font-medium text-slate-500">
                        Role: <span className="font-semibold text-slate-800">{role.name}</span>
                      </p>
                    </div>
                  </div>

                  {isRevoked ? (
                    <span className="flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700 border border-rose-200">
                      <ShieldAlert className="h-3.5 w-3.5" /> Suspended
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> Active Pass
                    </span>
                  )}
                </div>

                {/* Role & clearance summary */}
                <div className="mt-4 rounded-xl bg-slate-50 p-3.5 border border-slate-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">Clearance Level</p>
                      <p className="font-bold text-slate-900 text-sm">Security Level {role.level} of 4</p>
                    </div>
                    <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 border border-blue-200">
                      Level {role.level}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                    {role.description}
                  </p>
                </div>

                {isRevoked && (
                  <div className="mt-3.5 flex items-start gap-2.5 rounded-xl bg-rose-50 p-3.5 text-xs text-rose-800 border border-rose-200">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                    <div>
                      <p className="font-bold">Pass Suspended by Host</p>
                      <p className="text-[0.75rem] text-rose-700 mt-0.5">
                        Your electronic door access has been temporarily revoked. All doors will report denied until the host restores your pass.
                      </p>
                    </div>
                  </div>
                )}

                {activeGrants.length > 0 && (
                  <div className="mt-3.5 rounded-xl bg-amber-50 p-3.5 border border-amber-200">
                    <p className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                      <Zap className="h-3.5 w-3.5 text-amber-600" /> Temporary Door Key Active:
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {activeGrants.map((g) => {
                        const sec = Math.max(0, Math.ceil((g.expiresAt - now) / 1000));
                        return (
                          <span
                            key={g.resourceId}
                            className="rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-amber-800 border border-amber-300 shadow-sm"
                          >
                            {CAMPUS_RESOURCES.find((r) => r.id === g.resourceId)?.name ?? g.resourceId} ({sec}s remaining)
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Campus Doors & Facilities list */}
            <div>
              <div className="flex items-center justify-between px-1">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <DoorOpen className="h-4 w-4 text-blue-600" /> Campus Doors & Rooms
                  </h3>
                  <p className="text-xs text-slate-500">Tap &ldquo;Tap Badge to Enter&rdquo; on any door to test your access</p>
                </div>
              </div>

              <div className="mt-3 grid gap-3">
                {CAMPUS_RESOURCES.map((resource) => {
                  const isScanning = scanningResource === resource.id;
                  const resultForThis = scanResult?.resourceId === resource.id ? scanResult : null;
                  const hasEmergencyGrant = activeGrants.some((g) => g.resourceId === resource.id);
                  const isRolePermitted = role.allowedResources.includes(resource.id);

                  const hasPendingRequest = snap.accessRequests?.some(
                    (r) => r.playerId === mePlayer?.id && r.resourceId === resource.id && r.status === "pending"
                  );

                  return (
                    <motion.div
                      key={resource.id}
                      layout
                      className={`relative overflow-hidden rounded-2xl border p-4 transition shadow-sm ${
                        resultForThis?.granted
                          ? "border-emerald-300 bg-emerald-50/70"
                          : resultForThis?.granted === false
                          ? "border-rose-300 bg-rose-50/70"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                              resultForThis?.granted || (isRolePermitted && !isRevoked)
                                ? "bg-blue-100 text-blue-700 border border-blue-200"
                                : "bg-slate-100 text-slate-600 border border-slate-200"
                            }`}
                          >
                            <ResourceIcon id={resource.id} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-bold text-slate-900">{resource.name}</h4>
                              <span className="rounded bg-slate-100 px-2 py-0.5 text-[0.65rem] font-semibold text-slate-600">
                                {resource.category}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                              {resource.description}
                            </p>
                          </div>
                        </div>

                        <span className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1 text-[0.65rem] font-bold text-slate-600 border border-slate-200">
                          Req L{resource.minLevel}
                        </span>
                      </div>

                      {/* Result callout */}
                      <AnimatePresence>
                        {resultForThis && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className={`mt-3 rounded-xl p-3 text-xs leading-relaxed border ${
                              resultForThis.granted
                                ? "bg-emerald-100/90 text-emerald-900 border-emerald-300"
                                : "bg-rose-100/90 text-rose-900 border-rose-300"
                            }`}
                          >
                            <div className="flex items-center gap-2 font-bold">
                              {resultForThis.granted ? (
                                <>
                                  <DoorOpen className="h-4 w-4 text-emerald-700" /> Door Unlocked • Access Granted
                                </>
                              ) : (
                                <>
                                  <DoorClosed className="h-4 w-4 text-rose-700" /> Door Locked • Access Denied
                                </>
                              )}
                            </div>
                            <p className="mt-1 text-xs opacity-90">{resultForThis.reason}</p>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Action Bar */}
                      <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                        <button
                          onClick={() => handleSwipeDoor(resource.id)}
                          disabled={isScanning}
                          className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 active:scale-95 disabled:opacity-50"
                        >
                          {isScanning ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verifying…
                            </>
                          ) : (
                            <>
                              <IdCard className="h-3.5 w-3.5 text-blue-400" /> Tap Badge to Enter
                            </>
                          )}
                        </button>

                        {!isRolePermitted && !hasEmergencyGrant && (
                          hasPendingRequest ? (
                            <span className="inline-flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 border border-amber-200">
                              <Hourglass className="h-3.5 w-3.5 text-amber-600 animate-spin" /> Request Pending
                            </span>
                          ) : (
                            <button
                              onClick={() => {
                                setEmergencyModalResource(resource.id);
                                setEmergencyReason("");
                              }}
                              className="flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 border border-amber-200 hover:bg-amber-100 transition shadow-sm"
                            >
                              <Key className="h-3.5 w-3.5 text-amber-600" /> Request Door Key
                            </button>
                          )
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* -------------------- TAB 2: SCENARIOS (QUIZ) -------------------- */}
        {activeTab === "quiz" && (
          <div className="mt-3.5 space-y-4">
            <RoundTrack current={snap.currentRound || 0} total={snap.totalRounds} />

            {/* Lobby */}
            {snap.status === "waiting" && (
              <Panel className="p-7 text-center bg-white border border-slate-200 shadow-sm" glow>
                <motion.div
                  animate={{ scale: [1, 1.03, 1] }}
                  transition={{ duration: 2.4, repeat: Infinity }}
                  className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-blue-50 text-blue-600 border border-blue-200"
                >
                  <Radio className="h-7 w-7 text-blue-600" />
                </motion.div>
                <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">
                  You&apos;re in the Lobby
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Keep this tab open. Interactive RBAC scenarios will appear here for the class when the host starts the session.
                </p>
                <div className="mt-6 flex items-center justify-center gap-6">
                  <Stat icon={<Users className="h-4 w-4" />} value={snap.players.length} label="connected" />
                  <Stat icon={<Radio className="h-4 w-4" />} value={snap.totalRounds} label="scenarios" />
                </div>
              </Panel>
            )}

            {/* Waiting between rounds */}
            {snap.status === "revealing" && revealed && (
              <Panel className="flex items-center gap-3 px-4 py-3 bg-white border border-slate-200 shadow-sm">
                <Hourglass className="h-4 w-4 shrink-0 text-slate-400" />
                <p className="text-sm text-slate-600">
                  Next scenario begins when the host advances.
                </p>
              </Panel>
            )}

            {/* Scenario */}
            {snap.scenario && snap.status !== "waiting" && (
              <>
                <Panel className="p-6 bg-white border border-slate-200 shadow-sm" glow={snap.status === "active"}>
                  <ScenarioCard snapshot={snap} />
                </Panel>

                {/* Decision */}
                <Panel className="p-6 bg-white border border-slate-200 shadow-sm">
                  {revealed ? (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="label">Your decision</span>
                        {myVote ? (
                          <span
                            className={`rounded-lg px-3 py-1 text-sm font-bold tracking-wider ${
                              myVote.decision === "APPROVE"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-rose-50 text-rose-700 border border-rose-200"
                            }`}
                          >
                            {myVote.decision}
                          </span>
                        ) : (
                          <span className="text-sm text-slate-400">No answer</span>
                        )}
                      </div>
                      <div className="flex justify-center py-1">
                        {myVote?.points !== null && myVote?.points !== undefined ? (
                          <PointsBadge points={myVote.points} />
                        ) : (
                          <span className="text-sm text-slate-400">No points this round</span>
                        )}
                      </div>
                      <RevealPanel reveal={round?.reveal ?? null} />
                    </div>
                  ) : effectiveVote ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="py-4 text-center"
                    >
                      <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
                      <p className="mt-3 text-lg font-bold text-slate-900">Decision locked in</p>
                      <p className="mt-1 text-sm text-slate-600">
                        You voted <span className="font-bold text-slate-900">{effectiveVote.decision}</span>. Host will reveal results shortly.
                      </p>
                    </motion.div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="label">Your evaluation</span>
                        {msLeft !== null && (
                          <span className="tabular text-sm font-bold text-amber-700">
                            {Math.ceil(msLeft / 1000)}s
                          </span>
                        )}
                      </div>
                      <DecisionButtons
                        disabled={!canVote}
                        locked={false}
                        chosen={null}
                        onChoose={choose}
                      />
                      {snap.status === "countdown" && (
                        <p className="text-center text-sm text-slate-500">
                          Hold on — voting opens in a moment.
                        </p>
                      )}
                      {snap.status === "paused" && (
                        <p className="text-center text-sm font-bold uppercase tracking-widest text-amber-700">
                          Host paused the round
                        </p>
                      )}
                      {(submitting || pending) && (
                        <p className="flex items-center justify-center gap-2 text-xs text-slate-500">
                          <Send className="h-3 w-3 animate-pulse text-blue-600" /> recording…
                        </p>
                      )}
                    </div>
                  )}
                  {error && (
                    <div className="mt-4">
                      <ErrorNote>{error}</ErrorNote>
                    </div>
                  )}
                </Panel>
              </>
            )}

            {/* Live feedback */}
            {snap.status === "active" && round?.status === "open" && (
              <Panel className="p-5 bg-white border border-slate-200 shadow-sm">
                <SectionTitle>Live Room Voting</SectionTitle>
                <VoteBars snapshot={snap} />
              </Panel>
            )}

            {/* Leaderboard */}
            <Panel className="p-5 bg-white border border-slate-200 shadow-sm">
              <SectionTitle icon={<Trophy className="h-3.5 w-3.5 text-amber-500" />}>Leaderboard</SectionTitle>
              <Leaderboard players={snap.leaderboard} limit={8} highlightId={snap.me?.id ?? null} />
            </Panel>
          </div>
        )}

        {/* Emergency Elevation Modal */}
        <AnimatePresence>
          {emergencyModalResource && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.94 }}
                className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
                    <ShieldAlert className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">Request Door Key</h3>
                    <p className="text-xs text-slate-500">
                      Room: {CAMPUS_RESOURCES.find((r) => r.id === emergencyModalResource)?.name}
                    </p>
                  </div>
                </div>

                <p className="mt-3 text-xs leading-relaxed text-slate-600">
                  Your role ({role.name}) does not have standard clearance for this room. Submit a note to request a temporary 60-second door key from the host.
                </p>

                <div className="mt-4">
                  <label className="text-[0.7rem] font-bold uppercase tracking-wider text-slate-500">
                    Reason for entry
                  </label>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    {[
                      "Study group meeting",
                      "Lab research project",
                      "Emergency equipment check",
                      "Need to collect belongings",
                    ].map((reason) => (
                      <button
                        key={reason}
                        type="button"
                        onClick={() => setEmergencyReason(reason)}
                        className={`rounded-xl p-2.5 text-left transition border ${
                          emergencyReason === reason
                            ? "bg-blue-50 text-blue-700 border-blue-300 font-semibold"
                            : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        {reason}
                      </button>
                    ))}
                  </div>

                  <input
                    type="text"
                    value={emergencyReason}
                    onChange={(e) => setEmergencyReason(e.target.value)}
                    placeholder="Or type a custom note to the host…"
                    className="mt-3 w-full rounded-xl bg-white px-3.5 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                  />
                </div>

                <div className="mt-5 flex items-center justify-end gap-2.5">
                  <button
                    onClick={() => setEmergencyModalResource(null)}
                    disabled={submittingEmergency}
                    className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitEmergencyRequest}
                    disabled={submittingEmergency}
                    className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 active:scale-95 transition"
                  >
                    {submittingEmergency ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending…
                      </>
                    ) : (
                      <>
                        <Send className="h-3.5 w-3.5" /> Send Request
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <button
          onClick={leave}
          className="mx-auto mt-8 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-rose-600"
        >
          <LogOut className="h-3.5 w-3.5" />
          Leave this room
        </button>
      </main>
    </>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-center gap-1.5 text-slate-500">
        {icon}
        <span className="tabular text-2xl font-black text-slate-900">{value}</span>
      </div>
      <p className="label mt-0.5 text-slate-400">{label}</p>
    </div>
  );
}
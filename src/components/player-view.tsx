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

  // Emergency request modal state
  const [emergencyModalResource, setEmergencyModalResource] = useState<string | null>(null);
  const [emergencyReason, setEmergencyReason] = useState("");
  const [submittingEmergency, setSubmittingEmergency] = useState(false);
  const [emergencyNotice, setEmergencyNotice] = useState<string | null>(null);

  const snap = snapshot ?? initial;
  const round = snap.round;
  const myVote = snap.me?.vote ?? null;
  const revealed = round?.status === "revealed";

  // Me identity
  const mePlayer = snap.players.find((p) => p.id === snap.me?.id) ?? {
    id: snap.me?.id ?? "local-user",
    nickname: "Campus Member",
    score: 0,
    isBot: false,
    isConnected: true,
    joinedAt: new Date().toISOString(),
    roleId: snap.me?.roleId ?? "undergrad",
    badgeStatus: snap.me?.badgeStatus ?? "active",
    temporaryGrants: snap.me?.temporaryGrants ?? [],
    admissionStatus: snap.me?.admissionStatus ?? "approved",
  };

  const role = getRole(mePlayer.roleId);
  const isRevoked = mePlayer.badgeStatus === "revoked";
  const now = Date.now();
  const activeGrants = (mePlayer.temporaryGrants ?? []).filter((g) => g.expiresAt > now);

  // Reset optimistic vote whenever round changes
  useEffect(() => {
    setOptimisticVote(null);
  }, [round?.roundIndex, snap.status]);

  const effectiveVote = myVote ?? (optimisticVote ? {
    roundIndex: round?.roundIndex ?? 0,
    decision: optimisticVote,
    points: null,
  } : null);

  // 5-second pre-roll overlay
  const [countdown, setCountdown] = useState<number | null>(null);
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
  if (mePlayer.admissionStatus === "pending") {
    return (
      <main className="relative z-10 mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-12 text-center">
        <div className="rounded-3xl border border-white/10 bg-panel p-8 shadow-2xl backdrop-blur-xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-glow/10 text-cyan-glow ring-1 ring-cyan-glow/30">
            <Clock className="h-8 w-8 animate-pulse" />
          </div>

          <span className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-300 ring-1 ring-amber-500/30">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
            Waiting for Host to Admit You
          </span>

          <h1 className="mt-4 text-2xl font-bold tracking-tight text-white">
            Hi, {mePlayer.nickname}!
          </h1>

          <p className="mt-2 text-sm leading-relaxed text-ink-dim">
            Your admission request has been sent to the host. Please keep this screen open while the host approves your entry.
          </p>

          <div className="mt-6 rounded-2xl bg-white/[0.03] p-4 text-left ring-1 ring-white/10 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-ink-faint">Room Code</span>
              <span className="font-mono font-bold tracking-wider text-cyan-glow">{snap.code}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-ink-faint">Assigned Role</span>
              <span className="font-bold text-white">{role.name} (Level {role.level})</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-ink-faint">Status</span>
              <span className="font-bold text-amber-300">Pending Host Admission</span>
            </div>
          </div>

          <p className="mt-5 text-xs text-ink-faint">
            Once admitted, your campus pass and interactive doors will unlock automatically.
          </p>

          <button
            onClick={leave}
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-ink-dim hover:bg-white/10 hover:text-white transition"
          >
            <LogOut className="h-3.5 w-3.5" />
            Change Nickname / Cancel
          </button>
        </div>
      </main>
    );
  }

  if (mePlayer.admissionStatus === "rejected") {
    return (
      <main className="relative z-10 mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-12 text-center">
        <div className="rounded-3xl border border-denied/30 bg-panel p-8 shadow-2xl backdrop-blur-xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-denied/15 text-denied ring-1 ring-denied/30">
            <ShieldAlert className="h-8 w-8" />
          </div>

          <h1 className="mt-6 text-2xl font-bold tracking-tight text-white">
            Admission Declined
          </h1>

          <p className="mt-2 text-sm leading-relaxed text-ink-dim">
            The host declined this entry request for room <strong className="text-white">{snap.code}</strong>.
          </p>

          <button
            onClick={leave}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
          >
            Return to Join Screen
          </button>
        </div>
      </main>
    );
  }

  return (
    <>
      <CountdownOverlay value={countdown} />

      <main className="relative z-10 mx-auto flex min-h-dvh max-w-xl flex-col px-4 pb-12 pt-5">
        {/* Header */}
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Logo compact />
            <div>
              <p className="mono text-sm font-black tracking-[0.25em] text-cyan-glow">
                {snap.code}
              </p>
              <p className="text-[0.6rem] uppercase tracking-[0.18em] text-ink-faint">
                {snap.me?.id ? "campus credential active" : "spectating"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill status={snap.status} />
            <ConnectionBadge state={connection} />
          </div>
        </header>

        {/* Tab switcher */}
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-white/[0.04] p-1.5 ring-1 ring-white/10">
          <button
            onClick={() => setActiveTab("arena")}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold uppercase tracking-wider transition ${
              activeTab === "arena"
                ? "bg-cyan-glow/15 text-cyan-glow shadow-sm ring-1 ring-cyan-glow/30"
                : "text-ink-faint hover:text-ink"
            }`}
          >
            <IdCard className="h-4 w-4" />
            My ID & Doors
          </button>
          <button
            onClick={() => setActiveTab("quiz")}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold uppercase tracking-wider transition ${
              activeTab === "quiz"
                ? "bg-cyan-glow/15 text-cyan-glow shadow-sm ring-1 ring-cyan-glow/30"
                : "text-ink-faint hover:text-ink"
            }`}
          >
            <Radio className="h-4 w-4" />
            Scenarios ({snap.totalRounds})
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
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-warn/10 px-4 py-2.5 text-sm text-warn ring-1 ring-warn/25">
                <WifiOff className="h-4 w-4" />
                Connection lost — retrying secure campus tunnel…
              </div>
            </motion.div>
          )}

          {emergencyNotice && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-cyan-glow/15 px-4 py-3 text-xs font-semibold text-cyan-glow ring-1 ring-cyan-glow/30"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 shrink-0 text-cyan-glow" />
                <span>{emergencyNotice}</span>
              </div>
              <button
                onClick={() => setEmergencyNotice(null)}
                className="text-cyan-glow/60 hover:text-cyan-glow text-xs"
              >
                Dismiss
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* -------------------- TAB 1: CAMPUS PASS & DOORS -------------------- */}
        {activeTab === "arena" && (
          <div className="mt-4 space-y-4">
            {/* Modern Campus ID Card */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className={`relative overflow-hidden rounded-3xl border p-6 shadow-xl transition-all ${
                isRevoked
                  ? "border-denied/30 bg-gradient-to-br from-denied/10 via-panel to-panel"
                  : "border-white/10 bg-gradient-to-br from-panel-2 via-panel to-panel"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3.5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-glow/15 text-cyan-glow font-bold text-lg ring-1 ring-cyan-glow/30">
                    {mePlayer.nickname.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <span className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-ink-faint">
                      Digital Campus Pass
                    </span>
                    <h2 className="text-2xl font-bold tracking-tight text-white">
                      {mePlayer.nickname}
                    </h2>
                  </div>
                </div>

                {isRevoked ? (
                  <span className="flex items-center gap-1.5 rounded-full bg-denied/20 px-3 py-1 text-xs font-bold text-denied ring-1 ring-denied/40">
                    <ShieldAlert className="h-3.5 w-3.5" /> Suspended
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 rounded-full bg-granted/20 px-3 py-1 text-xs font-bold text-granted ring-1 ring-granted/40">
                    <span className="h-2 w-2 rounded-full bg-granted animate-pulse" /> Active Pass
                  </span>
                )}
              </div>

              {/* Role & clearance summary */}
              <div className="mt-5 rounded-2xl bg-black/40 p-4 ring-1 ring-white/5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-ink-faint">Assigned Role</p>
                    <p className="font-bold text-white text-base">{role.name}</p>
                  </div>
                  <span className="rounded-xl bg-cyan-glow/15 px-3 py-1 text-xs font-bold text-cyan-glow ring-1 ring-cyan-glow/30">
                    Clearance Level {role.level}
                  </span>
                </div>
                <p className="mt-2 text-xs text-ink-dim leading-relaxed">
                  {role.description}
                </p>
              </div>

              {isRevoked && (
                <div className="mt-3.5 flex items-start gap-2.5 rounded-xl bg-denied/15 p-3.5 text-xs text-denied ring-1 ring-denied/30">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Pass Suspended by Host</p>
                    <p className="text-[0.75rem] text-denied/90 mt-0.5">
                      Your access has been temporarily turned off. All doors will remain locked until the host restores your badge.
                    </p>
                  </div>
                </div>
              )}

              {activeGrants.length > 0 && (
                <div className="mt-3.5 rounded-xl bg-amber-500/15 p-3.5 ring-1 ring-amber-500/30">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                    <Zap className="h-3.5 w-3.5" /> Temporary Door Key Active:
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {activeGrants.map((g) => {
                      const sec = Math.max(0, Math.ceil((g.expiresAt - now) / 1000));
                      return (
                        <span
                          key={g.resourceId}
                          className="rounded-lg bg-black/50 px-2.5 py-1 text-xs font-bold text-amber-200 ring-1 ring-amber-500/40"
                        >
                          {CAMPUS_RESOURCES.find((r) => r.id === g.resourceId)?.name ?? g.resourceId} ({sec}s remaining)
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </motion.div>

            {/* Campus Doors list */}
            <div>
              <div className="flex items-center justify-between px-1">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <DoorOpen className="h-4 w-4 text-cyan-glow" /> Campus Doors & Rooms
                  </h3>
                  <p className="text-xs text-ink-dim">Tap any door below to test your badge access</p>
                </div>
              </div>

              <div className="mt-3 grid gap-3">
                {CAMPUS_RESOURCES.map((resource) => {
                  const isScanning = scanningResource === resource.id;
                  const resultForThis = scanResult?.resourceId === resource.id ? scanResult : null;
                  const hasEmergencyGrant = activeGrants.some((g) => g.resourceId === resource.id);
                  const isRolePermitted = role.allowedResources.includes(resource.id);

                  const hasPendingRequest = snap.accessRequests?.some(
                    (r) => r.playerId === mePlayer.id && r.resourceId === resource.id && r.status === "pending"
                  );

                  return (
                    <motion.div
                      key={resource.id}
                      layout
                      className={`relative overflow-hidden rounded-2xl border p-4 transition ${
                        resultForThis?.granted
                          ? "border-granted/50 bg-granted/[0.08]"
                          : resultForThis?.granted === false
                          ? "border-denied/50 bg-denied/[0.08]"
                          : "border-white/10 bg-panel hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                              resultForThis?.granted || (isRolePermitted && !isRevoked)
                                ? "bg-cyan-glow/15 text-cyan-glow ring-1 ring-cyan-glow/30"
                                : "bg-white/5 text-ink-dim ring-1 ring-white/10"
                            }`}
                          >
                            <ResourceIcon id={resource.id} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-bold text-white">{resource.name}</h4>
                              <span className="rounded bg-white/10 px-2 py-0.5 text-[0.65rem] font-semibold text-ink-dim">
                                {resource.category}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-ink-dim leading-relaxed">
                              {resource.description}
                            </p>
                          </div>
                        </div>

                        <span className="shrink-0 rounded-lg bg-black/40 px-2.5 py-1 text-[0.65rem] font-bold text-ink-dim ring-1 ring-white/10">
                          Requires L{resource.minLevel}
                        </span>
                      </div>

                      {/* Result callout */}
                      <AnimatePresence>
                        {resultForThis && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className={`mt-3 rounded-xl p-3 text-xs leading-relaxed ${
                              resultForThis.granted
                                ? "bg-granted/20 text-granted ring-1 ring-granted/30"
                                : "bg-denied/20 text-denied ring-1 ring-denied/30"
                            }`}
                          >
                            <div className="flex items-center gap-2 font-bold">
                              {resultForThis.granted ? (
                                <>
                                  <DoorOpen className="h-4 w-4" /> Door Unlocked • Access Granted
                                </>
                              ) : (
                                <>
                                  <DoorClosed className="h-4 w-4" /> Locked • Access Denied
                                </>
                              )}
                            </div>
                            <p className="mt-1 text-xs opacity-90">{resultForThis.reason}</p>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Action Bar */}
                      <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-white/5 pt-3">
                        <button
                          onClick={() => handleSwipeDoor(resource.id)}
                          disabled={isScanning}
                          className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-xs font-bold text-white transition hover:bg-white/15 active:scale-95 disabled:opacity-50"
                        >
                          {isScanning ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verifying…
                            </>
                          ) : (
                            <>
                              <IdCard className="h-3.5 w-3.5 text-cyan-glow" /> Tap Badge to Enter
                            </>
                          )}
                        </button>

                        {!isRolePermitted && !hasEmergencyGrant && (
                          hasPendingRequest ? (
                            <span className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-300 ring-1 ring-amber-500/25">
                              <Hourglass className="h-3.5 w-3.5 animate-spin" /> Request Pending
                            </span>
                          ) : (
                            <button
                              onClick={() => {
                                setEmergencyModalResource(resource.id);
                                setEmergencyReason("");
                              }}
                              className="flex items-center gap-1.5 rounded-xl bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-amber-300 ring-1 ring-amber-500/30 hover:bg-amber-500/25 transition"
                            >
                              <Key className="h-3.5 w-3.5" /> Request Door Key
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
          <div className="mt-4 space-y-4">
            <RoundTrack current={snap.currentRound || 0} total={snap.totalRounds} />

            {/* Lobby */}
            {snap.status === "waiting" && (
              <Panel className="p-6 text-center" glow>
                <motion.div
                  animate={{ scale: [1, 1.03, 1] }}
                  transition={{ duration: 2.4, repeat: Infinity }}
                  className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-cyan-glow/10 ring-1 ring-cyan-glow/30"
                >
                  <Radio className="h-7 w-7 text-cyan-glow" />
                </motion.div>
                <h1 className="mt-5 text-2xl font-black tracking-tight">You&apos;re in the lobby</h1>
                <p className="mt-2 text-sm leading-relaxed text-ink-dim">
                  Keep this page open. The governance scenario will appear here for everyone when the host opens the round.
                </p>
                <div className="mt-6 flex items-center justify-center gap-6">
                  <Stat icon={<Users className="h-4 w-4" />} value={snap.players.length} label="players" />
                  <Stat icon={<Radio className="h-4 w-4" />} value={snap.totalRounds} label="scenarios" />
                </div>
              </Panel>
            )}

            {/* Waiting between rounds */}
            {snap.status === "revealing" && revealed && (
              <Panel className="flex items-center gap-3 px-4 py-3">
                <Hourglass className="h-4 w-4 shrink-0 text-ink-faint" />
                <p className="text-sm text-ink-dim">
                  Next scenario begins when the host advances.
                </p>
              </Panel>
            )}

            {/* Scenario */}
            {snap.scenario && snap.status !== "waiting" && (
              <>
                <Panel className="p-5" glow={snap.status === "active"}>
                  <ScenarioCard snapshot={snap} />
                </Panel>

                {/* Decision */}
                <Panel className="p-5">
                  {revealed ? (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="label">Your decision</span>
                        {myVote ? (
                          <span
                            className={`rounded-lg px-3 py-1 text-sm font-bold tracking-wider ${
                              myVote.decision === "APPROVE"
                                ? "bg-granted/12 text-granted ring-1 ring-granted/25"
                                : "bg-denied/12 text-denied ring-1 ring-denied/25"
                            }`}
                          >
                            {myVote.decision}
                          </span>
                        ) : (
                          <span className="text-sm text-ink-faint">No answer</span>
                        )}
                      </div>
                      <div className="flex justify-center py-1">
                        {myVote?.points !== null && myVote?.points !== undefined ? (
                          <PointsBadge points={myVote.points} />
                        ) : (
                          <span className="text-sm text-ink-faint">No points this round</span>
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
                      <CheckCircle2 className="mx-auto h-12 w-12 text-granted" />
                      <p className="mt-3 text-lg font-bold">Decision locked in</p>
                      <p className="mt-1 text-sm text-ink-dim">
                        You voted <span className="font-bold text-ink">{effectiveVote.decision}</span>. The host will reveal results shortly.
                      </p>
                    </motion.div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="label">Your evaluation</span>
                        {msLeft !== null && (
                          <span className="tabular text-sm font-bold text-warn">
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
                        <p className="text-center text-sm text-ink-faint">
                          Hold on — voting opens in a moment.
                        </p>
                      )}
                      {snap.status === "paused" && (
                        <p className="text-center text-sm font-bold uppercase tracking-widest text-warn">
                          Host paused the round
                        </p>
                      )}
                      {(submitting || pending) && (
                        <p className="flex items-center justify-center gap-2 text-xs text-ink-faint">
                          <Send className="h-3 w-3 animate-pulse" /> recording…
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
              <Panel className="p-5">
                <SectionTitle>Live room voting</SectionTitle>
                <VoteBars snapshot={snap} />
              </Panel>
            )}

            {/* Leaderboard */}
            <Panel className="p-5">
              <SectionTitle icon={<Trophy className="h-3.5 w-3.5" />}>Leaderboard</SectionTitle>
              <Leaderboard players={snap.leaderboard} limit={8} highlightId={snap.me?.id ?? null} />
            </Panel>
          </div>
        )}

        {/* Emergency Elevation Modal */}
        <AnimatePresence>
          {emergencyModalResource && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.94 }}
                className="w-full max-w-md rounded-2xl border border-white/15 bg-neutral-900 p-6 shadow-2xl"
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-500/20 text-amber-400">
                    <ShieldAlert className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">Request Door Key</h3>
                    <p className="text-xs text-ink-dim">
                      Room: {CAMPUS_RESOURCES.find((r) => r.id === emergencyModalResource)?.name}
                    </p>
                  </div>
                </div>

                <p className="mt-3 text-xs leading-relaxed text-ink-dim">
                  Your current role ({role.name}) does not have standard clearance for this room. Send a quick note to the host to request a 60-second access key.
                </p>

                <div className="mt-4">
                  <label className="text-[0.7rem] font-bold uppercase tracking-wider text-ink-faint">
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
                        className={`rounded-xl p-2.5 text-left transition ${
                          emergencyReason === reason
                            ? "bg-cyan-glow/20 text-cyan-glow ring-1 ring-cyan-glow/40"
                            : "bg-white/5 text-ink-dim hover:bg-white/10"
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
                    className="mt-3 w-full rounded-xl bg-black/50 px-3.5 py-2.5 text-xs text-white placeholder-ink-faint ring-1 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-glow"
                  />
                </div>

                <div className="mt-5 flex items-center justify-end gap-2.5">
                  <button
                    onClick={() => setEmergencyModalResource(null)}
                    disabled={submittingEmergency}
                    className="rounded-xl px-4 py-2 text-xs font-semibold text-ink-dim hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitEmergencyRequest}
                    disabled={submittingEmergency}
                    className="flex items-center gap-1.5 rounded-xl bg-cyan-glow/20 px-5 py-2 text-xs font-bold uppercase tracking-wider text-cyan-glow ring-1 ring-cyan-glow/40 hover:bg-cyan-glow/30 active:scale-95 transition"
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
          className="mx-auto mt-8 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-faint transition hover:text-denied"
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
      <div className="flex items-center justify-center gap-1.5 text-ink-dim">
        {icon}
        <span className="tabular text-2xl font-black text-ink">{value}</span>
      </div>
      <p className="label mt-0.5">{label}</p>
    </div>
  );
}
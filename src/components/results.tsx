"use client";

import { motion } from "framer-motion";
import { Download, Medal, MonitorUp, Trophy } from "lucide-react";

import { Confetti, Leaderboard, RevealPanel } from "@/components/game";
import { Panel, SectionTitle, StatusPill } from "@/components/ui";
import { useRoom } from "@/lib/client/useRoom";
import type { RoomSnapshot } from "@/lib/types";

/**
 * Final results. Public by design — a room code plus a live session is
 * not sensitive, and the host frequently wants to share the leaderboard.
 * Nothing here is ever shown before the host reveals the corresponding
 * round, so a shared link cannot leak the answer key early.
 */
export function ResultsView({ initial }: { initial: RoomSnapshot }) {
  const { snapshot } = useRoom(initial.code, initial);
  const snap = snapshot ?? initial;
  const finished = snap.status === "finished";
  const winner = snap.leaderboard[0];
  const runnerUp = snap.leaderboard[1];
  const third = snap.leaderboard[2];

  function exportCsv() {
    const rows = [
      ["Rank", "Nickname", "Score", "Connected"],
      ...snap.leaderboard.map((p, i) => [
        String(i + 1),
        p.nickname,
        String(p.score),
        p.isConnected ? "yes" : "no",
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campuslock-${snap.code}-results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Confetti run={finished} />
      <main className="relative z-10 mx-auto max-w-5xl px-5 pb-20 pt-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="label">Room {snap.code}</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">
              {finished ? "Final results" : "Results so far"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill status={snap.status} />
            <a
              href={`/screen/${snap.code}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet/12 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-violet ring-1 ring-violet/30 transition hover:bg-violet/20"
            >
              <MonitorUp className="h-3.5 w-3.5" />
              Projector
            </a>
            <button
              onClick={exportCsv}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-ink-dim ring-1 ring-white/10 transition hover:bg-white/10"
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </button>
          </div>
        </header>

        {winner && (
          <Panel className="mt-6 p-6 sm:p-8" glow>
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <motion.span
                  initial={{ scale: 0.6, rotate: -12 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 160, damping: 12 }}
                  className="grid h-16 w-16 place-items-center rounded-2xl bg-warn/15 ring-1 ring-warn/35"
                >
                  <Trophy className="h-8 w-8 text-warn" />
                </motion.span>
                <div>
                  <p className="label">Top decision-maker</p>
                  <p className="text-3xl font-black tracking-tight">{winner.nickname}</p>
                  <p className="tabular text-sm font-bold text-cyan-glow">{winner.score} points</p>
                </div>
              </div>

              <div className="flex gap-3">
                <PodiumSpot rank={2} player={runnerUp} />
                <PodiumSpot rank={3} player={third} />
              </div>
            </div>
          </Panel>
        )}

        <div className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_1fr]">
          <Panel className="p-6">
            <SectionTitle icon={<Trophy className="h-3.5 w-3.5" />}>
              Full leaderboard · {snap.players.length} players
            </SectionTitle>
            <Leaderboard players={snap.leaderboard} highlightId={snap.me?.id ?? null} />
          </Panel>

          <Panel className="p-6">
            <SectionTitle icon={<Medal className="h-3.5 w-3.5" />}>
              Last reveal · round {snap.round?.roundIndex ?? "—"}
            </SectionTitle>
            {snap.round?.reveal ? (
              <RevealPanel reveal={snap.round.reveal} />
            ) : (
              <p className="py-8 text-center text-sm text-ink-faint">
                The final answer has not been revealed yet.
              </p>
            )}
          </Panel>
        </div>

        <p className="mt-8 text-center text-xs leading-relaxed text-ink-faint">
          Scoring: 100 points for a correct decision, plus up to 50 bonus points scaled by how early
          you answered. Incorrect answers score zero. Ties break by earliest join.
        </p>
      </main>
    </>
  );
}

function PodiumSpot({ rank, player }: { rank: number; player?: RoomSnapshot["leaderboard"][0] }) {
  return (
    <div className="min-w-[7rem] rounded-2xl bg-white/[0.04] px-4 py-3 text-center ring-1 ring-white/10">
      <p className="label">#{rank}</p>
      <p className="mt-0.5 truncate text-sm font-bold">{player?.nickname ?? "—"}</p>
      <p className="tabular text-sm font-bold text-ink-faint">{player?.score ?? 0}</p>
    </div>
  );
}
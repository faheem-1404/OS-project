"use client";

import { motion } from "framer-motion";
import { Download, Medal, MonitorUp, Trophy } from "lucide-react";

import { Confetti, Leaderboard, RevealPanel } from "@/components/game";
import { Panel, SectionTitle, StatusPill } from "@/components/ui";
import { useRoom } from "@/lib/client/useRoom";
import type { RoomSnapshot } from "@/lib/types";

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
        <header className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div>
            <p className="text-[0.68rem] font-bold uppercase tracking-wider text-slate-500">Room {snap.code}</p>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {finished ? "Final Results & Leaderboard" : "Results So Far"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill status={snap.status} />
            <a
              href={`/screen/${snap.code}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 px-3.5 py-2 text-xs font-bold text-indigo-700 border border-indigo-200 transition hover:bg-indigo-100 shadow-xs"
            >
              <MonitorUp className="h-3.5 w-3.5" />
              Projector
            </a>
            <button
              onClick={exportCsv}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-slate-700 border border-slate-200 transition hover:bg-slate-50 shadow-xs"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          </div>
        </header>

        {winner && (
          <Panel className="mt-6 p-6 sm:p-8 bg-white border border-slate-200 shadow-sm" glow>
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <motion.span
                  initial={{ scale: 0.6, rotate: -12 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 160, damping: 12 }}
                  className="grid h-16 w-16 place-items-center rounded-2xl bg-amber-100 border border-amber-200 text-amber-600 shadow-xs"
                >
                  <Trophy className="h-8 w-8 text-amber-600" />
                </motion.span>
                <div>
                  <p className="text-[0.68rem] font-bold uppercase tracking-wider text-amber-700">1st Place Decision Maker</p>
                  <p className="text-3xl font-bold tracking-tight text-slate-900">{winner.nickname}</p>
                  <p className="tabular text-sm font-bold text-blue-600">{winner.score} points</p>
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
          <Panel className="p-6 bg-white border border-slate-200 shadow-sm">
            <SectionTitle icon={<Trophy className="h-3.5 w-3.5 text-amber-500" />}>
              Full Leaderboard · {snap.players.length} Participants
            </SectionTitle>
            <Leaderboard players={snap.leaderboard} highlightId={snap.me?.id ?? null} />
          </Panel>

          <Panel className="p-6 bg-white border border-slate-200 shadow-sm">
            <SectionTitle icon={<Medal className="h-3.5 w-3.5 text-blue-600" />}>
              Latest Round Breakdown · Round {snap.round?.roundIndex ?? "—"}
            </SectionTitle>
            {snap.round?.reveal ? (
              <RevealPanel reveal={snap.round.reveal} />
            ) : (
              <p className="py-8 text-center text-sm text-slate-400">
                The round answer has not been revealed yet.
              </p>
            )}
          </Panel>
        </div>

        <p className="mt-8 text-center text-xs leading-relaxed text-slate-500">
          Scoring: 100 points for a correct RBAC decision, plus up to 50 bonus points scaled by speed.
          Incorrect decisions score zero.
        </p>
      </main>
    </>
  );
}

function PodiumSpot({ rank, player }: { rank: number; player?: RoomSnapshot["leaderboard"][0] }) {
  return (
    <div className="min-w-[7.5rem] rounded-2xl bg-slate-50 px-4 py-3 text-center border border-slate-200 shadow-xs">
      <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">#{rank}</p>
      <p className="mt-0.5 truncate text-sm font-bold text-slate-900">{player?.nickname ?? "—"}</p>
      <p className="tabular text-sm font-bold text-blue-600">{player?.score ?? 0} pts</p>
    </div>
  );
}
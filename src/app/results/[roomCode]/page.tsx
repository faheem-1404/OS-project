import { Ambient, Logo, Panel } from "@/components/ui";
import { ResultsView } from "@/components/results";
import { store } from "@/lib/server/store";
import { readPlayerToken } from "@/lib/server/session";
import { connection } from "next/server";

// These routes read request-time state (cookies / live room data), so they
// are rendered per request rather than prerendered at build time.
export const instant = false;

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  // Mark this route request-time: the snapshot contains live server clock
  // values that must never be prerendered.
  await connection();

  const { roomCode } = await params;
  const code = roomCode.toUpperCase();
  await readPlayerToken(code);
  const snapshot = await store().snapshot(code);

  if (!snapshot) {
    return (
      <>
        <Ambient />
        <main className="relative z-10 mx-auto max-w-lg px-5 py-24 text-center">
          <Logo className="justify-center" />
          <Panel className="mt-8 p-8">
            <h1 className="text-2xl font-bold">Room not found</h1>
            <p className="mt-2 text-sm text-ink-dim">This session never existed or has expired.</p>
          </Panel>
        </main>
      </>
    );
  }

  return (
    <>
      <Ambient />
      <ResultsView initial={snapshot} />
    </>
  );
}
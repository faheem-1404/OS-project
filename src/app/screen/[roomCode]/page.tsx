import { Ambient, Logo, Panel } from "@/components/ui";
import { ProjectorScreen } from "@/components/projector";
import { store } from "@/lib/server/store";
import { readPlayerToken } from "@/lib/server/session";
import { connection } from "next/server";

// These routes read request-time state (cookies / live room data), so they
// are rendered per request rather than prerendered at build time.
export const dynamic = "force-dynamic";

export default async function ScreenPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  // Mark this route request-time: the snapshot contains live server clock
  // values that must never be prerendered.
  await connection();

  const { roomCode } = await params;
  const code = roomCode.toUpperCase();
  // Reading the session keeps this route request-time (and lets us
  // highlight the viewer if a player happens to have this tab open).
  await readPlayerToken(code);
  const snapshot = await store().snapshot(code);

  if (!snapshot) {
    return (
      <>
        <Ambient />
        <main className="relative z-10 grid min-h-dvh place-items-center">
          <Panel className="p-10 text-center">
            <Logo className="mx-auto mb-6 justify-center" />
            <h1 className="text-3xl font-black">Room not found</h1>
            <p className="mt-2 text-ink-dim">Open the host console and start a session first.</p>
          </Panel>
        </main>
      </>
    );
  }

  return (
    <>
      <Ambient />
      <ProjectorScreen initial={snapshot} />
    </>
  );
}
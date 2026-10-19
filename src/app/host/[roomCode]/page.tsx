import Link from "next/link";
import { headers } from "next/headers";
import { connection } from "next/server";

import { QrCode } from "@/components/qr-code";
import { HostConsole } from "@/components/host-console";
import { Ambient, Logo, Panel } from "@/components/ui";
import { readHostToken } from "@/lib/server/session";
import { store } from "@/lib/server/store";

// These routes read request-time state (cookies / live room data), so they
// are rendered per request rather than prerendered at build time.
export const instant = false;

export default async function HostRoomPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  // Mark this route request-time: the snapshot contains live server clock
  // values that must never be prerendered.
  await connection();

  const { roomCode } = await params;
  const code = roomCode.toUpperCase();
  const s = store();

  const hostToken = await readHostToken(code);
  const authorized = hostToken ? await s.isHost(code, hostToken) : false;

  const snapshot = await s.snapshot(code);
  if (!snapshot) {
    return (
      <>
        <Ambient />
        <main className="relative z-10 mx-auto max-w-lg px-5 py-24 text-center">
          <Logo className="justify-center" />
          <Panel className="mt-8 p-8">
            <h1 className="text-2xl font-bold">Room not found</h1>
            <p className="mt-2 text-sm text-ink-dim">
              This code does not exist or the session expired. Rooms are cleared automatically six
              hours after creation.
            </p>
            <Link
              href="/host"
              className="mt-6 inline-block rounded-xl bg-cyan-glow px-6 py-3 font-bold text-void"
            >
              Create a new room
            </Link>
          </Panel>
        </main>
      </>
    );
  }

  if (!authorized) {
    return (
      <>
        <Ambient />
        <main className="relative z-10 mx-auto max-w-lg px-5 py-24 text-center">
          <Logo className="justify-center" />
          <Panel className="mt-8 p-8">
            <h1 className="text-2xl font-bold">Host session required</h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-dim">
              Room <span className="mono font-bold text-cyan-glow">{code}</span> exists, but this
              browser is not authorised to control it. Knowing the room code is deliberately not
              enough.
            </p>
            <Link
              href="/host"
              className="mt-6 inline-block rounded-xl bg-cyan-glow px-6 py-3 font-bold text-void"
            >
              Enter host passphrase
            </Link>
            <Link
              href={`/play/${code}`}
              className="mt-3 block text-sm font-semibold text-ink-dim hover:text-ink"
            >
              Join as a player instead
            </Link>
          </Panel>
        </main>
      </>
    );
  }

  const headerList = await headers();
  const hostHeader = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  const detectedBase = hostHeader ? `${proto}://${hostHeader}` : null;

  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    detectedBase ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const joinUrl = `${base}/join?room=${code}`;

  return (
    <>
      <Ambient />
      <HostConsole
        initial={snapshot}
        joinUrl={joinUrl}
        qr={<QrCode value={joinUrl} size={168} />}
        screenUrl={`${base}/screen/${code}`}
        playUrl={`${base}/play/${code}`}
      />
    </>
  );
}

export function generateMetadata() {
  return { robots: { index: false, follow: false } };
}


import { JoinForm } from "@/components/join-form";
import { store } from "@/lib/server/store";

// These routes read request-time state (cookies / live room data), so they
// are rendered per request rather than prerendered at build time.
export const dynamic = "force-dynamic";

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string }>;
}) {
  const { room } = await searchParams;
  const initialCode = (room ?? "").toUpperCase().slice(0, 6);
  let initialRoom = null;
  if (initialCode.length >= 4) {
    try {
      initialRoom = await store().snapshot(initialCode);
    } catch {
      initialRoom = null;
    }
  }
  return <JoinForm initialCode={initialCode} initialRoom={initialRoom} />;
}
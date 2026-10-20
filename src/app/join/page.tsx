import { JoinForm } from "@/components/join-form";

// These routes read request-time state (cookies / live room data), so they
// are rendered per request rather than prerendered at build time.
export const dynamic = "force-dynamic";

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string }>;
}) {
  const { room } = await searchParams;
  return <JoinForm initialCode={(room ?? "").toUpperCase().slice(0, 6)} />;
}
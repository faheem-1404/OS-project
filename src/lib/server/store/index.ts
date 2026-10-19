import "server-only";

import { LocalStore } from "./local-store";
import { SupabaseStore } from "./supabase-store";
import type { GameStore } from "./types";

/**
 * CampusLock runs against Supabase when service-role credentials are
 * present, and falls back to a process-local store (with an SSE bus)
 * otherwise. Both satisfy the same contract, so the app is fully
 * playable for local development, demos and automated tests without any
 * cloud project — and fully durable once Supabase is configured.
 */
function create(): GameStore {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key && !key.includes("your-")) {
    try {
      return new SupabaseStore(url, key);
    } catch (error) {
      console.error("[campuslock] Supabase init failed, using local store:", error);
    }
  }
  return new LocalStore();
}

const g = globalThis as unknown as { __campuslock_store?: GameStore };

export function store(): GameStore {
  if (!g.__campuslock_store) g.__campuslock_store = create();
  return g.__campuslock_store;
}

export function usingSupabase(): boolean {
  return store().transport === "supabase";
}

export { LocalStore, SupabaseStore };
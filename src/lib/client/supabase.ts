"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * Browser Supabase client. Uses ONLY the anon key. The service-role key
 * never leaves the server, and RLS keeps the anon key read-only over the
 * game tables (see supabase/migrations/0001_init.sql).
 *
 * Realtime is used purely as an invalidation signal: any change triggers
 * a re-fetch of the server projection, so there is exactly one place
 * that knows how to build a RoomSnapshot.
 */
export function browserSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || key.includes("your-")) return null;
  if (!cached) {
    cached = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
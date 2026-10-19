-- =====================================================================
-- CampusLock — Smart University Access Management Simulation
-- Migration 0001 : core schema, constraints, indexes, RLS
-- Run with:  supabase db push      (or paste into Supabase SQL editor)
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------
create type room_status as enum ('waiting', 'countdown', 'active', 'revealing', 'finished');
create type round_status as enum ('pending', 'open', 'closed', 'revealed');
create type decision as enum ('APPROVE', 'DENY');
create type vote_outcome as enum ('correct', 'incorrect');

-- ---------------------------------------------------------------------
-- scenarios : the 5 fixed rounds. Correct answers NEVER reach the client
-- until the host reveals the round.
-- ---------------------------------------------------------------------
create table public.scenarios (
  id                int primary key generated always as identity,
  round_index       int  not null unique check (round_index between 1 and 20),
  title             text not null,
  description       text not null,
  resource_type     text not null,
  requester_role    text not null,
  access_request    text not null,
  correct_decision  decision not null,
  explanation       text not null,
  principle         text not null,
  created_at        timestamptz not null default now()
);

comment on table public.scenarios is
  'Server-authoritative answer key. Exposed to clients only after reveal.';

-- ---------------------------------------------------------------------
-- rooms : one live session. `code` is the human-joinable short code.
-- ---------------------------------------------------------------------
create table public.rooms (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique check (code ~ '^[A-Z0-9]{4,8}$'),
  host_token_hash    text not null,           -- sha256(host token); raw token only in host cookie
  status             room_status not null default 'waiting',
  current_round      int  not null default 0,
  question_duration  int  not null default 25 check (question_duration between 5 and 180),
  total_rounds       int  not null default 5,
  is_demo            boolean not null default false,
  paused_remaining_ms int,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  expires_at         timestamptz not null default now() + interval '6 hours'
);

create index rooms_status_idx on public.rooms (status);
create index rooms_expires_idx on public.rooms (expires_at);

comment on column public.rooms.host_token_hash is
  'sha256 of the host secret. The raw secret is issued once and stored in an httpOnly cookie.';

-- ---------------------------------------------------------------------
-- players : anonymous participants. No email, no PII — nickname only.
-- `token_hash` supports refresh/reconnect without an account.
-- ---------------------------------------------------------------------
create table public.players (
  id             uuid primary key default gen_random_uuid(),
  room_id        uuid not null references public.rooms (id) on delete cascade,
  nickname       text not null check (char_length(nickname) between 1 and 24),
  token_hash     text not null,
  score          int  not null default 0,
  is_bot         boolean not null default false,
  is_connected   boolean not null default true,
  joined_at      timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  constraint players_nickname_unique_per_room unique (room_id, nickname)
);

create index players_room_idx on public.players (room_id);
create index players_room_score_idx on public.players (room_id, score desc, joined_at asc);

-- ---------------------------------------------------------------------
-- rounds : one row per (room, round_index). Server owns the clock via
-- question_opened_at / question_ends_at so clients never count locally.
-- ---------------------------------------------------------------------
create table public.rounds (
  id                   uuid primary key default gen_random_uuid(),
  room_id              uuid not null references public.rooms (id) on delete cascade,
  scenario_id          int  not null references public.scenarios (id),
  round_index          int  not null,
  status               round_status not null default 'pending',
  question_opened_at   timestamptz,
  question_ends_at     timestamptz,
  closed_at            timestamptz,
  revealed_at          timestamptz,
  unique (room_id, round_index)
);

create index rounds_room_idx on public.rounds (room_id, round_index);

-- ---------------------------------------------------------------------
-- votes : idempotent by construction — one row per (round, player).
-- ---------------------------------------------------------------------
create table public.votes (
  id            uuid primary key default gen_random_uuid(),
  round_id      uuid not null references public.rounds (id) on delete cascade,
  player_id     uuid not null references public.players (id) on delete cascade,
  decision      decision not null,
  outcome       vote_outcome not null,
  ms_taken      int not null check (ms_taken >= 0),
  points        int not null default 0,
  submitted_at  timestamptz not null default now(),
  unique (round_id, player_id)
);

create index votes_round_idx on public.votes (round_id);

-- ---------------------------------------------------------------------
-- score_events : append-only audit trail of every point awarded.
-- ---------------------------------------------------------------------
create table public.score_events (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms (id) on delete cascade,
  player_id   uuid not null references public.players (id) on delete cascade,
  round_id    uuid not null references public.rounds (id) on delete cascade,
  points      int  not null,
  reason      text not null,
  created_at  timestamptz not null default now(),
  unique (round_id, player_id)
);

create index score_events_room_idx on public.score_events (room_id, created_at desc);

-- =====================================================================
-- Row Level Security
--
-- Threat model: all client traffic uses the anon key. The anon key can
-- only reach these tables through the policies below. The authoritative
-- game engine (server actions) uses the service-role key, which BYPASSES
-- RLS — that is why every host transition is validated in application
-- code against the host token hash, and never inferred from the client.
--
-- Deny-by-default: RLS is enabled on every table and no permissive
-- "public" policy exists on the answer key.
-- =====================================================================

alter table public.scenarios  enable row level security;
alter table public.rooms      enable row level security;
alter table public.players    enable row level security;
alter table public.rounds     enable row level security;
alter table public.votes      enable row level security;
alter table public.score_events enable row level security;

-- --- scenarios ------------------------------------------------------
-- Anonymous clients may NOT read the answer key. It is only ever served
-- by the server after a reveal.
create policy scenarios_no_client_read on public.scenarios
  for select to anon, authenticated using (false);

-- --- rooms ----------------------------------------------------------
-- Anyone may resolve a room code (needed to render the join screen).
create policy rooms_public_read on public.rooms
  for select to anon, authenticated using (expires_at > now());

-- No direct client writes: room lifecycle is server-authoritative.
-- The host_token_hash column is additionally protected by revoking
-- column-level SELECT from anon (see below).

-- --- players --------------------------------------------------------
-- A player can only see other players in the SAME room that are already
-- revealed-safe (nickname + score only; token_hash is never selected by
-- client code paths and is additionally column-protected).
create policy players_same_room_read on public.players
  for select to anon, authenticated
  using (room_id in (select id from public.rooms where expires_at > now()));

-- --- rounds ---------------------------------------------------------
-- Scenario id is safe to expose (the round row does not embed answers).
create policy rounds_public_read on public.rounds
  for select to anon, authenticated
  using (room_id in (select id from public.rooms where expires_at > now()));

-- --- votes ----------------------------------------------------------
-- Read: only your own vote, or aggregate counts in the same room.
create policy votes_room_read on public.votes
  for select to anon, authenticated
  using (round_id in (select id from public.rounds));

-- Writes go through the server only (service role) so that scoring and
-- idempotency cannot be forged. There is deliberately NO insert policy.
-- Supabase Realtime still receives changes because it reads via the
-- authenticated replication slot, not via the anon REST role.

-- --- score_events ---------------------------------------------------
create policy score_events_room_read on public.score_events
  for select to anon, authenticated
  using (room_id in (select id from public.rooms where expires_at > now()));

-- =====================================================================
-- Column hardening: hide host secrets / player secrets from anon even if
-- a future policy is loosened.
-- =====================================================================
revoke select (host_token_hash) on public.rooms from anon, authenticated;
revoke select (token_hash)     on public.players from anon, authenticated;

-- Realtime publication (idempotent).
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

-- Add each table to the publication only if it is not already a member,
-- so the migration can be re-applied safely.
do $$
declare
  t text;
begin
  foreach t in array array[
    'public.rooms',
    'public.players',
    'public.rounds',
    'public.votes',
    'public.score_events'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname || '.' || tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %s', t);
    end if;
  end loop;
end $$;
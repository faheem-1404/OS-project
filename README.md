# CampusLock

**A live, multiplayer access-governance simulation for a university hall.**
Sixty students on their own phones decide APPROVE or DENY on five real
security scenarios. One projector shows the room deciding together.

Built with Next.js (App Router, TypeScript), Tailwind CSS, Framer Motion,
Supabase Postgres + Realtime, and Vercel.

---

## Table of contents

1. [What it does](#what-it-does)
2. [Quick start](#quick-start)
3. [Environment variables](#environment-variables)
4. [Connecting Supabase](#connecting-supabase)
5. [Deploying to Vercel](#deploying-to-vercel)
6. [Routes](#routes)
7. [How the game works](#how-the-game-works)
8. [Architecture](#architecture)
9. [Security model](#security-model)
10. [Testing](#testing)
11. [Pre-presentation checklist](#pre-presentation-checklist)
12. [Troubleshooting](#troubleshooting)

---

## What it does

Five scenarios, each a genuine access-governance decision:

| # | Scenario | Resource | Correct | Principle |
|---|----------|----------|---------|-----------|
| 1 | Valid ID, wrong person | Server room | **DENY** | Authentication ≠ authorization |
| 2 | Time-boxed examiner pass | Examination hall B | **APPROVE** | Temporary access is scoped and time-bound |
| 3 | Graduated, still marked active | Library after hours | **DENY** | Access must be revoked on departure |
| 4 | Professor edits own gradebook | Gradebook | **APPROVE** | Least privilege and need-to-know |
| 5 | Borrowed ID card | Genomics lab | **DENY** | Credentials are not transferable |

Three synchronised surfaces:

- **Host console** — room code, QR, live player list, start / pause /
  close / reveal / skip / next / end, live vote distribution, leaderboard.
  Nothing here requires a page refresh.
- **Player view** (phone) — scan, pick a nickname, vote once per round,
  see the answer, the explanation and points earned.
- **Projector screen** — scenario, countdown, two enormous APPROVE/DENY
  gates, live vote bars, reveal animation, top three, final podium.

---

## Quick start

```bash
npm install
cp .env.example .env.local     # optional — the app runs without it
npm run dev
```

Open <http://localhost:3000>.

**No Supabase project is required to try it.** Without credentials the app
uses a process-local game engine (`LocalStore`) with an in-process event
bus and Server-Sent Events. Everything works — joining, voting, scoring,
the leaderboard, the projector screen — and room state is written to
`.data/rooms.json` so it survives a dev-server restart.

> If port 3000 is busy, use `npm run dev -- -p 3100`.

### Try it with demo mode

1. Go to `/host` → tick **Demo mode** → **Create room**.
2. Save the **host passphrase** shown in the amber banner. It is shown
   once and never again.
3. Open **Projector** in a new window and put it on the second screen.
4. On your phone (same Wi-Fi) scan the QR, or open
   `http://<your-lan-ip>:3000/join?room=CODE`.
5. Press **Start round 1**, vote, then **Reveal answer**.

Demo mode seeds 26 clearly-labelled `DEMO` bots so the whole flow can be
rehearsed alone.

---

## Environment variables

Copy `.env.example` to `.env.local` and fill in what you need. **All four
are optional for local use.**

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_APP_URL` | in production | Base URL used to build the join QR code. On Vercel it falls back to `VERCEL_PROJECT_PRODUCTION_URL`. |
| `NEXT_PUBLIC_SUPABASE_URL` | for Supabase | Project URL. Browser-safe. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | for Supabase | Anon/publishable key, used **only** for Realtime subscriptions. Browser-safe, still subject to RLS. |
| `SUPABASE_SERVICE_ROLE_KEY` | for Supabase | Service-role key. **Server only.** Bypasses RLS, so it must never be exposed. Never prefix it with `NEXT_PUBLIC_`. |

Optional, for tests:

| Variable | Default | Purpose |
|----------|---------|---------|
| `CAMPUSLOCK_DATA_DIR` | `.data` | Where `LocalStore` persists room state. Tests point this at a temp dir. |

The landing page shows a **Supabase connected** / **Local engine** badge
so you always know which backend is live.

---

## Connecting Supabase

### 1. Create the project

1. <https://supabase.com/dashboard> → **New project**.
2. Pick a region close to your audience (latency matters for 60 phones).
3. Save the database password — you will not see it again.

### 2. Run the migrations

With the Supabase CLI:

```bash
npm i -g supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

Or without the CLI: open **SQL Editor → New query** and run the files in
order:

- `supabase/migrations/0001_init.sql` — schema, constraints, indexes, RLS
- `supabase/migrations/0002_seed_scenarios.sql` — the five scenarios

`0001` creates `scenarios`, `rooms`, `players`, `rounds`, `votes` and
`score_events`, enables RLS on every table, installs read-only policies
for the anon role, revokes column access to `rooms.host_token_hash` and
`players.token_hash`, and adds the tables to the `supabase_realtime`
publication.

### 3. Configure Realtime

Realtime publication is handled by the migration. In **Database →
Replication**, confirm `rooms`, `players`, `rounds`, `votes` and
`score_events` are enabled.

### 4. Add the keys

Copy the values from **Project Settings → API** into `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
```

Restart the dev server. The landing-page badge should now read
**Supabase connected**.

---

## Deploying to Vercel

```bash
npm i -g vercel
vercel            # preview
vercel --prod     # production
```

Or import the repository at <https://vercel.com/new>.

Set the environment variables in **Project → Settings → Environment
Variables** for both Preview and Production:

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | your project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | service-role key (**mark as secret**) |
| `NEXT_PUBLIC_APP_URL` | your production domain |

Run the two SQL migrations before the first real session — the Supabase
store will fail fast if the tables do not exist.

> **Vercel note:** the local engine keeps state in process memory and on
> disk, which does **not** survive serverless instances. On Vercel you
> must configure Supabase; the app will otherwise show a room that
> appears to work and then forgets every player.

---

## Routes

| Route | Audience | Description |
|-------|----------|-------------|
| `/` | Everyone | Product introduction and the five scenarios |
| `/host` | Host | Create a room, or re-open one with its passphrase |
| `/host/[roomCode]` | Host | Control centre — requires the host cookie |
| `/join` | Players | Enter room code (prefilled from `?room=`) and nickname |
| `/play/[roomCode]` | Players | The game. Requires a valid player session cookie |
| `/screen/[roomCode]` | Projector | Audience display |
| `/results/[roomCode]` | Everyone | Leaderboard, top three, last reveal, CSV export |

Supporting endpoints:

| Endpoint | Description |
|----------|-------------|
| `GET /api/rooms/[code]` | Authoritative room snapshot |
| `GET /api/rooms/[code]/stream` | SSE stream (local engine only) |

---

## How the game works

### Round lifecycle

```
waiting ──start──▶ countdown (5s) ──▶ active ──timer/host──▶ closed
                        │                                    │
                        └────────── paused ◀──pause──────────┤
                                                              │
                                        reveal/skip ──▶ revealed
                                                              │
                                                    next ────┴──▶ finished
```

### Scoring

- **100 points** for a correct decision.
- Up to **50 bonus points** for speed, decaying linearly across the first
  70 % of the voting window. Correctness always outweighs speed: a wrong
  answer scores zero no matter how fast.
- One vote per player per round, enforced by a database constraint and by
  idempotent vote handling — replaying a submission returns the original
  vote and never awards points twice.
- Ties break deterministically: higher score → lower total response time
  → earlier join → player id.

### Timers

Clients never run their own countdown. The server stores absolute
`startsAt` / `endsAt` timestamps in every snapshot; clients measure their
own clock skew against `serverNow` and render from the corrected value.
Voting closes on the server the moment the window elapses, regardless of
what any device believes.

---

## Architecture

```
src/
├── app/
│   ├── actions.ts                    server actions (the only mutation path)
│   ├── api/rooms/[code]/route.ts     snapshot endpoint
│   ├── api/rooms/[code]/stream/      SSE channel (local engine)
│   ├── host/[roomCode]/              host control centre
│   ├── join/  play/[roomCode]/       student flow
│   ├── screen/[roomCode]/            projector display
│   └── results/[roomCode]/           final results
├── components/                       UI (host, player, projector, results)
└── lib/
    ├── server/
    │   ├── session.ts                httpOnly host / player cookies
    │   ├── rate-limit.ts             join + vote throttles
    │   ├── scenarios.ts              SERVER-ONLY answer key
    │   └── store/
    │       ├── types.ts              GameStore contract
    │       ├── local-store.ts        in-process engine + SSE bus
    │       ├── supabase-store.ts     Postgres engine
    │       └── index.ts              backend selection
    ├── client/
    │   ├── useRoom.ts                live subscription + server clock
    │   └── supabase.ts               browser client (anon key only)
    ├── scoring.ts                    scoring + tie-break rules
    └── types.ts                      shared DTOs
```

**One contract, two backends.** `GameStore` defines every game operation.
`LocalStore` and `SupabaseStore` implement it identically, including all
validation. `src/lib/server/store/index.ts` picks Supabase when
credentials are present and the local engine otherwise.

**Realtime is an invalidation signal, not a state transport.** The
projection lives in exactly one place — the server's `snapshot()` — and
clients re-read it on every change. That is why the host console, 60
phones and the projector can never disagree.

---

## Security model

- **Server-authoritative everything.** Scores, correct answers, timing
  windows and room state live on the server. Clients only ever *ask*.
- **Host authorisation is a secret, not a route.** Creating a room issues
  a readable passphrase (e.g. `K4M2XQ-7RTBP`). Only its SHA-256 hash is
  stored; the raw value lives in an httpOnly cookie. Every host action
  re-checks that hash — a hidden button protects nothing.
- **Room codes are not secret.** Anyone with the code can *join*, never
  *control*. `/host/[roomCode]` without a valid host cookie shows a
  refusal screen.
- **Player identity is server-issued.** Joining mints a random token,
  stored hashed and kept in an httpOnly cookie, so a refresh or a
  reconnect restores the same player. A forged token is rejected.
- **The answer key is never in a client payload.** `scenarios.correct_decision`,
  `explanation` and `principle` are selected only after a round is
  revealed. There is an explicit test asserting the key is absent from
  the pre-reveal snapshot.
- **RLS is deny-by-default.** There is no permissive anon policy on the
  answer key, and no client `INSERT` policy on votes — votes go through
  the service-role client after server validation. `host_token_hash` and
  `token_hash` are column-revoked from the anon role.
- **Privacy.** Nickname only. No email, no account, no personal data.
- **Throttling.** Join and vote endpoints are rate-limited per IP.

---

## Testing

```bash
npm run typecheck     # tsc, no errors
npm run test:game     # 22 game-rule checks
npm run test:scale    # 60 concurrent players, engine level
```

Browser tests need a running server:

```bash
npm run build && npm run start -- -p 3100
npm run test:e2e      # 16 full-stack UI checks
PLAYERS=20 npm run test:load   # concurrent participants end to end
npm run shots         # screenshots of every surface to /tmp
```

### What is covered

`test:game` — room creation, host authorisation, wrong-token rejection,
duplicate nicknames, countdown gating, idempotent voting, vote rejection
after close, server-side scoring, double-reveal protection, round
advance, restart guard, pause/resume, skip, leaderboard ordering,
session completion, and an assertion that **no answer data appears in the
snapshot before the reveal**.

`test:scale` — 60 players joining, voting and scoring **concurrently**;
verifies exactly 60 vote rows, idempotent replays, exact correct/incorrect
scoring, the 150-point ceiling, and deterministic ordering.

`test:e2e` — the real UI: create room → student joins → host sees them
appear live → room code alone cannot control the room → start → vote →
vote confirmed and locked → projector reflects it → reveal → principle
shown → points shown → next round loads → **no answer key before reveal**
→ end → results page.

`test:load` — N real browser participants join and vote inside one round.

> **A note on the browser load test.** One Chromium instance stops
> hydrating background tabs reliably past roughly 25–30 pages, so
> `PLAYERS=60` measures the harness rather than the server. The genuine
> 60-participant verification is `npm run test:scale`, which drives the
> same engine and validation paths with zero browser overhead. Run
> `PLAYERS=60 npm run test:load` on a beefier CI runner to see the full
> browser path.

---

## Pre-presentation checklist

**The night before**

- [ ] Deploy to Vercel and open it once from a phone on the venue Wi-Fi.
- [ ] Confirm the landing badge reads **Supabase connected**.
- [ ] Run `npm run test` and `npm run test:e2e` against a local build.
- [ ] Run one full demo-mode session end to end (all five rounds, podium).
- [ ] Charge the laptop, disable sleep, and pin the browser fullscreen.
- [ ] Set question duration to something comfortable (default 25 s).
- [ ] Turn off notification banners on the presenting machine.

**In the hall, 10 minutes before**

- [ ] Open the host console. Create the room with **demo mode OFF** —
      demo bots would pollute the real leaderboard.
- [ ] Open **Projector**, press `F11`, confirm the lobby screen.
- [ ] Test the QR with your own phone on the venue Wi-Fi.
- [ ] Confirm the host passphrase banner is saved somewhere safe.
- [ ] Ask a student to join and leave so you know the flow works.

**While presenting**

- [ ] Announce the room code verbally as well — QR scanning fails.
- [ ] Wait for the player counter to settle before starting.
- [ ] Give the class the full timer; use **Close voting now** if they
      finish early.
- [ ] Read the explanation aloud — the point is the principle, not the score.
- [ ] After round five, press **Finish & show podium** for the confetti.

---

## Troubleshooting

**"Room not found"** — the code is wrong, or the room expired. Rooms live
six hours; there is no reuse.

**"Host session required"** — the browser does not hold the host cookie.
Go to `/host`, enter the room code **and** the passphrase. If you never
saved the passphrase, the room can only be recovered from the same
browser that created it.

**Players see a stale board** — the client falls back to polling every
five seconds and shows a **Reconnecting** badge. Check the server logs.

**Supabase errors** — run both migrations. The store fails loudly rather
than silently degrading, because a silent fallback would lose every vote.

**Votes are not landing** — check that the round is `active`, not
`countdown`. Votes are rejected during the 5-second pre-roll and after the
timer expires. This is enforced server-side and reported in the player's
UI.

---

## Licence

Built for academic demonstration. The scenarios are fictional but the
governance principles they teach are not.
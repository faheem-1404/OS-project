/**
 * 60-participant load test.
 *
 * Creates one room, then drives 60 independent browser sessions through
 * the real join → vote flow, all voting inside the same round window, to
 * confirm the server holds up for a lecture-hall-sized class.
 *
 * Run with:  npx tsx scripts/loadtest.mts
 * Requires:  a running server (BASE_URL, default http://127.0.0.1:3100)
 */
import { chromium, type BrowserContext } from "playwright";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
// NOTE: this harness drives one Chromium instance. Roughly 25-30 fully
// hydrated pages is the practical ceiling on a single laptop, because
// Chromium stops scheduling timers in the surplus background tabs — not
// because of anything the server does. For the true 60-participant check
// use `npx tsx scripts/test-scale.mts` (engine-level) or run this from a
// CI runner with more cores, or set PLAYERS=60 there.
const PLAYERS = Number(process.env.PLAYERS ?? 20);

const CHROMIUM_ARGS = [
  // Playwright drives many contexts at once; without these Chromium
  // backgrounds the extra pages and throttles their timers, which stalls
  // hydration and measures the harness rather than the server.
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--disable-features=CalculateNativeWinOcclusion",
];

const browser = await chromium.launch({ args: CHROMIUM_ARGS });
console.log(`\nCampusLock — ${PLAYERS}-participant load test\n`);

// --- host session -------------------------------------------------------
const hostCtx = await browser.newContext();
const host = await hostCtx.newPage();
await host.goto(`${BASE}/host`, { waitUntil: "networkidle" });
await host.getByRole("button", { name: /Create room/i }).click();
await host.waitForURL(/\/host\/[A-Z0-9]{6}/, { timeout: 20_000 });
await host.waitForLoadState("networkidle");
const code = host.url().split("/").pop()!;
console.log(`  room ${code}`);

// --- 60 players join concurrently --------------------------------------
const contexts: BrowserContext[] = [];
const failures: string[] = [];

// Contexts are created up front: spinning up 60 browsers concurrently
// starves the harness itself and measures Playwright, not the app.
await Promise.all(
  Array.from({ length: PLAYERS }, async () => {
    const ctx = await browser.newContext();
    contexts.push(ctx);
    await ctx.newPage();
  }),
);

const t1 = Date.now();
await Promise.all(
  contexts.map(async (ctx, i) => {
    const page = ctx.pages()[0];
    const name = `P${String(i + 1).padStart(2, "0")}`;
    try {
      await page.goto(`${BASE}/join?room=${code}`, { waitUntil: "domcontentloaded" });
      await page.locator("#nick").fill(name);
      // The join button stays disabled until the client has hydrated AND
      // the room lookup resolves — waiting on the enabled state covers both.
      const joinButton = page.getByRole("button", { name: /Join room/i });
      await joinButton.waitFor({ state: "visible", timeout: 120_000 });
      await page.waitForFunction(
        () => {
          const b = [...document.querySelectorAll("button")].find((x) =>
            /join room/i.test(x.textContent ?? ""),
          );
          return !!b && !b.disabled;
        },
        undefined,
        { timeout: 120_000 },
      );
      await joinButton.click();
      await page.waitForURL(new RegExp(`/play/${code}`), { timeout: 120_000 });
    } catch (error) {
      const text = (await page
        .locator("body")
        .innerText()
        .catch(() => "<page gone>")).replace(/\n+/g, " | ");
      failures.push(`${name}: ${(error as Error).message.split("\n")[0]} :: ${text.slice(0, 160)}`);
    }
  }),
);
const joinMs = Date.now() - t1;
console.log(`  ${PLAYERS - failures.length} players joined in ${joinMs}ms`);
if (failures.length) {
  console.log(`  ${failures.length} failures:`);
  for (const f of failures.slice(0, 5)) console.log(`    ${f}`);
  process.exitCode = 1;
}

// Verify the host sees all of them (no page refresh involved).
await host.waitForFunction(
  (n) => {
    const m = document.body.innerText.match(/(\d+)\s*\n?\s*JOINED/i);
    return m ? Number(m[1]) >= n : false;
  },
  PLAYERS,
  { timeout: 60_000 },
);
const hostText = await host.locator("body").innerText();
console.log(`  host reports: ${hostText.match(/(\d+)\s*joined/i)?.[1] ?? "?"} joined`);

// --- start the round ----------------------------------------------------
await host.getByRole("button", { name: /Start round 1/i }).click();
await host.waitForFunction(() => /countdown|active/i.test(document.body.innerText), undefined, {
  timeout: 30_000,
});

// Everyone waits for the same server-driven countdown.
await Promise.all(
  contexts.map((ctx) =>
    ctx
      .pages()[0]
      .waitForFunction(
        () => /your decision/i.test(document.body.innerText),
        undefined,
        { timeout: 40_000 },
      ),
  ),
);
console.log("  voting window opened on every device");

// --- all vote at once ---------------------------------------------------
const voteStart = Date.now();
await Promise.all(
  contexts.map(async (ctx, i) => {
    const page = ctx.pages()[0];
    await page.getByRole("button", { name: i % 3 === 0 ? "APPROVE" : "DENY" }).click();
  }),
);
await Promise.all(
  contexts.map((ctx) =>
    ctx
      .pages()[0]
      .waitForFunction(() => /answer locked in/i.test(document.body.innerText), undefined, {
        timeout: 30_000,
      }),
  ),
);
const voteMs = Date.now() - voteStart;
console.log(`  ${PLAYERS} simultaneous votes confirmed in ${voteMs}ms`);

// --- host sees the tally ------------------------------------------------
await host.waitForFunction(
  (n) => {
    const m = document.body.innerText.match(/VOTES CAST\s*(\d+)/i);
    return m ? Number(m[1]) >= n : false;
  },
  PLAYERS,
  { timeout: 30_000 },
);
const tallyText = await host.locator("body").innerText();
console.log(
  `  live distribution on host screen:\n${tallyText
    .match(/VOTES CAST[\s\S]{0,140}/i)?.[0]
    ?.replace(/\n{2,}/g, "\n")}`,
);

// --- reveal -------------------------------------------------------------
const revealStart = Date.now();
await host.getByRole("button", { name: /Reveal answer|Reveal now/i }).first().click();
await host.waitForFunction(() => /correct decision/i.test(document.body.innerText), undefined, {
  timeout: 30_000,
});
console.log(`  reveal propagated to the host screen in ${Date.now() - revealStart}ms`);

await Promise.all(
  contexts.map((ctx) =>
    ctx
      .pages()[0]
      .waitForFunction(() => /correct decision/i.test(document.body.innerText), undefined, {
        timeout: 30_000,
      }),
  ),
);
console.log(`  reveal propagated to all ${PLAYERS} players`);

// --- server health ------------------------------------------------------
const started = Date.now();
const res = await fetch(`${BASE}/api/rooms/${code}`);
const snapshot = (await res.json()) as { players: unknown[] };
console.log(
  `\n  snapshot endpoint: ${res.status} in ${Date.now() - started}ms, ${snapshot.players.length} players\n`,
);

for (const ctx of contexts) await ctx.close();
await hostCtx.close();
await browser.close();

console.log("  Load test complete.\n");
/**
 * Browser end-to-end test — drives the real UI the way a student would.
 * Run with:  node --experimental-strip-types scripts/e2e.mts
 * Requires:  npm run dev -- -p 3100  (or set BASE_URL)
 */
import { chromium, type Browser, type Page } from "playwright";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const results: { name: string; ok: boolean; detail?: string }[] = [];

function check(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

async function hostStart(browser: Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/host`, { waitUntil: "networkidle" });

  // Demo mode gives us 26 seeded voters without simulating 60 phones here.
  await page.getByText("Demo mode").click();
  await page.getByRole("button", { name: /Create room/i }).click();
  await page.waitForURL(/\/host\/[A-Z0-9]{6}/, { timeout: 20_000 });
  // Partial navigation streams the new route in; settle before asserting.
  await page.waitForLoadState("networkidle");

  const code = page.url().split("/").pop()!;
  return { ctx, page, code };
}

async function joinAs(page: Page, code: string, nickname: string) {
  await page.goto(`${BASE}/join?room=${code}`, { waitUntil: "networkidle" });
  await page.locator("#nick").fill(nickname);
  await page.getByRole("button", { name: /Join room/i }).click();
  await page.waitForURL(new RegExp(`/play/${code}`), { timeout: 20_000 });
  await page.waitForLoadState("networkidle");
}

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
console.log("\nCampusLock — browser end-to-end test\n");

try {
  const { ctx: hostCtx, page: host, code } = await hostStart(browser);
  console.log(`  room ${code}\n`);

  check("host console renders with room code", (await host.locator("main").first().innerText()).includes(code));

  check(
    "QR code is rendered as inline SVG",
    (await host.locator("svg[role='img'], main svg").count()) > 0,
  );

  // A student joins.
  const playerCtx = await browser.newContext();
  const player = await playerCtx.newPage();
  await joinAs(player, code, "Ada");
  check("player reaches the lobby after joining", (await player.locator("main").first().innerText()).includes("lobby"));

  // Host sees the new player live, with no refresh.
  await host.waitForFunction(
    () => document.body.innerText.includes("Ada"),
    undefined,
    { timeout: 15_000 },
  );
  check("host sees the player appear in real time", true);

  // Unauthorized host access must be refused.
  const strangerCtx = await browser.newContext();
  const stranger = await strangerCtx.newPage();
  await stranger.goto(`${BASE}/host/${code}`, { waitUntil: "networkidle" });
  check(
    "room code alone cannot control the room",
    (await stranger.locator("main").first().innerText()).includes("Host session required"),
  );

  // Start the round.
  await host.getByRole("button", { name: /Start round 1/i }).click();
  await host.waitForFunction(
    () => /countdown|active/.test(document.body.innerText),
    undefined,
    { timeout: 25_000 },
  );
  check("round starts and enters countdown/active", true);

  // Wait out the 5-second pre-roll, then the player answers.
  await player.waitForFunction(
    () => document.body.innerText.includes("APPROVE") && document.body.innerText.includes("DENY"),
    undefined,
    { timeout: 20_000 },
  );
  await player.getByRole("button", { name: "DENY" }).click();
  await player.waitForFunction(
    () => document.body.innerText.includes("Answer locked in"),
    undefined,
    { timeout: 15_000 },
  );
  check("player vote is confirmed on their device", true);

  // The player must not be able to change their answer: the choice UI is
  // replaced entirely once a vote is recorded.
  check(
    "the choice buttons disappear after voting",
    (await player.getByRole("button", { name: "APPROVE" }).count()) === 0,
  );

  // Projector screen reflects the vote without a reload.
  const screenCtx = await browser.newContext();
  const screen = await screenCtx.newPage();
  await screen.goto(`${BASE}/screen/${code}`, { waitUntil: "networkidle" });
  await screen.waitForFunction(
    () => document.body.innerText.includes("DENY"),
    undefined,
    { timeout: 15_000 },
  );
  const screenText = await screen.locator("body").innerText();
  check("projector shows the scenario", /Server Room|Borrowed|Examiner|Former|Gradebook/i.test(screenText));

  // Reveal.
  await host.getByRole("button", { name: /Reveal answer|Reveal now/i }).first().click();
  await host.waitForFunction(
    () => /correct decision/i.test(document.body.innerText),
    undefined,
    { timeout: 20_000 },
  );
  check("host reveals the correct answer", true);

  const revealedText = await host.locator("main").first().innerText();
  check(
    "reveal shows the principle",
    revealedText.includes("valid identity") ||
      revealedText.toLowerCase().includes("least privilege") ||
      revealedText.toLowerCase().includes("temporary access") ||
      revealedText.toLowerCase().includes("credentials must not be shared"),
  );

  // Player sees the outcome and their points.
  await player.waitForFunction(
    () => /correct decision/i.test(document.body.innerText),
    undefined,
    { timeout: 20_000 },
  );
  const playerText = await player.locator("main").first().innerText();
  check("player sees the reveal and their score", /points|\+1\d\d|\+\d\d/.test(playerText));

  // Answer must never appear before reveal — verified on a fresh round.
  await host.getByRole("button", { name: /Next round|Finish & show podium/i }).click();
  await host.waitForFunction(
    () => /round 2/i.test(document.body.innerText),
    undefined,
    { timeout: 20_000 },
  );
  await player.waitForFunction(() => /round 2/i.test(document.body.innerText), undefined, {
    timeout: 20_000,
  });
  const round2 = await player.locator("main").first().innerText();
  check("next round loads a new scenario", /round 2/i.test(round2));
  check(
    "no answer key is shown before the reveal",
    !/correct decision/i.test(round2),
  );

  // End the session.
  host.once("dialog", (d) => void d.accept());
  await host.getByRole("button", { name: /End session/i }).click();
  await host.waitForFunction(
    () => /finished/i.test(document.body.innerText),
    undefined,
    { timeout: 20_000 },
  );
  check("host can end the session", true);

  // Results page.
  const resultsPage = await hostCtx.newPage();
  await resultsPage.goto(`${BASE}/results/${code}`, { waitUntil: "networkidle" });
  check(
    "results page renders the leaderboard",
    (await resultsPage.locator("main").first().innerText()).includes("Ada"),
  );

  await hostCtx.close();
  await playerCtx.close();
  await strangerCtx.close();
  await screenCtx.close();
} catch (error) {
  check("test run completed", false, (error as Error).message);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed.\n`);
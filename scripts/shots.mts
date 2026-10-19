import { chromium } from "playwright";
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const OUT = process.env.OUT ?? "/tmp/campuslock";
const b = await chromium.launch();

const hostCtx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
const host = await hostCtx.newPage();
await host.goto(`${BASE}/`, { waitUntil: "networkidle" });
await host.screenshot({ path: `${OUT}-landing.png` });

await host.goto(`${BASE}/host`, { waitUntil: "networkidle" });
await host.screenshot({ path: `${OUT}-hostentry.png` });

await host.getByText("Demo mode").click();
await host.getByRole("button", { name: /Create room/i }).click();
await host.waitForURL(/\/host\/[A-Z0-9]{6}/);
await host.waitForLoadState("networkidle");
const code = host.url().split("/").pop()!;

const phone = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const p1 = await phone.newPage();
await p1.goto(`${BASE}/join?room=${code}`, { waitUntil: "networkidle" });
await p1.screenshot({ path: `${OUT}-join.png` });
await p1.locator("#nick").fill("Ada");
await p1.getByRole("button", { name: /Join room/i }).click();
await p1.waitForURL(new RegExp(`/play/${code}`));
await p1.screenshot({ path: `${OUT}-lobby.png` });

const proj = await b.newContext({ viewport: { width: 1920, height: 1080 } });
const scr = await proj.newPage();
await scr.goto(`${BASE}/screen/${code}`, { waitUntil: "networkidle" });
await scr.screenshot({ path: `${OUT}-screen-lobby.png` });

await host.getByRole("button", { name: /Start round 1/i }).click();
await host.waitForFunction(() => /countdown|active/i.test(document.body.innerText));
await new Promise((r) => setTimeout(r, 2500));
await host.screenshot({ path: `${OUT}-host-round.png` });
await scr.screenshot({ path: `${OUT}-screen-countdown.png` });

await p1.waitForFunction(() => /your decision/i.test(document.body.innerText), undefined, { timeout: 30000 });
await p1.screenshot({ path: `${OUT}-player-vote.png` });
await p1.getByRole("button", { name: "DENY" }).click();
await new Promise((r) => setTimeout(r, 1500));
await p1.screenshot({ path: `${OUT}-player-locked.png` });
await scr.screenshot({ path: `${OUT}-screen-voting.png` });

await host.getByRole("button", { name: /Reveal answer|Reveal now/i }).first().click();
await host.waitForFunction(() => /correct decision/i.test(document.body.innerText));
await new Promise((r) => setTimeout(r, 1200));
await host.screenshot({ path: `${OUT}-host-reveal.png` });
await scr.screenshot({ path: `${OUT}-screen-reveal.png` });
await p1.screenshot({ path: `${OUT}-player-reveal.png` });

// finish the run to capture the podium
for (let r = 1; r < 5; r++) {
  await host.getByRole("button", { name: /Next round/i }).click();
  await host.waitForFunction((n) => new RegExp(`round ${n}`, "i").test(document.body.innerText), r + 1, { timeout: 30000 });
  await new Promise((res) => setTimeout(res, 5200));
  await host.getByRole("button", { name: /Reveal answer|Reveal now/i }).first().click();
  await host.waitForTimeout(1200);
}
await host.getByRole("button", { name: /Finish & show podium/i }).click();
await host.waitForTimeout(2500);
await scr.screenshot({ path: `${OUT}-screen-podium.png` });

const res = await b.newPage({ viewport: { width: 1400, height: 1000 } });
await res.goto(`${BASE}/results/${code}`, { waitUntil: "networkidle" });
await res.screenshot({ path: `${OUT}-results.png` });

console.log("shots written to", OUT);
await b.close();

/* Installable and offline: the manifest is valid and its icons exist, the service worker takes control and
   caches the app, the app opens and a practice question can be answered with the network off, accounts and
   the tutor (/api/) are never served from cache, and ?nosw opts out. Needs the source tree on http://localhost:8899. */
const { chromium } = require("playwright-core");
const path = require("node:path");
const os = require("node:os");

const EXEC = process.env.PLAYWRIGHT_EXEC || path.join(os.homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-x64/chrome-headless-shell");
const BASE = process.env.BASE_URL || "http://localhost:8899";
const APP = BASE + "/" + encodeURIComponent("SAT & ACT Practice.html");
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.FunSATHabits);

  // ---- manifest
  ok((await page.getAttribute('link[rel="manifest"]', "href")) === "/manifest.webmanifest", "the page links the manifest");
  ok(!!(await page.getAttribute('meta[name="theme-color"]', "content")), "the page sets a theme colour");
  const man = await page.evaluate(async () => { const r = await fetch("/manifest.webmanifest"); return { ok: r.ok, json: await r.json() }; });
  const m = man.json;
  ok(man.ok && m.name && m.short_name === "FunSAT" && m.display === "standalone", "the manifest names the app and runs it standalone");
  ok(m.start_url.startsWith("/") && m.scope === "/", "the start URL is inside the scope");
  ok(m.icons.some((i) => i.sizes === "192x192") && m.icons.some((i) => i.sizes === "512x512"), "the manifest has 192 and 512 icons");
  for (const i of m.icons) { const st = await page.evaluate(async (u) => (await fetch(u)).status, i.src); ok(st === 200, "icon " + i.src + " loads"); }
  ok((m.shortcuts || []).every((s) => s.url.startsWith("/?view=")), "app shortcuts open real views");

  // ---- the service worker takes control and caches the app shell
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
  const cached = await page.evaluate(async () => {
    const out = [];
    for (const k of await caches.keys()) { const c = await caches.open(k); out.push(...(await c.keys()).map((r) => new URL(r.url).pathname)); }
    return out;
  });
  for (const f of ["/", "/app.js", "/plan.js", "/study-habits.js", "/worksheet.js", "/pwa.js", "/progress-desk.css"]) ok(cached.includes(f), f + " is cached for offline use");
  ok(!cached.some((p) => p.startsWith("/api/")), "nothing from /api/ is cached");

  // ---- offline: the app opens and a practice question works
  await ctx.setOffline(true);
  await page.goto(BASE + "/?source=pwa", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.FunSATHabits && !!document.getElementById("screen-start"), null, { timeout: 15000 });
  ok(await page.evaluate(() => getComputedStyle(document.getElementById("screen-start")).display !== "none"), "the app opens with the network off");
  await page.evaluate(() => { state.cfg.testType = "sat"; state.cfg.section = "math"; state.cfg.total = 6; });
  await page.click("#btnStart");
  await require("./helpers/to-choice.cjs")(page, { timeout: 15000 });
  const info = await page.evaluate(() => { const id = currentQids()[state.qi]; return { id, ans: byId(id).ans }; });
  await page.locator("#questionCard .choice").nth(info.ans === 0 ? 1 : 0).click();
  await page.click("#btnCheck");
  await page.waitForTimeout(300);
  ok(await page.evaluate((id) => !!profile.srs[id], info.id), "a practice question can be answered offline and its miss is queued for review");
  // The Plan screen and a worksheet work offline too.
  await page.evaluate(() => FunSATPlanScreen.open());
  await page.waitForSelector("#screen-plan", { state: "visible" });
  await page.evaluate(() => FunSATWorksheet.open({ test: "sat" }));
  ok((await page.locator(".ws-q").count()) > 0, "a worksheet builds offline");
  // Accounts and the tutor are never answered from the cache.
  const apiResult = await page.evaluate(async () => { try { const r = await fetch("/api/me"); return "response " + r.status; } catch (e) { return "network error"; } });
  ok(apiResult === "network error", "/api/ is not served from cache when offline (" + apiResult + ")");
  await ctx.setOffline(false);
  ok(!errs.length, "no page errors while offline: " + errs.join(" | "));
  await ctx.close();

  // ---- ?nosw opts out
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await p2.goto(BASE + "/?nosw=1", { waitUntil: "domcontentloaded" });
  await p2.waitForTimeout(1500);
  ok((await p2.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)) === 0, "?nosw does not register the service worker");
  await ctx2.close();

  await browser.close();
  if (fails.length) { console.error("FAIL:\n - " + fails.join("\n - ")); process.exit(1); }
  console.log("PASS: valid manifest and icons, service worker caches the app, it opens and practises offline, /api/ is never cached, ?nosw opts out.");
})().catch((e) => { console.error(e); process.exit(1); });

/* The racingV2 flag and lazy loader.

   The flag defaults ON as of 2026-10-10 (operator decision): the rebuilt game
   is what students get when they open a driving game. What still must hold:
   every explicit way back to v1 (?racingV2=0, the device override, the account
   flag) wins over the default, nothing downloads until a driving game is
   actually opened, and a failed optional download leaves the student on v1
   rather than breaking the arcade. */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const PLAYWRIGHT_CACHE = path.join(os.homedir(), "Library", "Caches", "ms-playwright");

// Resolve the Chromium executable without hardcoding a version string:
//   1. PLAYWRIGHT_EXEC env override (so CI can pin an exact build),
//   2. playwright-core's supported API (no globbing needed),
//   3. glob the cache and take the highest installed headless-shell build.
function resolveExecutable() {
  if (process.env.PLAYWRIGHT_EXEC) {
    if (fs.existsSync(process.env.PLAYWRIGHT_EXEC)) return process.env.PLAYWRIGHT_EXEC;
    throw new Error(`PLAYWRIGHT_EXEC points at a missing file: ${process.env.PLAYWRIGHT_EXEC}`);
  }

  try {
    const p = chromium.executablePath();
    if (p && fs.existsSync(p)) return p;
  } catch (e) {
    // no usable path from playwright-core; fall through to globbing
  }

  if (fs.existsSync(PLAYWRIGHT_CACHE)) {
    const versions = fs
      .readdirSync(PLAYWRIGHT_CACHE)
      .filter((name) => name.startsWith("chromium_headless_shell-"))
      .map((name) => name.slice("chromium_headless_shell-".length))
      .sort((a, b) => (parseInt(b, 10) || 0) - (parseInt(a, 10) || 0));
    for (const version of versions) {
      const candidate = path.join(
        PLAYWRIGHT_CACHE,
        `chromium_headless_shell-${version}`,
        "chrome-headless-shell-mac-x64",
        "chrome-headless-shell",
      );
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  throw new Error(
    "Could not locate a Playwright Chromium executable. " +
      "Install it with: npx playwright install chromium",
  );
}

const EXEC = resolveExecutable();
const BASE = process.env.BASE_URL || "http://localhost:8899";
const PAGE = "/" + encodeURIComponent("SAT & ACT Practice.html");

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  const fail = (m, got) => { throw new Error(m + ": " + JSON.stringify(got)); };

  const open = async (query = "", init) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    if (init) await page.addInitScript(init);
    await page.goto(BASE + PAGE + query, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("body[data-workspace]");
    return { page, errs };
  };

  // --- defaults ON, and still nothing is downloaded until a game is opened ---
  {
    const { page, errs } = await open();
    const r = await page.evaluate(() => ({
      enabled: RacingV2.enabled(), source: RacingV2.source(), loaded: !!window.Racing,
    }));
    if (r.enabled !== true) fail("racingV2 must default on", r);
    if (r.source !== "default") fail("unexpected flag source", r);
    if (r.loaded) fail("v2 modules must not load merely from page load", r);
    const v1 = await page.evaluate(() => ({ drift: typeof DriftCircuit, racing: typeof NeonRacing }));
    if (v1.drift !== "function" || v1.racing !== "function") fail("v1 classes must still be present", v1);
    if (errs.length) fail("page errors with the default flag", errs);
    await page.close();
  }

  // --- ?racingV2=0 still returns the old game ---
  {
    const { page, errs } = await open("?racingV2=0");
    const r = await page.evaluate(() => ({
      enabled: RacingV2.enabled(), source: RacingV2.source(), loaded: !!window.Racing,
    }));
    if (r.enabled !== false || r.source !== "query") fail("?racingV2=0 must disable", r);
    if (r.loaded) fail("nothing may load when explicitly disabled", r);
    if (errs.length) fail("page errors with the flag explicitly off", errs);
    await page.close();
  }

  // --- a query string turns it on and the modules load and work ---
  {
    const { page, errs } = await open("?racingV2=1");
    const on = await page.evaluate(() => ({ enabled: RacingV2.enabled(), source: RacingV2.source() }));
    if (on.enabled !== true || on.source !== "query") fail("?racingV2=1 should enable via query", on);

    const loaded = await page.evaluate(async () => {
      const R = await RacingV2.ensure();
      if (!R) return { ok: false };
      // Run a few ticks to prove the modules actually work in the browser, and
      // that they agree with the node-side determinism tests.
      const car = R.Cars.get("sport");
      const st = R.Physics.createState(car);
      const clock = R.FixedStep.create();
      for (let f = 0; f < 120; f++) {
        clock.advance(1 / 60, (step, tick) =>
          R.Physics.step(st, car, { throttle: 1, brake: 0, steer: 0.2, handbrake: 0 }, { difficulty: "expert", weather: "dry" }, step));
      }
      return { ok: true, tick: clock.tick, kph: R.Physics.kph(st), snap: R.Physics.snapshot(st),
               parts: Object.keys(R).sort() };
    });
    if (!loaded.ok) fail("v2 failed to load with the flag on", loaded);
    if (loaded.tick !== 120) fail("the browser clock did not run 120 ticks", loaded);
    if (!(loaded.kph > 20)) fail("the v2 car did not accelerate in the browser", loaded);
    for (const part of ["AI", "Cars", "FixedStep", "Ghost", "Physics", "Random"]) {
      if (!loaded.parts.includes(part)) fail("missing v2 module " + part, loaded.parts);
    }
    if (errs.length) fail("page errors with the flag on", errs);
    await page.close();
  }

  // --- ?racingV2=0 beats a device override, which beats the account ---
  {
    const { page } = await open("?racingV2=0", () => { try { localStorage.setItem("funsat.racingV2", "1"); } catch (e) {} });
    const r = await page.evaluate(() => ({ enabled: RacingV2.enabled(), source: RacingV2.source() }));
    if (r.enabled !== false || r.source !== "query") fail("the query string must win over a device override", r);
    await page.close();
  }
  {
    const { page } = await open("", () => { try { localStorage.setItem("funsat.racingV2", "1"); } catch (e) {} });
    const r = await page.evaluate(() => {
      profile.flags = { racingV2: false };
      return { enabled: RacingV2.enabled(), source: RacingV2.source() };
    });
    if (r.enabled !== true || r.source !== "device") fail("a device override must win over the account", r);
    await page.close();
  }
  {
    const { page } = await open();
    const r = await page.evaluate(() => {
      profile.flags = { racingV2: false };
      return { enabled: RacingV2.enabled(), source: RacingV2.source() };
    });
    if (r.enabled !== false || r.source !== "account") fail("an account with the flag off must beat the default on", r);
    await page.close();
  }
  {
    const { page } = await open();
    const r = await page.evaluate(() => {
      profile.flags = { racingV2: true };
      return { enabled: RacingV2.enabled(), source: RacingV2.source() };
    });
    if (r.enabled !== true || r.source !== "account") fail("the account flag should apply when nothing overrides it", r);
    const cleared = await page.evaluate(() => { RacingV2.setLocal(false); const a = RacingV2.enabled(); RacingV2.setLocal(null); return { a, b: RacingV2.source() }; });
    if (cleared.a !== false || cleared.b !== "account") fail("a device override must win in both directions, and clearing it should fall back to the account", cleared);
    await page.close();
  }

  // --- a failed download leaves the student on v1 instead of breaking ---
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.route("**/racing/core/**", (route) => route.abort());
    await page.goto(BASE + PAGE + "?racingV2=1", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("body[data-workspace]");
    const r = await page.evaluate(async () => ({ result: await RacingV2.ensure(), drift: typeof DriftCircuit }));
    if (r.result !== null) fail("a failed v2 load must resolve to null", r);
    if (r.drift !== "function") fail("v1 must still be usable after a failed v2 load", r);
    if (errs.length) fail("a failed v2 load must not throw into the page", errs);
    await page.close();
  }

  // --- a failed v2 APP boot still lands on the full v1 game ----------------
  // (The vanilla-module failure case above is different: this one aborts the
  // React bundle itself, so startApp reports failure and the hook must
  // re-dispatch through the whole v1 chain -- session rules included.)
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.route("**/racing-v2/racing-v2.js", (route) => route.abort());
    await page.goto(BASE + PAGE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("body[data-workspace]");
    const r = await page.evaluate(async () => {
      arcade.select("drift");
      await new Promise((res) => setTimeout(res, 2500));
      return {
        ctor: arcade.game && arcade.game.constructor && arcade.game.constructor.name,
        sessionMode: window.RacingSession ? RacingSession.state().mode : null,
        tokens: profile.tokens,
        mountHidden: !document.getElementById("racingV2Mount") || document.getElementById("racingV2Mount").style.display === "none",
      };
    });
    if (r.ctor !== "DriftCircuit") fail("a failed v2 boot must land on v1 DriftCircuit", r);
    if (r.sessionMode !== "practice") fail("the v1 session rules must own the failed-boot fallback", r);
    if (!r.mountHidden) fail("the v2 mount must be hidden after a failed boot", r);
    if (errs.length) fail("a failed v2 boot must not throw into the page", errs);
    await page.close();
  }

  // --- a scored request survives every v2 failure, charged exactly once ---
  // The stub replaces the React bundle with a module that fails in the two
  // ways the real one can after the request was consumed: mount() throwing
  // synchronously, and a post-mount error after the run already charged its
  // token. Both must land on v1 with the run scored, not practice.
  const STUB_THROWS = "export function mount() { throw new Error('boom in mount') } export function unmount() {}";
  const STUB_CHARGES_THEN_ERRORS = "export function mount(c, o) { o.economy.spendScored(); setTimeout(function () { o.onError() }, 10) } export function unmount() {}";
  for (const [name, stub] of [["sync mount throw", STUB_THROWS], ["charged then post-mount error", STUB_CHARGES_THEN_ERRORS]]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.route("**/racing-v2/racing-v2.js", (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: stub }));
    await page.goto(BASE + PAGE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("body[data-workspace]");
    const r = await page.evaluate(async () => {
      profile.tokens = 1;
      RacingSession.start("scored");
      await new Promise((res) => setTimeout(res, 2500));
      return {
        ctor: arcade.game && arcade.game.constructor && arcade.game.constructor.name,
        sessionMode: RacingSession.state().mode,
        tokens: profile.tokens,
      };
    });
    if (r.ctor !== "DriftCircuit") fail(`${name}: must land on v1 DriftCircuit`, r);
    if (r.sessionMode !== "scored") fail(`${name}: the paid scored request must survive into v1, got ${r.sessionMode}`, r);
    if (r.tokens !== 0) fail(`${name}: exactly one token must be charged, tokens=${r.tokens}`, r);
    if (errs.length) fail(`${name}: must not throw into the page`, errs);
    await page.close();
  }

  await browser.close();
  console.log("PASS: racingV2 defaults on with every explicit opt-out intact, nothing loads until a game is opened, query/device/account precedence, in-browser v2 simulation runs, a failed v2 app boot falls back to the full v1 game, a failed module load stays on v1, and a scored request survives both v2 failure timing variants with a single charge.");
})().catch((e) => { console.error(e); process.exit(1); });

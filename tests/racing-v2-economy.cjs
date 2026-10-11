/* The v2 session economy, end to end in the browser.
 *
 * v2 is the default game now, so it must carry the v1 session rules: Open
 * Practice is free and never recorded; a Scored run costs one token, gets
 * five minutes of ACTIVE driving, and banks a record in the profile. This
 * suite drives the REAL bridge (racing/index.js) through the real page.
 *
 * The race-finish and clock paths are driven through window.__rv2economyProbe
 * -- the same documented test-seam pattern as RacingSession._tick and
 * window.__rv2probe -- because driving two genuine laps plus five real
 * minutes in CI is not a test, it is a wait.
 */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");

function resolveExecutable() {
  if (process.env.PLAYWRIGHT_EXEC) return process.env.PLAYWRIGHT_EXEC;
  try {
    const p = chromium.executablePath();
    if (p && fs.existsSync(p)) return p;
  } catch (e) { /* fall through */ }
  const cache = path.join(os.homedir(), "Library", "Caches", "ms-playwright");
  for (const d of fs.readdirSync(cache).filter((n) => n.startsWith("chromium-"))) {
    for (const shape of [
      ["chrome-mac-x64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"],
      ["chrome-mac", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"],
    ]) {
      const c = path.join(cache, d, ...shape);
      if (fs.existsSync(c)) return c;
    }
  }
  throw new Error("Could not locate Chromium. Install it with: npx playwright install chromium");
}

const ROOT = path.join(__dirname, "..");
const PORT = 8908;
const PAGE = "/" + encodeURIComponent("SAT & ACT Practice.html");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".mp3": "audio/mpeg", ".png": "image/png" };

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split("?")[0]);
      const file = url.startsWith("/racing-v2/")
        ? path.join(ROOT, "racing-v2", "dist", url.slice("/racing-v2/".length))
        : path.join(ROOT, url === "/" ? "index.html" : url.slice(1));
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404); res.end("not found"); return; }
        res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
        res.end(buf);
      });
    });
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

(async () => {
  const server = await serve();
  const browser = await chromium.launch({
    executablePath: resolveExecutable(),
    args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"],
  });
  const fail = (m, got) => { throw new Error(m + ": " + JSON.stringify(got)); };
  const base = `http://127.0.0.1:${PORT}`;

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(base + PAGE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("body[data-workspace]");

  const setTokens = (n) => page.evaluate((v) => { profile.tokens = v; saveProfile(); updateHUD(); }, n);
  const records = () => page.evaluate(() => profile.racingV2Records || {});
  const tokens = () => page.evaluate(() => profile.tokens);
  const probe = (fn, ...args) => page.evaluate(({ fn, args }) => window.__rv2economyProbe[fn](...args), { fn, args });

  const openGame = async () => {
    await page.evaluate(() => arcade.select("drift"));
    await page.waitForFunction("window.RacingV2 && RacingV2.appLoaded() === true", { timeout: 20000 });
    await page.waitForSelector(".rv2-go", { state: "visible", timeout: 20000 });
    await page.waitForFunction("window.__rv2economyProbe", { timeout: 20000 });
  };
  const backToArcade = async () => {
    await page.click(".rv2-ghost");
    await page.waitForFunction(`document.getElementById("racingV2Mount") === null || document.getElementById("racingV2Mount").style.display === "none"`, { timeout: 10000 });
  };
  const chip = (text) => page.locator(".rv2-chip", { hasText: text }).first();

  // --- 1. the intro carries the mode choice and the wallet -----------------
  await setTokens(3);
  await openGame();
  const introText = await page.textContent(".rv2-panel");
  if (!introText.includes("Open Practice") || !introText.includes("Scored run")) fail("mode chips missing", introText.slice(0, 200));
  if (!introText.includes("3")) fail("token count missing from intro", introText.slice(0, 200));
  const practiceOn = await chip("Open Practice").getAttribute("class");
  if (!/is-on/.test(practiceOn)) fail("practice must be the default mode", practiceOn);

  // --- 2. practice: free, finishes, and records nothing --------------------
  await page.click(".rv2-go");
  await page.waitForSelector(".rv2-mode", { timeout: 10000 });
  const hudMode = await page.textContent(".rv2-mode");
  if (!hudMode.includes("OPEN PRACTICE")) fail("practice badge missing", hudMode);
  await probe("finish", 95.2, 44.1);
  await page.waitForSelector(".rv2-panel-sm", { timeout: 10000 });
  let st = await probe("state");
  if (st.result.mode !== "practice" || st.result.recorded !== false) fail("practice run must not be recorded", st.result);
  if ((await tokens()) !== 3) fail("practice must not spend a token", await tokens());
  const recAfterPractice = await records();
  if (Object.keys(recAfterPractice).length !== 0) fail("practice must not write records", recAfterPractice);
  const finishedText = await page.textContent(".rv2-panel");
  if (!finishedText.includes("not scored")) fail("finish screen must say practice is not scored", finishedText);

  // --- 3. the arcade round trip (quit returns to the menu, not v1) ---------
  await backToArcade();
  const arcadeState = await page.evaluate(() => ({ mode: arcade.mode, game: arcade.game && arcade.game.constructor && arcade.game.constructor.name }));
  if (arcadeState.mode === "playing") fail("quit must leave the arcade, not the v1 game, running", arcadeState);

  // --- 4. scored run: spends one token, records on finish ------------------
  await openGame();
  await chip("Scored run").click();
  await page.click(".rv2-go");
  if ((await tokens()) !== 2) fail("a scored run must spend exactly one token", await tokens());
  await page.waitForSelector(".rv2-mode", { timeout: 10000 });
  const scoredBadge = await page.textContent(".rv2-mode");
  if (!scoredBadge.includes("SCORED")) fail("scored badge missing", scoredBadge);
  await probe("finish", 95.2, 44.1);
  st = await probe("state");
  if (st.result.recorded !== true) fail("scored run must be recorded", st.result);
  if (!st.result.improvedRace || !st.result.improvedLap) fail("first scored run is a new record", st.result);
  const rec1 = await records();
  if (rec1["apex-flats:dry"]?.race !== 95.2 || rec1["apex-flats:dry"]?.lap !== 44.1) fail("record not written", rec1);
  if (!(await page.textContent(".rv2-panel")).includes("New record")) fail("finish screen must celebrate the record");

  // --- 5. a slower scored run records but does not improve -----------------
  await backToArcade();
  await openGame();
  await chip("Scored run").click();
  await page.click(".rv2-go");
  if ((await tokens()) !== 1) fail("second scored run must spend a token", await tokens());
  await probe("finish", 120, 50);
  st = await probe("state");
  if (!st.result.recorded || st.result.improvedRace || st.result.improvedLap) fail("slower run must not improve", st.result);
  const rec2 = await records();
  if (rec2["apex-flats:dry"]?.race !== 95.2 || rec2["apex-flats:dry"]?.lap !== 44.1) fail("slower run must not overwrite", rec2);

  // --- 6. the clock: five active minutes end a run unrecorded --------------
  await backToArcade();
  await openGame();
  await chip("Scored run").click();
  await page.click(".rv2-go");
  if ((await tokens()) !== 0) fail("third scored run must spend the last token", await tokens());
  await probe("tick", 301);
  st = await probe("state");
  if (!st.result.timeUp || st.result.recorded) fail("time-up must end unrecorded", st.result);
  const rec3 = await records();
  if (rec3["apex-flats:dry"]?.race !== 95.2) fail("time-up must not touch records", rec3);
  if (!(await page.textContent(".rv2-panel")).includes("not recorded")) fail("finish screen must say the run was not recorded");

  // --- 7. broke: the scored chip is disabled and nothing goes negative -----
  await backToArcade();
  await openGame();
  if (!(await chip("Scored run").isDisabled())) fail("scored chip must be disabled with no tokens");
  await page.click(".rv2-go");
  if ((await tokens()) !== 0) fail("practice with an empty wallet must stay at zero", await tokens());
  await probe("finish", 60, 30);
  st = await probe("state");
  if (st.result.recorded) fail("broke practice run must not record", st.result);

  // --- 8. workshop path: RacingSession.start('scored') presets v2 ----------
  await backToArcade();
  await setTokens(1);
  await page.evaluate(() => RacingSession.start("scored"));
  await page.waitForFunction("window.RacingV2 && RacingV2.appLoaded() === true", { timeout: 20000 });
  await page.waitForSelector(".rv2-go", { timeout: 20000 });
  await page.waitForFunction("window.__rv2economyProbe", { timeout: 20000 });
  const scoredChipOn = await chip("Scored run").getAttribute("class");
  if (!/is-on/.test(scoredChipOn)) fail("a pending scored request must preselect the scored chip", scoredChipOn);
  if ((await tokens()) !== 1) fail("nothing may be spent before the race starts", await tokens());
  const pending = await page.evaluate(() => RacingSession.takePending());
  if (pending !== null) fail("the pending request must be consumed by v2", pending);
  await page.click(".rv2-go");
  if ((await tokens()) !== 0) fail("starting the preset scored run must spend the token", await tokens());

  if (errs.length) fail("page errors during the economy flow", errs.slice(0, 3));
  await page.close();
  await browser.close();
  server.close();
  console.log("PASS: v2 carries the session economy — practice is free and unrecorded, scored runs cost one token and bank records, the clock ends runs unrecorded, broke players fall back to practice, and the workshop path presets the mode.");
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });

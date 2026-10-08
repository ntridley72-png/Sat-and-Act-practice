/* Racing session rules: free Open Practice, one-token five-minute scored runs,
   no auto-renewal, and an allowance that only moves while the player drives. */
const { chromium } = require("playwright-core");
const path = require("node:path");
const os = require("node:os");

const EXEC = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-x64/chrome-headless-shell");
const BASE = process.env.BASE_URL || "http://localhost:8899";
const PAGE_PATH = /localhost|127\.0\.0\.1/.test(BASE) ? "/" + encodeURIComponent("SAT & ACT Practice.html") : "/";

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1360, height: 980 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  await page.goto(BASE + PAGE_PATH, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("body[data-workspace]");

  const fail = (msg, got) => { throw new Error(msg + ": " + JSON.stringify(got)); };
  const setup = (tokens) => page.evaluate((t) => {
    profile.tokens = t;
    profile.highScores.drift = 500;
    DriftCircuit.garage().cash = 1000;
    arcade.backToMenu();
    arcade.open();
  }, tokens);

  // --- Open Practice is free, available with an empty wallet, and unlimited ---
  await setup(0);
  let practice = await page.evaluate(() => {
    RacingSession.start("practice");
    return { tokens: profile.tokens, mode: RacingSession.state().mode, remaining: RacingSession.state().remaining, key: arcade.game.key };
  });
  if (practice.tokens !== 0) fail("practice must not spend a token", practice);
  if (practice.mode !== "practice") fail("practice mode not entered", practice);
  if (practice.remaining !== null && isFinite(practice.remaining)) fail("practice must be unlimited", practice);
  if (practice.key !== "drift") fail("practice did not open drift", practice);

  // Practice banks no cash and cannot set a high score, however well it goes.
  const practiceEnd = await page.evaluate(() => {
    const g = arcade.game;
    g.score = 99999; g.earned = 750;
    const cashBefore = DriftCircuit.garage().cash;
    arcade.gameOver();
    return { cashBefore, cashAfter: DriftCircuit.garage().cash, high: profile.highScores.drift };
  });
  if (practiceEnd.cashAfter !== practiceEnd.cashBefore) fail("practice must not bank garage cash", practiceEnd);
  if (practiceEnd.high !== 500) fail("practice must not set a high score", practiceEnd);

  // --- A scored run costs exactly one token and grants five minutes ---
  await setup(3);
  let scored = await page.evaluate(() => {
    RacingSession.start("scored");
    return { tokens: profile.tokens, state: RacingSession.state(), max: RacingSession.MAX_SEC };
  });
  if (scored.tokens !== 2) fail("a scored run must cost exactly one token", scored);
  if (scored.state.mode !== "scored") fail("scored mode not entered", scored);
  if (scored.state.remaining !== scored.max || scored.max !== 300) fail("scored run must grant five minutes", scored);

  // --- Pause, a hidden tab, and the garage do not consume the allowance ---
  const frozen = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const read = () => RacingSession.state().remaining;
    const out = {};
    arcade.mode = "paused"; const p0 = read(); await wait(400); out.paused = read() - p0;
    arcade.mode = "playing";
    window.FunSATWorkshop.open(); const g0 = read(); await wait(400); out.garage = read() - g0;
    window.FunSATWorkshop.close();
    return out;
  });
  if (frozen.paused !== 0) fail("a paused run must not spend the allowance", frozen);
  if (frozen.garage !== 0) fail("garage time must not spend the allowance", frozen);

  // --- The allowance only moves while driving, and runs out exactly once ---
  const burn = await page.evaluate(() => {
    const before = RacingSession.state().remaining;
    RacingSession._tick(120, { driving: true });
    const mid = RacingSession.state().remaining;
    RacingSession._tick(60, { driving: false }); // idle time is free
    const afterIdle = RacingSession.state().remaining;
    return { before, mid, afterIdle };
  });
  if (Math.round(burn.before - burn.mid) !== 120) fail("driving must spend the allowance", burn);
  if (burn.afterIdle !== burn.mid) fail("idle time must not spend the allowance", burn);

  // --- It never auto-renews: running out does not reach for another token ---
  const exhausted = await page.evaluate(() => {
    const tokensBefore = profile.tokens;
    RacingSession._tick(400, { driving: true });
    return { tokensBefore, tokensAfter: profile.tokens, state: RacingSession.state(), mode: arcade.mode, refill: arcade.autoRefill() };
  });
  if (exhausted.tokensAfter !== exhausted.tokensBefore) fail("an exhausted run must not auto-renew", exhausted);
  if (exhausted.refill !== false) fail("autoRefill must refuse racing sessions", exhausted);
  if (!exhausted.state.ended) fail("the run should have ended", exhausted);

  // Asking for more time explains the rule instead of silently extending.
  const noExtend = await page.evaluate(() => {
    const t = profile.tokens, r = RacingSession.state().remaining;
    arcade.addTime();
    return { spent: t - profile.tokens, moved: RacingSession.state().remaining - r };
  });
  if (noExtend.spent !== 0 || noExtend.moved !== 0) fail("a scored run must not be extendable", noExtend);

  // Replaying an exhausted run is a deliberate second token, charged once. The
  // arcade's own playAgain also debits for non-credit games, so this guards the
  // double charge that would follow from letting both paths bill.
  const replay = await page.evaluate(() => {
    const before = profile.tokens;
    arcade.playAgain();
    return { before, after: profile.tokens, state: RacingSession.state() };
  });
  if (replay.before - replay.after !== 1) fail("replaying a spent run must cost exactly one token", replay);
  if (replay.state.remaining !== 300) fail("the replayed run must get a fresh five minutes", replay);

  // Replaying free practice stays free no matter how many times it is pressed.
  await setup(2);
  const replayFree = await page.evaluate(() => {
    RacingSession.start("practice");
    arcade.playAgain(); arcade.playAgain();
    return { tokens: profile.tokens, mode: RacingSession.state().mode };
  });
  if (replayFree.tokens !== 2) fail("replaying practice must stay free", replayFree);
  if (replayFree.mode !== "practice") fail("replaying practice must stay unscored", replayFree);

  // --- Three idle minutes end the run safely ---
  await setup(2);
  const idle = await page.evaluate(() => {
    RacingSession.start("scored");
    RacingSession._tick(RacingSession.IDLE_END_SEC + 1, { driving: false });
    return { state: RacingSession.state(), tokens: profile.tokens };
  });
  if (!idle.state.ended) fail("three idle minutes must end the run", idle);
  if (idle.tokens !== 1) fail("an idle end must not cost a further token", idle);

  // --- An empty wallet falls back to free practice rather than failing ---
  await setup(0);
  const broke = await page.evaluate(() => {
    RacingSession.start("scored");
    return { mode: RacingSession.state().mode, tokens: profile.tokens };
  });
  if (broke.mode !== "practice") fail("no tokens should fall back to free practice", broke);
  if (broke.tokens !== 0) fail("the fallback must not go into token debt", broke);

  // --- Opening drift from the cabinet never silently spends a token ---
  await setup(4);
  const cabinet = await page.evaluate(() => {
    arcade.select("drift");
    return { tokens: profile.tokens, mode: RacingSession.state().mode };
  });
  if (cabinet.tokens !== 4) fail("the cabinet must not spend a token on open", cabinet);
  if (cabinet.mode !== "practice") fail("the cabinet should default to free practice", cabinet);

  // --- Other arcade games keep their own billing ---
  const other = await page.evaluate(() => {
    arcade.backToMenu(); arcade.open();
    const before = profile.tokens;
    arcade.select("snake");
    return { before, after: profile.tokens, mode: RacingSession.state().mode, runMode: arcade.runMode };
  });
  if (other.mode !== null) fail("leaving racing must clear the session", other);
  if (other.runMode === "racing") fail("a non-racing game must not use racing billing", other);

  await browser.close();
  if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
  console.log("PASS: free unscored Open Practice, one-token five-minute scored runs, no auto-renewal, pause/garage/idle never billed, three-minute idle end, broke fallback, and untouched billing for other games.");
})().catch((error) => { console.error(error); process.exit(1); });

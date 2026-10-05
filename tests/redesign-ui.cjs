/* Redesign UI test: topbar, home ring + college comparison, profile hero, Enter nav, arcade intro + restart. */
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
  page.on("console", (m) => { if (m.type() === "error" && !/\/api\/|501|404/.test(m.text())) errors.push("console: " + m.text()); });

  await page.goto(BASE + PAGE_PATH, { waitUntil: "load" });
  await page.waitForSelector("body[data-workspace]");

  // Top bar redesign markers.
  if (!(await page.locator("#btnHome svg").count())) throw new Error("missing Home SVG button");
  if (!(await page.locator("#btnCollege svg").count())) throw new Error("College should use an SVG icon");
  if (!(await page.locator("#btnArcade svg").count())) throw new Error("Arcade should use an SVG icon");
  if (!(await page.locator("#tokenBadge .coin").count())) throw new Error("wallet should use the gold coin");
  if (!/FunSAT/.test(await page.textContent(".brand"))) throw new Error("brand text missing");

  // Seed an average + a saved college, then re-render home.
  await page.evaluate(() => {
    profile.history = [{ id: "r1", done: true, testType: "sat", totalAnswered: 40, totalCorrect: 34, accuracy: 85, total: 40, finishedAt: Date.now(), tokensEarned: 3, elapsed: 600, bestStreak: 4, scoreEligible: true, keys: ["rw", "math"], secScores: { rw: { score: 680, answered: 20, correct: 18 }, math: { score: 660, answered: 20, correct: 16 } } }];
    profile.college = { saved: [170976, 204796], grade: "11", gpa: 3.8, gpaScale: "4uw", sat: 1340, act: null, targetMode: "p75" };
    saveProfile(); render();
  });
  await page.waitForSelector("#homeScoreCard .ring-num", { state: "visible" });
  const pctText = await page.textContent("#homeScoreCard .ring-num");
  if (!/^\d+%$/.test(pctText.trim())) throw new Error("home ring percentile missing: " + pctText);
  const avgText = await page.textContent("#homeScoreCard .hsc-average");
  if (!/1340/.test(avgText)) throw new Error("home average should be 1340, got: " + avgText);

  // Expand the comparison.
  await page.click("#homeScoreCard .hsc-top");
  await page.waitForSelector("#homeScoreCard.open .hsc-expand", { state: "visible" });
  if ((await page.locator("#homeScoreCard .hsc-tile").count()) !== 4) throw new Error("expected 4 comparison tiles");
  if (!(await page.locator("#homeScoreCard .hsc-band").count())) throw new Error("missing admitted middle-50 band");
  if (!(await page.locator("#homeScoreCard .hsc-you").count())) throw new Error("missing You marker");
  const tabs = await page.locator("#homeScoreCard .hsc-tab").count();
  if (tabs < 2) throw new Error("expected saved-college tabs, saw " + tabs);
  await page.click("#homeScoreCard .hsc-tab:nth-child(2)");
  await page.waitForSelector("[data-close-detail]");
  await page.click("[data-close-detail]");
  await page.waitForTimeout(120);

  // Profile hero ring on the College screen.
  await page.click("#btnCollege");
  await page.waitForSelector("#screen-college", { state: "visible" });
  if (!(await page.locator("#collegeProfileHero .ring").count())) throw new Error("missing profile hero ring");
  if ((await page.locator("#collegeSavedPanel .college-saved-item").count()) < 2) throw new Error("saved colleges panel should list saved schools beside the profile");
  await page.click("#collegeSavedPanel .college-saved-item");
  await page.waitForSelector(".college-detail .college-pie");
  if ((await page.locator(".college-detail .college-pie-legend li").count()) < 3) throw new Error("acceptance pie should show accept, waitlist, and deny");
  if (await page.locator("#collegeProfileHero .ring-num").textContent() === "—") throw new Error("profile ring should show a percentile for SAT 1340");
  await page.click("[data-close-detail]");
  await page.click("#collegeBack");

  // Enter advances to the next question (12 questions guarantees a multi-question module).
  await page.fill("#customLen", "12");
  await page.dispatchEvent("#customLen", "change");
  await page.click("#btnStart");
  await page.waitForSelector("#screen-test", { state: "visible" });
  await page.locator("#questionCard .choice").first().click();
  // Full screen practice mode: only the test, with Esc to exit.
  await page.click("#btnZen");
  await page.waitForTimeout(200);
  if (!(await page.evaluate(() => document.body.classList.contains("zen-mode")))) throw new Error("full screen mode did not activate");
  if (await page.locator(".topbar").isVisible()) throw new Error("top bar should be hidden in full screen mode");
  if (!(await page.locator("#zenExit").isVisible())) throw new Error("exit full screen button missing");
  // Study tools stay available in full screen: tool row + slide-in drawer.
  if (!(await page.locator("#btnCalc").isVisible())) throw new Error("calculator tool should stay available in full screen");
  await page.click("#zenStudy");
  await page.waitForTimeout(180);
  if (!(await page.locator(".workspace-learning").isVisible())) throw new Error("study tools drawer did not open");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(180);
  if (await page.evaluate(() => document.body.classList.contains("zen-study"))) throw new Error("Esc should close the study drawer first");
  if (!(await page.evaluate(() => document.body.classList.contains("zen-mode")))) throw new Error("closing the drawer should not exit full screen");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  if (await page.evaluate(() => document.body.classList.contains("zen-mode"))) throw new Error("Esc did not exit full screen mode");
  if (!(await page.locator(".topbar").isVisible())) throw new Error("top bar should return after exiting full screen");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(220);
  const advanced = await page.evaluate(() => state.qi > 0 || state.view === "routing");
  if (!advanced) throw new Error("Enter did not advance the question");

  // Arcade: menu click plays the intro and lands in the game; restart resets a dead game.
  await page.evaluate(() => arcade.open());
  await page.click('[data-game="2048"]');
  await page.waitForFunction(() => arcade.game && arcade.game.key === "2048", null, { polling: 100, timeout: 8000 });
  let introClosed = false;
  for (let i = 0; i < 40 && !introClosed; i++) { await page.waitForTimeout(200); introClosed = await page.evaluate(() => { const el = document.getElementById("fxOverlay"); return !!el && !el.classList.contains("show"); }); }
  if (!introClosed) throw new Error("arcade intro overlay did not finish");
  await page.evaluate(() => { arcade.game.over = true; });
  await page.waitForTimeout(150);
  const reset = await page.evaluate(() => window.FunSATRedesign.resetCurrentGame());
  if (!reset || await page.evaluate(() => arcade.game.over)) throw new Error("restart did not reset the game");

  await browser.close();
  if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
  console.log("PASS: new top bar, home ring + college comparison, profile hero ring, Enter navigation, arcade intro, and HUD restart all work.");
})().catch((error) => { console.error(error); process.exit(1); });

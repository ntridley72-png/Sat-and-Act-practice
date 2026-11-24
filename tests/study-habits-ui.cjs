/* Review queue, daily goal and mastery levels in the real app: a miss enters the queue, comes back when due,
   advances on a correct answer, shows on the Practice desk and Plan screen, and mastery chips appear in
   Subjects. Needs the source tree on http://localhost:8899. */
const { chromium } = require("playwright-core");
const path = require("node:path");
const os = require("node:os");

const EXEC = process.env.PLAYWRIGHT_EXEC || path.join(os.homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-x64/chrome-headless-shell");
const BASE = process.env.BASE_URL || "http://localhost:8899";
const APP = BASE + "/" + encodeURIComponent("SAT & ACT Practice.html");
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

async function open(browser, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.FunSATHabits && !!window.FunSATPlanScreen);
  await page.waitForTimeout(600);
  return { ctx, page, errs };
}
const startMath = async (page, n) => {
  await page.evaluate((total) => { state.cfg.testType = "sat"; state.cfg.section = "rw"; state.cfg.total = total; }, n);
  await page.click("#btnStart");
  await require("./helpers/to-choice.cjs")(page, { timeout: 15000 });
  await page.waitForTimeout(300);
};
const answer = async (page, wantRight) => {
  const info = await page.evaluate(() => { const id = currentQids()[state.qi]; return { id, ans: byId(id).ans }; });
  const idx = wantRight ? info.ans : (info.ans === 0 ? 1 : 0);
  await page.locator("#questionCard .choice").nth(idx).click();
  await page.click("#btnCheck");            // the app records the answer when you press Check answer
  await page.waitForTimeout(250);
  return info.id;
};

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  let { ctx, page, errs } = await open(browser, 1280, 900);

  // Practice desk starts clean: a goal line, no queue.
  ok(/Today 0 \/ 20/.test(await page.textContent("#habitChip")), "the Practice desk shows today's goal");
  ok((await page.locator("#hbChipReview").count()) === 0, "no review button when nothing is due");

  // A miss enters the queue, due tomorrow, and counts toward today's goal.
  await startMath(page, 6);
  const missed = await answer(page, false);
  const e = await page.evaluate((id) => profile.srs[id], missed);
  ok(e && e.box === 1 && e.lapses === 1 && Math.abs(e.due - Date.now() - 86400000) < 60000, "a missed question enters box 1, due in a day: " + JSON.stringify(e));
  ok((await page.evaluate(() => FunSATHabits.today())) === 1, "answering counts toward today's goal");
  // A correct answer on a new question does not enter the queue.
  await page.evaluate(() => { const nx = document.getElementById("btnNext"); if (nx && !nx.disabled) nx.click(); });
  await page.waitForTimeout(300);
  const right = await answer(page, true);
  ok((await page.evaluate((id) => !profile.srs[id], right)), "a question answered right the first time stays out of the queue");
  ok((await page.evaluate(() => FunSATHabits.today())) === 2, "today's count follows each answer");

  // Re-answering the same question in the same attempt does not double count.
  const before = await page.evaluate(() => FunSATHabits.today());
  await page.locator("#questionCard .choice").first().click({ timeout: 2000 }).catch(() => {});
  await page.locator("#btnCheck").click({ timeout: 2000 }).catch(() => {});
  ok((await page.evaluate(() => FunSATHabits.today())) === before, "checking again does not count twice");

  // Plan screen: nothing due yet, then make it due and review it.
  await page.evaluate(() => FunSATPlanScreen.open());
  await page.waitForSelector("#screen-plan", { state: "visible" });
  ok(/Review queue and daily goal/.test(await page.textContent("#screen-plan")), "the Plan screen has the review and goal pane");
  ok(/None are due\. The next one is due tomorrow/.test(await page.textContent("#screen-plan")), "it says when the next review is due");
  ok((await page.locator("#hbPlanReview").count()) === 0, "no review button until something is due");
  await page.evaluate((id) => { profile.srs[id].due = Date.now() - 1000; saveProfile(); FunSATPlanScreen.render(); }, missed);
  ok(/Review 1 due now/.test(await page.textContent("#hbPlanReview")), "a due question offers a review");
  await page.click("#hbPlanReview");
  await require("./helpers/to-choice.cjs")(page, { timeout: 15000 });
  ok((await page.evaluate(() => currentQids().length)) === 1 && (await page.evaluate((id) => currentQids()[0] === id, missed)), "the review session contains exactly the due question");

  // Right when due: advances to box 2, due in 3 days.
  await answer(page, true);
  const after = await page.evaluate((id) => profile.srs[id], missed);
  ok(after && after.box === 2 && Math.abs(after.due - Date.now() - 3 * 86400000) < 60000, "a correct answer when due moves it to box 2, due in 3 days: " + JSON.stringify(after));

  // Daily goal control.
  await page.evaluate(() => FunSATPlanScreen.open());
  await page.waitForSelector("#hbGoal");
  await page.selectOption("#hbGoal", "10");
  ok((await page.evaluate(() => profile.dailyGoal)) === 10, "the daily goal can be changed");
  ok(/of 10 questions today/.test(await page.textContent("#screen-plan")), "the Plan screen shows the new goal");

  // Mastery levels in Subjects.
  await page.evaluate(() => {
    const inv = FunSATSubjects.inventory();
    const keys = Object.keys(inv).filter((k) => k.startsWith("sat|math"));
    profile.skillStats = {};
    profile.skillStats[keys[0]] = { r: 19, w: 1, sessions: 3 };   // mastered
    profile.skillStats[keys[1]] = { r: 9, w: 1, sessions: 2 };    // proficient
    profile.skillStats[keys[2]] = { r: 3, w: 2, sessions: 1 };    // familiar
    profile.skillStats[keys[3]] = { r: 1, w: 1, sessions: 1 };    // attempted
    window.__mk = keys.slice(0, 4);
  });
  await page.click("#btnSubjectPractice");
  await page.waitForSelector("#screen-subjects", { state: "visible" });
  await page.click('[data-s-section="math"]');
  const levels = await page.evaluate(() => window.__mk.map((k) => document.querySelector('[data-s-key="' + k + '"] .sk-level')?.textContent.trim()));
  ok(JSON.stringify(levels) === JSON.stringify(["Mastered", "Proficient", "Familiar", "Attempted"]), "Subjects rows show mastery levels: " + JSON.stringify(levels));
  ok((await page.locator(".sk-level:text('Not started')").count()) > 0, "untouched skills read Not started");
  await page.evaluate(() => FunSATPlanScreen.open());
  ok(/Mastered\s*\d/.test(await page.textContent(".hb-levels")), "the Plan screen tallies skill levels");

  // Practice desk chip with something due.
  await page.evaluate((id) => { profile.srs[id] = { box: 1, due: Date.now() - 1000, lapses: 1, last: Date.now() }; saveProfile(); document.getElementById("btnHome").click(); }, missed);
  await page.waitForSelector("#screen-start", { state: "visible" });
  await page.waitForSelector("#hbChipReview");
  ok(/Review 1 missed question/.test(await page.textContent("#hbChipReview")), "the Practice desk offers the due review");
  ok(!errs.length, "no page errors: " + errs.join(" | "));
  await ctx.close();

  // The queue survives a reload (it lives in the profile).
  ({ ctx, page, errs } = await open(browser, 390, 800));
  await page.evaluate(() => { profile.srs = { m1: { box: 2, due: Date.now() + 3 * 86400000, lapses: 1, last: Date.now() } }; saveProfile(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.FunSATHabits);
  ok((await page.evaluate(() => FunSATHabits.counts().total)) === 1, "the queue persists across a reload");
  await page.click("#deskMenu"); await page.click("#btnPlan");
  await page.waitForSelector("#screen-plan", { state: "visible" });
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "the Plan screen with the review pane fits a phone");
  ok(!errs.length, "no page errors on a phone: " + errs.join(" | "));
  await ctx.close();

  await browser.close();
  if (fails.length) { console.error("FAIL:\n - " + fails.join("\n - ")); process.exit(1); }
  console.log("PASS: review queue (miss, schedule, due review, advance), daily goal, Practice desk chip, Plan pane, mastery levels in Subjects, persistence and phone fit all work.");
})().catch((e) => { console.error(e); process.exit(1); });

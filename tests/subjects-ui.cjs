/* Subject practice: picker, skill filtering, separate stats, and score-exclusion. */
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

  await page.goto(BASE + PAGE_PATH, { waitUntil: "load" });
  await page.waitForSelector("body[data-workspace]");

  // Tabs exist and the subject tab opens the picker with active state.
  if (!(await page.locator("#btnPractice").count()) || !(await page.locator("#btnSubjectPractice").count())) throw new Error("both practice tabs must exist");
  await page.click("#btnSubjectPractice");
  await page.waitForSelector("#screen-subjects", { state: "visible" });
  if (!(await page.evaluate(() => document.getElementById("btnSubjectPractice").classList.contains("active")))) throw new Error("subject tab should be active");
  if (await page.evaluate(() => document.getElementById("btnPractice").classList.contains("active"))) throw new Error("practice tests tab should not be active on the subject screen");

  // Inventory: every skill has questions; report thin ones.
  const inv = await page.evaluate(() => Object.values(window.FunSATSubjects.inventory()).map((x) => ({ key: x.key, n: x.ids.length })).sort((a, b) => a.n - b.n));
  if (!inv.length) throw new Error("no skills in the inventory");
  const empty = inv.filter((x) => x.n === 0);
  if (empty.length) throw new Error("empty skills: " + empty.map((x) => x.key).join(", "));
  const total = inv.reduce((a, b) => a + b.n, 0);
  console.log("skills:", inv.length, "| total question slots:", total, "| under 10:", inv.filter((x) => x.n < 10).length, "| smallest:", inv[0].key + " (" + inv[0].n + ")");

  // ACT tab shows science.
  await page.click('#screen-subjects [data-s-test="act"]');
  await page.waitForTimeout(120);
  if (!(await page.locator('#screen-subjects [data-s-section="science"]').count())) throw new Error("ACT should offer a Science section");
  await page.click('#screen-subjects [data-s-test="sat"]');
  await page.waitForTimeout(120);

  // Pick a skill with at least 10 questions and start a 10-question drill.
  const target = await page.evaluate(() => {
    const inv = Object.values(window.FunSATSubjects.inventory()).filter((x) => x.test === "sat" && x.ids.length >= 10);
    return inv.length ? inv[0].key : Object.values(window.FunSATSubjects.inventory())[0].key;
  });
  const before = await page.evaluate(() => { const p = predictScores(); return { attempts: p.attempts, questions: p.questions }; });
  await page.evaluate((key) => window.FunSATSubjects.start(key, 10), target);
  await page.waitForSelector("#screen-test", { state: "visible" });
  const drill = await page.evaluate(() => {
    const meta = state.drillMeta;
    const key = state.keys[0];
    const ids = currentQids();
    const sameSkill = ids.filter((id) => { const q = byId(id); return q && (q.skill || q.domain) === meta.skill; }).length;
    const rec = makeAttemptRecord();
    return { meta, key, count: ids.length, sameSkill, practiceKind: rec.practiceKind, scoreEligible: rec.scoreEligible, moduleOnly: state.plan[key].moduleOnly };
  });
  if (drill.moduleOnly !== "drill") throw new Error("subject drill should set moduleOnly=drill");
  if (drill.count !== 10) throw new Error("expected a 10-question drill, got " + drill.count);
  if (!drill.meta.mixed && drill.sameSkill !== drill.count) throw new Error("non-mixed drill should stay on the chosen skill (saw " + drill.sameSkill + "/" + drill.count + ")");
  if (drill.meta.mixed && drill.sameSkill < 1) throw new Error("mixed drill should still include the chosen skill");
  if (drill.scoreEligible !== false || drill.practiceKind !== "topic") throw new Error("subject drills must not affect the score estimate");

  // Finish the drill: separate skill stats recorded; score estimate unchanged.
  await page.evaluate(() => { state.done = true; finalizeAttempt(true); });
  await page.waitForTimeout(150);
  const after = await page.evaluate((key) => {
    const st = profile.skillStats && profile.skillStats[key];
    const p = predictScores();
    return { sessions: st && st.sessions, r: st && st.r, w: st && st.w, attempts: p.attempts, questions: p.questions };
  }, target);
  if (!after.sessions) throw new Error("skill stats were not recorded");
  if (after.attempts !== before.attempts || after.questions !== before.questions) throw new Error("subject drill changed the estimated-score inputs");

  await browser.close();
  if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
  console.log("PASS: subject tabs, skill picker, 10-question skill drill, separate skill stats, and score exclusion all work.");
})().catch((error) => { console.error(error); process.exit(1); });

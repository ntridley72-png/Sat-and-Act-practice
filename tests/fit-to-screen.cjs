/* A test question fits the screen: on any desktop or tablet window the question, its choices and the controls are all on
 * screen with no scrolling, for a real test and for a topic drill, math, writing and reading questions alike. A long passage
 * scrolls in its own pane instead. Phones keep their own layout (and scroll), untouched. Needs the source tree on http://localhost:8899. */
const { chromium } = require("playwright-core");
const path = require("node:path");
const os = require("node:os");

const EXEC = process.env.PLAYWRIGHT_EXEC || path.join(os.homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-x64/chrome-headless-shell");
const BASE = process.env.BASE_URL || "http://localhost:8899";
const APP = BASE + "/" + encodeURIComponent("SAT & ACT Practice.html");
const SIZES = [[1280, 720], [1366, 768], [1440, 900], [1536, 864], [1920, 1080], [2560, 1440], [1024, 768], [820, 1180]];
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  for (const [w, h] of SIZES) {
    for (const mode of ["test", "drill"]) {
      const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
      const errs = [];
      page.on("pageerror", (e) => errs.push(e.message));
      await page.goto(APP + "?nosw", { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => !!window.FunSATPlanScreen);
      await page.waitForTimeout(400);
      const res = await page.evaluate(async (mode) => {
        const pick = (arr, n) => arr.filter((q) => !q.withheld && q.kind !== "gridin" && Array.isArray(q.choices)).sort((a, b) => a.id.localeCompare(b.id)).filter((_, i) => i % Math.floor(arr.length / n) === 0).slice(0, n);
        if (mode === "drill") {
          const ids = [].concat(pick(BANK.math, 14), pick(BANK.rw.filter((q) => q.kind === "writing"), 8), pick(BANK.rw.filter((q) => q.kind === "reading"), 8)).map((q) => q.id);
          state.cfg.testType = "sat"; state.cfg.section = "both"; startCustomSet(ids, "fit");
        } else { state.cfg.testType = "sat"; state.cfg.section = "both"; state.cfg.total = 54; document.getElementById("btnStart").click(); }
        await new Promise((r) => setTimeout(r, 500));
        const out = []; const qids = currentQids();
        for (let i = 0; i < Math.min(qids.length, 30); i++) {
          state.qi = i; render(); await new Promise((r) => setTimeout(r, 120));
          const body = document.querySelector("#screen-test .workspace-question-body");
          const right = body.querySelector(".split-r");
          const scrolls = (right ? right.scrollHeight > right.clientHeight + 2 : false) || body.scrollHeight > body.clientHeight + 2;
          const choices = [...body.querySelectorAll(".choice")]; const last = choices[choices.length - 1];
          const chk = document.getElementById("btnCheck");
          out.push({ id: qids[i], scrolls, lastOff: !!(last && last.getBoundingClientRect().bottom > body.getBoundingClientRect().bottom + 1), chkOff: !!(chk && chk.getBoundingClientRect().bottom > innerHeight), fit: +(getComputedStyle(body).getPropertyValue("--fit") || 1), pageScroll: document.documentElement.scrollHeight > innerHeight + 2 });
        }
        return out;
      }, mode);
      const bad = res.filter((r) => r.scrolls || r.lastOff || r.chkOff || r.pageScroll);
      ok(res.length >= 10, `${w}x${h} ${mode}: only ${res.length} questions were checked`);
      ok(bad.length === 0, `${w}x${h} ${mode}: ${bad.length}/${res.length} questions need scrolling: ` + bad.slice(0, 4).map((r) => r.id + "@" + r.fit).join(", "));
      ok(Math.min(...res.map((r) => r.fit)) >= 0.66, `${w}x${h} ${mode}: text was shrunk below the readable floor (${Math.min(...res.map((r) => r.fit))})`);
      ok(!errs.length, `${w}x${h} ${mode}: page errors ${errs.join(" | ")}`);
      await page.context().close();
    }
  }

  // Phones keep their own layout: no scaling is applied.
  {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage();
    await page.goto(APP + "?nosw", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.FunSATPlanScreen); await page.waitForTimeout(400);
    await page.evaluate(() => { state.cfg.testType = "sat"; state.cfg.section = "math"; state.cfg.total = 6; document.getElementById("btnStart").click(); });
    await require("./helpers/to-choice.cjs")(page); await page.waitForTimeout(400);
    ok(await page.evaluate(() => document.querySelector("#screen-test .workspace-question-body").style.getPropertyValue("--fit") === ""), "a phone was given a fit scale (phones keep their own layout)");
    await page.context().close();
  }

  await browser.close();
  if (fails.length) { console.error("FAIL:\n - " + fails.join("\n - ")); process.exit(1); }
  console.log("PASS: on every desktop and tablet size a test question, its choices and the controls fit without scrolling (tests and drills, math, writing and reading); phones are unchanged.");
})().catch((e) => { console.error(e); process.exit(1); });

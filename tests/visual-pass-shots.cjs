/* Screenshots of every affected screen at 320/390/768/1024/1280/1440 in each of
   the three workspace layouts, plus the generated college profile page.
   Output: docs/screenshots/visual-pass/<screen>-<theme>-<width>.png          */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const EXEC = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-x64/chrome-headless-shell");
const BASE = process.env.BASE_URL || "http://localhost:8899";
const APP = "/" + encodeURIComponent("SAT & ACT Practice.html");
const PAGES = process.env.PAGES_URL || "";
const OUT = path.join(path.dirname(__dirname), "docs", "screenshots", "visual-pass");
const WIDTHS = [320, 390, 768, 1024, 1280, 1440];
const THEMES = ["exam", "notebook", "focus"];
const SEED = {
  college: { sat: 1280, gpa: 3.7, grade: "11", homeState: "CA", saved: [110662, 170976, 166027] },
  scoreComparisonEnabled: true,
  history: [{
    id: "shot-1", done: true, testType: "sat", section: "both", practiceKind: "test",
    scoreEligible: true, total: 54, totalAnswered: 54, totalCorrect: 43, accuracy: 80,
    startedAt: 1759795200000, finishedAt: 1759797240000, elapsed: 2040,
    bestStreak: 9, tokensEarned: 18,
    secScores: { rw: { score: 640 }, math: { score: 640 } },
  }],
};

const SCREENS = [
  ["home", async (p) => { const c = p.locator("#homeScoreCard"); if (await c.count()) await c.click().catch(() => {}); await p.waitForTimeout(400); }],
  ["practice", async (p) => { await p.click("#btnStart"); await p.waitForSelector("#questionCard .choice", { timeout: 15000 }); await p.waitForTimeout(250); }],
  ["practice-answered", async (p) => { await p.click("#btnStart"); await p.waitForSelector("#questionCard .choice", { timeout: 15000 }); await p.locator("#questionCard .choice").first().click(); await p.locator(".qfx-check").first().click().catch(() => {}); await p.waitForTimeout(500); }],
  ["practice-calc", async (p) => { await p.click("#btnStart"); await p.waitForSelector("#questionCard .choice", { timeout: 15000 }); await p.click("#btnCalc"); await p.waitForTimeout(700); }],
  ["college", async (p) => { await p.click("#btnCollege"); await p.waitForSelector("#screen-college", { state: "visible" }); await p.waitForTimeout(1200); }],
  ["scholarships", async (p) => { await p.click("#btnScholarships"); await p.waitForSelector("#screen-scholarships", { state: "visible" }); const c = p.locator(".schl-card").first(); if (await c.count()) await c.click(); await p.waitForTimeout(500); }],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  let n = 0;
  for (const theme of THEMES) {
    for (const [name, go] of SCREENS) {
      for (const width of WIDTHS) {
        const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
        await ctx.route("**://*.wikimedia.org/**", (r) => r.abort());
        const page = await ctx.newPage();
        await page.addInitScript(([t, seed]) => { try { localStorage.setItem("funsatWorkspaceTheme", t); localStorage.setItem("satPrepProfile_v1", JSON.stringify(seed)); } catch (e) {} }, [theme, SEED]);
        await page.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
        try {
          await page.goto(BASE + APP, { waitUntil: "domcontentloaded" });
          await page.waitForSelector("body[data-workspace]");
          await page.evaluate(() => { try { arcade.close(); } catch (e) {} });
          await go(page);
          await page.screenshot({ path: path.join(OUT, `${name}-${theme}-${width}.png`), fullPage: true });
          n++;
        } catch (e) { console.log(`skip ${name}-${theme}-${width}: ${e.message.split("\n")[0]}`); }
        await ctx.close();
      }
    }
  }
  if (PAGES) {
    for (const width of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      await ctx.route("**://*.wikimedia.org/**", (r) => r.abort());
      const page = await ctx.newPage();
      await page.addInitScript((seed) => { try { localStorage.setItem("satPrepProfile_v1", JSON.stringify(seed)); } catch (e) {} }, SEED);
      try {
        await page.goto(PAGES + "/colleges/harvard-university/", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(700);
        await page.screenshot({ path: path.join(OUT, `college-page-${width}.png`), fullPage: true });
        n++;
        if (width === 1280) {
          await page.locator('.cg-open[data-cg="1"]').click();
          await page.waitForSelector(".cg-lb:not([hidden])");
          await page.waitForTimeout(250);
          await page.screenshot({ path: path.join(OUT, "college-page-lightbox-1280.png") });
          n++;
        }
      } catch (e) { console.log(`skip college-page-${width}: ${e.message.split("\n")[0]}`); }
      await ctx.close();
    }
  }
  await browser.close();
  console.log(`wrote ${n} screenshots to docs/screenshots/visual-pass/`);
})();

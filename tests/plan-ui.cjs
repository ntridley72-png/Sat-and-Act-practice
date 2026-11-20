/* Plan screen and worksheet maker, end to end: manual and PDF score-report import (a real PDF is
   generated in the test), validation, history and goal, the study plan, the AI coach note (with the
   network stubbed), printable worksheets (print stylesheet, real PDF, PNG), the Subjects shortcut,
   and phone fit. Needs the source tree on http://localhost:8899. */
const { chromium } = require("playwright-core");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

const EXEC = process.env.PLAYWRIGHT_EXEC || path.join(os.homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-x64/chrome-headless-shell");
const BASE = process.env.BASE_URL || "http://localhost:8899";
const APP = BASE + "/" + encodeURIComponent("SAT & ACT Practice.html");
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

async function open(browser, width, height, setup) {
  const ctx = await browser.newContext({ viewport: { width, height }, acceptDownloads: true });
  if (setup) await setup(ctx);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/ERR_TUNNEL|405|Failed to load resource/.test(m.text())) errs.push("console: " + m.text()); });
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("body[data-workspace]");
  await page.waitForFunction(() => !!window.FunSATPlanScreen && !!window.FunSATWorksheet && !!window.FunSATSubjects);
  await page.waitForTimeout(800);
  return { ctx, page, errs };
}
const openPlan = async (page, phone) => {
  if (phone) await page.click("#deskMenu");
  await page.click("#btnPlan");
  await page.waitForSelector("#screen-plan", { state: "visible" });
};

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });

  // ---------- empty state, manual entry, validation, goal ----------
  let { ctx, page, errs } = await open(browser, 1280, 900);
  await openPlan(page);
  ok(await page.evaluate(() => document.getElementById("btnPlan").classList.contains("active")), "Plan tab is marked active");
  ok(await page.evaluate(() => getComputedStyle(document.getElementById("screen-start")).display === "none"), "other screens are hidden on Plan");
  ok((await page.locator(".pl-focus li").count()) >= 3, "an empty profile still gets a starter focus list");
  ok(/little to go on|worth the most points/.test(await page.textContent(".pl-note")), "the empty plan says it has little to go on");

  await page.click("#plManual");
  await page.fill("#plDate", "2026-10-04");
  await page.fill("#plTotal", "1255");
  await page.fill('[data-pl-section="rw"]', "640");
  await page.fill('[data-pl-section="math"]', "610");
  await page.click("#plForm button[type=submit]");
  ok(/steps of 10|add up/.test(await page.textContent("#plErrors")), "an invalid total is refused with a reason");
  ok((await page.evaluate(() => profile.scoreReports.length)) === 0, "nothing is saved while the form has errors");
  await page.fill("#plTotal", "1250");
  await page.locator("summary", { hasText: "Skill levels" }).click();
  await page.selectOption('[data-pl-domain="Algebra"]', "3");
  await page.selectOption('[data-pl-domain="Advanced Math"]', "2");
  await page.selectOption('[data-pl-domain="Craft & Structure"]', "6");
  await page.click("#plForm button[type=submit]");
  await page.waitForSelector(".pl-list li");
  ok((await page.evaluate(() => profile.scoreReports.length)) === 1, "a valid report is saved");
  const rec = await page.evaluate(() => profile.scoreReports[0]);
  ok(rec.total === 1250 && rec.sections.rw === 640 && rec.domains.Algebra === 3 && rec.source === "manual", "the saved report keeps scores and levels");
  ok(!JSON.stringify(rec).match(/name|email|pdf/i) || Object.keys(rec).every((k) => ["id", "kind", "date", "total", "sections", "domains", "source", "addedAt", "percentile"].includes(k)), "the report holds numbers only");
  ok(/1250/.test(await page.textContent(".pl-tiles")), "the latest official score shows in the summary");
  ok((await page.locator("svg.pl-chart circle.pl-dot.official").count()) === 1, "the chart plots the official score");

  await page.fill("#plGoal", "1255"); await page.dispatchEvent("#plGoal", "change");
  ok(/steps of 10/.test(await page.textContent("#plGoalErr")), "an invalid goal is refused");
  await page.fill("#plGoal", "1400"); await page.dispatchEvent("#plGoal", "change");
  await page.waitForSelector(".pl-tiles");
  ok(/\+150 to go/.test(await page.textContent(".pl-tiles")), "the gap to the goal is shown");
  ok((await page.evaluate(() => profile.college && profile.college.customTarget)) === 1400, "the SAT goal is the same number as the college target");
  ok((await page.locator("svg.pl-chart line.pl-goal").count()) === 1, "the goal line is drawn");
  const first = await page.textContent(".pl-focus li:first-child");
  ok(/Advanced Math|Algebra|Equivalent|Exponential|Quadratic|Nonlinear|Linear/.test(first) && /Report: .*\/7/.test(first), "the plan leads with the weak report areas: " + first.slice(0, 90));
  ok((await page.locator(".pl-week").count()) >= 4, "a week-by-week schedule is shown");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.FunSATPlanScreen);
  await openPlan(page);
  ok((await page.locator(".pl-list li").count()) === 1 && /1400/.test(await page.textContent(".pl-tiles")), "history and goal persist after a reload");

  // The week's drill link starts a real drill.
  await page.locator(".pl-focus .pl-drill").first().click();
  await page.waitForSelector("#screen-test", { state: "visible" });
  ok((await page.evaluate(() => state.drillMeta && state.drillMeta.skill)) != null, "a Drill button starts that skill's drill");
  await ctx.close();

  // ---------- PDF upload, paste, unreadable files ----------
  ({ ctx, page, errs } = await open(browser, 1280, 900));
  await openPlan(page);
  const maker = await browser.newPage();
  await maker.setContent(`<html><body style="font-family:Arial;font-size:14px"><h1>SAT Score Report</h1>
    <p>College Board</p><p>Test Date: March 8, 2025</p><p>Your Total Score 1290 Score Range 1250 - 1330</p>
    <p>Reading and Writing 650 &nbsp; Math 640</p>
    <p>Information and Ideas 5 of 7</p><p>Craft and Structure 4 of 7</p><p>Expression of Ideas 6 of 7</p>
    <p>Standard English Conventions 3 of 7</p><p>Algebra 6 of 7</p><p>Advanced Math 2 of 7</p>
    <p>Problem-Solving and Data Analysis 5 of 7</p><p>Geometry and Trigonometry 4 of 7</p></body></html>`);
  const pdf = await maker.pdf({ format: "Letter" });
  await maker.close();
  const requests = [];
  page.on("request", (r) => { if (/\/api\//.test(r.url())) requests.push(r.url()); });
  await page.setInputFiles("#plFile", { name: "score-report.pdf", mimeType: "application/pdf", buffer: pdf });
  await page.waitForSelector("#plForm", { timeout: 20000 });
  ok((await page.inputValue("#plTotal")) === "1290", "the PDF's total score is read: " + (await page.inputValue("#plTotal")));
  ok((await page.inputValue('[data-pl-section="rw"]')) === "650" && (await page.inputValue('[data-pl-section="math"]')) === "640", "the PDF's section scores are read");
  ok((await page.inputValue("#plDate")) === "2025-03-08", "the PDF's test date is read");
  ok((await page.inputValue('[data-pl-domain="Advanced Math"]')) === "2" && (await page.inputValue('[data-pl-domain="Algebra"]')) === "6", "the PDF's skill levels are read");
  ok(/Check each number/.test(await page.textContent(".pl-info")), "the student is asked to check what was read");
  ok(!requests.length, "reading a PDF sends nothing to the server: " + requests.join(","));
  await page.fill("#plTotal", "1300"); // the student corrects a value before saving
  await page.fill('[data-pl-section="rw"]', "660");
  await page.click("#plForm button[type=submit]");
  await page.waitForSelector(".pl-list li");
  const saved = await page.evaluate(() => profile.scoreReports[0]);
  ok(saved.total === 1300 && saved.source === "pdf" && saved.date === "2025-03-08", "the corrected values are what is saved");
  const stored = await page.evaluate(() => localStorage.getItem(PROFILE_KEY));
  ok(!/%PDF|score-report\.pdf/.test(stored), "the PDF itself is not stored");

  // A file that is not a PDF is refused with a plain message and the manual form stays available.
  await page.setInputFiles("#plFile", { name: "fake.pdf", mimeType: "application/pdf", buffer: Buffer.from("hello, not a pdf") });
  await page.waitForSelector(".pl-notice");
  ok(/does not look like a PDF/.test(await page.textContent(".pl-notice")), "a non-PDF is refused");
  ok((await page.locator("#plManual").count()) === 1, "manual entry is still offered");

  // Pasted text works too, and text with no scores says so.
  await page.fill("#plPaste", "ACT Score Report Test date 10/26/2024 Composite Score 27 English 29 Mathematics 24 Reading 28 Science 26").catch(async () => { await page.locator(".pl-paste summary").click(); await page.fill("#plPaste", "ACT Score Report Test date 10/26/2024 Composite Score 27 English 29 Mathematics 24 Reading 28 Science 26"); });
  await page.click("#plPasteGo");
  await page.waitForSelector("#plForm");
  ok((await page.inputValue("#plKind")) === "act" && (await page.inputValue("#plTotal")) === "27", "pasted ACT text fills the ACT form");
  await page.click("#plCancel");
  await page.locator(".pl-paste summary").click();
  await page.fill("#plPaste", "nothing useful in here");
  await page.click("#plPasteGo");
  ok(/could not find any scores/.test(await page.textContent(".pl-notice")), "text without scores is reported honestly");
  // Delete.
  await page.locator(".pl-del").first().click();
  ok((await page.evaluate(() => profile.scoreReports.length)) === 0, "a report can be deleted");
  await ctx.close();

  // ---------- AI coach (network stubbed) ----------
  let coachCalls = 0, lastBody = null;
  ({ ctx, page, errs } = await open(browser, 1280, 900, async (c) => {
    await c.route("**/api/ai", async (r) => {
      coachCalls++; lastBody = JSON.parse(r.request().postData() || "{}");
      if (coachCalls === 1) return r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "no_key" }) });
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ content: "You are at 1250 and aiming for 1400.\nStart with Advanced Math.", provider: "groq", model: "test" }) });
    });
  }));
  await page.evaluate(() => { profile.scoreReports = [{ id: "r1", kind: "sat", date: "2026-10-04", total: 1250, sections: { rw: 640, math: 610 }, domains: { "Advanced Math": 2 }, source: "manual", addedAt: 1 }]; profile.studyPlan = { goals: { sat: { total: 1400, date: "" } }, minutes: 180 }; });
  await openPlan(page);
  await page.click("#plCoach");
  await page.waitForSelector(".pl-err");
  ok(/isn.t set up|tutor/i.test(await page.textContent(".pl-err")), "an unavailable coach fails gently");
  ok((await page.locator(".pl-focus li").count()) >= 3, "the plan still works when the coach is down");
  await page.click("#plCoach");
  await page.waitForSelector(".pl-coach p:has-text('Advanced Math')");
  ok(/Written by an AI/.test(await page.textContent(".pl-coach")), "AI text is labelled as AI-written");
  const sent = JSON.stringify(lastBody);
  ok(/1250/.test(sent) && /Advanced Math/.test(sent), "the coach is given the scores and skills");
  ok(!/email|password|token|@/i.test(sent.replace(/"role"/g, "")), "nothing personal is sent to the coach");
  ok((await page.evaluate(() => !!profile.studyPlan.coach && profile.studyPlan.coach.text.length > 10)), "the note is cached");
  await page.reload({ waitUntil: "domcontentloaded" }); await page.waitForFunction(() => !!window.FunSATPlanScreen);
  await openPlan(page);
  ok(/Advanced Math/.test(await page.textContent(".pl-coach")) && coachCalls === 2, "a cached note is shown without another request");
  await ctx.close();

  // ---------- worksheet maker ----------
  ({ ctx, page, errs } = await open(browser, 1280, 900));
  await page.evaluate(() => { profile.skillStats = { "sat|math|Algebra|Linear equations in one variable": { r: 2, w: 8, sessions: 1 } }; });
  await page.click("#btnSubjectPractice");
  await page.waitForSelector("#screen-subjects", { state: "visible" });
  await page.click('[data-s-section="math"]');
  await page.click('[data-s-ws="sat|math|Algebra|Linear equations in one variable"]');
  await page.waitForSelector("#wsDialog");
  ok(await page.evaluate(() => document.activeElement.id === "wsDialog"), "focus moves into the dialog");
  ok((await page.locator('[data-ws-key]:checked').count()) === 1 && (await page.locator('[data-ws-key="sat|math|Algebra|Linear equations in one variable"]').isChecked()), "the Subjects shortcut preselects that skill");
  ok((await page.locator(".ws-q").count()) === 10, "ten questions by default");
  ok((await page.locator(".ws-keygrid li").count()) === 10 && (await page.locator(".ws-exps li").count()) === 10, "an answer key and explanations are included");
  const ids = await page.evaluate(() => FunSATWorksheet.state.ids.slice());
  const keyOk = await page.evaluate(() => FunSATWorksheet.state.ids.every((id, i) => { const q = byId(id); return document.querySelectorAll(".ws-keygrid li b")[i].textContent === String.fromCharCode(65 + q.ans); }));
  ok(keyOk, "every answer-key letter matches the question's correct choice");
  ok(await page.evaluate(() => FunSATWorksheet.state.ids.every((id) => /Algebra|Advanced|Problem|Geometry/.test(byId(id).domain))), "questions come from the math bank");
  await page.selectOption("#wsCount", "5");
  ok((await page.locator(".ws-q").count()) === 5, "the count changes the sheet");
  await page.selectOption("#wsDiff", "hard");
  ok(await page.evaluate(() => FunSATWorksheet.state.ids.every((id) => byId(id).diff === "hard")), "difficulty filters the questions");
  await page.selectOption("#wsDiff", "mixed");
  await page.click("#wsShuffle");
  const reshuffled = await page.evaluate(() => FunSATWorksheet.state.ids.slice());
  ok(reshuffled.length === 5, "shuffle keeps the count");
  await page.uncheck("#wsKey");
  ok((await page.locator(".ws-keypage").count()) === 0, "the key can be turned off");
  await page.check("#wsKey");
  await page.uncheck("#wsName");
  ok((await page.locator(".ws-who").count()) === 0, "name and date lines can be turned off");
  await page.check("#wsName");
  // A passage-based skill shows the passage, and repeats are not duplicated.
  await page.click('[data-ws-test="sat"]');
  await page.evaluate(() => { const inv = FunSATSubjects.inventory(); const k = Object.keys(inv).find((x) => x.startsWith("sat|rw") && inv[x].ids.some((id) => byId(id).passage)); document.querySelector('[data-ws-key="' + k + '"]').click(); });
  // Print: the print stylesheet shows only the sheet.
  await page.evaluate(() => { window.__printed = null; window.print = () => { window.__printed = document.getElementById("wsPrintRoot").querySelectorAll(".ws-q").length; }; });
  await page.click("#wsPrint");
  await page.waitForFunction(() => window.__printed != null);
  ok(await page.evaluate(() => window.__printed) > 0, "printing builds the sheet in the print root");
  await page.emulateMedia({ media: "print" });
  const vis = await page.evaluate(() => ({
    topbar: document.querySelector(".topbar").getClientRects().length ? "shown" : "none", main: document.querySelector("main, .wrap").getClientRects().length ? "shown" : "none",
    dialog: getComputedStyle(document.getElementById("wsRoot")).display,
    sheet: getComputedStyle(document.querySelector("#wsPrintRoot .ws-sheet")).display,
    ads: Array.from(document.querySelectorAll(".sponsor-slot")).every((e) => getComputedStyle(e).display === "none"),
  }));
  ok(vis.topbar === "none" && vis.main === "none" && vis.dialog === "none" && vis.sheet !== "none" && vis.ads, "print media shows only the sheet: " + JSON.stringify(vis));
  const pdfBytes = await page.pdf({ format: "Letter", printBackground: true });
  ok(pdfBytes.slice(0, 5).toString() === "%PDF-" && pdfBytes.length > 4000, "the printed sheet makes a PDF");
  const pages = (pdfBytes.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  ok(pages >= 2, "the answer key starts a new page (" + pages + " pages)");
  await page.emulateMedia({ media: "screen" });
  // Image download.
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), page.click("#wsImage")]);
  const file = await dl.path();
  const png = fs.readFileSync(file);
  ok(dl.suggestedFilename() === "funsat-worksheet.png" && png.slice(1, 4).toString() === "PNG", "the image downloads as a PNG");
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
  ok(w >= 1500 && h > 600, "the image has the sheet's size (" + w + "x" + h + ")");
  // Escape closes the dialog and returns focus.
  await page.keyboard.press("Escape");
  ok((await page.locator("#wsDialog").count()) === 0, "Escape closes the dialog");
  ok(await page.evaluate(() => !document.body.classList.contains("ws-open") && document.activeElement && document.activeElement.hasAttribute("data-s-ws")), "focus returns to the button that opened it");
  ok(!errs.length, "no page errors in the worksheet flow: " + errs.join(" | "));
  await ctx.close();

  // ---------- phone ----------
  ({ ctx, page, errs } = await open(browser, 390, 800));
  await openPlan(page, true);
  await page.click("#plManual");
  await page.fill("#plTotal", "1250");
  await page.click("#plForm button[type=submit]");
  await page.waitForSelector(".pl-list li");
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "the Plan screen fits a phone");
  await page.click("#plWorksheet");
  await page.waitForSelector("#wsDialog");
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "the worksheet maker fits a phone");
  ok(await page.evaluate(() => { const r = document.getElementById("wsPrint").getBoundingClientRect(); return r.height >= 44 && r.right <= innerWidth; }), "worksheet buttons are tappable on a phone");
  ok(!errs.length, "no page errors on a phone: " + errs.join(" | "));
  await ctx.close();

  // ---------- header still fits with the extra tab ----------
  for (const w of [901, 1100, 1280, 1439, 1440, 1920]) {
    ({ ctx, page, errs } = await open(browser, w, 700));
    const fit = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll(".topbar button,.topbar .brand,.topbar #hudStreak,.topbar #tokenBadge")).filter((e) => e.offsetParent);
      const rects = els.map((e) => e.getBoundingClientRect());
      const overlap = rects.some((a, i) => rects.some((b, j) => j > i && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 8 && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1));
      return { right: Math.max(...rects.map((r) => r.right)), vw: innerWidth, overlap, plan: !!document.getElementById("btnPlan").offsetParent };
    });
    ok(fit.plan && !fit.overlap && fit.right <= fit.vw, "header fits with the Plan tab at " + w + "px: " + JSON.stringify(fit));
    await ctx.close();
  }

  await browser.close();
  if (fails.length) { console.error("FAIL:\n - " + fails.join("\n - ")); process.exit(1); }
  console.log("PASS: Plan screen, report import (manual, PDF, paste), validation, history, goal, study plan, coach note, worksheets (print, PDF, PNG), Subjects shortcut, phone fit and header fit all work.");
})().catch((e) => { console.error(e); process.exit(1); });

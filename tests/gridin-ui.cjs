/* Typed ("grid-in") answers in the real app: the input and its rules, equivalent forms, wrong answers, "I don't know", the
 * review and saved history, the tutor's view of a typed answer, practice tests that include them in realistic proportion
 * (and ACT / Reading & Writing that do not), the printable worksheet, and that it all fits the window without scrolling.
 * The tutor endpoint is mocked. Needs the source tree on http://localhost:8899. */
const { chromium } = require("playwright-core");
const path = require("node:path");
const os = require("node:os");

const EXEC = process.env.PLAYWRIGHT_EXEC || path.join(os.homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-x64/chrome-headless-shell");
const BASE = process.env.BASE_URL || "http://localhost:8899";
const APP = BASE + "/" + encodeURIComponent("SAT & ACT Practice.html") + "?nosw";
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  const tutor = [];
  await page.route("**/api/ai", async (route) => {
    try { tutor.push(JSON.parse(route.request().postData() || "{}")); } catch (e) { tutor.push({}); }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ content: JSON.stringify({ shortAnswer: "Set it up as a fraction.", detailedSteps: ["Count favourable.", "Divide by the total."], simpleSteps: ["Count.", "Divide."], memoryTip: "", equations: [], whyOthers: [], verification: "ok", nextPractice: "" }), provider: "mock", model: "mock" }) });
  });
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.FunSATGridIn && !!window.FunSATSubjects);

  const startSet = async (ids) => {
    await page.evaluate((ids) => { state.cfg.testType = "sat"; state.cfg.section = "math"; startCustomSet(ids, "grid"); }, ids);
    await page.waitForSelector("#gridInput");
    await page.waitForTimeout(250);
  };
  // A custom set is shuffled, so questions are visited by id, not by position.
  const goTo = async (id) => { await page.evaluate((id) => { state.qi = currentQids().indexOf(id); render(); }, id); await page.waitForSelector("#gridInput"); await page.waitForTimeout(200); };
  const type = async (text) => { await page.fill("#gridInput", text); await page.waitForTimeout(80); };
  const check = async () => { await page.click("#btnCheck"); await page.waitForTimeout(500); };

  // ---- the questions are live and well formed
  const live = await page.evaluate(() => { const g = BANK.math.filter((q) => q.kind === "gridin"); return { total: g.length, live: g.filter((q) => !q.withheld).length }; });
  ok(live.total >= 120 && live.live === live.total, `all ${live.total} typed-answer questions are live (live ${live.live})`);

  // ---- the box replaces the choices
  const ids = ["m5616", "m5625", "m5619", "m5501", "m5623", "m5504"];   // 8/15, 6.25, -1, 20, -3/2, 23
  await startSet(ids);
  await goTo("m5616");
  ok(await page.evaluate(() => document.querySelectorAll("#questionCard .choice").length === 0), "a grid-in shows no lettered choices");
  ok(await page.evaluate(() => !document.getElementById("btnElim")), "there is no cross-out button on a typed-answer question");
  ok(await page.evaluate(() => document.getElementById("btnCheck").disabled), "Check answer waits for an answer");
  ok(/Type your answer/.test(await page.textContent(".gi-howto")), "the box says how to enter an answer");
  ok(!(await page.evaluate(() => document.querySelector(".gridin").textContent.includes("8/15"))), "the box does not reveal the answer");

  // ---- input rules
  await type("abc"); await page.locator("#gridInput").blur(); await page.waitForTimeout(100);
  ok(/digits/i.test(await page.textContent("#gridErr")) && await page.evaluate(() => document.getElementById("btnCheck").disabled), "letters are refused with a reason");
  await type("3 1/2"); await page.locator("#gridInput").blur(); await page.waitForTimeout(100);
  ok(/mixed/i.test(await page.textContent("#gridErr")), "a mixed number is refused and the reason says so");
  await type("1/0"); await page.locator("#gridInput").blur(); await page.waitForTimeout(100);
  ok(/0 on the bottom/.test(await page.textContent("#gridErr")), "a zero denominator is refused");
  await type("1234567"); await page.locator("#gridInput").blur(); await page.waitForTimeout(100);
  ok(/Too long/.test(await page.textContent("#gridErr")), "an over-long answer is refused");
  await type("7/15");
  ok(await page.evaluate(() => !document.getElementById("btnCheck").disabled), "a valid answer enables Check answer");
  ok(await page.evaluate(() => !!document.querySelector("#gridPv .gi-frac")), "a fraction is previewed stacked, like the real grid");
  ok((await page.textContent("#gridErr")).trim() === "", "the error clears when the answer is valid");

  // ---- a wrong answer
  await check();
  const wrong = await page.evaluate(() => ({ ans: state.answers["m5616"], typed: state.typed["m5616"], fb: document.querySelector(".feedback") && document.querySelector(".feedback").textContent, cls: document.querySelector(".gridin").className, dis: document.getElementById("gridInput").disabled }));
  ok(wrong.ans === -2 && wrong.typed === "7/15", `a wrong typed answer is recorded (answer ${wrong.ans}, typed ${wrong.typed})`);
  ok(/Your answer:\s*7\/15/.test(wrong.fb) && /Correct answer:\s*8\/15/.test(wrong.fb), "the feedback shows what was typed and the right answer: " + (wrong.fb || "").slice(0, 120));
  ok(/wrong/.test(wrong.cls) && wrong.dis, "the box turns red and locks");
  await page.waitForTimeout(600);
  const explain = tutor.find((p) => p.teaching && p.messages && p.messages.some((m) => /Correct answer:/.test(m.content)));
  ok(!!explain, "a wrong typed answer asks the tutor for a worked explanation");
  if (explain) {
    const q = explain.messages.find((m) => /Correct answer:/.test(m.content)).content;
    ok(/Student's answer: 7\/15/.test(q) && /Correct answer: 8\/15/.test(q) && !/undefined|Choices:/.test(q), "the tutor is told the typed answer, the right answer, and that there are no choices: " + q.replace(/\n/g, " | ").slice(0, 200));
  }

  // ---- equivalent forms are right
  await goTo("m5625");          // 6.25
  await type("25/4"); await check();
  ok(await page.evaluate(() => state.answers["m5625"] === 0 && /right/.test(document.querySelector(".gridin").className)), "25/4 is accepted for 6.25");
  await goTo("m5619");          // -1
  await type("−1"); await check();     // a typographic minus sign
  ok(await page.evaluate(() => state.answers["m5619"] === 0), "a typographic minus sign counts");
  await goTo("m5616");
  ok(await page.evaluate(() => state.answers["m5616"] === -2), "going back keeps the earlier answer");
  ok(await page.evaluate(() => document.getElementById("gridInput").value === "7/15" && document.getElementById("gridInput").disabled), "an answered question shows what was typed");

  // ---- repeating decimals need 3 places
  await page.evaluate(() => { delete state.answers["m5616"]; delete state.typed["m5616"]; render(); }); await page.waitForSelector("#gridInput:not([disabled])");
  await type(".53"); await check();
  ok(await page.evaluate(() => state.answers["m5616"] === -2), ".53 is not accepted for 8/15");
  await page.evaluate(() => { delete state.answers["m5616"]; delete state.typed["m5616"]; render(); }); await page.waitForSelector("#gridInput:not([disabled])");
  await type(".533"); await check();
  ok(await page.evaluate(() => state.answers["m5616"] === 0), ".533 is accepted for 8/15");

  // ---- Enter submits; a draft survives a re-render; "I don't know" works
  await goTo("m5501");          // 20
  await type("2"); await page.evaluate(() => document.getElementById("btnStar").click()); await page.waitForTimeout(250);
  ok(await page.evaluate(() => document.getElementById("gridInput").value === "2"), "a half-typed answer survives a re-render");
  await type("20"); await page.press("#gridInput", "Enter"); await page.waitForTimeout(500);
  ok(await page.evaluate(() => state.answers["m5501"] === 0), "Enter checks the answer");
  await goTo("m5623");          // -3/2
  await page.click("#btnIdk"); await page.waitForTimeout(400);
  ok(await page.evaluate(() => state.answers["m5623"] === -1 && /I don.t know/.test(document.querySelector(".feedback").textContent)), "\"I don't know\" works on a typed-answer question");

  // ---- results, review, saved history
  await goTo("m5504");           // 23: answered wrongly so the review has a typed wrong answer to show
  await type("24"); await check();
  await page.evaluate(() => { finalizeAttempt(true); state.view = "results"; render(); });
  await page.waitForTimeout(500);
  await page.click("#btnReview").catch(() => {}); await page.waitForTimeout(400);
  const review = await page.evaluate(() => document.getElementById("reviewArea").textContent);
  ok(/Your answer:\s*24/.test(review) && /Correct:\s*23/.test(review), "the review shows the typed wrong answer and the correct one");
  ok(/Your answer:\s*\.533/.test(review) && /Correct:\s*8\/15/.test(review), "the review shows an equivalent typed form beside the stored answer");
  ok(/Your answer:\s*I don.t know/.test(review), "the review shows \"I don't know\" for a skipped typed question");
  ok(!/undefined|NaN/.test(review) && !/Your answer:\s*\?/.test(review), "the review has no broken answers");
  const saved = await page.evaluate(() => { const r = profile.history[0]; return { typed: r && r.typed && r.typed["m5616"], ans: r && r.answers["m5616"] }; });
  ok(saved.typed === ".533" && saved.ans === 0, "the typed answers are saved with the attempt (saved " + JSON.stringify(saved) + ")");

  // ---- practice tests carry a realistic share, and only SAT math does
  const mix = await page.evaluate(() => {
    const share = (pool, n, runs) => { const out = []; for (let i = 0; i < runs; i++) out.push(sample(pool, n).filter((q) => q.kind === "gridin").length); return out; };
    return { sat22: share(BANK.math, 22, 25), sat10: share(BANK.math, 10, 25), act: share(ACT_MATH, 20, 10), rw: share(BANK.rw, 27, 5), sat22domains: (() => { const d = {}; sample(BANK.math, 22).forEach((q) => { d[q.domain] = (d[q.domain] || 0) + 1; }); return d; })() };
  });
  ok(mix.sat22.every((n) => n >= 4 && n <= 7), "a 22-question SAT math module has 4 to 7 typed answers (saw " + [...new Set(mix.sat22)].join(",") + ")");
  ok(mix.sat10.every((n) => n >= 2 && n <= 3), "a 10-question set has 2 or 3 (saw " + [...new Set(mix.sat10)].join(",") + ")");
  ok(mix.act.every((n) => n === 0) && mix.rw.every((n) => n === 0), "ACT math and Reading & Writing have none");

  // ---- the printable worksheet prints a blank line, never the answer, and keys the answer
  const sheet = await page.evaluate(() => { FunSATWorksheet.state.ids = ["m5616", "m5501"]; FunSATWorksheet.state.key = true; return FunSATWorksheet.sheetHtml(); });
  const questionsPart = sheet.split('class="ws-keypage"')[0];
  ok(/ws-free/.test(questionsPart) && !/ws-ch/.test(questionsPart) && !/>8\/15</.test(questionsPart), "the worksheet shows an answer blank, not a lettered choice that gives the answer away");
  ok(/ws-keypage[\s\S]*8\/15/.test(sheet), "the worksheet answer key gives 8/15");

  // ---- it fits the window without scrolling
  for (const [w, h] of [[1366, 768], [1280, 720], [1024, 768], [1920, 1080]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate((ids) => { state.cfg.testType = "sat"; state.cfg.section = "math"; startCustomSet(ids, "grid"); }, ["m5616", "m5643", "m5620"]);
    await page.waitForSelector("#gridInput"); await page.waitForTimeout(350);
    const fit = await page.evaluate(() => { const b = document.querySelector("#screen-test .workspace-question-body"); const chk = document.getElementById("btnCheck"); const inp = document.getElementById("gridInput").getBoundingClientRect(); const pv = document.getElementById("gridPreview").getBoundingClientRect(); return { scroll: b.scrollHeight > b.clientHeight + 2, chkOff: chk.getBoundingClientRect().bottom > innerHeight, previewOff: pv.bottom > b.getBoundingClientRect().bottom + 1, page: document.documentElement.scrollHeight > innerHeight + 2 }; });
    ok(!fit.scroll && !fit.chkOff && !fit.previewOff && !fit.page, `a typed-answer question fits ${w}x${h} without scrolling ` + JSON.stringify(fit));
  }

  // ---- a phone gets the same box and it is usable
  await page.setViewportSize({ width: 390, height: 800 });
  await page.evaluate((ids) => { state.cfg.testType = "sat"; state.cfg.section = "math"; startCustomSet(ids, "grid"); }, ["m5616"]);
  await page.waitForSelector("#gridInput"); await page.waitForTimeout(300);
  const phone = await page.evaluate(() => { const r = document.getElementById("gridInput").getBoundingClientRect(); return { w: Math.round(r.width), inView: r.left >= 0 && r.right <= innerWidth, h: Math.round(r.height) }; });
  ok(phone.inView && phone.h >= 44, "on a phone the answer box fits the width and is at least 44px tall " + JSON.stringify(phone));

  ok(!errs.length, "no page errors: " + errs.join(" | "));
  await browser.close();
  if (fails.length) { console.error("FAIL:\n - " + fails.join("\n - ")); process.exit(1); }
  console.log("PASS: typed answers: input rules and reasons, equivalent forms, wrong and unsure answers, tutor and review see them, tests carry ~a quarter, worksheet blanks, fits every size and a phone.");
})().catch((e) => { console.error(e); process.exit(1); });

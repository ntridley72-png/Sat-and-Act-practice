/* The app sends the tutor's instructions with every request, keeps the key out of an unanswered question's prompt,
   shows the passage for Reading questions, and renders "Why the other choices miss" and "Try it yourself".
   The tutor endpoint is mocked, so this needs no network. Needs the source tree on http://localhost:8899. */
const { chromium } = require("playwright-core");
const path = require("node:path");
const os = require("node:os");

const EXEC = process.env.PLAYWRIGHT_EXEC || path.join(os.homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-x64/chrome-headless-shell");
const BASE = process.env.BASE_URL || "http://localhost:8899";
const APP = BASE + "/" + encodeURIComponent("SAT & ACT Practice.html");
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  const payloads = [];
  const reply = { shortAnswer: "Plug in the choices and compare.", detailedSteps: ["Name the unknown.", "Solve and check."], simpleSteps: ["Find x.", "Check it."], memoryTip: "Undo operations in reverse order.", equations: [], whyOthers: ["A) WHYMARK-ALPHA: forgot to divide.", "C) WHYMARK-GAMMA: sign error."], verification: "Substituted back.", nextPractice: "TRYMARK: solve 2x + 5 = 17 on your own." };
  await page.route("**/api/ai", async (route) => {
    try { payloads.push(JSON.parse(route.request().postData() || "{}")); } catch (e) { payloads.push({}); }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ content: JSON.stringify(reply), provider: "mock", model: "mock" }) });
  });

  await page.goto(APP + "?nosw", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.FunSATTutor && !!window.FunSATSubjects);
  ok(await page.evaluate(() => typeof FunSATTutor.system === "function"), "tutor instructions module is loaded in the app");
  await page.evaluate(() => { state.cfg.testType = "sat"; state.cfg.section = "math"; state.cfg.total = 6; });
  await page.click("#btnStart");
  await page.waitForSelector("#questionCard .choice");
  const info = await page.evaluate(() => { const q = byId(currentQids()[state.qi]); return { id: q.id, ans: q.ans, key: q.choices[q.ans], exp: q.exp, math: isMathQ(q) }; });

  // ---- 1) A follow-up question before answering: instructions first, question second, key withheld, server guard on.
  await page.evaluate(() => { document.getElementById("cinput").value = "Give me a hint"; document.getElementById("csend").click(); });
  await page.waitForFunction(() => document.querySelectorAll("#cmsgs .cmsg.a").length > 0 && !/Thinking/.test(document.querySelector("#cmsgs .cmsg.a:last-child").textContent), null, { timeout: 8000 });
  const coach = payloads.find((p) => p.messages && p.messages.some((m) => m.content === "Give me a hint"));
  ok(!!coach, "the follow-up reached the tutor endpoint");
  if (coach) {
    ok(coach.noAnswer === true && /^[A-D]$/.test(coach.correctLetter), "an unanswered follow-up sets noAnswer and sends the letter to the server guard");
    ok(coach.messages[0].role === "system" && /inside FunSAT/.test(coach.messages[0].content) && /HOW YOU TEACH/.test(coach.messages[0].content), "the first message is the teaching instructions");
    ok(/NOT ANSWERED YET/.test(coach.messages[0].content), "the instructions carry the no-reveal rule while unanswered");
    ok(coach.messages[1].role === "system" && /^Topic:|^Question:|^Passage:/m.test(coach.messages[1].content), "the second message is the question");
    ok(!/Correct answer|Practice explanation/.test(coach.messages[1].content), "the question message has no key or explanation before the student answers");
    ok(!coach.messages.some((m) => m.content && info.exp && m.content.includes(info.exp)), "the practice explanation is not sent before the student answers");
    ok(/STUDENT RECORD/.test(coach.messages[0].content), "the instructions include the student's record on the skill");
  }

  // ---- 2) A wrong answer triggers the worked explanation: key and the student's choice are now included.
  const wrongIndex = info.ans === 0 ? 1 : 0;
  payloads.length = 0;
  await page.locator("#questionCard .choice").nth(wrongIndex).click();
  await page.click("#btnCheck");
  await page.waitForFunction(() => document.querySelector(".why-others"), null, { timeout: 10000 });
  const explain = payloads.find((p) => p.teaching && p.messages.some((m) => /Correct answer:/.test(m.content)));
  ok(!!explain, "a wrong answer requests a worked explanation that includes the correct answer");
  if (explain) {
    ok(/Student's choice: [A-D]\)/.test(explain.messages[1].content), "the explanation request says what the student chose");
    ok(/TASK: Explain this question/.test(explain.messages[0].content), "the explanation uses the explain task");
    ok(explain.noAnswer === false || explain.noAnswer === undefined || explain.noAnswer === "" , "the explanation request is not marked unanswered");
  }
  const why = await page.locator(".why-others").first().textContent();
  ok(/WHYMARK-ALPHA/.test(why) && /WHYMARK-GAMMA/.test(why), "'Why the other choices miss' lists the tutor's notes");
  ok(/Why the other choices miss/.test(why), "the section is labelled");
  const next = await page.locator(".try-next").first().textContent();
  ok(/TRYMARK/.test(next) && /Try it yourself/.test(next), "'Try it yourself' shows the self-check");

  // ---- 3) The passage reaches the tutor for Reading questions (the follow-up chat used to leave it out).
  const reading = await page.evaluate(() => { const q = BANK.rw.find((x) => !x.withheld && x.kind === "reading" && x.passage); const block = tutorQuestion(q, null); return { hasPassage: block.includes(q.passage.slice(0, 40)), hasKey: new RegExp("Correct answer").test(block) }; });
  ok(reading.hasPassage && !reading.hasKey, "a Reading question's passage is included and its key is not (when unanswered)");

  // ---- 4) The skill record is real.
  const rec = await page.evaluate(() => FunSATSubjects.recordFor(byId(currentQids()[state.qi])));
  ok(rec && typeof rec.attempts === "number" && rec.skill, "recordFor returns the student's record for the question's skill");

  ok(!errs.length, "no page errors: " + errs.join(" | "));
  await browser.close();
  if (fails.length) { console.error("FAIL:\n - " + fails.join("\n - ")); process.exit(1); }
  console.log("PASS: the app sends the teaching instructions, withholds the key before an answer, includes Reading passages, and shows 'Why the other choices miss' and 'Try it yourself'.");
})().catch((e) => { console.error(e); process.exit(1); });

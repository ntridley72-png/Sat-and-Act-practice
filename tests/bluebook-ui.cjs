/* Bluebook-style practice screen: layout at desktop and phone widths, the floating calculator,
   the tutor bubble, the More menu, the question navigator, ACT chrome, and that the Desmos API is
   still created with the same options as before. Needs the source tree on http://localhost:8899. */
const { chromium } = require("playwright-core");
const path = require("node:path");
const os = require("node:os");

const EXEC = process.env.PLAYWRIGHT_EXEC || path.join(os.homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-x64/chrome-headless-shell");
const BASE = process.env.BASE_URL || "http://localhost:8899";
const APP = BASE + "/" + encodeURIComponent("SAT & ACT Practice.html");
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

const DESMOS_STUB = `window.Desmos={GraphingCalculator:function(host,opts){window.__desmosOpts=opts;window.__desmosCalls=(window.__desmosCalls||0)+1;
  return {resize(){},setBlank(){},setExpression(e){(window.__desmosExprs=window.__desmosExprs||[]).push(e)},setMathBounds(){}}}};`;

async function open(browser, width, height, kind) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const requested = [];
  await ctx.route(/desmos\.com\/api/, (r) => { requested.push(r.request().url()); r.fulfill({ contentType: "text/javascript", body: DESMOS_STUB }); });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("body[data-workspace]");
  await page.waitForTimeout(1500);
  if (kind === "act") {
    await page.click('#typePicker .pick[data-type="act"]');
    await page.click('#actSectionPicker .pick[data-act-section="math"]');
  } else {
    await page.evaluate(() => { state.cfg.testType = "sat"; state.cfg.section = "math"; });
  }
  await page.evaluate(() => { state.cfg.total = 6; });
  await page.click("#btnStart");
  await require("./helpers/to-choice.cjs")(page, { timeout: 15000 });
  await page.waitForTimeout(400);
  return { ctx, page, errs, requested };
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });

  // ---------- desktop SAT ----------
  let { ctx, page, errs, requested } = await open(browser, 1280, 800, "sat");
  ok(await page.evaluate(() => getComputedStyle(document.querySelector(".topbar")).display === "none"), "site navigation is hidden while practicing");
  const head = await page.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
    return { tag: r(".module-tag"), timer: r("#modTimer"), tools: r("#toolsBar"), more: r("#btnMore"), foot: r(".bb-foot"), nav: r("#btnNavOpen"), check: r("#btnCheck"), back: r("#btnPrev"), vw: innerWidth };
  });
  ok(head.tag && head.timer && head.tools && head.more, "header has section, timer, tools and More");
  ok(head.tag.l < head.timer.l && head.timer.r < head.tools.l, "header order is section, timer, tools");
  ok(Math.abs((head.timer.l + head.timer.r) / 2 - head.vw / 2) < 40, "timer is centred");
  ok(head.foot && Math.abs(head.foot.b - 800) < 2, "bottom bar is pinned to the bottom");
  ok(head.nav && Math.abs((head.nav.l + head.nav.r) / 2 - head.vw / 2) < 40, "question navigator sits in the middle of the bottom bar");
  ok(head.back && head.check && head.back.l > head.nav.r && head.check.l > head.back.l, "Back and Check answer sit on the right");
  ok(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 2), "no horizontal scroll on desktop");

  // Answering still works: pick, check, next.
  await page.click(".choice >> nth=0");
  ok(await page.evaluate(() => !document.getElementById("btnCheck").disabled), "choosing an answer enables Check answer");
  await page.click("#btnCheck");
  await page.waitForSelector("#btnNext");
  ok(await page.evaluate(() => !!document.querySelector(".feedback")), "feedback appears after checking");
  await page.click("#btnNext");
  await page.waitForTimeout(300);
  ok((await page.textContent("#btnNavOpen")).includes("2"), "Next moves to question 2");
  await page.click("#btnPrev");
  await page.waitForTimeout(300);
  ok((await page.textContent("#btnNavOpen")).includes("1"), "Back returns to question 1");

  // Navigator popup.
  await page.click("#btnNavOpen");
  ok(await page.evaluate(() => document.getElementById("navPop").classList.contains("show")), "navigator opens");
  const dots = await page.evaluate(() => [...document.querySelectorAll("#navPop .qdot")].map((d) => d.textContent));
  const modLen = Number(/of (\d+)/.exec(await page.textContent("#btnNavOpen"))[1]);
  ok(dots.length === modLen && modLen >= 2, "navigator lists every question in the module: " + dots.length + " vs " + modLen);
  await page.click("#navPop .qdot >> nth=" + (modLen - 1));
  await page.waitForTimeout(300);
  ok(new RegExp("^" + modLen + " ?|Question " + modLen).test((await page.textContent("#btnNavOpen")).trim()), "navigator jumps to the last question");

  // More menu.
  ok(await page.evaluate(() => getComputedStyle(document.querySelector(".module-actions")).display === "none"), "More menu starts closed");
  await page.click("#btnMore");
  ok(await page.evaluate(() => getComputedStyle(document.querySelector(".module-actions")).display !== "none"), "More opens the actions");
  await page.keyboard.press("Escape");
  ok(await page.evaluate(() => getComputedStyle(document.querySelector(".module-actions")).display === "none"), "Escape closes More");

  // Calculator: Desmos is created with the same options, and the window is draggable.
  await page.click("#btnCalc");
  await page.waitForFunction(() => window.__desmosCalls >= 1, null, { timeout: 5000 }).catch(() => {});
  const opts = await page.evaluate(() => window.__desmosOpts);
  ok(JSON.stringify(opts) === JSON.stringify({ keypad: true, expressions: true, settingsMenu: true, zoomButtons: true, expressionsCollapsed: false, border: false }),
    "Desmos is created with the original options: " + JSON.stringify(opts));
  ok(requested.length >= 1 && /api\/v1\.12\/calculator\.js\?apiKey=/.test(requested[0]), "Desmos API v1.12 is requested with its key: " + requested[0]);
  const dock = await page.evaluate(() => { const d = document.getElementById("workspaceCalcDock"); const b = d.getBoundingClientRect(); return { pos: getComputedStyle(d).position, l: b.left, t: b.top, w: b.width }; });
  ok(dock.pos === "fixed" && dock.w > 300 && Math.round(dock.l) === 0, "calculator is docked on the left, like the Digital SAT: " + JSON.stringify(dock));
  const qLeft = await page.evaluate(() => document.querySelector("#screen-test .workspace-question-body").getBoundingClientRect().left);
  ok(qLeft >= dock.l + dock.w - 2, "the question sits beside the calculator, not under it (" + Math.round(qLeft) + ")");
  await page.click("#btnCalc");
  ok(await page.evaluate(() => getComputedStyle(document.getElementById("workspaceCalcDock")).display === "none"), "calculator closes");

  // Tutor bubble.
  ok(await page.evaluate(() => getComputedStyle(document.querySelector(".workspace-learning")).display === "none"), "tutor panel starts closed");
  await page.click("#bbxBubble");
  const panel = await page.evaluate(() => { const p = document.querySelector(".workspace-learning"); const b = p.getBoundingClientRect(); return { disp: getComputedStyle(p).display, tabs: p.querySelectorAll(".learning-tab").length, bottom: b.bottom, right: b.right }; });
  ok(panel.disp === "block" && panel.tabs === 5, "bubble opens the learning tools: " + JSON.stringify(panel));
  ok(panel.bottom < head.foot.t, "tutor panel stays above the bottom bar");
  await page.keyboard.press("Escape");
  ok(await page.evaluate(() => getComputedStyle(document.querySelector(".workspace-learning")).display === "none"), "Escape closes the tutor");
  ok(errs.length === 0, "page errors on desktop: " + errs.join(" | "));
  await ctx.close();

  // ---------- phone SAT ----------
  ({ ctx, page, errs } = await open(browser, 390, 800, "sat"));
  const ph = await page.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
    return { foot: r(".bb-foot"), back: r("#btnPrev"), check: r("#btnCheck"), nav: r("#btnNavOpen"), elim: r("#btnElim"), flag: r("#btnFlag"), bubble: r("#bbxBubble"),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, actions: getComputedStyle(document.querySelector(".module-actions")).display, tools: r("#toolsBar") };
  });
  ok(ph.overflow <= 2, "no horizontal scroll on a phone: " + ph.overflow);
  ok(ph.foot.h < 90, "bottom bar fits one row on a phone: " + Math.round(ph.foot.h) + "px");
  ok(ph.elim.r <= ph.nav.l + 2 && ph.nav.r <= ph.back.l + 2 && ph.back.r <= ph.check.l + 12, "phone bottom bar order: tools, question number, Back, Check");
  ok(ph.check.r <= 390 && ph.elim.l >= 0, "phone bottom bar controls stay on screen");
  ok(ph.actions === "none", "More actions are collapsed on a phone");
  ok(ph.bubble.b < ph.foot.t, "tutor bubble sits above the bottom bar");
  await page.click("#btnCalc");
  await page.waitForTimeout(500);
  const sheet = await page.evaluate(() => { const d = document.getElementById("workspaceCalcDock").getBoundingClientRect(); return { l: d.left, r: d.right, t: d.top, b: d.bottom, h: d.height }; });
  ok(sheet.l <= 1 && sheet.r >= 389, "calculator is a full-width sheet on a phone");
  ok(sheet.b <= ph.foot.t + 2, "calculator sheet stops above the bottom bar: sheet bottom " + Math.round(sheet.b) + " vs bar top " + Math.round(ph.foot.t));
  ok(sheet.t > 120, "calculator sheet leaves the question header visible: top " + Math.round(sheet.t));
  await page.click("#btnCalc");
  ok(errs.length === 0, "page errors on phone: " + errs.join(" | "));
  await ctx.close();

  // ---------- ACT ----------
  ({ ctx, page, errs } = await open(browser, 1280, 800, "act"));
  ok(await page.evaluate(() => document.body.dataset.test === "act"), "ACT tests are marked on the body");
  const actHead = await page.evaluate(() => { const c = getComputedStyle(document.querySelector("#screen-test>.card:first-child")); return { bg: c.backgroundColor, timer: getComputedStyle(document.getElementById("modTimer")).color }; });
  ok(actHead.bg === "rgb(11, 42, 91)" && actHead.timer === "rgb(255, 255, 255)", "ACT header is dark blue with a readable timer: " + JSON.stringify(actHead));
  ok(await page.evaluate(() => document.querySelectorAll(".choice").length >= 4), "ACT questions render their choices");
  ok(errs.length === 0, "page errors in ACT: " + errs.join(" | "));
  await ctx.close();

  await browser.close();
  console.log(fails.length ? "FAIL:\n - " + fails.join("\n - ") : "PASS: Bluebook-style layout, calculator window and sheet, tutor bubble, More menu, navigator, ACT chrome, phone fit and the Desmos options all hold.");
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

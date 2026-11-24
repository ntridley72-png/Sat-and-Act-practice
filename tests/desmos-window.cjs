/* The Desmos calculator works and has its own section on the left, like the Digital SAT.
 *
 * Desmos itself comes from desmos.com, which a test cannot reach, so a stand-in Desmos records what the app asks of it.
 * This proves the app's side: the calculator opens as Desmos and is told to resize, the AI's steps are typed into it, it docks
 * on the left between the header and the footer with the question moved right, resizes by its edge (mouse, touch, keys)
 * within limits, remembers its width, expands, survives a smaller window, undocks when closed, and still opens when Desmos
 * cannot load. Phones get a bottom sheet instead.
 * Needs the source tree on http://localhost:8899. */
const { chromium } = require("playwright-core");
const path = require("node:path");
const os = require("node:os");

const EXEC = process.env.PLAYWRIGHT_EXEC || path.join(os.homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-x64/chrome-headless-shell");
const BASE = process.env.BASE_URL || "http://localhost:8899";
const APP = BASE + "/" + encodeURIComponent("SAT & ACT Practice.html") + "?nosw";
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

const STUB = `window.__desmos = []; window.Desmos = { GraphingCalculator: function (host) {
  var d = document.createElement("div"); d.id = "fake-desmos"; d.style.cssText = "height:100%;min-height:200px"; d.textContent = "Desmos"; host.appendChild(d);
  return { resize: function () { window.__desmos.push("resize"); }, setExpression: function (e) { window.__desmos.push("expr:" + e.latex); }, setBlank: function () { window.__desmos.push("blank"); }, setMathBounds: function () { window.__desmos.push("bounds"); }, destroy: function () {} };
} };`;

async function openCalc(page) {
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.FunSATPlanScreen);
  await page.evaluate(() => { state.cfg.testType = "sat"; state.cfg.section = "math"; state.cfg.total = 6; document.getElementById("btnStart").click(); });
  await require("./helpers/to-choice.cjs")(page);
  await page.click("#btnCalc");
  await page.waitForSelector("#calcPanel.show");
  await page.waitForTimeout(400);
}
const dockRect = (page) => page.evaluate(() => { const r = document.getElementById("workspaceCalcDock").getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; });
async function dragHeader(page, dx, dy) {
  const box = await page.evaluate(() => { const h = document.querySelector("#workspaceCalcDock .calc-head"); const r = h.getBoundingClientRect(); return { x: r.left + 14, y: r.top + r.height / 2 }; });
  await page.mouse.move(box.x, box.y); await page.mouse.down();
  await page.mouse.move(box.x + dx / 2, box.y + dy / 2, { steps: 4 }); await page.mouse.move(box.x + dx, box.y + dy, { steps: 4 });
  await page.mouse.up(); await page.waitForTimeout(150);
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });

  // =================== Desmos present
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errs = []; page.on("pageerror", (e) => errs.push(e.message));
    await page.addInitScript(STUB);
    await openCalc(page);
    ok((await page.textContent("#calcEngine")).trim() === "Desmos", "the calculator opens as Desmos");
    ok(await page.evaluate(() => window.__desmos.includes("resize")), "Desmos is told to resize when the calculator opens");

    // ---- the AI's steps are typed into it
    await page.evaluate(() => calcTool.demo(["y=x^2-5x+6", "y=0"]));
    await page.waitForTimeout(1700);
    ok(await page.evaluate(() => window.__desmos.includes("expr:y=x^2-5x+6") && window.__desmos.includes("expr:y=0")), "the tutor's calculator steps are entered into Desmos");

    // ---- docked on the left between the test header and the footer, like the Digital SAT
    const geo = () => page.evaluate(() => {
      const d = document.getElementById("workspaceCalcDock").getBoundingClientRect();
      const h = document.querySelector("#screen-test .module-head").getBoundingClientRect(), f = document.querySelector("#screen-test .bb-foot").getBoundingClientRect();
      const q = document.querySelector("#screen-test .workspace-question-body").getBoundingClientRect();
      return { l: Math.round(d.left), t: Math.round(d.top), b: Math.round(d.bottom), w: Math.round(d.width), headB: Math.round(h.bottom), footT: Math.round(f.top), qL: Math.round(q.left),
        docked: document.body.classList.contains("bb-calc-docked"), xScroll: document.documentElement.scrollWidth - innerWidth };
    });
    let g = await geo();
    ok(g.docked && g.l === 0, "the calculator opens docked on the left: " + JSON.stringify(g));
    ok(Math.abs(g.t - g.headB) <= 2 && Math.abs(g.b - g.footT) <= 2, "it fills the height between the header and the footer: " + JSON.stringify(g));
    ok(g.qL >= g.l + g.w - 2, "the question moves right instead of being covered: " + JSON.stringify(g));
    ok(g.xScroll <= 1, "no sideways scrolling");
    // The header no longer drags it around.
    await dragHeader(page, 300, 120);
    ok((await geo()).l === 0, "dragging the header does not move the docked calculator");

    // ---- resize by dragging the right edge (mouse), remembered, Desmos told to resize
    const resizesBefore = await page.evaluate(() => window.__desmos.filter((x) => x === "resize").length);
    const edge = await page.locator(".bb-dock-edge").boundingBox();
    await page.mouse.move(edge.x + 6, edge.y + 200); await page.mouse.down(); await page.mouse.move(edge.x + 206, edge.y + 200, { steps: 6 }); await page.mouse.up();
    let g2 = await geo();
    ok(Math.abs(g2.w - (g.w + 200)) <= 8, `dragging the edge resizes it (${g.w} -> ${g2.w})`);
    ok(g2.qL >= g2.w - 2, "the question moves with it");
    ok(await page.evaluate((n) => window.__desmos.filter((x) => x === "resize").length > n, resizesBefore), "Desmos is told to resize");
    // Touch, then keyboard.
    await page.evaluate(() => {
      const e = document.querySelector(".bb-dock-edge"), r = e.getBoundingClientRect(), x = r.left + 6, y = r.top + 200;
      const ev = (type, dx) => e.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: "touch", isPrimary: true, clientX: x + dx, clientY: y, buttons: 1 }));
      ev("pointerdown", 0); ev("pointermove", -60); ev("pointermove", -120); ev("pointerup", -120);
    });
    const g3 = await geo();
    ok(Math.abs(g3.w - (g2.w - 120)) <= 8, `a finger can resize it (${g2.w} -> ${g3.w})`);
    await page.focus(".bb-dock-edge"); await page.keyboard.press("ArrowLeft");
    ok(Math.abs((await geo()).w - (g3.w - 40)) <= 2, "arrow keys resize it");
    // Limits: it can't swallow the question or vanish.
    let eb = await page.locator(".bb-dock-edge").boundingBox();
    await page.mouse.move(eb.x + 6, eb.y + 100); await page.mouse.down(); await page.mouse.move(1430, eb.y + 100, { steps: 4 }); await page.mouse.up();
    ok((await geo()).w <= 1440 - 420, "the question keeps at least 420px");
    eb = await page.locator(".bb-dock-edge").boundingBox();
    await page.mouse.move(eb.x + 6, eb.y + 100); await page.mouse.down(); await page.mouse.move(20, eb.y + 100, { steps: 4 }); await page.mouse.up();
    ok((await geo()).w >= 300, "the calculator keeps at least 300px");
    // Remembered across a reload.
    eb = await page.locator(".bb-dock-edge").boundingBox();
    await page.mouse.move(eb.x + 6, eb.y + 100); await page.mouse.down(); await page.mouse.move(600, eb.y + 100, { steps: 4 }); await page.mouse.up();
    const saved = await geo();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.FunSATPlanScreen);
    await page.evaluate(() => { state.cfg.testType = "sat"; state.cfg.section = "math"; state.cfg.total = 6; document.getElementById("btnStart").click(); });
    await require("./helpers/to-choice.cjs")(page);
    await page.click("#btnCalc"); await page.waitForSelector("#calcPanel.show"); await page.waitForTimeout(400);
    ok(Math.abs((await geo()).w - saved.w) <= 2, `the width is remembered (${saved.w})`);
    // Expand button: wide, then back.
    await page.click("#calcWide"); await page.waitForTimeout(150);
    ok((await geo()).w >= Math.round(1440 * 0.58) - 2, "the expand button makes it wide");
    await page.click("#calcWide"); await page.waitForTimeout(150);
    ok(Math.abs((await geo()).w - saved.w) <= 2, "and back");
    // Smaller window: still docked and inside the screen.
    await page.setViewportSize({ width: 1000, height: 600 });
    await page.waitForTimeout(400);
    const small = await geo();
    ok(small.docked && small.w <= 1000 - 420 && small.xScroll <= 1, "after the window shrinks it stays docked and leaves room for the question: " + JSON.stringify(small));
    // Closing gives the question its full width back.
    await page.click("#calcClose"); await page.waitForTimeout(200);
    ok(await page.evaluate(() => !document.body.classList.contains("bb-calc-docked") && !document.querySelector("#screen-test .workspace-grid").style.marginLeft), "closing the calculator undocks it");
    ok(!errs.length, "no page errors: " + errs.join(" | "));
    await ctx.close();
  }

  // =================== Desmos cannot load: the calculator still opens, says so, and still moves
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.route(/desmos\.com|cdnjs\.cloudflare\.com/, (route) => route.abort());
    const page = await ctx.newPage();
    const errs = []; page.on("pageerror", (e) => errs.push(e.message));
    await openCalc(page);
    await page.waitForTimeout(800);
    const engine = await page.evaluate(() => document.getElementById("calcEngine").textContent + " | " + document.getElementById("calcHost").textContent);
    ok(/basic|couldn't load|open Desmos/i.test(engine), "when Desmos cannot load the panel says so and offers a way to open Desmos: " + engine.slice(0, 120));
    ok(await page.evaluate(() => document.body.classList.contains("bb-calc-docked") && document.getElementById("workspaceCalcDock").getBoundingClientRect().left === 0), "the docked calculator still opens when Desmos cannot load");
    ok(!errs.length, "no page errors (Desmos blocked): " + errs.join(" | "));
    await ctx.close();
  }

  // =================== a phone gets a bottom sheet, not a draggable window
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
    const page = await ctx.newPage();
    await page.addInitScript(STUB);
    await openCalc(page);
    const before = await dockRect(page);
    const headBox = await page.evaluate(() => { const r = document.querySelector("#workspaceCalcDock .calc-head").getBoundingClientRect(); return { x: r.left + 14, y: r.top + r.height / 2 }; });
    await page.mouse.move(headBox.x, headBox.y); await page.mouse.down(); await page.mouse.move(headBox.x - 100, headBox.y - 150, { steps: 4 }); await page.mouse.up();
    const after = await dockRect(page);
    ok(before.l === after.l && before.t === after.t, "on a phone the calculator sheet does not drag around");
    ok(await page.evaluate(() => !document.getElementById("workspaceCalcDock").style.left), "no free-floating position is stored on a phone");
    await ctx.close();
  }

  await browser.close();
  if (fails.length) { console.error("FAIL:\n - " + fails.join("\n - ")); process.exit(1); }
  console.log("PASS: the calculator opens as Desmos, takes the tutor's steps, docks on the left with the question beside it, resizes by mouse, finger or keys within limits, is remembered, expands, survives a smaller window, works without Desmos, and is a sheet on phones.");
})().catch((e) => { console.error(e); process.exit(1); });

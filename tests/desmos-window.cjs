/* The Desmos calculator window works and can be moved.
 *
 * Desmos itself comes from desmos.com, which a test cannot reach, so a stand-in Desmos records what the app asks of it.
 * This proves the app's side: the calculator opens as Desmos and is told to resize, the AI's steps are typed into it, the
 * window drags by its header (mouse and touch) and stays on screen, remembers where it was left across a reload and when
 * the window shrinks, and still opens, moves and says so when Desmos cannot load. Phones get a bottom sheet instead of a window.
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
  await page.waitForSelector("#questionCard .choice");
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

    // ---- drag by the header
    const start = await dockRect(page);
    const resizesBefore = await page.evaluate(() => window.__desmos.filter((x) => x === "resize").length);
    await dragHeader(page, -320, 140);
    const moved = await dockRect(page);
    ok(Math.abs((moved.l - start.l) + 320) <= 3 && Math.abs((moved.t - start.t) - 140) <= 3, `the window follows the pointer (moved ${moved.l - start.l}, ${moved.t - start.t}; wanted -320, 140)`);
    ok(moved.w === start.w && moved.h === start.h, "moving the window does not change its size");
    ok(await page.evaluate((n) => window.__desmos.filter((x) => x === "resize").length > n, resizesBefore), "Desmos is told to resize after the window is dropped");
    ok(await page.evaluate(() => getComputedStyle(document.getElementById("workspaceCalcDock")).position === "fixed"), "the calculator is a floating window");

    // ---- it cannot be dragged off screen
    await dragHeader(page, -3000, -3000);
    let r = await dockRect(page);
    ok(r.l >= 0 && r.t >= 60 && r.r >= 100, `dragged far up-left it stays reachable (left ${r.l}, top ${r.t}, right ${r.r})`);
    await dragHeader(page, 4000, 4000);
    r = await dockRect(page);
    ok(r.l <= 1440 - 100 && r.t <= 900 - 60, `dragged far down-right it stays reachable (left ${r.l}, top ${r.t})`);

    // ---- touch drag (pointer events from a finger)
    await dragHeader(page, -600, -600);   // bring it back near the top-left first
    const t0 = await dockRect(page);
    await page.evaluate(() => {
      const head = document.querySelector("#workspaceCalcDock .calc-head"), r = head.getBoundingClientRect(), x = r.left + 14, y = r.top + r.height / 2;
      const ev = (type, dx, dy, target) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: "touch", isPrimary: true, clientX: x + dx, clientY: y + dy, buttons: 1 }));
      ev("pointerdown", 0, 0, head); ev("pointermove", 100, 60, head); ev("pointermove", 200, 120, head); ev("pointerup", 200, 120, head);
    });
    await page.waitForTimeout(150);
    const t1 = await dockRect(page);
    ok(Math.abs((t1.l - t0.l) - 200) <= 3 && Math.abs((t1.t - t0.t) - 120) <= 3, `a finger can drag the window (moved ${t1.l - t0.l}, ${t1.t - t0.t}; wanted 200, 120)`);
    // A cancelled touch (the browser took the gesture) must not leave the window stuck in drag mode.
    await page.evaluate(() => {
      const head = document.querySelector("#workspaceCalcDock .calc-head"), r = head.getBoundingClientRect(), x = r.left + 14, y = r.top + r.height / 2;
      const ev = (type, dx, dy) => head.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 8, pointerType: "touch", isPrimary: true, clientX: x + dx, clientY: y + dy, buttons: 1 }));
      ev("pointerdown", 0, 0); ev("pointermove", 20, 20); ev("pointercancel", 20, 20);
    });
    ok(await page.evaluate(() => !document.getElementById("workspaceCalcDock").classList.contains("dragging")), "a cancelled touch ends the drag");
    const afterCancel = await dockRect(page);
    await page.evaluate(() => { const head = document.querySelector("#workspaceCalcDock .calc-head"), r = head.getBoundingClientRect(); head.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 8, pointerType: "touch", clientX: r.left + 300, clientY: r.top + 200, buttons: 1 })); });
    ok((await dockRect(page)).l === afterCancel.l, "after a cancelled touch the window no longer follows the pointer");

    // ---- remembered across a reload
    await dragHeader(page, 0, 0);
    const saved = await dockRect(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.FunSATPlanScreen);
    await page.evaluate(() => { state.cfg.testType = "sat"; state.cfg.section = "math"; state.cfg.total = 6; document.getElementById("btnStart").click(); });
    await page.waitForSelector("#questionCard .choice");
    await page.click("#btnCalc"); await page.waitForSelector("#calcPanel.show"); await page.waitForTimeout(400);
    const back = await dockRect(page);
    ok(Math.abs(back.l - saved.l) <= 2 && Math.abs(back.t - saved.t) <= 2, `the window reopens where it was left (${saved.l},${saved.t} -> ${back.l},${back.t})`);

    // ---- the window shrinks: it comes back on screen
    await dragHeader(page, 900, 500);
    await page.setViewportSize({ width: 1000, height: 600 });
    await page.waitForTimeout(400);
    r = await dockRect(page);
    ok(r.l <= 1000 - 100 && r.t <= 600 - 60 && r.l >= 0, `after the window shrinks the calculator is still reachable (left ${r.l}, top ${r.t})`);
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
    const s = await dockRect(page);
    await dragHeader(page, -200, 80);
    const m = await dockRect(page);
    ok(Math.abs((m.l - s.l) + 200) <= 3, "the window still moves when Desmos cannot load");
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
  console.log("PASS: the calculator opens as Desmos, takes the tutor's steps, drags by mouse or finger, stays on screen, is remembered, recovers when the window shrinks, works without Desmos, and is a sheet on phones.");
})().catch((e) => { console.error(e); process.exit(1); });

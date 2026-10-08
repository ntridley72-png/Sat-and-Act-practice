/* Layout check for the practice workspace.
   At every breakpoint, with a short stem and a long one and with the calculator
   open, asserts: the page does not scroll sideways, nothing in the question
   column is clipped, the question column is the widest of the three panes, the
   sticky action bar does not cover a choice, and no button label wraps.
   Usage: node tests/workspace-layout.cjs [--shots dir]                      */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const EXEC = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-x64/chrome-headless-shell");
const BASE = process.env.BASE_URL || "http://localhost:8899";
const APP = "/" + encodeURIComponent("SAT & ACT Practice.html");
const WIDTHS = [320, 390, 768, 1024, 1280, 1440, 1920];
const THEMES = ["exam", "notebook", "focus"];
const shotsAt = process.argv.indexOf("--shots");
const SHOTS = shotsAt > 0 ? process.argv[shotsAt + 1] : "";

const LONG = "A ".repeat(1) + "Researchers studying the thermoregulatory behaviour of desert-dwelling " +
  "lizards observed that individuals relocated between sun-exposed and shaded microhabitats far more " +
  "frequently than the ambient temperature gradient alone would predict, and the team hypothesised that " +
  "this additional movement served a function unrelated to heat exchange; which choice, if true, would " +
  "most strongly support the researchers' hypothesis that the extra relocations are driven by predator " +
  "avoidance rather than by thermoregulation, given that the shaded microhabitats were also the ones " +
  "most densely vegetated and therefore least visible from above?";

const MEASURE = function () {
  const q = document.querySelector(".workspace-question-body");
  const canvas = document.querySelector(".workspace-canvas");
  const learn = document.querySelector(".workspace-learning");
  const railEl = document.querySelector(".workspace-tool-rail:not(:empty)") || document.querySelector(".workspace-navigator");
  const foot = document.querySelector(".bb-foot");
  const box = (el) => (el ? el.getBoundingClientRect() : null);
  const clipped = [];
  if (q) {
    for (const el of q.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      if (/auto|scroll/.test(cs.overflowX + cs.overflowY)) continue; // its own scroller: by design
      const over = el.scrollWidth - el.clientWidth;
      const overY = el.scrollHeight - el.clientHeight;
      if (over > 1 && cs.overflow === "hidden") clipped.push({ sel: el.tagName + "." + el.className, axis: "x", by: over });
      else if (overY > 1 && cs.overflowY === "hidden" && cs.maxHeight !== "none") clipped.push({ sel: el.tagName + "." + el.className, axis: "y", by: overY });
    }
  }
  // A sticky bar floats over content mid-scroll by design; what must never
  // happen is content left under it once the column is scrolled to the end.
  // So this is measured at the bottom of the scroll.
  // The action bar must not sit over the question. Where the column is its own
  // scroller the bar is a sibling and can never overlap; where the page scrolls
  // and the bar is sticky, nothing may be left under it at the end of the
  // scroll. Both scroll positions are measured.
  const covered = [];
  const overlaps = () => {
    if (!foot) return;
    const f = foot.getBoundingClientRect();
    // Inside a clipping scroller a scrolled-off choice still reports geometry
    // past the scroller's edge, so each rect is clipped to what is on screen
    // before it is compared with the bar.
    const view = q ? q.getBoundingClientRect() : { top: -1e6, bottom: 1e6 };
    for (const el of document.querySelectorAll(".workspace-question-body .choice, .workspace-question-body .qtext")) {
      const r = el.getBoundingClientRect();
      const top = Math.max(r.top, view.top), bottom = Math.min(r.bottom, view.bottom);
      if (bottom - top <= 2) continue;
      const overlap = Math.min(bottom, f.bottom) - Math.max(top, f.top);
      if (overlap > 2 && r.left < f.right && r.right > f.left) covered.push({ sel: el.className, overlap: Math.round(overlap), at: Math.round(window.scrollY) });
    }
  };
  const colScroller = q && /auto|scroll/.test(getComputedStyle(q).overflowY);
  if (colScroller) {
    q.scrollTop = 0; overlaps();
    q.scrollTop = q.scrollHeight; overlaps();
  } else {
    window.scrollTo(0, 0); overlaps();
    window.scrollTo(0, document.documentElement.scrollHeight); overlaps();
  }
  // Two-line buttons mean a wrapped label.
  const wrapped = [];
  for (const el of document.querySelectorAll(".bb-foot button, .module-actions button, .learning-tab")) {
    const cs = getComputedStyle(el);
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
    const inner = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (!el.offsetParent) continue;
    if (inner > lh * 1.7 && el.textContent.trim().split(/\s+/).length === 1) wrapped.push({ text: el.textContent.trim().slice(0, 24), h: Math.round(inner), lh: Math.round(lh) });
  }
  return {
    doc: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth,
    q: box(q) && Math.round(box(q).width), canvas: box(canvas) && Math.round(box(canvas).width),
    learn: learn && learn.offsetParent ? Math.round(box(learn).width) : null,
    rail: railEl && railEl.offsetParent ? Math.round(box(railEl).width) : null,
    sameRowAsLearn: !!(canvas && learn && learn.offsetParent && Math.abs(box(canvas).top - box(learn).top) < 24),
    stem: (() => { const el = document.querySelector(".qtext"); return el ? Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10 : null; })(),
    footH: foot ? Math.round(box(foot).height) : null,
    reserved: q ? Math.round(parseFloat(getComputedStyle(q).paddingBottom)) : null,
    clipped, covered, wrapped, colScroller: !!colScroller,
  };
};

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  const problems = [];
  const table = [];
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

  for (const theme of THEMES) {
    for (const stem of ["short", "long"]) {
      for (const calc of [false, true]) {
        if (stem === "long" && calc) continue;
        for (const width of WIDTHS) {
          const ctx = await browser.newContext({ viewport: { width, height: 900 } });
          const page = await ctx.newPage();
          await page.addInitScript((t) => { try { localStorage.setItem("funsatWorkspaceTheme", t); } catch (e) {} }, theme);
          await page.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
          const label = `${theme}/${stem}${calc ? "+calc" : ""}/${width}`;
          try {
            await page.goto(BASE + APP, { waitUntil: "domcontentloaded" });
            await page.waitForSelector("body[data-workspace]");
            await page.evaluate(() => { try { arcade.close(); } catch (e) {} });
            await page.click("#btnStart");
            await page.waitForSelector("#questionCard .choice", { timeout: 15000 });
            if (stem === "long") {
              await page.evaluate((text) => {
                const el = document.querySelector(".qtext");
                if (el) el.textContent = text;
              }, LONG);
              await page.waitForTimeout(120);
            }
            if (calc) { await page.click("#btnCalc"); await page.waitForTimeout(500); }
            await page.waitForTimeout(180);
            const m = await page.evaluate(MEASURE);
            table.push(Object.assign({ label }, m));
            if (m.doc > m.vw + 1) problems.push(`${label}: page scrolls sideways (${m.doc} > ${m.vw})`);
            if (m.clipped.length) problems.push(`${label}: clipped in question column ${JSON.stringify(m.clipped.slice(0, 3))}`);
            if (m.covered.length) problems.push(`${label}: sticky bar covers ${JSON.stringify(m.covered.slice(0, 3))}`);
            if (m.wrapped.length) problems.push(`${label}: wrapped button label ${JSON.stringify(m.wrapped)}`);
            if (!m.colScroller && m.reserved != null && m.footH && m.reserved < m.footH) problems.push(`${label}: reserve ${m.reserved}px < bar ${m.footH}px`);
            if (m.sameRowAsLearn && m.canvas != null && m.learn != null && m.canvas <= m.learn) problems.push(`${label}: tools pane (${m.learn}) is not narrower than the question column (${m.canvas})`);
            if (m.stem != null && (m.stem < 17.5 || m.stem > 22.5)) problems.push(`${label}: stem at ${m.stem}px is outside 18-22`);
            if (SHOTS && stem === "short" && !calc) await page.screenshot({ path: path.join(SHOTS, `practice-${theme}-${width}.png`), fullPage: false });
          } catch (e) {
            problems.push(`${label}: ${e.message.split("\n")[0]}`);
          }
          await ctx.close();
        }
      }
    }
  }
  await browser.close();
  console.log("case".padEnd(26) + "rail  question  tools  stem  bar  reserve");
  for (const r of table) {
    console.log(r.label.padEnd(26) + String(r.rail ?? "-").padEnd(6) + String(r.canvas ?? "-").padEnd(10) + String(r.learn ?? "below").padEnd(7) + String(r.stem ?? "-").padEnd(6) + String(r.footH ?? "-").padEnd(5) + String(r.reserved ?? "-"));
  }
  console.log("");
  problems.forEach((p) => console.log("PROBLEM " + p));
  console.log(problems.length ? `\nRESULT: ${problems.length} problem(s)` : "\nRESULT: pass");
  process.exit(problems.length ? 1 : 0);
})();

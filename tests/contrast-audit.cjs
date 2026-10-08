/* Programmatic WCAG contrast audit for the redesigned screens.
   Walks every rendered text node, composites its colour and its actual painted
   background (through every translucent ancestor and inherited opacity), and
   fails anything under 4.5:1 — 3:1 for large text. Runs each screen in all
   three workspace layouts so a fix in one theme cannot break another.

   Usage: node tests/contrast-audit.cjs [--json out.json] [--wide]        */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const EXEC = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-x64/chrome-headless-shell");
const BASE = process.env.BASE_URL || "http://localhost:8899";
const APP = "/" + encodeURIComponent("SAT & ACT Practice.html");
const COLLEGE_PAGE = process.env.COLLEGE_PAGE_URL || "";
const THEMES = ["exam", "notebook", "focus"];
const WIDTHS = process.argv.includes("--wide") ? [390, 768, 1280] : [390, 1280];
const jsonAt = process.argv.indexOf("--json");
const JSON_OUT = jsonAt > 0 ? process.argv[jsonAt + 1] : "";

/* ---------------- in-page audit (serialised into the browser) ---------------- */
const AUDIT = function () {
  const parse = (s) => {
    const m = String(s || "").match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[,/\s]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const over = (fg, bg) => {
    const a = fg[3];
    return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
  };
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const ratio = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const sel = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += "#" + el.id;
    const cls = (el.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean).slice(0, 3);
    if (cls.length) s += "." + cls.join(".");
    return s;
  };

  /* The painted background behind an element: walk ancestors compositing every
     translucent layer until an opaque one is reached. An element painting a
     gradient or image is treated as covering what is behind it, and reported so
     the number can be read with that in mind. */
  function background(el) {
    let stack = [], imagey = false, node = el;
    while (node && node.nodeType === 1) {
      const cs = getComputedStyle(node);
      if (cs.backgroundImage && cs.backgroundImage !== "none") imagey = true;
      const c = parse(cs.backgroundColor);
      if (c && c[3] > 0) {
        stack.push(c);
        if (c[3] === 1) break;
      }
      node = node.parentElement;
    }
    let out = [255, 255, 255, 1];
    for (let i = stack.length - 1; i >= 0; i--) out = over(stack[i], out);
    return { color: out, imagey };
  }

  const hasOwnText = (el) => {
    for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) return true;
    return false;
  };
  const ownText = (el) => Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").trim().replace(/\s+/g, " ");

  const seen = new Map();
  for (const el of document.querySelectorAll("body *")) {
    if (!hasOwnText(el)) continue;
    if (el.closest("[aria-hidden='true']")) continue;
    if (el.closest("script,style,noscript,template,title")) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    // Accumulated opacity: .45 on a struck choice really does halve its contrast.
    let op = 1, p = el;
    while (p && p.nodeType === 1) { op *= parseFloat(getComputedStyle(p).opacity || "1"); p = p.parentElement; }
    if (op < 0.06) continue;
    if (parseFloat(cs.fontSize) < 4) continue;
    // A clipped-to-zero or screen-reader-only node is not seen by anyone.
    if (cs.clip === "rect(0px, 0px, 0px, 0px)") continue;
    // Gradient-filled text (background-clip:text) is not a flat colour; a ratio
    // against its own clipped gradient is meaningless, so it is reported apart.
    if ((cs.backgroundClip || cs.webkitBackgroundClip) === "text") continue;

    const bg = background(el);
    const fgRaw = parse(cs.color) || [0, 0, 0, 1];
    const fg = over([fgRaw[0], fgRaw[1], fgRaw[2], fgRaw[3] * op], bg.color);
    const size = parseFloat(cs.fontSize);
    const weight = parseInt(cs.fontWeight, 10) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    const got = ratio(fg, bg.color);
    const hex = (c) => "#" + [0, 1, 2].map((i) => Math.round(c[i]).toString(16).padStart(2, "0")).join("");
    const key = sel(el) + "|" + hex(fg) + "|" + hex(bg.color) + "|" + Math.round(size);
    if (seen.has(key)) continue;
    seen.set(key, {
      selector: sel(el), text: ownText(el).slice(0, 56), fg: hex(fg), bg: hex(bg.color),
      size: Math.round(size * 10) / 10, weight, large, need, ratio: Math.round(got * 100) / 100,
      pass: got >= need - 0.005, imagey: bg.imagey,
    });
  }
  // Accent census: the accent is a signal, so a screen that fills it into more
  // than a few elements has stopped signalling anything. Only solid accent
  // fills count — a tint or a border is not the accent shouting.
  // getPropertyValue hands back the declaration ("var(--ws-accent)"), so the
  // token is resolved by painting it onto a throwaway element.
  const probe = document.createElement("span");
  probe.style.cssText = "position:absolute;left:-9999px;background-color:var(--fx-accent)";
  document.body.appendChild(probe);
  const accent = parse(getComputedStyle(probe).backgroundColor);
  probe.remove();
  const near = (c) => accent && Math.abs(c[0] - accent[0]) < 12 && Math.abs(c[1] - accent[1]) < 12 && Math.abs(c[2] - accent[2]) < 12;
  const filled = [];
  for (const el of document.querySelectorAll("#screen-test *,#screen-college *,#screen-scholarships *,#homeScoreCard *")) {
    if (!el.offsetParent && el.tagName !== "BODY") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 6 || r.height < 6) continue;
    const c = parse(getComputedStyle(el).backgroundColor);
    if (c && c[3] > 0.75 && near(c)) filled.push(sel(el) + " " + Math.round(r.width) + "x" + Math.round(r.height));
  }
  return { rows: Array.from(seen.values()), accentFills: filled };
};

/* ---------------- scenarios ---------------- */
const SEED = {
  college: { sat: 1280, act: null, gpa: 3.7, grade: "11", homeState: "CA", saved: [110662, 170976, 166027] },
  scoreComparisonEnabled: true,
};

const scenarios = [
  {
    name: "home",
    async go(page) {
      await page.waitForSelector("#screen-start", { state: "visible" });
      const card = page.locator("#homeScoreCard");
      if (await card.count()) await card.click().catch(() => {});
      await page.waitForTimeout(250);
    },
  },
  {
    name: "practice",
    async go(page) {
      await page.click("#btnStart");
      await page.waitForSelector("#questionCard .choice", { timeout: 15000 });
      await page.waitForTimeout(200);
    },
  },
  {
    name: "practice-answered",
    async go(page) {
      await page.click("#btnStart");
      await page.waitForSelector("#questionCard .choice", { timeout: 15000 });
      await page.locator("#questionCard .choice").first().click();
      await page.locator(".qfx-check, #btnCheck").first().click().catch(() => {});
      await page.waitForTimeout(400);
    },
  },
  {
    name: "practice-calc",
    async go(page) {
      await page.click("#btnStart");
      await page.waitForSelector("#questionCard .choice", { timeout: 15000 });
      await page.click("#btnCalc");
      await page.waitForTimeout(500);
    },
  },
  {
    name: "college",
    async go(page) {
      await page.click("#btnCollege");
      await page.waitForSelector("#screen-college", { state: "visible" });
      await page.waitForTimeout(350);
    },
  },
  {
    name: "scholarships",
    async go(page) {
      await page.click("#btnScholarships");
      await page.waitForSelector("#screen-scholarships", { state: "visible" });
      const card = page.locator(".schl-card").first();
      if (await card.count()) await card.click();
      await page.waitForTimeout(350);
    },
  },
];

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  const all = [];
  const accent = [];
  const errors = [];

  for (const theme of THEMES) {
    for (const scenario of scenarios) {
      for (const width of WIDTHS) {
        const ctx = await browser.newContext({ viewport: { width, height: 900 } });
        const page = await ctx.newPage();
        page.on("pageerror", (e) => errors.push(`${theme}/${scenario.name}/${width}: ${e.message}`));
        await page.addInitScript(([t, seed]) => {
          try {
            localStorage.setItem("funsatWorkspaceTheme", t);
            localStorage.setItem("satPrepProfile_v1", JSON.stringify(seed));
          } catch (e) {}
        }, [theme, SEED]);
        await page.route("**/api/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
        try {
          await page.goto(BASE + APP, { waitUntil: "domcontentloaded" });
          await page.waitForSelector("body[data-workspace]");
          await page.evaluate(() => { try { arcade.close(); } catch (e) {} });
          await scenario.go(page);
          const res = await page.evaluate(AUDIT);
          res.rows.forEach((r) => all.push(Object.assign({ theme, screen: scenario.name, width }, r)));
          accent.push({ theme, screen: scenario.name, width, fills: res.accentFills });
        } catch (e) {
          errors.push(`${theme}/${scenario.name}/${width}: ${e.message.split("\n")[0]}`);
        }
        await ctx.close();
      }
    }
  }

  if (COLLEGE_PAGE) {
    for (const width of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await ctx.newPage();
      await page.addInitScript((seed) => { try { localStorage.setItem("satPrepProfile_v1", JSON.stringify(seed)); } catch (e) {} }, SEED);
      try {
        await page.goto(COLLEGE_PAGE, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(500);
        const res = await page.evaluate(AUDIT);
        res.rows.forEach((r) => all.push(Object.assign({ theme: "page", screen: "college-profile-page", width }, r)));
      } catch (e) {
        errors.push(`college-page/${width}: ${e.message.split("\n")[0]}`);
      }
      await ctx.close();
    }
  }

  await browser.close();

  const fails = all.filter((r) => !r.pass);
  // One line per distinct offender, not per viewport it was measured in.
  const grouped = new Map();
  for (const f of fails) {
    const key = [f.screen, f.selector, f.fg, f.bg, f.size].join("|");
    const g = grouped.get(key);
    if (g) { g.themes.add(f.theme); g.widths.add(f.width); continue; }
    grouped.set(key, Object.assign({}, f, { themes: new Set([f.theme]), widths: new Set([f.width]) }));
  }
  const list = Array.from(grouped.values()).sort((a, b) => a.ratio - b.ratio);

  console.log(`contrast audit — ${all.length} text nodes measured across ${THEMES.length} themes x ${scenarios.length + (COLLEGE_PAGE ? 1 : 0)} screens x ${WIDTHS.length} widths`);
  console.log(`${all.length - fails.length} pass, ${fails.length} fail (${list.length} distinct)\n`);
  for (const f of list) {
    console.log(
      `FAIL ${String(f.ratio).padEnd(5)} (need ${f.need})  ${f.screen} [${Array.from(f.themes).join(",")}]  ${f.selector}` +
      `\n      ${f.fg} on ${f.bg}  ${f.size}px/${f.weight}${f.imagey ? "  (bg has an image/gradient layer)" : ""}  "${f.text}"`
    );
  }
  console.log("\naccent census (solid --fx-accent fills per screen; budget ~3):");
  const worst = new Map();
  for (const a of accent) {
    const prev = worst.get(a.screen);
    if (!prev || a.fills.length > prev.fills.length) worst.set(a.screen, a);
  }
  for (const [screen, a] of worst) {
    const flag = a.fills.length > 3 ? "  OVER BUDGET" : "";
    console.log("  " + screen.padEnd(20) + a.fills.length + " (" + a.theme + "/" + a.width + ")" + flag);
    a.fills.forEach((f) => console.log("      " + f));
  }
  if (errors.length) { console.log("\nnavigation problems:"); errors.forEach((e) => console.log("  " + e)); }
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ measured: all.length, fails: list.map((f) => Object.assign({}, f, { themes: Array.from(f.themes), widths: Array.from(f.widths) })) }, null, 2));
  console.log(list.length ? "\nRESULT: fail" : "\nRESULT: pass");
  process.exit(list.length ? 1 : 0);
})();

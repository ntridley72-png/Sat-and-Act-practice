/* Theme regression for the module-transition (routing) card: the original bug report. */
const { chromium } = require("playwright-core");
const path = require("node:path");
const os = require("node:os");

const EXEC = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-x64/chrome-headless-shell");
const BASE = process.env.BASE_URL || "http://localhost:8899";
const PAGE_PATH = /localhost|127\.0\.0\.1/.test(BASE) ? "/" + encodeURIComponent("SAT & ACT Practice.html") : "/";
const SHOTS = path.join(__dirname, "screenshots");
const THEMES = ["exam", "notebook", "focus"];
const EXPECTED_BACKGROUND = {
  dark: "rgb(23, 27, 29)",
  light: "rgb(244, 247, 247)",
};

function contrast(l1, l2) { const a = Math.max(l1, l2), b = Math.min(l1, l2); return (a + 0.05) / (b + 0.05); }

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });

  async function captureStartupFrames({ label, theme = null, appearance = 'dark', blockStorage = false, warm = false, reload = false, slow = false }) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    await context.addInitScript(({ savedTheme, appearance, shouldBlockStorage }) => {
      localStorage.setItem('funsatDeskAppearance', appearance);
      if (shouldBlockStorage) {
        const originalGetItem = Storage.prototype.getItem;
        Storage.prototype.getItem = function (key) {
          if (key === "funsatWorkspaceTheme" || key === 'funsatDeskAppearance') throw new DOMException("Storage is blocked", "SecurityError");
          return originalGetItem.call(this, key);
        };
      } else if (savedTheme) {
        localStorage.setItem("funsatWorkspaceTheme", savedTheme);
      } else {
        localStorage.removeItem("funsatWorkspaceTheme");
      }
    }, { savedTheme: theme, appearance, shouldBlockStorage: blockStorage });

    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    if (slow) await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.route("**/app.js", async (route) => {
      if (slow) await new Promise((resolve) => setTimeout(resolve, 600));
      await route.continue();
    });

    const navigate = async (kind) => {
      if (kind === "reload") await page.reload({ waitUntil: "commit" });
      else await page.goto(BASE + PAGE_PATH, { waitUntil: "commit" });
      await page.waitForSelector("body");
      const frames = [];
      const started = Date.now();
      for (const at of [0, 40, 100, 250, 500, 1000, 2000]) {
        const remaining = at - (Date.now() - started);
        if (remaining > 0) await page.waitForTimeout(remaining);
        await page.screenshot({ type: "png" });
        frames.push(await page.evaluate(() => ({
          workspace: document.body.dataset.workspace || null,
          background: getComputedStyle(document.body).backgroundColor,
          colorScheme: document.documentElement.style.colorScheme,
        })));
      }
      const expectedTheme = theme || "exam";
      for (const [index, frame] of frames.entries()) {
        if (frame.workspace !== expectedTheme) throw new Error(`${label}/${kind} frame ${index} painted workspace ${frame.workspace}, expected ${expectedTheme}`);
        const expectedScheme = blockStorage ? 'dark' : appearance;
        if (frame.background !== EXPECTED_BACKGROUND[expectedScheme]) throw new Error(`${label}/${kind} frame ${index} painted ${frame.background}, expected ${EXPECTED_BACKGROUND[expectedScheme]}`);
        if (frame.colorScheme !== expectedScheme) throw new Error(`${label}/${kind} frame ${index} used color-scheme ${frame.colorScheme}, expected ${expectedScheme}`);
      }
    };

    await navigate("cold");
    if (warm) await navigate("warm");
    if (reload) await navigate("reload");
    await context.close();
  }

  for (const theme of THEMES) {
    for (const appearance of ['dark', 'light']) {
      await captureStartupFrames({ label: `saved-${theme}-${appearance}`, theme, appearance, warm: true, reload: true, slow: true });
    }
  }
  await captureStartupFrames({ label: "empty-storage", slow: true });
  await captureStartupFrames({ label: "blocked-storage", blockStorage: true, slow: true });

  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  await page.goto(BASE + PAGE_PATH, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("body[data-workspace]");
  // The setup folds to a summary line once there is a finished attempt (S1), so
  // the controls inside it have to be opened before they can be driven.
  const openSetup = async (page) => {
    const det = page.locator("#setupDetails");
    if (await det.count() && !(await det.evaluate((d) => d.open))) {
      await page.click("#setupDetails > summary");
      await page.waitForTimeout(120);
    }
  };
  await openSetup(page);
  await page.fill("#customLen", "4");
  await page.dispatchEvent("#customLen", "change");
  await page.click("#btnStart");
  await page.waitForSelector("#screen-test", { state: "visible" });

  // Answer questions until the module-transition (routing) card appears.
  let reached = false;
  for (let i = 0; i < 12 && !reached; i++) {
    if (await page.locator("#routingCard").isVisible().catch(() => false)) { reached = true; break; }
    const choice = page.locator("#questionCard .choice").first();
    if (await choice.count()) { await choice.click(); await page.waitForTimeout(80); const chk = page.locator('#btnCheck'); if (await chk.count() && await chk.isEnabled().catch(() => false)) { await chk.click(); await page.waitForTimeout(120); } }
    const next = page.locator("#btnNext");
    if (await next.count() && await next.isEnabled().catch(() => false)) { await next.click(); await page.waitForTimeout(160); }
  }
  reached = await page.locator("#routingCard").isVisible().catch(() => false);
  if (!reached) throw new Error("could not reach the module-transition card");

  for (const theme of THEMES) {
    await page.selectOption("#workspaceTheme", theme);
    await page.waitForTimeout(120);
    await page.evaluate(() => render());
    await page.waitForTimeout(120);
    await page.locator("#routingCard").scrollIntoViewIfNeeded();
    await page.waitForTimeout(120);
    const result = await page.evaluate(() => {
      const box = document.querySelector("#routingCard .routing-box") || document.querySelector("#routingCard");
      const sample = box.querySelector("h1, h2, h3, strong, .routing-title") || box;
      const button = box.querySelector("button");
      const rgb = (value) => (value.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
      const lum = (c) => { const f = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
      let bg = getComputedStyle(sample).backgroundColor;
      let node = sample;
      while ((bg === "rgba(0, 0, 0, 0)" || bg === "transparent") && node.parentElement) { node = node.parentElement; bg = getComputedStyle(node).backgroundColor; }
      return { text: getComputedStyle(sample).color, background: bg, buttonText: button ? getComputedStyle(button).color : null, buttonBg: button ? getComputedStyle(button).backgroundColor : null, sample: sample.textContent.slice(0, 40) };
    });
    const textLum = (() => { const v = result.text.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number); const f = v.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; })();
    const bgVals = result.background.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
    const bgLum = (() => { const f = bgVals.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; })();
    if (contrast(textLum, bgLum) < 4.5) throw new Error(theme + " routing text contrast " + contrast(textLum, bgLum).toFixed(2) + " (" + result.text + " on " + result.background + ")");
    await page.locator("#routingCard").screenshot({ path: path.join(SHOTS, "routing-" + theme + ".png") });
  }

  await browser.close();
  if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
  console.log("PASS: startup frames keep the selected theme on cold, warm, reload, slow, empty-storage, and blocked-storage loads; module-transition contrast passes in all three themes.");
})().catch((error) => { console.error(error); process.exit(1); });

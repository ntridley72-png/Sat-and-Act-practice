/* The racing-v2 arcade integration.
 *
 * racing/index.js wraps arcade.select() so the driving games run the v2 React
 * game. As of 2026-10-10 that is the DEFAULT (operator decision); this test
 * pins both directions: with no overrides the arcade mounts v2, and with an
 * explicit ?racingV2=0 the wrapper is completely transparent and the student
 * gets exactly the v1 game. A hook that works when enabled but subtly breaks
 * the explicit opt-out is far worse than no hook. */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");

function resolveExecutable() {
  if (process.env.PLAYWRIGHT_EXEC) return process.env.PLAYWRIGHT_EXEC;
  try {
    const p = chromium.executablePath();
    if (p && fs.existsSync(p)) return p;
  } catch (e) { /* fall through */ }
  const cache = path.join(os.homedir(), "Library", "Caches", "ms-playwright");
  for (const d of fs.readdirSync(cache).filter((n) => n.startsWith("chromium-"))) {
    for (const shape of [
      ["chrome-mac-x64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"],
      ["chrome-mac", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"],
    ]) {
      const c = path.join(cache, d, ...shape);
      if (fs.existsSync(c)) return c;
    }
  }
  throw new Error("Could not locate Chromium. Install it with: npx playwright install chromium");
}

const ROOT = path.join(__dirname, "..");
const PORT = 8907;
const PAGE = "/" + encodeURIComponent("SAT & ACT Practice.html");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".mp3": "audio/mpeg", ".png": "image/png" };

/* Serves the repo, but maps /racing-v2/* to racing-v2/dist/* -- the same
   layout wrangler.toml produces when it copies dist into public/racing-v2.
   Testing against a different layout would not exercise the real URLs. */
function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split("?")[0]);
      const file = url.startsWith("/racing-v2/")
        ? path.join(ROOT, "racing-v2", "dist", url.slice("/racing-v2/".length))
        : path.join(ROOT, url === "/" ? "index.html" : url.slice(1));
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404); res.end("not found"); return; }
        res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
        res.end(buf);
      });
    });
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

(async () => {
  const server = await serve();
  const browser = await chromium.launch({
    executablePath: resolveExecutable(),
    args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"],
  });
  const fail = (m, got) => { throw new Error(m + ": " + JSON.stringify(got)); };
  const base = `http://127.0.0.1:${PORT}`;

  const open = async (query) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(String(e)));
    await page.goto(base + PAGE + query, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(900);
    return { page, errs };
  };

  // --- DEFAULT (no overrides): v2 mounts, v1 is not started ----------------
  {
    const { page, errs } = await open("");
    const r = await page.evaluate(() => RacingV2.enabled());
    if (r !== true) fail("racingV2 must default on for the arcade path", r);

    const mounted = await page.evaluate(async () => {
      arcade.select("drift");
      await new Promise((res) => setTimeout(res, 4000));
      const host = document.getElementById("racingV2Mount");
      return {
        ctor: arcade.game && arcade.game.constructor && arcade.game.constructor.name,
        visible: !!host && host.style.display === "block",
        rectW: host ? Math.round(host.getBoundingClientRect().width) : 0,
        appLoaded: RacingV2.appLoaded(),
      };
    });
    if (!mounted.appLoaded) fail("the default path must load the v2 bundle", mounted);
    if (!mounted.visible) fail("the default path must show the v2 mount", mounted);
    if (!(mounted.rectW > 300)) fail("the default path must lay the game out, not mount it at 0x0", mounted);
    if (errs.length) fail("page errors on the default path", errs);

    // app.js owns a global cabinet shortcut: Space launches the highlighted
    // menu item whenever arcade.mode is still `menu`. v2 also uses Space for
    // its handbrake, so the host seam must keep that key inside the live race
    // instead of letting the hidden cabinet replace it.
    await page.locator('body').focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(150);
    const afterSpace = await page.evaluate(() => ({
      visible: document.getElementById('racingV2Mount')?.style.display === 'block',
      active: document.getElementById('arcadeStage')?.classList.contains('racing-v2-active'),
      mode: arcade.mode,
    }));
    if (!afterSpace.visible || !afterSpace.active) fail("Space must stay inside v2 instead of relaunching the cabinet selection", afterSpace);
    if (afterSpace.mode !== 'playing') fail("the host must expose v2 as a live game to cabinet shortcuts", afterSpace);
    await page.close();
  }

  // --- explicit ?racingV2=0: the wrapper must be invisible ------------------
  {
    const { page, errs } = await open("?racingV2=0");
    const r = await page.evaluate(() => ({
      enabled: RacingV2.enabled(),
      hooked: typeof RacingV2.hookArcade === "function",
      selectIsFunction: typeof arcade !== "undefined" && typeof arcade.select === "function",
    }));
    if (r.enabled !== false) fail("?racingV2=0 must disable", r);
    if (!r.selectIsFunction) fail("arcade.select must still be callable after hooking", r);

    // Actually start the v1 drift game and confirm it is the v1 class.
    const v1 = await page.evaluate(() => {
      arcade.select("drift");
      return {
        ctor: arcade.game && arcade.game.constructor && arcade.game.constructor.name,
        mountHidden: !document.getElementById("racingV2Mount") ||
          document.getElementById("racingV2Mount").style.display === "none",
      };
    });
    if (v1.ctor !== "DriftCircuit") fail("explicitly disabled must still run v1 DriftCircuit", v1);
    if (!v1.mountHidden) fail("the v2 mount must not be visible when disabled", v1);
    if (errs.length) fail("page errors when disabled", errs);
    await page.close();
  }

  // --- flag ON: v2 mounts, and v1 is not started ---------------------------
  {
    const { page, errs } = await open("?racingV2=1");
    const on = await page.evaluate(() => RacingV2.enabled());
    if (on !== true) fail("?racingV2=1 should enable", on);

    const mounted = await page.evaluate(async () => {
      arcade.select("drift");
      // Give the dynamic import and the React mount time to land.
      await new Promise((r) => setTimeout(r, 4000));
      const host = document.getElementById("racingV2Mount");
      const go = document.querySelector(".rv2-go");
      return {
        hostExists: !!host,
        visible: !!host && host.style.display === "block",
        // LAYOUT, not display: the stage was display:none while its child
        // mount was display:block, so the game rendered into a 0x0 box and
        // every existence check still passed. A rect is the honest measure.
        rectW: host ? Math.round(host.getBoundingClientRect().width) : 0,
        buttonTick: go ? Math.round(go.getBoundingClientRect().height) : 0,
        hasCanvas: !!(host && host.querySelector("canvas")),
        appLoaded: RacingV2.appLoaded(),
      };
    });
    if (!mounted.hostExists) fail("the v2 mount element was never created", mounted);
    if (!mounted.visible) fail("the v2 mount should be visible with the flag on", mounted);
    if (!mounted.appLoaded) fail("the v2 bundle did not load", mounted);
    if (!mounted.hasCanvas) fail("the v2 game did not render a canvas", mounted);
    if (!(mounted.rectW > 300)) fail("the v2 mount must have real layout, not a 0x0 box", mounted);
    if (!(mounted.buttonTick > 0)) fail("the intro must actually be on screen", mounted);
    if (errs.length) fail("page errors with the flag on", errs);
    await page.close();
  }

  // --- a non-driving game is untouched either way --------------------------
  {
    const { page } = await open("?racingV2=1");
    const other = await page.evaluate(() => {
      arcade.select("snake");
      return arcade.game && arcade.game.constructor && arcade.game.constructor.name;
    });
    if (other !== "Snake") fail("non-driving games must be unaffected by the hook", other);
    await page.close();
  }

  await browser.close();
  server.close();
  console.log("PASS: the arcade mounts v2 by default, is fully transparent under ?racingV2=0, and leaves other games alone.");
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });

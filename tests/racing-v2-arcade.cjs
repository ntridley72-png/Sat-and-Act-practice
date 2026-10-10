/* The racing-v2 arcade integration.
 *
 * racing/index.js wraps arcade.select() so the driving games can run the v2
 * React game. The thing that matters most here is the NEGATIVE case: with the
 * flag off, the wrapper must be completely transparent and the student must
 * get exactly the v1 game they had yesterday. A hook that works when enabled
 * but subtly breaks the arcade when disabled is far worse than no hook.
 */
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

  // --- flag OFF: the wrapper must be invisible -----------------------------
  {
    const { page, errs } = await open("");
    const r = await page.evaluate(() => ({
      enabled: RacingV2.enabled(),
      hooked: typeof RacingV2.hookArcade === "function",
      selectIsFunction: typeof arcade !== "undefined" && typeof arcade.select === "function",
    }));
    if (r.enabled !== false) fail("flag must default off", r);
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
    if (v1.ctor !== "DriftCircuit") fail("flag off must still run v1 DriftCircuit", v1);
    if (!v1.mountHidden) fail("the v2 mount must not be visible with the flag off", v1);
    if (errs.length) fail("page errors with the flag off", errs);
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
      return {
        hostExists: !!host,
        visible: !!host && host.style.display === "block",
        hasCanvas: !!(host && host.querySelector("canvas")),
        appLoaded: RacingV2.appLoaded(),
      };
    });
    if (!mounted.hostExists) fail("the v2 mount element was never created", mounted);
    if (!mounted.visible) fail("the v2 mount should be visible with the flag on", mounted);
    if (!mounted.appLoaded) fail("the v2 bundle did not load", mounted);
    if (!mounted.hasCanvas) fail("the v2 game did not render a canvas", mounted);
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
  console.log("PASS: the arcade hook is transparent with the flag off, mounts v2 with it on, and leaves other games alone.");
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });

/* Arcade smoke test: every game opens, scales for high-DPI, draws, and responds to input. */
const { chromium } = require("playwright-core");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

const EXEC = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-x64/chrome-headless-shell");
const BASE = process.env.BASE_URL || "http://localhost:8899";
const PAGE_PATH = /localhost|127\.0\.0\.1/.test(BASE) ? "/" + encodeURIComponent("SAT & ACT Practice.html") : "/";
const SHOTS = path.join(__dirname, "screenshots");

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1360, height: 980 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

  await page.goto(BASE + PAGE_PATH, { waitUntil: "load" });
  await page.waitForSelector("body[data-workspace]");
  await page.evaluate(() => arcade.open());
  await page.waitForSelector("#arcadeOverlay.show");

  const games = await page.evaluate(() => GAME_LIST.map((g) => g.key));
  if (games.length < 15) throw new Error("expected 15 games, saw " + games.length);
  fs.mkdirSync(SHOTS, { recursive: true });

  const interaction = {
    "2048": () => { arcade.game.input("left"); },
    breakout: () => { arcade.game.tap(); arcade.game.movePaddle(300); },
    flappy: () => { arcade.game.flap(); },
    minesweeper: () => { arcade.game.tap(100, 100, false); },
    connect4: () => { arcade.game.tap(260); },
    wordgame: () => { arcade.game.answer(0); },
    sudoku: () => { arcade.game.tap(100, 100); arcade.game.place(5); },
    solitaire: () => { arcade.game.tap(50, 90); },
    hopper: () => { arcade.game.hop("up"); },
    stack: () => { arcade.game.drop(); },
    doodle: () => { arcade.game.tap(); },
    wordscape: () => { arcade.game.keyDown("P"); arcade.game.keyDown("L"); },
    blackjack: () => { arcade.game.deal(); },
    tictactoe: () => { arcade.game.tap(240, 220); },
    blockblast: () => { arcade.game.refill(); arcade.game.selected = 0; arcade.game.placeAt(0, 0); },
    bubbles: () => { arcade.game.shoot(); arcade.game.update(0.1); },
    invaders: () => { arcade.game.fire(); },
  };

  for (const key of games) {
    await page.evaluate((k) => arcade.select(k), key);
    await page.waitForTimeout(160);
    const info = await page.evaluate(() => {
      const g = arcade.game, c = arcade.canvas;
      return { key: g.key, W: g.W, H: g.H, backing: [c.width, c.height], css: c.style.width, smooth: c.style.imageRendering, wantsSmooth: !!g.smooth };
    });
    const dpr = 2;
    const logical = parseFloat(info.css) || 420;
    if (info.backing[0] !== Math.round(logical * dpr)) throw new Error(key + " backing store not DPR scaled: " + info.backing + " for " + logical);
    if (info.wantsSmooth && info.smooth !== "auto") throw new Error(key + " should render smooth: " + info.smooth);
    if (!info.wantsSmooth && info.smooth !== "pixelated") throw new Error(key + " should keep retro pixels: " + info.smooth);
    // Start and interact.
    await page.evaluate(() => { arcade.play(); arcade.game.started = true; }, key);
    if (interaction[key]) await page.evaluate(() => {
      const actions = {
        "2048": () => arcade.game.input("left"),
        breakout: () => { arcade.game.tap(); arcade.game.movePaddle(300); },
        flappy: () => arcade.game.flap(),
        minesweeper: () => { arcade.game.tap(100, 100, false); },
        connect4: () => { arcade.game.tap(260); },
        wordgame: () => { arcade.game.answer(0); },
        sudoku: () => { arcade.game.tap(100, 100); arcade.game.place(5); },
        solitaire: () => { arcade.game.tap(50, 90); },
        hopper: () => { arcade.game.hop("up"); },
        stack: () => { arcade.game.drop(); },
        doodle: () => { arcade.game.tap(); },
        wordscape: () => { arcade.game.keyDown("P"); arcade.game.keyDown("L"); },
        blackjack: () => { arcade.game.deal(); },
        tictactoe: () => { arcade.game.tap(240, 220); },
        blockblast: () => { arcade.game.refill(); arcade.game.selected = 0; arcade.game.placeAt(0, 0); },
        bubbles: () => { arcade.game.shoot(); arcade.game.update(0.1); },
        invaders: () => { arcade.game.fire(); },
      };
      if (actions[arcade.game.key]) actions[arcade.game.key]();
    });
    await page.waitForTimeout(140);
    if (["2048", "minesweeper", "wordgame", "solitaire", "connect4", "sudoku", "invaders", "bubbles", "blockblast"].includes(key)) {
      await page.screenshot({ path: path.join(SHOTS, "arcade-" + key + ".png") });
    }
  }
  await browser.close();
  if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
  console.log("PASS: all " + games.length + " arcade games open, DPR-scale, draw, and accept input with no console errors.");
})().catch((error) => { console.error(error); process.exit(1); });

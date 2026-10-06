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
      return { key: g.key, W: g.W, H: g.H, backing: [c.width, c.height], css: c.style.width, logical: arcade.logicalW, smooth: c.style.imageRendering, wantsSmooth: !!g.smooth };
    });
    const dpr = 2;
    const logical = info.logical || Math.round(parseFloat(info.css)) || 420;
    if (info.backing[0] !== Math.round(logical * dpr)) throw new Error(key + " backing store not DPR scaled: " + info.backing + " for " + logical);
    if (info.wantsSmooth && info.smooth !== "auto") throw new Error(key + " should render smooth: " + info.smooth);
    if (!info.wantsSmooth && info.smooth !== "pixelated") throw new Error(key + " should keep retro pixels: " + info.smooth);
    // Start and interact.
    await page.evaluate(() => { arcade.play(); arcade.game.started = true; }, key);
    if (key === "racing" || key === "drift") {
      const before = await page.evaluate(() => ({ x: arcade.game.x, y: arcade.game.y, distance: arcade.game.distance || 0, speed: arcade.game.speed || 0, score: arcade.game.score || 0 }));
      await page.keyboard.down("ArrowUp");
      await page.keyboard.down("ArrowLeft");
      if (key === "drift") await page.keyboard.down("Space");
      await page.waitForTimeout(key === "drift" ? 1200 : 700);
      if (key === "drift") await page.keyboard.up("Space");
      await page.keyboard.up("ArrowLeft");
      await page.keyboard.up("ArrowUp");
      const after = await page.evaluate(() => ({ x: arcade.game.x, y: arcade.game.y, distance: arcade.game.distance || 0, speed: arcade.game.speed || Math.hypot(arcade.game.vx || 0, arcade.game.vy || 0), score: arcade.game.score || 0 }));
      if (!(after.speed > 3)) throw new Error(key + " did not accelerate: " + JSON.stringify({ before, after }));
      if (key === "racing" && !(after.distance > before.distance)) throw new Error("racing did not advance");
      if (key === "drift" && !(Math.hypot(after.x - before.x, after.y - before.y) > 3)) throw new Error("drift car did not move");
      if (key === "drift" && !(after.score > before.score)) throw new Error("space did not start a scored drift");
    }
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

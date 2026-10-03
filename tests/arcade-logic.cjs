/* Arcade logic tests for the games added after Water Sort. */
const { chromium } = require("playwright-core");
const path = require("node:path");
const os = require("node:os");

const EXEC = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-x64/chrome-headless-shell");
const BASE = process.env.BASE_URL || "http://localhost:8899";
const PAGE_PATH = /localhost|127\.0\.0\.1/.test(BASE) ? "/" + encodeURIComponent("SAT & ACT Practice.html") : "/";

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1360, height: 980 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  await page.goto(BASE + PAGE_PATH, { waitUntil: "load" });
  await page.waitForSelector("body[data-workspace]");

  const results = await page.evaluate(() => {
    const out = {};
    const pick = (key) => { arcade.select(key); const g = arcade.game; g.started = true; return g; };

    // 2048: equal tiles merge and score.
    let g = pick("2048");
    g.grid = [[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    g.score = 0; g.input("left");
    out.g2048 = g.grid[0][0] === 4 && g.score >= 4;

    // Breakout: launch + paddle clamp.
    g = pick("breakout");
    g.tap(); g.movePaddle(-500);
    out.breakout = g.launched === true && g.paddle.x === 8;

    // Flappy: flapping gives upward velocity.
    g = pick("flappy"); g.bird.vy = 200; g.flap();
    out.flappy = g.bird.vy < 0;

    // Minesweeper: first tap is safe and clearing all safe cells advances.
    g = pick("minesweeper");
    const firstIdx = g.grid.flat().indexOf(g.grid[0][0]);
    g.tap(g.boardGeo().pad + 5, g.boardGeo().top + 5);
    const firstCell = g.grid[0][0];
    out.minesFirstSafe = firstCell.open && !firstCell.mine;
    g.grid.forEach((row) => row.forEach((c) => { if (!c.mine) { c.open = true; g.revealed++; } }));
    g.checkWin();
    out.minesLevel = g.level === 2 && g.score > 0;

    // Connect 4: four discs in a row wins and scores.
    g = pick("connect4"); g.level = 1; g.score = 0;
    [0, 1, 2, 3].forEach((c) => { if (!g.winner) g.play(c, 1); });
    out.connect4 = g.winner === 1 && g.score > 0;

    // Vocab: correct answer scores and records stats; wrong answer records too.
    g = pick("wordgame");
    const correctIdx = g.choices.findIndex((c) => c.correct);
    g.answer(correctIdx);
    const afterRight = profile.vocabStats.total.r >= 1 && g.score > 0;
    g.selected = -1; g.correct = false;
    const wrongIdx = g.choices.findIndex((c) => !c.correct);
    g.answer(wrongIdx);
    out.vocab = afterRight && profile.vocabStats.total.w >= 1 && Object.keys(profile.vocabStats.words).length >= 1;
    if (typeof renderVocabSummary === "function") { renderVocabSummary(); out.vocabCard = document.getElementById("vocabStart").style.display === "block" && /Vocab practice/.test(document.getElementById("vocabStart").textContent); }

    // Sudoku: puzzle is incomplete and copying the solution completes it.
    g = pick("sudoku");
    g.puzzle.forEach((row) => row.forEach((v, c) => { if (v) g.cells[g.puzzle.indexOf(row)][c] = v; }));
    const blanks = g.cells.flat().filter((v) => !v).length;
    g.cells = g.solution.map((row) => row.slice());
    g.checkComplete();
    out.sudoku = blanks > 20 && g.level === 2 && g.score > 0;

    // Solitaire: initial deal is standard, drawing advances the stock, and the deal is solvable-checkable shape.
    g = pick("solitaire");
    const dealOk = g.tableau.length === 7 && g.tableau.every((p, i) => p.length === i + 1) && g.stock.length === 24 && g.foundations.length === 4;
    g.tap(50, 90);
    out.solitaire = dealOk && g.stock.length === 23 && g.waste.length === 1;

    // Hopper advances a row and scores.
    g = pick("hopper"); const row0 = g.player.row; g.hop("up");
    out.hopper = g.player.row === row0 + 1 && g.score >= 10;

    // Stack places a block when dropped.
    g = pick("stack"); g.drop();
    out.stack = g.blocks.length === 2 && g.score === 10;

    // Doodle bounces upward on tap.
    g = pick("doodle"); g.player.vy = 300; g.tap();
    out.doodle = g.player.vy < 0;

    // Word Finder accepts a listed word and records vocab stats.
    g = pick("wordscape");
    "PLANE".split("").forEach((ch) => g.typeLetter(ch));
    g.submit();
    out.wordscape = g.found.includes("plane") && g.score > 0 && !!profile.vocabStats.words["plane"];

    // Blackjack deals two cards to each hand.
    g = pick("blackjack"); g.deal();
    out.blackjack = g.player.length === 2 && g.dealer.length === 2 && g.phase === "player";

    // Tic-tac-toe places X and the CPU responds.
    g = pick("tictactoe"); g.tap(240, 220);
    const placedX = g.board[4] === 1;
    g.update(0.6);
    out.tictactoe = placedX && g.board.some((v) => v === 2);

    // Block Blast places a piece and scores.
    g = pick("blockblast"); g.refill(); g.selected = 0;
    const placed = g.placeAt(0, 0);
    out.blockblast = placed === true && g.score > 0;

    // Bubble Shooter fires a bubble that snaps into the grid.
    g = pick("bubbles"); g.current = 0; g.shoot();
    const flying = !!g.shot;
    for (let i = 0; i < 40 && g.shot; i++) g.update(0.016);
    out.bubbles = flying && !g.shot;

    // Space Invaders fires.
    g = pick("invaders"); g.fire();
    out.invaders = g.bullets.length === 1;

    // Every game has a rules entry.
    out.rules = GAME_LIST.every((x) => typeof GAME_RULES[x.key] === "string" && GAME_RULES[x.key].length > 20);
    return out;
  });

  await browser.close();
  const failed = Object.entries(results).filter(([, v]) => !v).map(([k]) => k);
  if (errors.length || failed.length) { console.error(errors.join("\n")); throw new Error("failed checks: " + failed.join(", ")); }
  console.log("PASS: 2048 merges, Breakout launches, Flappy flaps, Minesweeper first-click is safe, Connect 4 wins, Vocab stats persist, Sudoku completes, Solitaire deals and draws, and every game has rules.");
})().catch((error) => { console.error(error); process.exit(1); });

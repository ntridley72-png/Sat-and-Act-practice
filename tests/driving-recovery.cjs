const { chromium } = require('playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const executablePath = process.env.PLAYWRIGHT_EXEC || path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1234/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');

(async () => {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = url.startsWith('/racing-v2/')
      ? path.join(root, 'racing-v2/dist', url.slice(11))
      : path.join(root, url === '/' ? 'SAT & ACT Practice.html' : url.slice(1));
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.mp3': 'audio/mpeg' })[path.extname(file)] || 'application/octet-stream');
      res.end(data);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.__audioVoices = [];
      const NativeAudio = window.Audio;
      window.Audio = function (...args) { const el = new NativeAudio(...args); window.__audioVoices.push(el); return el; };
      window.Audio.prototype = NativeAudio.prototype;
    });
    await page.goto(process.env.BASE_URL || `http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => typeof RacingV2 !== 'undefined');
    const lot = await page.evaluate(() => {
      profile.soundOn = true; window.FunSATAudio.muted = false;
      arcade.select('drift'); arcade.play();
      const g = arcade.game; const safe = g.obstacles.every((o) => Math.hypot(o.x - g.x, o.y - g.y) > o.r + 13);
      g.score = 1234; g.earned = 3; g.x = 30; g.vx = 400;
      document.getElementById('btnResetPosition').click();
      g.update(.016);
      document.getElementById('btnSound').click();
      return { safe, renderedLot: g.track3d?.sandbox, score: g.score, earned: g.earned, x: g.x, cx: g.worldW / 2, speed: g.speedNow, audio: g.audio };
    });
    assert(lot.safe, 'spawn must be clear of obstacles');
    assert(lot.renderedLot, 'WebGL must render the parking lot, not a circuit');
    assert.equal(lot.score, 1234); assert.equal(lot.earned, 3);
    assert.equal(lot.x, lot.cx); assert.equal(lot.speed, 0); assert.equal(lot.audio, null);

    await page.evaluate(() => { arcade.select('racing'); arcade.close(); });
    await page.waitForTimeout(1500);
    assert.equal(await page.locator('#racingV2Mount canvas').count(), 0, 'closing during import must cancel the mount');
    await page.evaluate(() => arcade.select('racing'));
    await page.waitForSelector('.rv2-go');
    await page.click('.rv2-go');
    await page.waitForSelector('.rv2-recover');
    await page.keyboard.down('ArrowUp');
    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(3000);
    await page.keyboard.up('ArrowLeft'); await page.keyboard.up('ArrowUp');
    const driven = await page.evaluate(() => window.__rv2probe());
    assert(driven.upright > .99, `car flipped: ${JSON.stringify(driven)}`);
    const muted = await page.evaluate(() => window.__audioVoices.every((el) => el.paused || el.muted));
    assert(muted, 'v2 must inherit site mute');
    await page.evaluate(() => document.getElementById('btnSound').click());
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(800);
    await page.keyboard.up('ArrowUp');
    const voices = await page.evaluate(() => window.__audioVoices.map((el) => ({ paused: el.paused, muted: el.muted, loop: el.loop, src: el.src, error: el.error?.code })));
    assert(voices.some((el) => !el.paused && !el.muted && el.loop), `engine must play when unmuted: ${JSON.stringify(voices)}`);
    await page.evaluate(() => document.getElementById('btnSound').click());
    assert(await page.evaluate(() => window.__audioVoices.every((el) => el.paused || el.muted)), 'mute must silence already playing voices');
    await page.click('.rv2-recover');
    await page.waitForTimeout(500);
    const recovered = await page.evaluate(() => window.__rv2probe());
    assert(recovered.speed < 2 && recovered.upright > .99, `recovery failed: ${JSON.stringify(recovered)}`);
    for (const exit of ['showMenu', 'backToMenu', 'close']) {
      if (exit !== 'showMenu') {
        await page.evaluate(() => arcade.select('racing'));
        await page.waitForSelector('.rv2-go'); await page.click('.rv2-go');
      }
      await page.evaluate(() => { if (!profile.soundOn) document.getElementById('btnSound').click(); });
      await page.keyboard.press('ArrowUp'); await page.waitForTimeout(100);
      await page.evaluate((name) => arcade[name](), exit);
      await page.waitForTimeout(300);
      assert(await page.evaluate(() => window.__audioVoices.every((el) => el.paused)), `${exit} left audio playing`);
      assert.equal(await page.locator('#racingV2Mount canvas').count(), 0, `${exit} did not unmount game`);
    }
    assert.deepEqual(errors, []);
    console.log('PASS: clear parking-lot spawn, position recovery preserves score, v2 stays upright, mute inherits/toggles, and menu/back/close stop every audio voice.');
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
})().catch((error) => { console.error(error); process.exitCode = 1; });

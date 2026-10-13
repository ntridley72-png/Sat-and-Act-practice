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
    const file = url.startsWith('/racing-v2/') ? path.join(root, 'racing-v2/dist', url.slice(11)) : path.join(root, url === '/' ? 'SAT & ACT Practice.html' : url.slice(1));
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.mp3': 'audio/mpeg' })[path.extname(file)] || 'application/octet-stream');
      res.end(data);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      const AudioConstructor = window.Audio;
      window.__voices = [];
      window.Audio = function (...args) { const el = new AudioConstructor(...args); window.__voices.push(el); return el; };
      window.Audio.prototype = AudioConstructor.prototype;
    });
    const baseUrl = process.env.BASE_URL || `http://127.0.0.1:${server.address().port}/`;
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof RacingV2 !== 'undefined');
    await page.evaluate(() => {
      RacingV2.setLocal(null);
      profile.soundOn = true; window.FunSATAudio.muted = false;
      profile.tokens = 2;
      const g = DriftCircuit.garage(); g.car = 'sport'; g.raceCar = 'rally'; g.unlocked = ['sport', 'rally']; g.cash = 100;
      arcade.select('drift');
    });
    const host = page.locator('.rv2-root[data-driving-mode="drift-sandbox"]');
    await host.waitFor();
    await page.waitForSelector('.rv2-car');
    assert.equal(await page.evaluate(() => arcade.game), null, 'default drift must not instantiate v1');
    assert.match(await page.locator('.rv2-title').textContent(), /Parking Lot/);
    assert.equal(await page.locator('#rv2-grid').count(), 0, 'sandbox must not offer race opponents');
    assert(!/All six tracks/.test(await host.textContent()), 'sandbox must not offer circuit choices');
    await page.click('.rv2-go');
    await page.waitForFunction(() => window.__rv2probe?.().sandbox === true);
    let first = await page.evaluate(() => window.__rv2probe());
    assert(first.car && first.car.mass === 500 && first.archetype === 'sport', 'modern v2 sport car and garage physics must be used');
    assert.equal(first.opponents.length, 0);
    await page.waitForTimeout(700);
    await page.keyboard.down('ArrowUp');
    await page.waitForFunction(() => window.__rv2probe().speed > 8, null, { timeout: 90000 }).catch(async (e) => { throw new Error(e.message + ': ' + JSON.stringify(await page.evaluate(() => window.__rv2probe()))); });
    await page.keyboard.up('ArrowUp');
    await page.keyboard.down('ArrowUp'); await page.keyboard.down('ArrowLeft'); await page.keyboard.down('Space');
    await page.waitForFunction(() => window.__rv2probe().driftScore > 0, null, { timeout: 60000 });
    await page.keyboard.up('Space'); await page.keyboard.up('ArrowLeft'); await page.keyboard.up('ArrowUp');
    const driven = await page.evaluate(() => window.__rv2probe());
    assert(driven.upright > .99 && driven.lap === 0, 'drift must remain upright and never count circuit laps');
    assert(Math.abs(driven.x) < 82 && Math.abs(driven.z) < 57, 'physical lot boundaries must contain the car');
    assert(driven.driftScore > 0, 'real throttle/steering/handbrake input must earn drift points: ' + JSON.stringify(driven));
    await page.keyboard.press('F9');
    assert.equal(await host.count(), 1, 'an unused key must not replace the game');
    await page.locator('.rv2-recover').first().click();
    await page.waitForFunction(() => {
      const p = window.__rv2probe();
      return Math.hypot(p.x, p.z) < 2 && p.speed < 2;
    }, null, { timeout: 45000 });
    const recovered = await page.evaluate(() => window.__rv2probe());
    assert(Math.hypot(recovered.x, recovered.z) < 2 && recovered.speed < 2, 'reset must return v2 car to clear spawn: ' + JSON.stringify(recovered));
    assert(recovered.driftScore >= driven.driftScore, 'position reset must retain earned drift score');
    const shot = process.env.SCREENSHOT_PATH || path.join(os.tmpdir(), 'drift-v2-parking-lot.png');
    await page.screenshot({ path: shot });
    for (const viewport of [{ width: 768, height: 1024 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport); await page.waitForTimeout(200);
      const box = await page.locator('.rv2-recover').first().boundingBox();
      assert(box && box.x >= 0 && box.x + box.width <= viewport.width, 'Reset Position must remain reachable on tablet/phone');
    }
    await page.evaluate(() => document.getElementById('btnSound').click());
    assert(await page.evaluate(() => window.__voices.every((v) => v.paused || v.muted)), 'site mute must silence v2 drift');
    await page.click('.rv2-end-run');
    assert.match(await page.locator('.rv2-result').textContent(), /drift points/);
    assert.equal(await page.evaluate(() => DriftCircuit.garage().cash), 100, 'practice must not mint garage cash');
    await page.evaluate(() => { arcade.select('drift'); });
    await page.waitForSelector('.rv2-go');
    await page.locator('.rv2-chip', { hasText: 'Scored run' }).click();
    await page.click('.rv2-go'); await page.waitForSelector('.rv2-end-run');
    assert.equal(await page.evaluate(() => profile.tokens), 1, 'scored drift must charge once');
    await page.waitForTimeout(700);
    await page.keyboard.down('ArrowUp');
    await page.waitForFunction(() => window.__rv2probe().speed > 8, null, { timeout: 90000 });
    await page.keyboard.down('ArrowRight'); await page.keyboard.down('Space');
    await page.waitForFunction(() => window.__rv2probe().driftScore > 0, null, { timeout: 60000 });
    await page.keyboard.up('Space'); await page.keyboard.up('ArrowRight'); await page.keyboard.up('ArrowUp');
    await page.click('.rv2-end-run');
    const scored = await page.evaluate(() => ({ result: window.__rv2economyProbe.state().result, high: profile.highScores.drift, cash: DriftCircuit.garage().cash }));
    assert(scored.result.recorded && scored.result.driftScore > 0, 'real scored drift must bank a drift record');
    assert.equal(scored.cash, 100 + Math.floor(scored.result.driftScore / 400), 'cash must follow the existing drift conversion');
    assert(scored.high >= scored.result.driftScore, 'record must persist through the host profile');
    await page.evaluate(() => arcade.select('racing'));
    await page.waitForSelector('.rv2-root[data-driving-mode="racing"]');
    assert.equal(await page.evaluate(() => DriftCircuit.garage().raceCar), 'rally', 'drift must not overwrite the separately selected racing car');
    await page.evaluate(() => arcade.close());
    await page.waitForTimeout(300);
    assert(await page.evaluate(() => window.__voices.every((v) => v.paused)), 'closing/switching must dispose all drift audio');
    await page.goto(baseUrl + '?play=drift', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.rv2-root[data-driving-mode="drift-sandbox"]');
    assert.equal(await page.evaluate(() => arcade.game), null, 'direct game-page links must also open v2, never v1');
    assert.deepEqual(errors, []);
    console.log('PASS: Drift uses v2 cars/physics and an open lot, no laps/opponents, real drift scoring, score-preserving recovery, responsive controls, mute/audio disposal, scored billing/cash and separate garage selections. Screenshot: ' + shot);
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
})().catch((e) => { console.error(e); process.exitCode = 1; });

/* Which way does the car actually travel when you press W?
 * Measures displacement projected onto the car's own forward axis. Positive
 * means nose-first, negative means it is driving backwards. */
const { chromium } = require('playwright-core')
const EXEC = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
;(async () => {
  const b = await chromium.launch({ executablePath: EXEC, headless: false, args: ['--no-sandbox'] })
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } })
  await p.goto('http://127.0.0.1:8901/?opponents=0', { waitUntil: 'load' })
  await p.waitForFunction('window.__ready === true', { timeout: 20000 })
  await p.waitForTimeout(1000)
  const go = await p.$('.rv2-go'); if (go) await go.click()
  await p.waitForTimeout(2500)

  /* Brake to a standstill first. Without this the reverse trial inherits the
     forward trial's momentum, still shows net forward displacement, and
     reports a false inversion -- which it did. */
  async function stop() {
    await p.keyboard.down('Space')
    await p.waitForTimeout(2500)
    await p.keyboard.up('Space')
    await p.waitForTimeout(600)
  }

  async function run(key, label) {
    await stop()
    const a = await p.evaluate(() => window.__rv2probe && window.__rv2probe())
    await p.keyboard.down(key); await p.waitForTimeout(2000); await p.keyboard.up(key)
    await p.waitForTimeout(300)
    const c = await p.evaluate(() => window.__rv2probe && window.__rv2probe())
    if (!a || !c) { console.log(`  ${label}: probe unavailable`); return 0 }
    const dx = c.x - a.x, dz = c.z - a.z
    // Car forward for a +Z-forward mesh at yaw: (sin yaw, cos yaw).
    const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw)
    const along = dx * fx + dz * fz
    console.log(`  ${label.padEnd(18)} moved ${Math.hypot(dx,dz).toFixed(1)} m, ${along >= 0 ? 'NOSE-FIRST' : 'BACKWARDS'} (${along.toFixed(1)} m along forward)`)
    return along
  }

  const w = await run('KeyW', 'W (accelerate)')
  const sKey = await run('KeyS', 'S (reverse)')
  await b.close()
  console.log('')
  const ok = w > 1 && sKey < -0.5
  console.log(ok ? 'CORRECT: W drives nose-first, S reverses.' : 'INVERTED: the engine force sign is backwards.')
  process.exit(ok ? 0 : 1)
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1) })

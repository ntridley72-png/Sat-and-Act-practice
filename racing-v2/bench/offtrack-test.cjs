/* Does leaving the road actually cost anything?
 * Before the penalty, grass was exactly as fast as tarmac, so cutting the
 * infield was strictly quicker than racing. */
const { chromium } = require('playwright-core')
const EXEC = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
;(async () => {
  const b = await chromium.launch({ executablePath: EXEC, headless: false, args: ['--no-sandbox'] })
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } })
  await p.goto('http://127.0.0.1:8901/?opponents=0', { waitUntil: 'load' })
  await p.waitForFunction('window.__ready === true', { timeout: 20000 })
  await p.waitForTimeout(1200)
  const go = await p.$('.rv2-go'); if (go) await go.click()
  await p.waitForTimeout(1500)

  const speed = () => p.evaluate(() => Number(document.querySelector('.rv2-speed span')?.textContent ?? 0))

  // Straight down the road from pole.
  await p.keyboard.down('KeyW'); await p.waitForTimeout(5000)
  const onTrack = await speed()

  // Now steer off into the grass and hold the throttle.
  await p.keyboard.down('KeyA'); await p.waitForTimeout(1600); await p.keyboard.up('KeyA')
  await p.waitForTimeout(3500)
  const offTrack = await speed()
  await p.keyboard.up('KeyW')
  await b.close()

  console.log(`  on track, full throttle : ${onTrack} km/h`)
  console.log(`  off in the grass        : ${offTrack} km/h`)
  const ok = offTrack < onTrack * 0.8
  console.log(ok ? '  PENALTY WORKS: the verge is meaningfully slower' : '  NO PENALTY: grass is as fast as tarmac')
  process.exit(ok ? 0 : 1)
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1) })

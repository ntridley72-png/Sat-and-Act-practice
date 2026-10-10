/* Capture the game mid-corner, under power, which is the only state where
 * the skid marks, dust and reflections are all doing something. A grid shot
 * shows none of them. */
const { chromium } = require('playwright-core')
const path = require('node:path')
const EXEC = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
;(async () => {
  const b = await chromium.launch({ executablePath: EXEC, headless: false, args: ['--no-sandbox'] })
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } })
  await p.goto('http://127.0.0.1:8901/?opponents=6', { waitUntil: 'load' })
  await p.waitForFunction('window.__ready === true', { timeout: 20000 })
  await p.waitForTimeout(1200)
  const go = await p.$('.rv2-go'); if (go) await go.click()
  await p.waitForTimeout(1500)

  // Accelerate down the straight, then turn in hard so the rear steps out.
  await p.keyboard.down('KeyW')
  await p.waitForTimeout(4500)
  await p.keyboard.down('KeyA')
  await p.waitForTimeout(1400)
  await p.screenshot({ path: path.join(__dirname, 'shots', 'cornering.png') })
  await p.keyboard.up('KeyA')
  await p.waitForTimeout(2500)
  await p.screenshot({ path: path.join(__dirname, 'shots', 'driving.png') })
  await p.keyboard.up('KeyW')

  const speed = await p.evaluate(() => Number(document.querySelector('.rv2-speed span')?.textContent ?? -1))
  console.log('captured at', speed, 'km/h -> shots/cornering.png, shots/driving.png')
  await b.close()
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1) })

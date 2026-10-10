const { chromium } = require('playwright-core')
const EXEC = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
;(async () => {
  const b = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] })
  const p = await b.newPage()
  p.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 400)))
  p.on('console', (m) => console.log(m.type().toUpperCase() + ':', m.text().slice(0, 300)))
  p.on('request', (r) => { if (r.url().includes('favicon') || r.resourceType()==='other') console.log('REQ', r.resourceType(), r.url()) })
  p.on('response', (r) => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url()) })
  p.on('requestfailed', (r) => console.log('REQFAILED:', r.url(), r.failure()?.errorText))
  await p.goto('http://127.0.0.1:8901/?opponents=4', { waitUntil: 'load' })
  await p.waitForTimeout(2500)
  // The intro screen gates the race now; click through it the way a player
  // would, so the bench measures an actual race and not a menu.
  const go = await p.$('.rv2-go')
  if (go) { await go.click(); console.log('clicked Race') } else { console.log('NO .rv2-go BUTTON FOUND') }
  await p.waitForTimeout(3000)
  console.log('__ready =', await p.evaluate('window.__ready'))
  console.log('canvas  =', await p.evaluate("document.querySelector('canvas') ? 'present' : 'ABSENT'"))
  await b.close()
})()

const { chromium } = require('playwright-core')
const EXEC = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
;(async () => {
  const b = await chromium.launch({ executablePath: EXEC, headless: false, args: ['--no-sandbox'] })
  const p = await b.newPage()
  p.on('response', (r) => { if (r.status() >= 400) console.log(r.status(), r.url()) })
  await p.goto('http://127.0.0.1:8901/?opponents=4', { waitUntil: 'load' })
  await p.waitForTimeout(2000)
  const go = await p.$('.rv2-go'); if (go) await go.click()
  await p.waitForTimeout(4000)
  await b.close()
})()

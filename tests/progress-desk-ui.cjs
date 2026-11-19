/* Local-only regression for the shared shell; fixtures never contact live accounts. */
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright-core');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8903';
const APP = '/' + encodeURIComponent('SAT & ACT Practice.html');
const EXEC = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-x64/chrome-headless-shell');
(async () => {
  assert.match(BASE, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/);
  const browser = await chromium.launch({ executablePath: EXEC });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE + APP);
    await page.waitForFunction(() => !!window.FunSATDesk);
    assert.equal(await page.textContent('#deskEstimate'), 'Not yet');
    assert.equal(await page.textContent('#deskTests'), '0');
    const ids = await page.evaluate(() => [...document.querySelectorAll('[id]')].map(e => e.id));
    assert.equal(new Set(ids).size, ids.length, 'duplicated live control ids');
    await page.click('#deskReview');
    assert.match(await page.textContent('#deskStatus'), /No saved attempts/);
    await page.evaluate(() => {
      profile.history = [{done:true,scoreEligible:true,totalAnswered:40,testType:'sat',keys:['rw','math'],secScores:{rw:{score:680,answered:20,correct:18},math:{score:660,answered:20,correct:16}}}, {done:true,scoreEligible:false,practiceKind:'topic',testType:'sat',keys:['math'],totalAnswered:10}];
      profile.college = {...profile.college,customTarget:1540};
      const key = Object.keys(FunSATSubjects.inventory()).find(k => k.startsWith('sat|'));
      profile.skillStats = {[key]:{r:1,w:3}};
      renderStart();
    });
    assert.equal(await page.textContent('#deskEstimate'), '1340');
    assert.equal(await page.textContent('#deskTarget'), '1540');
    assert.equal(await page.textContent('#deskTests'), '1');
    assert.equal(await page.locator('#deskSkillRows tr').count(), 1);
    assert.match(await page.textContent('#deskSkillRows'), /25%/);
    await page.locator('#deskSkillRows button').click();
    await page.waitForSelector('#screen-subjects', {state:'visible'});
    assert.equal(await page.evaluate(() => state.view), 'subjects');
    await page.click('#btnHome');
    for (const appearance of ['light','dark']) {
      await page.selectOption('#deskAppearance',appearance);
      await page.selectOption('#workspaceTheme','notebook');
      await page.reload();
      await page.waitForFunction(() => !!window.FunSATDesk);
      assert.equal(await page.getAttribute('html','data-desk-appearance'), appearance);
      assert.equal(await page.getAttribute('body','data-workspace'), 'notebook');
    }
    for (const width of [320,390,768,1024,1440,1920]) {
      await page.setViewportSize({width,height:960});
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'home overflow at '+width);
      if (width <= 900) {
        assert.equal(await page.locator('#btnCollege').isVisible(), false);
        await page.click('#deskMenu');
        assert.equal(await page.getAttribute('#deskMenu','aria-expanded'),'true');
        await page.keyboard.press('Escape');
        assert.equal(await page.getAttribute('#deskMenu','aria-expanded'),'false');
        assert.equal(await page.evaluate(() => document.activeElement.id),'deskMenu');
        await page.click('#deskMenu');
      }
      await page.click('#btnCollege');
      await page.waitForSelector('#screen-college',{state:'visible'});
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'college overflow at '+width);
      if (width <= 900) await page.click('#deskMenu');
      await page.click('#btnScholarships');
      await page.waitForSelector('#screen-scholarships',{state:'visible'});
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'scholarships overflow at '+width);
      if (width <= 900) await page.click('#deskMenu');
      await page.click('#btnHome');
    }
    for (const [view,screen] of [['subjects','subjects'],['college','college'],['scholarships','scholarships']]) {
      await page.goto(BASE+APP+'?view='+view);
      await page.waitForSelector('#screen-'+screen,{state:'visible'});
    }
    await page.goto(BASE+APP);
    await page.waitForFunction(() => !!window.FunSATDesk);
    if (!(await page.locator('#setupDetails').evaluate(e => e.open))) await page.click('#setupDetails > summary');
    await page.click('#sectionPicker [data-section="math"]');
    await page.click('.pd-modules > summary');
    await page.click('#satModulePicker [data-module="m2hard"]');
    assert.equal(await page.evaluate(() => state.cfg.satModule), 'm2hard');
    assert.deepEqual(errors,[]);
    console.log('PASS: genuine estimates, topic-score exclusion, precise skill navigation, appearance/layout persistence, mobile menu/keyboard, six responsive widths and public route bridges.');
  } finally { await browser.close(); }
})().catch(e => {console.error(e);process.exitCode=1;});

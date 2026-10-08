const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright-core');
const BASE=process.env.BASE_URL||'http://127.0.0.1:8899';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Never generate live ad traffic in tests.
 await page.route(/googlesyndication|doubleclick|bauval\.org/,r=>r.abort());
 for(const [width,height] of [[390,844],[768,1024],[1366,900],[1920,1080],[2560,1440]]){
  await page.setViewportSize({width,height});await page.goto(BASE+'/'+encodeURIComponent('SAT & ACT Practice.html')+'?adpreview=1',{waitUntil:'networkidle'});
  await page.evaluate(()=>{FUNSAT_ADS.gameRails=2;profile.tokens=200;arcade.select('snake')});await page.waitForTimeout(150);
  const result=await page.evaluate(()=>{
   const canvas=document.getElementById('gameCanvas').getBoundingClientRect();const rails=[...document.querySelectorAll('.game-ad-rail')].filter(h=>!h.hidden&&h.getBoundingClientRect().width);
   return {canvas:{width:canvas.width,left:canvas.left,right:canvas.right}, rails:rails.map(h=>{const a=h.getBoundingClientRect();return {left:a.left,right:a.right,safe:FunSatAds.railSafety([...document.querySelectorAll('#arcadeOverlay canvas,#arcadeOverlay button,#arcadeOverlay select,#arcadeOverlay .dpad,#arcadeOverlay .arcade-hud')].map(x=>x.getBoundingClientRect()).filter(r=>r.width&&r.height),a)}})};
  });
  assert(result.canvas.width>0&&result.canvas.right<=width+1,'canvas fits');assert(result.rails.every(r=>r.safe),'all rails >=150px from interactive content');assert.equal(await page.locator('#screen-start .sponsor-slot:visible').count(),0,'page ads are not left visible behind gameplay');if(width<1200)assert.equal(result.rails.length,0);
  if(width===2560)assert.equal(result.rails.length,2,'large desktop earns two independently safe rails');
  await page.evaluate(()=>{const node=document.querySelector('[data-ad-slot="arcade-menu"]');arcade.showMenu();arcade.buildMenu();if(node!==document.querySelector('[data-ad-slot="arcade-menu"]'))throw new Error('menu ad host must persist across redraws');arcade.close();document.getElementById('btnStart').click()});assert.equal(await page.locator('#screen-test').isVisible(),true);
  assert.equal(await page.locator('[data-ad-slot]:visible').count(),0,'no active SAT question ads');
  await page.evaluate(()=>{state.answers[currentQids()[0]]=byId(currentQids()[0]).ans;finishTest(true);renderReview()});assert(await page.locator('#screen-results').isVisible());assert(await page.locator('.difficulty-summary').isVisible());
  await page.selectOption('.review-filters select','missed');assert.equal(await page.locator('.review:visible .tag.right').count(),0);
  await page.selectOption('.review-filters select','all');assert(await page.locator('.review:visible').count()>0);
 }
 // Resizing never shrinks the game for ads; rails disappear when spacing disappears.
 await page.setViewportSize({width:2560,height:1440});await page.evaluate(()=>arcade.select('snake'));await page.setViewportSize({width:1024,height:768});await page.waitForTimeout(100);assert.equal(await page.locator('.game-ad-rail:visible').count(),0);
 await page.goto(BASE+'/'+encodeURIComponent('SAT & ACT Practice.html'),{waitUntil:'networkidle'});assert.equal(await page.locator('script[data-funsat-adsense]').count(),0,'missing IDs/consent cause no requests');
 // Isolated manager fixture: simulate an official loader without any Google requests.
 await page.setContent('<div id="screen-test" hidden></div><div style="width:800px"><aside class="sponsor-slot" data-ad-slot="results-top" hidden></aside></div>');
 await page.evaluate(()=>{delete window.FunSatAds;window.FUNSAT_ADS={enabled:true,audienceReviewed:true,autoAdsExclusionsConfirmed:true,client:'ca-pub-1234567890123456',slots:{'results-top':'123'},productionHosts:[location.hostname]};window.adsbygoogle=[]});
 let loads=0;await page.route('https://pagead2.googlesyndication.com/**',r=>{loads++;return r.fulfill({contentType:'text/javascript',body:'window.mockGoogleLoaded=true;'})});
 await page.addStyleTag({content:'[data-ad-slot]{min-height:300px}[hidden]{display:none}'});await page.addScriptTag({content:fs.readFileSync('ads.js','utf8')});await page.evaluate(()=>FunSatAds.mount());assert.equal(loads,0,'no consent no loader');
 await page.evaluate(()=>{FunSatAds.setConsent(true);FunSatAds.mount();FunSatAds.mount()});await page.waitForTimeout(200);assert.equal(loads,1);assert.equal(await page.evaluate(()=>adsbygoogle.length),1);
 await page.evaluate(()=>{FunSatAds.setPracticeMode(true);FunSatAds.setPracticeMode(false);FunSatAds.mount()});await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>adsbygoogle.length),1,'no refresh on SPA return');assert.equal(await page.evaluate(()=>document.querySelector('ins').hasAttribute('hidden')),false,'Google creative attributes are never changed');
 const boxBefore=await page.locator('.sponsor-slot[data-ad-slot]').boundingBox();
 await page.evaluate(()=>document.querySelector('ins').dataset.adStatus='unfilled');
 const boxAfter=await page.locator('.sponsor-slot[data-ad-slot]').boundingBox();assert.equal(boxBefore.height,boxAfter.height,'no-fill preserves reservation');
 // New document, blocked official loader: product and host remain usable.
 await page.reload({waitUntil:'domcontentloaded'});
 await page.setContent('<div id="screen-test" hidden></div><div style="width:800px"><aside class="sponsor-slot" data-ad-slot="results-top" hidden></aside><button id="product">Continue studying</button></div>');
 await page.evaluate(()=>{delete window.FunSatAds;window.FUNSAT_ADS={enabled:true,audienceReviewed:true,autoAdsExclusionsConfirmed:true,client:'ca-pub-1234567890123456',slots:{'results-top':'123'},productionHosts:[location.hostname]};window.adsbygoogle=[]});
 await page.unroute('https://pagead2.googlesyndication.com/**');await page.route('https://pagead2.googlesyndication.com/**',r=>r.abort());
 await page.addStyleTag({content:'[data-ad-slot]{min-height:300px}[hidden]{display:none}'});await page.addScriptTag({content:fs.readFileSync('ads.js','utf8')});
 await page.evaluate(()=>FunSatAds.setConsent(true));await page.waitForTimeout(150);assert.equal(await page.locator('ins').count(),0);assert(await page.locator('#product').isVisible());
 // Slow application network: questions and games do not wait on ad delivery.
 await page.route('**/*',async r=>{if(r.request().url().startsWith(BASE)&&r.request().resourceType()==='script')await new Promise(resolve=>setTimeout(resolve,100));return r.continue()});
 await page.evaluate(()=>localStorage.clear());await page.goto(BASE+'/'+encodeURIComponent('SAT & ACT Practice.html'),{waitUntil:'networkidle'});await page.click('#btnStart');assert(await page.locator('#questionCard').isVisible());await page.evaluate(()=>arcade.select('snake'));assert(await page.locator('#gameCanvas').isVisible());
 await page.screenshot({path:'/tmp/funsat-final-game.png'});
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS: five responsive sizes, safe game rails, resize removal, SAT/results/review, missing configuration, blocked loader/no-fill, slow network, consent and exactly-once mocked AdSense.');
})().catch(e=>{console.error(e);process.exit(1)});

const assert=require('node:assert/strict');const {chromium}=require('playwright-core');
const base=process.env.OWNER_APP_URL||'http://127.0.0.1:8790',pin=process.env.ANALYTICS_TEST_PIN;
if(!pin)throw new Error('Set ANALYTICS_TEST_PIN for isolated local testing.');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
 const page=await browser.newPage();const errors=[],saved=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('response',async r=>{if(new URL(r.url()).pathname.endsWith('/connections')&&r.request().postDataJSON()?.action!=='delete'){saved.push(await r.json());}});
 await page.route('**/api/analytics/summary?**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({totals:{events:0,observed_sessions:0},events:[]})}));
 // No actual Cloudflare ad/provider traffic. Credential saving and PIN auth use real local D1.
 await page.route('**/api/analytics/cloudflare?**',r=>{const p=new URL(r.request().url()).searchParams.get('project');return r.fulfill({contentType:'application/json',body:JSON.stringify({status:'partial',workers:{status:'not_configured'},zone:{status:'ok',data:[{date:'2026-10-08',sum:{requests:p==='funsat'?123:456,bytes:100},uniq:{uniques:10}}]}})});});
 await page.goto(base+'/owner-analytics/');assert(page.url().endsWith('login.html'));await page.fill('#pin',pin);await page.click('#login button');await page.waitForURL('**/owner-analytics/');
 await page.locator('#connection summary').click();
 for(const project of ['funsat','pillcounted']){await page.fill('#'+project+'-cf-token',project+'-read-only-phone-token');await page.fill('#'+project+'-zone',(project==='funsat'?'a':'b').repeat(32));assert.equal(await page.locator('#'+project+'-cf-token').getAttribute('type'),'password');await page.click('[data-save='+project+']');await page.waitForFunction(p=>document.getElementById(p+'-connection-status').textContent.startsWith('Connection saved'),project);assert.equal(await page.inputValue('#'+project+'-cf-token'),'');}
 for(const width of [320,390,768,1366]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'connection form fits '+width);}
 await page.locator('button[type=submit]').click();await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('Reports loaded'));
 assert((await page.locator('#funsat .report').innerText()).includes('123'));assert((await page.locator('#pillcounted .report').innerText()).includes('456'));assert.equal(saved.length,2);assert(!JSON.stringify(saved).includes('phone-token'));
 assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
 await page.reload();assert.equal(await page.inputValue('#funsat-cf-token'),'');await page.click('#lock');await page.waitForURL('**/login.html');
 const unauthorized=await page.request.get(base+'/api/analytics/summary?project=funsat');assert.equal(unauthorized.status(),401);
 assert.deepEqual(errors,[]);
 console.log('PASS: real PIN/D1 connection-save flow, mobile form, no token echo/browser storage, cleared fields, reload and logout protection. Provider reports mocked.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

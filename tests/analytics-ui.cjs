const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {chromium}=require('playwright-core');
const base=process.env.ANALYTICS_TEST_URL||'http://localhost:8788';
const token=process.env.ANALYTICS_TEST_TOKEN;
if(!token)throw new Error('Set ANALYTICS_TEST_TOKEN for the isolated local fixture. Never test with production data.');
(async()=>{
 const headers={Authorization:'Bearer '+token};
 const unauth=await fetch(base+'/api/analytics/summary?project=funsat');assert.equal(unauth.status,401);
 async function send(project,origin,id){const response=await fetch(base+'/api/analytics/events?project='+project,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({consent:true,sessionId:randomUUID(),events:[{id,name:'page_view',properties:{view:'site'}}]})});assert.equal(response.status,202);return response.json();}
 const id=randomUUID();assert.equal((await send('funsat','http://localhost:8788',id)).accepted,1);
 assert.equal((await send('funsat','http://localhost:8788',id)).accepted,0);
 assert.equal((await send('pillcounted','https://pillcounted.com',id)).accepted,1);
 const summary=await fetch(base+'/api/analytics/summary?project=pillcounted',{headers});assert.equal(summary.status,200);assert.equal((await summary.json()).project,'pillcounted');assert.equal(summary.headers.get('cache-control'),'no-store');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 try {
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/owner-analytics/');await page.fill('#token',token);await page.locator('button[type=submit]').click();await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('Reports loaded'));
 for(const project of ['funsat','pillcounted']){assert((await page.locator('#'+project+' .report').innerText()).includes('Anonymous tab sessions'));assert((await page.locator('#'+project+' .report').innerText()).includes('not_configured'));}
 for(const [width,height] of [[320,640],[390,844],[768,1024],[1366,900],[1920,1080]]){await page.setViewportSize({width,height});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow at '+width);}
 assert.equal(await page.evaluate(()=>localStorage.length),0);assert.equal(await page.evaluate(()=>sessionStorage.length),0);
 const manifest=await (await fetch(base+'/owner-analytics/manifest.webmanifest')).json();assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'/owner-analytics/');
 await page.click('#lock');assert.equal(await page.inputValue('#token'),'');assert.equal(await page.locator('#funsat .report').innerText(),'Not loaded.');assert.deepEqual(errors,[]);
 console.log('PASS: real D1 dedup/project isolation, owner auth, missing-provider fallback, mobile/tablet/desktop layouts, Home Screen manifest, token clear and no browser errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});

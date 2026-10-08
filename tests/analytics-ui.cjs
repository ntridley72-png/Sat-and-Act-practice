const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
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
 const hidden=await fetch(base+'/owner-analytics/');assert.equal(hidden.status,404,'owner dashboard is not available on public site');
 console.log('PASS: real D1 dedup/project isolation, owner auth, no-store reporting, and public-site dashboard exclusion. Phone/PIN tests live in analytics-connection-ui.cjs.');
})().catch(e=>{console.error(e);process.exit(1)});

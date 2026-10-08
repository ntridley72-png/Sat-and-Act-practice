const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
(async()=>{
 let calls=0;const attempts=new Map();
 const context=vm.createContext({URL,Response,Request,Headers,TextEncoder,TextDecoder,Uint8Array,crypto:webcrypto,backend:{async fetch(request,env){assert.equal(env.ANALYTICS_OWNER_APP,'true');assert.equal(request.headers.get('Authorization'),'Bearer '+env.ANALYTICS_ENCRYPTION_KEY);calls++;return new Response('owner-report')}}});
 vm.runInContext(fs.readFileSync('worker/analytics-owner.js','utf8').replace("import backend from './index.js';",'').replace('export default','const owner ='),context);
 const db={prepare(){return {bind(...args){return {
  async first(){const n=attempts.get(args[0])||0;if(n>=5)return null;attempts.set(args[0],n+1);return {n:n+1};},
  async run(){return {};}
 };}};}};
 const env={ANALYTICS_ENCRYPTION_KEY:'1'.repeat(64),ANALYTICS_LOGIN_PIN:'654321',ANALYTICS_LOGIN_LIMITER:{async limit(){return {success:true};}},DB:db};
 const run=vm.runInContext('owner.fetch',context);
 const req=(path,options={})=>new Request('https://analytics.example'+path,options);
 assert.equal((await run(req('/'),{})).status,503,'no bootstrap defaults');
 assert.equal((await run(req('/owner-analytics/'),env)).status,302);
 assert.equal((await run(req('/api/analytics/summary'),env)).status,401);
 assert.equal((await run(req('/owner-analytics/login.html'),env)).status,200);
 async function login(pin,origin='https://analytics.example'){return run(req('/api/analytics/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({pin})}),env);}
 assert.equal((await login('654321','https://evil.example')).status,403);
 assert.equal((await login('wrong')).status,401);
 const signed=await login('654321');assert.equal(signed.status,200);const cookie=signed.headers.get('Set-Cookie');assert(cookie.includes('HttpOnly'));assert(cookie.includes('SameSite=Strict'));assert(cookie.includes('Secure'));assert(!cookie.includes('654321'));
 for(const path of ['/api/me','/api/signup','/api/analytics/events','/unknown'])assert.equal((await run(req(path,{headers:{Cookie:cookie}}),env)).status,404);
 for(const path of ['/api/analytics/projects','/api/analytics/summary','/api/analytics/cloudflare','/owner-analytics/','/owner-analytics/manifest.webmanifest'])assert.equal((await run(req(path,{headers:{Cookie:cookie}}),env)).status,200);
 assert.equal((await run(req('/api/analytics/connections',{method:'POST',headers:{Cookie:cookie,Origin:'https://evil.example'}}),env)).status,403);
 assert.equal((await run(req('/api/analytics/connections',{method:'POST',headers:{Cookie:cookie,Origin:'https://analytics.example'}}),env)).status,200);
 assert.equal((await run(req('/api/analytics/summary',{headers:{Cookie:cookie.replace(/analytics_owner=./,'analytics_owner=0')}}),env)).status,401,'tampered session rejected');
 assert.equal((await run(req('/api/analytics/summary',{headers:{Cookie:cookie}}),{...env,ANALYTICS_LOGIN_PIN:'111111'})).status,401,'PIN rotation invalidates sessions');
 for(let i=0;i<3;i++)await login('wrong');assert.equal((await login('654321')).status,429,'five attempts per 15 minute bucket');
 const out=await run(req('/api/analytics/logout',{method:'POST',headers:{Cookie:cookie,Origin:'https://analytics.example'}}),env);assert(out.headers.get('Set-Cookie').includes('Max-Age=0'));
 const config=fs.readFileSync('wrangler.analytics.toml','utf8');assert(config.includes('workers_dev = false'));assert(config.includes('preview_urls = false'));
 console.log('PASS: fail-closed PIN bootstrap, gated dashboard/API, authenticated reporting/save-only routes, cross-site rejection, signed secure sessions, PIN rotation, attempt limits and logout.');
})().catch(e=>{console.error(e);process.exitCode=1});

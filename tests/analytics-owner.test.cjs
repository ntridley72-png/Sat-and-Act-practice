const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 let calls=0;
 const context=vm.createContext({URL,Response,backend:{async fetch(){calls++;return new Response('owner-report')}}});
 vm.runInContext(fs.readFileSync('worker/analytics-owner.js','utf8').replace("import backend from './index.js';",'').replace('export default','const owner ='),context);
 for(const path of ['/api/me','/api/signup','/api/analytics/events','/','/unknown']){
  const r=await vm.runInContext('owner.fetch',context)(new Request('https://analytics.example'+path),{});
  assert.equal(r.status,path==='/'?302:404);
 }
 for(const path of ['/api/analytics/projects','/api/analytics/summary','/api/analytics/cloudflare','/owner-analytics/','/owner-analytics/manifest.webmanifest']){
  const r=await vm.runInContext('owner.fetch',context)(new Request('https://analytics.example'+path),{});assert.equal(r.status,200);
 }
 const previous=calls;
 assert.equal((await vm.runInContext('owner.fetch',context)(new Request('https://analytics.example/api/analytics/summary',{method:'POST'}),{})).status,404);assert.equal(calls,previous);
 const config=fs.readFileSync('wrangler.analytics.toml','utf8');assert(config.includes('workers_dev = false'));assert(config.includes('preview_urls = false'));
 console.log('PASS: dedicated owner host rejects account/collection/write routes and disables alternate deployment URLs.');
})().catch(e=>{console.error(e);process.exitCode=1});

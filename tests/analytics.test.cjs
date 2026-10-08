const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const source=fs.readFileSync('worker/index.js','utf8').replace('export default','const worker =');
const secret='local-test-owner-token-with-more-than-thirty-two-characters';
let records=[],queries=[],providerCalls=[];
const db={prepare(sql){return{bind(...args){return{sql,args,async run(){return{meta:{changes:0}}},async all(){queries.push({sql,args});return{results:[]}},async first(){queries.push({sql,args});return{events:0,sessions:0}}}}}},async batch(statements){return statements.map(({args})=>{const key=args[0]+':'+args[1];if(records.includes(key))return{meta:{changes:0}};records.push(key);return{meta:{changes:1}}})}};
const context=vm.createContext({URL,Request,Response,Headers,TextEncoder,TextDecoder,Uint8Array,AbortSignal,crypto:webcrypto,console,
fetch:async(url,options)=>{providerCalls.push({url,...options});const body=JSON.parse(options.body);const data=body.query.includes('WorkerMetrics')?{viewer:{accounts:[{workersInvocationsAdaptive:[{sum:{requests:20,errors:1,subrequests:8,secret:'DO_NOT_RETURN'},quantiles:{cpuTimeP50:120,cpuTimeP99:500}}]}]}}:{viewer:{zones:[{httpRequests1dGroups:[{dimensions:{date:new Date().toISOString().slice(0,10)},sum:{requests:100,bytes:200,cachedRequests:30,cachedBytes:100,threats:0},uniq:{uniques:15}}]}]}};return new Response(JSON.stringify({data}))}});
vm.runInContext(source,context);
const limiter={async limit(){return{success:true}}};
let env={DB:db,ANALYTICS_ENABLED:'true',ANALYTICS_OWNER_TOKEN:secret,ANALYTICS_EVENT_LIMITER:limiter,ANALYTICS_PROJECT_LIMITER:limiter,ANALYTICS_READ_LIMITER:limiter};
async function call(path,{method='GET',token,origin,body,raw,headers={}}={}){context.req=new Request('https://funsat.bid'+path,{method,headers:{...headers,...(token?{Authorization:'Bearer '+token}:{}),...(origin?{Origin:origin}:{}),...(body||raw?{'Content-Type':'application/json'}:{})},...(body||raw?{body:raw||JSON.stringify(body)}:{})});context.env=env;const r=await vm.runInContext('worker.fetch(req,env)',context);return{r,data:r.status===204?null:await r.json()}}
const session='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const batch={consent:true,sessionId:session,events:[{id,name:'page_view',properties:{view:'screen-start'}}]};
(async()=>{
 let result=await call('/api/analytics/projects');assert.equal(result.r.status,401);assert.equal(providerCalls.length,0);
 result=await call('/api/analytics/projects',{token:'wrong'});assert.equal(result.r.status,401);
 result=await call('/api/analytics/projects',{token:secret});assert.deepEqual(result.data.projects.map(p=>p.id),['funsat','pillcounted']);assert.equal(result.r.headers.get('Cache-Control'),'no-store');assert.equal(result.r.headers.get('Access-Control-Allow-Origin'),null);
 result=await call('/api/analytics/events?project=funsat',{method:'OPTIONS',origin:'https://pillcounted.com'});assert.equal(result.r.status,403);
 result=await call('/api/analytics/events?project=pillcounted',{method:'OPTIONS',origin:'https://pillcounted.com'});assert.equal(result.r.status,204);assert.equal(result.r.headers.get('Access-Control-Allow-Origin'),'https://pillcounted.com');
 result=await call('/api/analytics/events?project=funsat',{method:'POST',origin:'https://evil.example',body:batch});assert.equal(result.r.status,403);
 result=await call('/api/analytics/events?project=funsat',{method:'POST',origin:'https://funsat.bid',body:{...batch,consent:false}});assert.equal(result.r.status,400);
 result=await call('/api/analytics/events?project=funsat',{method:'POST',origin:'https://funsat.bid',body:{...batch,events:[{...batch.events[0],properties:{email:'private@example.com'}}]}});assert.equal(result.r.status,400);
 result=await call('/api/analytics/events?project=pillcounted',{method:'POST',origin:'https://pillcounted.com',body:batch});assert.equal(result.r.status,400,'Pillcounted does not accept arbitrary views or health/product events');
 result=await call('/api/analytics/events?project=funsat',{method:'POST',origin:'https://funsat.bid',body:batch});assert.equal(result.r.status,202);assert.equal(result.data.accepted,1);
 result=await call('/api/analytics/events?project=funsat',{method:'POST',origin:'https://funsat.bid',body:batch});assert.equal(result.data.accepted,0,'idempotent batch retry');
 result=await call('/api/analytics/events?project=pillcounted',{method:'POST',origin:'https://pillcounted.com',body:{...batch,events:[{id,name:'page_view',properties:{view:'site'}}]}});assert.equal(result.data.accepted,1,'IDs have separate project namespaces');
 result=await call('/api/analytics/events?project=funsat',{method:'POST',origin:'https://funsat.bid',raw:'x'.repeat(17000)});assert.equal(result.r.status,413);
 result=await call('/api/analytics/summary?project=funsat&from=2026-02-31',{token:secret});assert.equal(result.r.status,400);
 result=await call('/api/analytics/summary?project=unknown',{token:secret});assert.equal(result.r.status,400);
 queries=[];result=await call('/api/analytics/summary?project=pillcounted',{token:secret});assert.equal(result.r.status,200);assert.equal(result.data.active_users,null);assert.equal(result.data.revenue,null);assert(queries.every(q=>q.args[0]==='pillcounted'),'all summary SQL is project-scoped');
 env.ANALYTICS_EVENT_LIMITER={async limit(){return{success:false}}};result=await call('/api/analytics/events?project=funsat',{method:'POST',origin:'https://funsat.bid',body:batch});assert.equal(result.r.status,429);env.ANALYTICS_EVENT_LIMITER=limiter;
 result=await call('/api/analytics/cloudflare?project=funsat',{token:secret});assert.equal(result.data.status,'not_configured');assert.equal(providerCalls.length,0);
 env.ANALYTICS_PROJECTS=JSON.stringify({funsat:{cloudflare:{accountId:'a'.repeat(32),zoneId:'b'.repeat(32),workerName:'sat-act-practice'}},pillcounted:{cloudflare:{accountId:'c'.repeat(32),workerName:'pillcounted-worker'}}});env.CLOUDFLARE_ANALYTICS_TOKENS=JSON.stringify({funsat:'funsat-provider-token',pillcounted:'pillcounted-provider-token'});
 result=await call('/api/analytics/cloudflare?project=funsat',{token:secret});assert.equal(result.data.status,'ok');assert.equal(result.data.workers.data[0].sum.requests,20);assert(!JSON.stringify(result.data).includes('DO_NOT_RETURN'));assert(!JSON.stringify(result.data).includes('provider-token'));
 await call('/api/analytics/cloudflare?project=pillcounted',{token:secret});assert.equal(providerCalls[2].headers.Authorization,'Bearer pillcounted-provider-token');assert.equal(JSON.parse(providerCalls[2].body).variables.accountTag,'c'.repeat(32));
 context.fetch=async()=>new Response(JSON.stringify({errors:[{message:'leaked upstream credential'}]}));result=await call('/api/analytics/cloudflare?project=funsat',{token:secret});assert.equal(result.data.workers.status,'query_unavailable');assert(!JSON.stringify(result.data).includes('leaked'));
 console.log('PASS: owner-only reads, strict CORS/consent/schema/size limits, deduplication, project isolation, bounded queries, private provider tokens and honest failure states.');
})().catch(e=>{console.error(e);process.exitCode=1});

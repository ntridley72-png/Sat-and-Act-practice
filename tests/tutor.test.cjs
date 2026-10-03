const fs=require('node:fs');const vm=require('node:vm');const assert=require('node:assert/strict');
const source=fs.readFileSync('worker/index.js','utf8').replace('export default','const worker =');
async function run(statuses,body={messages:[{role:'user',content:'Help'}]}){
 const calls=[];const context=vm.createContext({Request,Response,AbortSignal,URL,console,fetch:async(_,options)=>{calls.push(JSON.parse(options.body));const status=statuses.shift()||200;return new Response(JSON.stringify(status===200?{choices:[{message:{content:'ready'}}]}:{error:{message:'quota'}}),{status,headers:{'Content-Type':'application/json','retry-after':'23'}});}});
 vm.runInContext(source,context);context.request=new Request('https://funsat.bid/api/ai',{method:'POST',headers:{Origin:'https://funsat.bid','Content-Type':'application/json'},body:JSON.stringify(body)});
 context.env={GROQ_API_KEY:'fake-test-key',DB:{prepare(){return{bind(){return this},async first(){return{n:1}},async run(){return{meta:{changes:1}}}}}}};
 const response=await vm.runInContext('worker.fetch(request,env)',context);return{response,json:await response.json(),calls};
}
(async()=>{
 let result=await run([429,200]);assert.equal(result.response.status,200);assert.equal(result.calls.length,2);assert.equal(result.json.provider,'groq');
 result=await run([404,503,200]);assert.equal(result.response.status,200);assert.equal(result.calls.length,3);
 result=await run([429,429,429,429,429,429,429]);assert.equal(result.response.status,429);assert.equal(result.json.retryAfter,23);
 result=await run([401]);assert.equal(result.json.code,'server_key_invalid');assert.equal(result.calls.length,1);
 result=await run([200],{messages:[{role:'user',content:'Return JSON'}],teaching:true});assert.equal(result.calls[0].response_format.type,'json_object');
 const html=fs.readFileSync('SAT & ACT Practice.html','utf8');const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);scripts.forEach(s=>new vm.Script(s));new vm.Script(fs.readFileSync('workspace.js','utf8'));
 const main=scripts.find(s=>s.includes('async function aiChat'));const start=main.indexOf('const AI_SETTINGS_KEY');const end=main.indexOf('// ---- TEST TOOLS',start);
 const calls=[];const client=vm.createContext({AbortController,setTimeout,clearTimeout,API_BASE:'',localStorage:{getItem(){return JSON.stringify({provider:'groq',groqKey:'fake-test-key'})}},fetch:async(url)=>{calls.push(url);return new Response(JSON.stringify(url.startsWith('https:')?{error:'invalid'}:{content:'site tutor ready'}),{status:url.startsWith('https:')?401:200})}});
 vm.runInContext(main.slice(start,end),client);assert.equal(await vm.runInContext('aiChat([{role:"user",content:"Help"}])',client),'site tutor ready');assert.equal(calls.length,2);
 assert(html.includes('wireCoach(q, chosen);'));assert(html.includes('Retry Groq explanation'));
 assert(html.includes('Internally use three bounded passes'));assert(html.includes('parseTutorResponse'));
 assert(html.includes('recordTutorHelp'));assert(html.includes('Saved to Help history'));
 const workspace=fs.readFileSync('workspace.js','utf8');assert(workspace.includes('Copy equation'));assert(workspace.includes('plainEquation'));
 const css=fs.readFileSync('workspace.css','utf8');assert(css.includes('.routing-box.up'));assert(css.includes('--ws-success-bg'));
 console.log('PASS: Groq-only fallback for quotas/retired models/server failures, JSON teaching responses, invalid personal-key recovery, English chat and explanation retries.');
})().catch(e=>{console.error(e);process.exitCode=1});

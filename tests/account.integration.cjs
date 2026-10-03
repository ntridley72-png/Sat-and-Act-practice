const assert=require('node:assert/strict');
(async()=>{
 const base='http://localhost:8787/api/';
 async function api(path,body,token){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const j=await r.json();assert(r.ok,JSON.stringify(j));return j;}
 const email='save-test-'+Date.now()+'@example.com', password='Local-test-only-9281';
 let session=await api('signup',{email,password});
 async function save(history,updatedAt){const r=await fetch(base+'progress',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.token},body:JSON.stringify({updatedAt,data:{profile:{},history,state:{v:4}}})});const j=await r.json();assert(r.ok,JSON.stringify(j));return j;}
 await save([{id:'device-a',done:true,finishedAt:10}],100);
 await save([{id:'device-b',done:true,finishedAt:20}],50);
 let data=await api('progress',null,session.token);assert.equal(data.data.history.length,2);
 await api('logout',{},session.token);session=await api('login',{email,password});
 data=await api('progress',null,session.token);assert.equal(data.data.history.length,2);
 await Promise.all([save([{id:'concurrent-a',done:true,finishedAt:30}],200),save([{id:'concurrent-b',done:true,finishedAt:40}],201)]);
 data=await api('progress',null,session.token);assert.equal(data.data.history.length,4);
 await api('logout',{},session.token);
 console.log('PASS: actual local account signup, saves from two devices, logout/login recovery, and simultaneous saves preserve all results.');
})().catch(e=>{console.error(e);process.exitCode=1;});

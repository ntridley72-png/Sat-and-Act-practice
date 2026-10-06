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
 // Credits, high scores, and favorites never decrease during sync conflicts.
 const putProfile=(body)=>fetch(base+'progress',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.token},body:JSON.stringify(body)});
 await putProfile({updatedAt:Date.now()+10,data:{profile:{tokens:7,highScores:{pacman:120},favorites:['racing']},history:[{id:'x1',done:true,finishedAt:50}]}});
 await putProfile({updatedAt:1,data:{profile:{tokens:2,highScores:{pacman:80,snake:55},favorites:['drift']},history:[{id:'x2',done:true,finishedAt:60}]}});
 data=await api('progress',null,session.token);
 assert.equal(data.data.profile.tokens,7,'tokens must keep the higher balance');
 assert.equal(data.data.profile.highScores.pacman,120,'high scores keep the max');
 assert.equal(data.data.profile.highScores.snake,55,'new high scores merge in');
 assert.deepEqual([...data.data.profile.favorites].sort(),['drift','racing'],'favorites union');
 // Google sign-in advertises availability and fails cleanly when unconfigured.
 const providers=await api('auth/providers');
 assert.equal(providers.google,false,'local dev has no Google secrets');
 const googleRes=await fetch(base+'auth/google');
 assert.equal(googleRes.status,501,'unconfigured Google route answers 501');
 await api('logout',{},session.token);
 console.log('PASS: account signup/sync, simultaneous saves, token + high-score + favorites conflict merges, and Google auth endpoint states.');
})().catch(e=>{console.error(e);process.exitCode=1;});

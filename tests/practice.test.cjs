const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('SAT & ACT Practice.html', 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter(m => !/src=|ld\+json|application\//.test(m[1])).map(m => m[2]);
scripts.forEach((s, i) => new vm.Script(s, { filename: `inline-${i}.js` }));
// The app logic moved to an external bundle (app.js) during the file split; prefer it when present.
const appSrc = fs.existsSync('app.js') ? fs.readFileSync('app.js', 'utf8') : null;
if (appSrc) new vm.Script(appSrc, { filename: 'app.js' });
const source = (appSrc && appSrc.includes('function sample(')) ? appSrc : scripts.find(s => s.includes('function sample('));
assert(source, 'app source with function sample() not found');
const extract = (from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));
const context = vm.createContext({ console, profile: {seen:{},served:{},lastServed:{},recentQuestions:[],selectionSequence:0}, saveProfile(){}, escapeHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');} });
vm.runInContext(extract('function shuffle(', 'function defByKey'), context);
vm.runInContext(extract('const STUDY_TOOLS', 'function renderQuestion'), context);
const pool = Array.from({length: 80}, (_, i) => ({id:`q${i}`,domain:i%2?'Algebra':'Geometry & Trigonometry',exp:'Subtract 3 from both sides. Divide by 2.',q:'Find x.',choices:['2','3','4','5'],ans:2}));
context.pool = pool;
let previous = [];
for(let i=0;i<30;i++){
  const result = vm.runInContext('sample(pool, 10)',context);
  assert.equal(new Set(result.map(q=>q.id)).size,10);
  for(const q of result){assert(!previous.slice(-50).includes(q.id),'Repeated within 50 questions'); previous.push(q.id);}
  if(i===2) context.profile = JSON.parse(JSON.stringify(context.profile)); // reload persistence
}
context.small = pool.slice(0,12);
for(let i=0;i<5;i++) assert.equal(new Set(vm.runInContext('sample(small, 10)',context).map(q=>q.id)).size,10);
context.profile = {seen:{},served:{},lastServed:{},recentQuestions:[],selectionSequence:0};
const first = vm.runInContext('weightedSampleUnique(pool, 10, () => 3)',context);
const second = vm.runInContext('weightedSampleUnique(pool, 10, () => 1)',context);
assert(!second.some(q=>first.some(p=>p.id===q.id)));
for(const domain of ['Algebra','Standard English Conventions','Craft & Structure','Research Summaries']){
 context.q={...pool[0],domain};
 const help=vm.runInContext('studyHelpHtml(q) + explanationHtml(q, -1)',context);
 for(const label of ['Memory trick','First step','Study tool','Quick recall card','Practice this topic','Detailed explanation','Simple explanation']) assert(help.includes(label));
}
assert(source.includes('if (skipped) html += studyHelpHtml(q)'));
assert(source.includes('explanationHtml(q, chosen)'));
assert(source.includes('recentQuestions: []'));
vm.runInContext(extract('function profileBestStreak()', '// ---- STATE HELPERS'),context);
context.profile = {activityDays:[]};
vm.runInContext("recordDailyActivity(new Date(2026,9,3));recordDailyActivity(new Date(2026,9,4));recordDailyActivity(new Date(2026,9,5));",context);
assert.equal(context.profile.dailyStreak,3,'daily streak should count consecutive active dates');
vm.runInContext("refreshDailyStreak(new Date(2026,9,7))",context);
assert.equal(context.profile.dailyStreak,0,'daily streak should expire after a missed day');
assert.equal(context.profile.bestDailyStreak,3,'best daily streak should be preserved');
console.log('PASS: script syntax, 50-question repeat buffer across 30 attempts and reload, small pools, adaptive rotation, math/English/science study help.');
vm.runInContext(extract('function mergeAttemptHistory(', 'const cloud ='), context);
context.local = [{id:'a',done:true,finishedAt:10},{id:'b',done:false,finishedAt:20}];
context.remote = [{id:'b',done:true,finishedAt:15},{id:'c',done:true,finishedAt:30}];
const merged = vm.runInContext('mergeAttemptHistory(local,remote)',context);
assert.equal(merged.length,3);assert.equal(merged.find(r=>r.id==='b').done,true);
assert(source.includes('saveHistory(); saveProfile();\n  try { cloud.push();'));
const workerSource = fs.readFileSync('worker/index.js','utf8').replace('export default', 'const worker =');
const workerContext = vm.createContext({console});vm.runInContext(workerSource, workerContext);
workerContext.local=context.local;workerContext.remote=context.remote;
assert.equal(vm.runInContext('mergeAttemptHistory(local,remote)',workerContext).length,3);
console.log('PASS: account history merges across devices without losing completed attempts; finishing triggers account save.');
const bankContext=vm.createContext({console});
vm.runInContext(extract('/*__DATA_START__*/','const STORAGE_KEY'),bankContext);
const actual=vm.runInContext('({math:BANK.math,rw:BANK.rw,science:BANK.science,english:BANK.english,reading:BANK.reading})',bankContext);
const all=[...actual.math,...actual.rw,...actual.science];
assert.equal(new Set(all.map(q=>q.id)).size,all.length,'Duplicate question IDs');
for(const q of all){assert.equal(q.choices.length,4);assert(q.ans>=0&&q.ans<4);assert(q.exp);assert(['easy','medium','hard'].includes(q.diff));}
for(const bank of ['math','rw'])for(const diff of ['easy','medium','hard'])assert(actual[bank].filter(q=>q.diff===diff).length>50,`${bank} ${diff} pool too small`);
vm.runInContext(extract('const DIFF_B', '// ---- AI TUTOR'),context);
context.byId=id=>all.find(q=>q.id===id);
context.curCurve=()=>({sat:0,act:0,short:'test'});
context.CURVE=vm.runInContext('CURVE',bankContext);
context.clampSat=n=>Math.max(200,Math.min(800,n));
context.profile.history=[{id:'sat-test',testType:'sat',done:true,scoreEligible:true,totalAnswered:2,finishedAt:1,qlog:[[actual.math[0].id,1],[actual.math[1].id,0]]}];
const prediction=JSON.stringify(vm.runInContext('predictScores()',context));
context.profile.history.push({id:'topic',testType:'sat',done:true,scoreEligible:false,practiceKind:'topic',totalAnswered:1,finishedAt:100,qlog:[[actual.math[0].id,0]]});
assert.equal(JSON.stringify(vm.runInContext('predictScores()',context)),prediction,'Topic drill changed score');
assert(!source.includes('pollinations.ai'));
assert(!source.includes('Be a word detective'));
assert(source.includes('data-subject-practice='),'weak SAT subjects should link to personalized practice');
assert(source.includes("(DOMAINS.math || []).includes(domain) ? 'math' : 'rw'"),'subject links should route to the correct SAT section');
assert(source.includes('profile.fullPracticeDraft = JSON.parse(JSON.stringify(state))'),'subject drills should preserve an in-progress full practice');
console.log('PASS: real bank validation, SAT difficulty pools exceed 50 questions, topic drills leave estimates unchanged, Groq-only AI.');
console.log('Question totals:',Object.fromEntries(Object.entries(actual).map(([k,v])=>[k,v.length])));

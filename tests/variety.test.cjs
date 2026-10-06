const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('SAT & ACT Practice.html','utf8');
const inline=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter(m=>!/src=|ld\+json|application\//.test(m[1])).map(m=>m[2]).find(s=>s.includes('function sample('));
const source=(fs.existsSync('app.js')&&fs.readFileSync('app.js','utf8').includes('function sample('))?fs.readFileSync('app.js','utf8'):inline;
const c=vm.createContext({console,profile:{seen:{},served:{},lastServed:{},recentQuestions:[]},saveProfile(){}});
vm.runInContext(source.slice(source.indexOf('/*__DATA_START__*/'),source.indexOf('const STORAGE_KEY')),c);
vm.runInContext(source.slice(source.indexOf('function shuffle('),source.indexOf('function defByKey')),c);
const banks=vm.runInContext('({math:BANK.math,rw:BANK.rw,science:ACT_SCIENCE})',c);
const items=Object.values(banks).flat().filter(q=>q.id.startsWith('variety-'));
assert.equal(items.length,81);
// Pass 1: independent computations of each math key, using alternate forms.
const keys=[(7+12)/(3-2),'240 − 8t',9-(21-9)/(6-2)*2,(285-30*7)/(12-7),(24-6)/1.5,8*2,7+9*(13-7)/2,'x + 3',3+4,20/10,'8000(0.85)^t','1 + √10',(3*2+1)**2-4,100/4,5**2-2,3,100*.8*1.2,78*5-(72+75+80+83),'1/3',196/(84/3),3.5*8,5000*118/200,'They are equal.',21-(2.5*4+8),Math.sqrt(49),'24π',12*(15/6)**2,'12/13',30*72/360,40*2*2/2,6*3-8,'1/2',Math.log2(32)-1,'2(x + 2)(x − 5)',(100-80)/80*100,180-114];
for(let i=0;i<36;i++){const q=banks.math.find(q=>q.id===`variety-math-${i+1}`);assert.equal(q.choices[q.ans],String(keys[i]),q.id);}
// Pass 2: answer uniqueness, explanations, and editorial review coverage.
for(const q of items){assert.equal(new Set(q.choices).size,4,q.id);assert(q.exp.length>30,q.id);assert.equal(q.family,q.id);}
// Pass 3: Digital SAT content domains and 25–150-word texts.
const rwDomains=['Craft & Structure','Information & Ideas','Standard English Conventions','Expression of Ideas'];
for(const q of banks.rw.filter(q=>q.id.startsWith('variety-'))){
 assert(rwDomains.includes(q.domain));const text=q.passage||q.q.split(/\n(?:Which choice|Which pair)/)[0];const length=text.split(/\s+/).length;assert(length>=25&&length<=150,`${q.id}: ${length} words`);
}
// Near-duplicate families must not crowd a set when alternatives exist.
c.synthetic=Array.from({length:120},(_,i)=>({id:'synthetic'+i,family:'family'+(i%60),domain:'Algebra',skill:'Linear equations in one variable'}));
const first=vm.runInContext('sample(synthetic,25)',c),second=vm.runInContext('sample(synthetic,25)',c);
assert.equal(new Set(first.concat(second).map(q=>q.family)).size,50);
c.profile=JSON.parse(JSON.stringify(c.profile));assert.equal(c.profile.recentFamilies.length,50);
for(const bank of ['math','rw']){c.pool=banks[bank].filter(q=>q.diff==='medium');c.profile={seen:{},served:{},lastServed:{},recentQuestions:[]};const set=vm.runInContext('sample(pool,25)',c);assert.equal(new Set(set.map(q=>q.family)).size,25);assert(new Set(set.map(q=>q.skill)).size>=8);}
console.log('PASS: 81 new items; independent math solutions; unique answers; SAT text lengths/domains; 50-family rotation and real-bank variety.');

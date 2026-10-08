// Private owner app: PIN login precedes all reports and dashboard assets.
import backend from './index.js';
const lifetime = 3600;
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})}
function keyBytes(env){return /^[a-f0-9]{64}$/i.test(env.ANALYTICS_ENCRYPTION_KEY||'')?Uint8Array.from(env.ANALYTICS_ENCRYPTION_KEY.match(/../g),x=>parseInt(x,16)):null;}
async function sign(value,env){const k=await crypto.subtle.importKey('raw',keyBytes(env),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');}
function equal(a,b){if(a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;}
async function session(request,env){const raw=(request.headers.get('Cookie')||'').match(/(?:^|;\s*)analytics_owner=([^;]+)/)?.[1]||'';const [expires,nonce,signature]=raw.split('.');const until=Number(expires);if(!/^\d{10}$/.test(expires||'')||!/^[a-f0-9]{32}$/.test(nonce||'')||!/^[a-f0-9]{64}$/.test(signature||'')||until<=Date.now()/1000||until>Date.now()/1000+lifetime+5)return false;return equal(signature,await sign(expires+'.'+nonce+'.'+await sign(env.ANALYTICS_LOGIN_PIN,env),env));}
export default {
 async fetch(request,env){
  const url=new URL(request.url),local=url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname);
  if(url.protocol!=='https:'&&!local){url.protocol='https:';return Response.redirect(url.href,308);}
  if(!keyBytes(env)||!/^\d{6,12}$/.test(env.ANALYTICS_LOGIN_PIN||''))return json({error:'Owner app setup is required: configure the private PIN and encryption key.'},503);
  const login=url.pathname==='/api/analytics/login',logout=url.pathname==='/api/analytics/logout';
  if(login||logout){
   if(request.method!=='POST')return json({error:'Method not allowed.'},405);
   if(request.headers.get('Origin')!==url.origin)return json({error:'Origin not permitted.'},403);
   const cookie='analytics_owner=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'+(local?'':'; Secure');
   if(logout){const r=json({ok:true});r.headers.set('Set-Cookie',cookie);return r;}
   if(!env.ANALYTICS_LOGIN_LIMITER||!env.DB)return json({error:'Login protections are not configured.'},503);
   const ip=request.headers.get('CF-Connecting-IP')||(local?'loopback':'unknown');
   const key=await sign('login:'+ip,env),bucket=Math.floor(Date.now()/900000);
   if(!(await env.ANALYTICS_LOGIN_LIMITER.limit({key})).success)return json({error:'Too many attempts. Try again later.'},429);
   const attempts=await env.DB.prepare('INSERT INTO analytics_login_attempts (client,bucket,n) VALUES (?,?,1) ON CONFLICT(client,bucket) DO UPDATE SET n=n+1 WHERE n<5 RETURNING n').bind(key,bucket).first();
   if(!attempts)return json({error:'Too many attempts. Try again in 15 minutes.'},429);
   await env.DB.prepare('DELETE FROM analytics_login_attempts WHERE bucket < ?').bind(bucket-1).run();
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return json({error:'Invalid login.'},400);
   const reader=request.body?.getReader();if(!reader)return json({error:'Invalid login.'},400);let bytes=0,parts=[];
   for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>1024){await reader.cancel();return json({error:'Invalid login.'},413);}parts.push(value);}
   let b;try{const v=new Uint8Array(bytes);let off=0;for(const p of parts){v.set(p,off);off+=p.length;}b=JSON.parse(new TextDecoder().decode(v));}catch{return json({error:'Invalid login.'},400);}
   if(typeof b?.pin!=='string'||Object.keys(b).length!==1||!equal(await sign(b.pin,env),await sign(env.ANALYTICS_LOGIN_PIN,env)))return json({error:'Incorrect PIN.'},401);
   const expires=String(Math.floor(Date.now()/1000)+lifetime),nonce=crypto.randomUUID().replaceAll('-',''),value=expires+'.'+nonce;
   const signature=await sign(value+'.'+await sign(env.ANALYTICS_LOGIN_PIN,env),env);
   const r=json({ok:true});r.headers.set('Set-Cookie','analytics_owner='+value+'.'+signature+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+lifetime+(local?'':'; Secure'));return r;
  }
  const authenticated=await session(request,env);
  const loginAsset=['/owner-analytics/login.html','/owner-analytics/login.js','/owner-analytics/style.css','/owner-analytics/icon.png'].includes(url.pathname);
  if(!authenticated&&!loginAsset){if(url.pathname.startsWith('/api/'))return json({error:'PIN login required.'},401);return Response.redirect(url.origin+'/owner-analytics/login.html',302);}
  if(url.pathname==='/')return Response.redirect(url.origin+'/owner-analytics/',302);
  const report=['/api/analytics/projects','/api/analytics/summary','/api/analytics/cloudflare'].includes(url.pathname);
  const connection=['/api/analytics/cloudflare-report','/api/analytics/connections'].includes(url.pathname)&&request.method==='POST';
  const asset=url.pathname==='/owner-analytics'||url.pathname.startsWith('/owner-analytics/');
  if(!connection&&(!['GET','HEAD'].includes(request.method)||(!report&&!asset)))return json({error:'Not found.'},404);
  if(connection&&request.headers.get('Origin')!==url.origin)return json({error:'Origin not permitted.'},403);
  const headers=new Headers(request.headers);headers.set('Authorization','Bearer '+env.ANALYTICS_ENCRYPTION_KEY);
  return backend.fetch(new Request(request,{headers}),{...env,ANALYTICS_OWNER_APP:'true',ANALYTICS_OWNER_TOKEN:env.ANALYTICS_ENCRYPTION_KEY});
 }
};

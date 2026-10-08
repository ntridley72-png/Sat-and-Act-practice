import {mkdir, writeFile, access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
await import('./build-analytics-owner.mjs');
await mkdir(root + '.analytics-local', {recursive:true, mode:0o700});
const secrets = root + '.analytics-local/.dev.vars';
try {await access(secrets);} catch {
  await writeFile(secrets, 'ANALYTICS_OWNER_TOKEN="'+randomBytes(32).toString('hex')+'"\n', {mode:0o600, flag:'wx'});
}
await writeFile(root + '.analytics-local/wrangler.toml', `name = "analytics-owner-local"
main = "../worker/analytics-owner.js"
compatibility_date = "2026-09-01"
[assets]
directory = "../.analytics-assets"
binding = "ASSETS"
run_worker_first = true
html_handling = "none"
[[d1_databases]]
binding = "DB"
database_name = "analytics-local"
database_id = "00000000-0000-0000-0000-000000000001"
[[ratelimits]]
name = "ANALYTICS_READ_LIMITER"
namespace_id = "714023"
simple = {limit = 30, period = 60}
`);
const args = ['--yes','wrangler'];
function run(more) {return new Promise((resolve,reject)=>{const p=spawn('npx', [...args,...more], {cwd:root,stdio:'inherit'});p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(new Error('Wrangler exited '+code)));});}
await run(['d1','execute','analytics-local','--local','--config','.analytics-local/wrangler.toml','--file','worker/migrations/0001_analytics.sql']);
console.log('\nOpen http://localhost:8790/owner-analytics/ on this computer.');
console.log('Owner token is in .analytics-local/.dev.vars (never commit or share this file).');
console.log('Local events are separate from production. For phone access anywhere use the documented private HTTPS deployment.\n');
await run(['dev','--local','--config','.analytics-local/wrangler.toml','--ip','127.0.0.1','--port','8790']);

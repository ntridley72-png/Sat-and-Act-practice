import {mkdir, cp, rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
await rm(root + '.analytics-assets', {recursive:true, force:true});
await mkdir(root + '.analytics-assets', {recursive:true});
await cp(root + 'owner-analytics', root + '.analytics-assets/owner-analytics', {recursive:true});

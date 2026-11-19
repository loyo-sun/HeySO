import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const output=process.argv[2];
if(!output||!path.isAbsolute(output))throw Error('Usage: node deploy/mcp-authorization/build-package.mjs /absolute/new/package/path');
await fs.mkdir(output); // Refuse to overwrite an existing release package.
const sha=value=>createHash('sha256').update(value).digest('hex');
const files={};
async function add(source,target,baseline){
  const content=await fs.readFile(path.join(root,source));
  await fs.mkdir(path.dirname(path.join(output,'overlay',target)),{recursive:true});
  await fs.writeFile(path.join(output,'overlay',target),content);
  files[target]={next:sha(content),...(baseline?{base:sha(await fs.readFile(path.join(root,baseline)))}:{})};
}
await add('deploy/mcp-authorization/overlay/src/heyso.mjs','src/heyso.mjs','deploy/hs1-56/overlay/src/heyso.mjs');
for(const dir of ['server','shared'])for(const file of await fs.readdir(path.join(root,dir)))if(file.endsWith('.mjs'))await add(`${dir}/${file}`,`vendor/heyso/${dir}/${file}`);
await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify({baseNote:'src/heyso.mjs baseline is the repository HS1-56 cloud adapter, not a verified production release. Stop and reconcile if it differs. Vendor files require review against the installed vendor revision.',files},null,2)+'\n');
console.log(`Prepared ${Object.keys(files).length} source files in ${output}. No service or data was changed.`);

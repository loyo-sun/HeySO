import {execFileSync} from 'node:child_process';
import {readFileSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const commit=value=>typeof value==='string'&&/^[a-f0-9]{40}$/i.test(value.trim())?value.trim():'';
export function sourceRevision(env=process.env){
  const configured=commit(env.COMMIT_REF)||commit(env.GITHUB_SHA)||commit(env.HEYSO_COMMIT);
  if(configured)return configured;
  try{
    const gitRoot=execFileSync('git',['rev-parse','--show-toplevel'],{cwd:projectRoot,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
    // The local HeySO copy can live inside another repository. Never use its parent's HEAD.
    if(realpathSync(gitRoot)===realpathSync(projectRoot))return commit(execFileSync('git',['rev-parse','HEAD'],{cwd:projectRoot,encoding:'utf8',stdio:['ignore','pipe','ignore']}));
  }catch{}
  try{
    const saved=JSON.parse(readFileSync(path.join(projectRoot,'.data/source-revision.json'),'utf8'));
    if(saved.repository==='loyo-sun/HeySO')return commit(saved.commit);
  }catch{}
  return '';
}

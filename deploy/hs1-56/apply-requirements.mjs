import {readFile} from 'node:fs/promises';
import {database,transaction,audit} from './src/db.mjs';
import {hydrateVersion} from './src/shared-snapshots.mjs';
import {saveLiveProject} from './src/heyso-live.mjs';
import {act} from './vendor/heyso/server/model.mjs';
import {readProjectFile} from './vendor/heyso/server/project-file.mjs';
const spec=JSON.parse(await readFile(new URL('./hs1-56-requirements.json',import.meta.url),'utf8'));
const db=database(process.env.DATABASE_URL);
try{
 await transaction(db,async c=>{
  const file=(await c.query("SELECT * FROM cloud_documents WHERE id=$1 AND app='heyso' AND deleted_at IS NULL",[spec.fileId])).rows[0];if(!file)throw Error('目标项目不存在');
  const user=(await c.query('SELECT id,storage_limit_bytes FROM users WHERE id=$1 FOR UPDATE',[file.user_id])).rows[0];
  const requestId='hs1-56-requirements-live-v1';
  if((await c.query('SELECT request_id FROM heyso_requests WHERE user_id=$1 AND request_id=$2',[user.id,requestId])).rows.length){console.log('HS1-56 requirements already applied');return;}
  const previous=(await c.query('SELECT * FROM cloud_document_versions WHERE id=(SELECT head_id FROM cloud_documents WHERE id=$1)',[file.id])).rows[0];
  const current=await hydrateVersion(c,previous,user.id),content=readProjectFile(current.content),item=content.workspace.items.find(i=>i.id===spec.itemId);
  if(!item||item.number!==56)throw Error('工作项标识不匹配');
  if(item.description&&item.description!==spec.description||item.acceptance&&item.acceptance!==spec.acceptance)throw Error('HS1-56 已存在其他内容，停止覆盖，请重新核对');
  act(content.workspace,{type:'item.update',payload:{id:item.id,description:spec.description,acceptance:spec.acceptance,aiEnabled:true},actor:'Codex / HS1-56 requirements'});
  content.workspace.revision++;readProjectFile(content);
  await saveLiveProject(c,{user:user.id,content,previous,limit:user.storage_limit_bytes});
  await c.query('INSERT INTO heyso_requests(user_id,request_id,document_id,fingerprint,result) VALUES($1,$2,$3,$4,$5)',[user.id,requestId,file.id,requestId,JSON.stringify({itemId:item.id})]);
  await audit(c,user.id,'heyso_requirements_updated',{document_id:file.id,item_id:item.id,source:'HS1-56 server maintenance'});
  console.log('HS1-56 description and acceptance saved; AI execution enabled; not accepted or completed');
 });
}finally{await db.end();}

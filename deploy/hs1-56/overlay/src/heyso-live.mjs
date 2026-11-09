import {randomUUID} from 'node:crypto';
import {logicalStorageUsage} from './shared-snapshots.mjs';
import {fail} from './security.mjs';

// Latest mutable project state. Existing history is retained, never rewritten.
// Account transaction/lock is held by the caller, including quota accounting.
export async function saveLiveProject(c,{user,content,previous,limit,measure=async(_name,fn)=>fn()}) {
 const head=randomUUID(),raw=JSON.stringify(content),size=Buffer.byteLength(raw);
 await measure('persist',async()=>{
  await c.query('UPDATE cloud_documents SET heyso_live=true,head_id=$3,name=$4,updated_at=now() WHERE id=$1 AND user_id=$2',[content.id,user,head,content.name]);
  if(previous&&!previous.snapshot_hash&&!previous.version_name?.trim()) {
   const out=await c.query("UPDATE cloud_document_versions SET id=$2,content=$3,logical_bytes=$4,updated_by=$5,source='HeySO live',heyso_window_start=NULL WHERE id=$1 AND document_id=$6 AND snapshot_hash IS NULL AND NULLIF(btrim(version_name),'') IS NULL RETURNING id",[previous.id,head,raw,size,user,content.id]);
   if(!out.rows.length)throw fail(409,'SAVE_CONFLICT','项目保存状态已变化，请重试');
  } else {
   await c.query("INSERT INTO cloud_document_versions(id,document_id,content,preview,logical_bytes,preview_bytes,updated_by,source,version_name) VALUES($1,$2,$3,'[]',$4,2,$5,'HeySO live','')",[head,content.id,raw,size,user]);
  }
 });
 await measure('capacity',async()=>{if(await logicalStorageUsage(c,user)>Number(limit))throw fail(413,'STORAGE_FULL','云空间容量不足');});
 return head;
}

// Notifications carry no project contents. Long polling crosses the existing
// authenticated gateway; reconnects reconcile the manifest from the database.
export class ProjectUpdates {
 constructor(){this.listeners=new Map();}
 notify(user){for(const finish of [...(this.listeners.get(user)||[])])finish();}
 wait(user,{timeoutMs=15000,signal}={}){
  if(signal?.aborted)return Promise.resolve();
  return new Promise(resolve=>{
   const listeners=this.listeners.get(user)||new Set();this.listeners.set(user,listeners);
   const finish=()=>{clearTimeout(timer);signal?.removeEventListener('abort',finish);listeners.delete(finish);if(!listeners.size)this.listeners.delete(user);resolve();};
   const timer=setTimeout(finish,timeoutMs);listeners.add(finish);signal?.addEventListener('abort',finish,{once:true});
  });
 }
}
export function checkTextChanges(state,action,baseFields={}) {
 if(action?.type!=='item.update')return;
 const current=state.items.find(i=>i.id===action.payload?.id);if(!current)return;
 for(const key of ['description','acceptance'])if(action.payload[key]!==undefined&&Object.hasOwn(baseFields,key)&&
  JSON.stringify(current[key]??'')!==JSON.stringify(baseFields[key]??'')&&JSON.stringify(current[key]??'')!==JSON.stringify(action.payload[key]))
   throw fail(409,'FIELD_CONFLICT','该文本已被其他人修改，草稿已保留，请核对后重新提交');
}

const collections=['projects','items','sprints','releases','notes','runs','events'];
export const captureRecords=state=>Object.fromEntries(collections.map(key=>[key,new Map((state[key]||[]).map(record=>[record.id,JSON.stringify(record)]))]));
export function changedRecords(before,state){
 return Object.fromEntries(collections.map(key=>{
  const records=state[key]||[],ids=new Set(records.map(r=>r.id));
  return [key,{upsert:records.filter(r=>before[key].get(r.id)!==JSON.stringify(r)),remove:[...before[key].keys()].filter(id=>!ids.has(id))}];
 }));
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../src/db.mjs';
import {putSecret} from '../src/security.mjs';
import {installHeyso} from '../src/heyso.mjs';
import {ProjectUpdates} from '../src/heyso-live.mjs';
import {seed} from '../vendor/heyso/server/model.mjs';
import {projectFile} from '../vendor/heyso/server/project-file.mjs';

test('live project route and database contracts without a listening server',async t=>{
 const db=new PGlite();await migrate(db);t.after(()=>db.close());
 const user=randomUUID(),origin='https://heyso.test';
 await db.query("INSERT INTO users(id,username,password_hash,workspace_id,storage_limit_bytes) VALUES($1,$2,'unused',$3,10000000)",[user,user,randomUUID()]);
 const token=await putSecret(db,'editor',user,{app:'heyso',origin},3600000),routes=new Map();
 const app=Object.fromEntries(['get','post','all'].map(method=>[method,(path,...handlers)=>routes.set(method+' '+path,handlers)]));
 installHeyso(app,{db,base:'https://cloud.test',origins:new Set([origin]),live:{closeSession(){}}});
 // seed IDs are discovered rather than tied to a fixture project label.
 const seeded=seed(),file=projectFile(seeded,seeded.projects[0].id),item=file.workspace.items.find(i=>i.kind==='story');
 async function call(path,body={},params={},auth=token){
  const req={user:{id:user},params,body,headers:{authorization:'Bearer '+auth,origin}},res=new EventEmitter();res.destroyed=false;res.set=()=>res;res.json=data=>{res.data=data;return res;};
  try{for(const fn of routes.get('post '+path)){let next=false;await fn(req,res,()=>{next=true;});if(!next)break;}return {status:200,data:res.data};}
  catch(e){return {status:e.status||500,error:e.message};}
 }
 const imported=await call('/api/v1/heyso/files',{content:file});assert.equal(imported.status,200,imported.error);let head=imported.data.headId;
 const action=(payload,extra={})=>({action:{type:'item.update',payload:{id:item.id,...payload}},headId:head,requestId:randomUUID(),consistency:'live-v1',responseFormat:'content-v1',...extra});
 const update=body=>call('/api/v1/heyso/files/:id/action',body,{id:file.id});
 await t.test('stale heads on independent field patches do not conflict or create file history',async()=>{
  const first=action({title:'new title'}),second=action({priority:'high'});const a=await update(first),b=await update(second);assert.equal(a.status,200,a.error);assert.equal(b.status,200,b.error);
  assert.equal(b.data.content.workspace.items.find(i=>i.id===item.id).title,'new title');assert.equal(b.data.content.workspace.items.find(i=>i.id===item.id).priority,'high');
  assert.equal(Number((await db.query('SELECT count(*) AS n FROM cloud_document_versions WHERE document_id=$1',[file.id])).rows[0].n),1);
  const replay=await update(first);assert.equal(replay.status,200);assert.equal(replay.data.replayed,true);head=b.data.headId;
 });
 await t.test('same-key changed payload is rejected and text conflicts preserve server text',async()=>{
  const request=action({title:'one'});assert.equal((await update(request)).status,200);
  assert.equal((await update({...request,action:{type:'item.update',payload:{id:item.id,title:'two'}}})).status,409);
  const base=item.description||'';assert.equal((await update(action({description:'remote text'},{baseFields:{description:base}}))).status,200);
  const conflict=await update(action({description:'local text'},{baseFields:{description:base}}));assert.equal(conflict.status,409);
  const current=await call('/api/v1/heyso/state',{});assert.equal(current.data.files[0].content.workspace.items.find(i=>i.id===item.id).description,'remote text');
 });
 await t.test('state returns only changed projects and retains authorization',async()=>{
  const current=await call('/api/v1/heyso/state',{});assert.equal(current.data.protocol,'live-v1');assert.equal(current.data.files.length,1);
  const unchanged=await call('/api/v1/heyso/state',{heads:current.data.manifest});assert.equal(unchanged.data.files.length,0);
  assert.equal((await call('/api/v1/heyso/state',{}, {},'wrong')).status,401);
  const before=current.data.manifest;await update(action({owner:'我'}));const change=await call('/api/v1/heyso/updates',{heads:before});assert.equal(change.data.changed,true);
 });
 await t.test('matching cursors return changed records; stale cursors and retries return full current state',async()=>{
  const current=await call('/api/v1/heyso/state',{});head=current.data.manifest[0].headId;
  const request=action({title:'compact title'},{responseFormat:'changes-v1'}),compact=await update(request);
  assert.equal(compact.status,200,compact.error);assert.equal(compact.data.content,undefined);assert.equal(compact.data.changes.items.upsert.find(i=>i.id===item.id).title,'compact title');
  assert.equal(compact.data.changes.items.upsert.length,1);assert.ok(compact.data.changes.events.upsert.length);
  const replay=await update(request);assert.equal(replay.status,200);assert.ok(replay.data.content);assert.equal(replay.data.replayed,true);
  const stale=await update(action({priority:'low'},{responseFormat:'changes-v1'}));assert.equal(stale.status,200);assert.ok(stale.data.content);assert.equal(stale.data.content.workspace.items.find(i=>i.id===item.id).title,'compact title');
 });
 await t.test('quota failure rolls back current data and request record atomically',async()=>{
  const before=await call('/api/v1/heyso/state',{});await db.query('UPDATE users SET storage_limit_bytes=1 WHERE id=$1',[user]);
  const request=action({title:'must roll back'});assert.equal((await update(request)).status,413);
  const after=await call('/api/v1/heyso/state',{});assert.deepEqual(after.data,before.data);assert.equal((await db.query('SELECT * FROM heyso_requests WHERE request_id=$1',[request.requestId])).rows.length,0);
 });
});
test('notification listeners are isolated by account and release on timeout/abort',async()=>{
 const bus=new ProjectUpdates(),controller=new AbortController();let a=false,b=false;
 const first=bus.wait('a',{timeoutMs:100}).then(()=>a=true),second=bus.wait('b',{timeoutMs:100,signal:controller.signal}).then(()=>b=true);
 bus.notify('a');await first;assert.equal(a,true);assert.equal(b,false);controller.abort();await second;assert.equal(bus.listeners.size,0);
});

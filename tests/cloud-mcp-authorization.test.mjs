import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import express from 'express';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {seed} from '../server/model.mjs';
import {projectFile} from '../server/project-file.mjs';

// Exercise the shipped cloud route and real MCP/domain code; isolate only the
// unavailable LoyoCloud infrastructure. No production service or DB is contacted.
async function fixture(t) {
  const state=seed(),projectId=state.projects[0].id,fileId=crypto.randomUUID();
  let content=projectFile(state,projectId,fileId),headId='head-1',saves=0;
  const identity={userId:'owner',grantId:'grant',scopes:['heyso:read','heyso:write','heyso:progress']};
  const grant={id:'grant',user_id:'owner',app:'heyso',revoked:false,scopes:[...identity.scopes],document_ids:[fileId],connection_ids:null};
  const requests=new Map(),heads=new Map();
  let lockedGrant,inTransaction=false,grantChecks=0;
  const db={transaction:async fn=>{inTransaction=true;try{return await fn(db);}finally{inTransaction=false;}},query:async(sql,args=[])=>{
    if(sql.startsWith('SELECT * FROM grants')){grantChecks++;return {rows:[inTransaction&&lockedGrant?lockedGrant:grant]};}
    if(sql.startsWith('SELECT to_jsonb'))return {rows:args[0]===fileId&&args[1]==='owner'?[{file:{id:fileId,user_id:'owner',app:'heyso',head_id:headId,heyso_live:true,name:content.name},version:{content:structuredClone(content)}}]:[]};
    if(sql.includes('FROM users'))return {rows:[{id:'owner',name:'Owner',storage_limit_bytes:10000000}]};
    if(sql.startsWith('SELECT * FROM heyso_requests'))return {rows:requests.has(args[1])?[requests.get(args[1])]:[]};
    if(sql.startsWith('INSERT INTO heyso_requests')){requests.set(args[1],{fingerprint:args[2],result:JSON.parse(args[3])});return {rows:[]};}
    if(sql.startsWith('SELECT head_id FROM heyso_mcp_heads'))return {rows:heads.has(args[1])?[{head_id:heads.get(args[1])}]:[]};
    if(sql.startsWith('INSERT INTO heyso_mcp_heads')){if(!heads.has(args[1]))heads.set(args[1],args[2]);return {rows:[]};}
    if(sql.startsWith('INSERT INTO calls')||sql.startsWith('UPDATE calls'))return {rows:[]};
    throw Error('Unexpected test query: '+sql);
  }};
  const save=async(c,args)=>{content=structuredClone(args.content);headId='head-'+(++saves+1);return headId;};
  const noop=()=>{};
  const mocks={saveLiveProject:save,ProjectUpdates:class{notify(){}},checkTextChanges:noop,captureRecords:noop,changedRecords:noop,
    installHeysoViewPreferences:noop,displayName:()=> 'Owner',transaction:db.transaction,audit:noop,quota:noop,getSecret:noop,
    fail:(status,code,message)=>Object.assign(Error(message),{status,code}),hydrateVersion:async(c,v)=>v,
    autosaveWindow:()=>1000,saveHeysoVersion:save,saveTiming:()=>({track:c=>c,measure:async(name,fn)=>fn()}),
    assertFileUnlocked:noop,applications:{},allowsEditorOrigin:()=>true};
  const key='__heyso_cloud_test_'+crypto.randomUUID().replaceAll('-','');globalThis[key]=mocks;
  t.after(()=>delete globalThis[key]);
  let code=await fs.readFile(new URL('../deploy/mcp-authorization/overlay/src/heyso.mjs',import.meta.url),'utf8');
  code=code.replace(/import \{([^}]+)\} from (['"])([^'"]+)\2;/g,(statement,names,quote,spec)=>{
    if(spec.startsWith('node:'))return statement;
    if(!spec.startsWith('.'))return `import {${names}} from ${JSON.stringify(import.meta.resolve(spec))};`;
    if(spec.includes('/vendor/heyso/'))return `import {${names}} from ${JSON.stringify(new URL('../'+spec.split('/vendor/heyso/')[1],import.meta.url).href)};`;
    return `const {${names}}=globalThis[${JSON.stringify(key)}];`;
  });
  const {installHeyso}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
  const app=express();app.use(express.json());
  installHeyso(app,{db,base:'http://localhost',auth:{authenticate:async()=>identity},login:noop,csrf:noop,origins:[],live:{}});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const client=new Client({name:'test',version:'1'});
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${server.address().port}/mcp/heyso`)));
  t.after(()=>client.close());
  const call=async(name,args)=>{const result=await client.callTool({name,arguments:{fileId,...args}});return {isError:result.isError,data:JSON.parse(result.content[0].text)};};
  const create=extra=>call('create_item',{projectId,kind:'task',title:'test task',expectedRevision:content.workspace.revision,requestId:crypto.randomUUID(),agent:'test',...extra});
  return {call,create,identity,grant,fileId,projectId,state:()=>structuredClone(content.workspace),saves:()=>saves,grantChecks:()=>grantChecks,revokeOnLock:()=>{lockedGrant={...grant,revoked:true};}};
}
test('cloud MCP distinguishes read-only plugin and file authorization; successful writes need no AI',async t=>{
  const x=await fixture(t);
  const query=await x.call('query_project',{projectId:x.projectId});assert.equal(query.isError,undefined);
  x.identity.scopes=['heyso:read'];
  assert.equal((await x.create()).data.code,'PLUGIN_SCOPE_REQUIRED');assert.equal(x.saves(),0);
  x.identity.scopes.push('heyso:write');x.grant.document_ids=[];
  assert.equal((await x.create()).data.code,'FILE_ACCESS_DENIED');assert.equal(x.saves(),0);
  x.grant.document_ids=[x.fileId];
  const foreignId=crypto.randomUUID();x.grant.document_ids.push(foreignId);
  assert.equal((await x.create({fileId:foreignId})).data.code,'FILE_ACCESS_DENIED');
  assert.equal((await x.create({projectId:'other-organization'})).data.code,'FILE_ACCESS_DENIED');
  const args={requestId:'retry-create',expectedRevision:x.state().revision,parentId:'ep1'};
  const created=await x.create(args);assert.equal(created.isError,undefined);assert.equal(created.data.aiEnabled,false);assert.equal(created.data.parentId,'ep1');
  const after=x.state();assert.equal((await x.create(args)).data.id,created.data.id);assert.equal(x.saves(),1);
  assert.equal((await x.create({...args,requestId:'stale'})).data.code,'VERSION_CONFLICT');
  assert.equal((await x.create({...args,title:'different'})).data.code,'IDEMPOTENCY_CONFLICT');
  assert.deepEqual(x.state(),after);
});
test('cloud grant is checked again inside serialized mutation before any save',async t=>{
  const x=await fixture(t);x.revokeOnLock();
  assert.equal((await x.create()).data.code,'PLUGIN_AUTHORIZATION_REQUIRED');assert.equal(x.saves(),0);assert.equal(x.grantChecks(),2);
});

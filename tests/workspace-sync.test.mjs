import test from 'node:test';
import assert from 'node:assert/strict';
import {WorkspaceSync,mergeWorkspace,watchWorkspaceUpdates} from '../src/workspace-sync.mjs';
import {handleLoyo} from '../server/loyo-provider.mjs';
import {sessionCookie} from '../server/hosted-auth.mjs';
import {seed,emptyProject,act} from '../server/model.mjs';
import {projectFile} from '../server/project-file.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {resolve,promise};};
const ws=head=>({revision:1,projects:[{id:'p',name:'测试',code:'PX',nextItemNumber:2,cloud:{fileId:'f',headId:head}}],items:[{id:'i',number:1,projectId:'p',title:head}],sprints:[],releases:[],notes:[],runs:[],events:[]});
const delta=head=>({delta:true,state:ws(head),revision:2,result:{id:'i'}});
test('write confirmation wins over an earlier refresh; queued writes use the confirmed head',async()=>{
  const old=deferred(),write=deferred(),bodies=[],messages=[];let writes=0;
  const client=new WorkspaceSync({cloud:true,onMessage:m=>messages.push(m),fetcher:async(path,init)=>{
    if(path==='/api/state')return old.promise;
    bodies.push(JSON.parse(init.body));return ++writes===1?write.promise:Response.json(delta('h3'));
  }});client.receive(ws('h1'));
  const refreshing=client.refresh(),first=client.action('item.update',{id:'i',title:'first'},'p'),second=client.action('item.update',{id:'i',title:'second'},'p');
  await Promise.resolve();assert.ok(!messages.includes('已保存'));
  write.resolve(Response.json(delta('h2')));await first;
  old.resolve(Response.json(delta('old')));await refreshing;await second;
  assert.equal(client.state.projects[0].cloud.headId,'h3');assert.equal(bodies[1].headId,'h2');
});
test('lost confirmation retries the identical request; offline/expired/conflict never report saved',async()=>{
  const bodies=[],messages=[];let calls=0,expired=0;
  const client=new WorkspaceSync({cloud:true,onMessage:m=>messages.push(m),onExpired:()=>expired++,fetcher:async(path,init)=>{
    if(path==='/api/state')return Response.json(ws('latest'));
    bodies.push(init.body);if(++calls===1)throw Error('timeout after commit');return Response.json(delta('h2'));
  }});client.receive(ws('h1'));await client.action('item.create',{projectId:'p'},'p');assert.equal(bodies[0],bodies[1]);
  for(const status of [409,401,503]){
    messages.length=0;client.fetcher=async path=>path==='/api/state'?Response.json(ws('latest')):Response.json({error:'failed'},{status});
    assert.equal(await client.action('item.update',{id:'i'},'p'),null);assert.ok(!messages.includes('已保存'));
  }
  assert.ok(expired);await client.refreshing;client.fetcher=async()=>Response.json(delta('recovered'));await client.refresh();assert.equal(client.state.items[0].title,'recovered');
});
test('delta preserves unrelated projects, removes deleted files and replaces only changed collections',()=>{
  const state=ws('h1');state.projects.push({id:'other',name:'另一个',code:'OX',nextItemNumber:2,cloud:{fileId:'other-file',headId:'o'}});state.items.push({id:'other-item',number:1,projectId:'other'});
  assert.equal(mergeWorkspace(state,delta('h2')).items.find(i=>i.id==='other-item').projectId,'other');
  assert.equal(mergeWorkspace(state,{...delta('h2'),manifest:[{fileId:'f',headId:'h2'}]}).items.length,1);
  const duplicate=delta('h2');duplicate.state.projects[0].cloud.fileId='duplicate-file';assert.throws(()=>mergeWorkspace(state,duplicate),/重复/);
});
test('foreground return, focus and reconnect check immediately; hidden tabs stop polling and cleanup removes listeners',()=>{
  const doc=new EventTarget(),win=new EventTarget();doc.hidden=false;let calls=0,tick,cleared=false;
  const stop=watchWorkspaceUpdates({refresh:()=>calls++},{document:doc,window:win,setTimer:fn=>{tick=fn;return 1;},clearTimer:()=>{cleared=true;}});
  assert.equal(calls,1);doc.hidden=true;tick();assert.equal(calls,1);doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));assert.equal(calls,2);
  win.dispatchEvent(new Event('focus'));win.dispatchEvent(new Event('online'));assert.equal(calls,4);stop();win.dispatchEvent(new Event('focus'));assert.equal(calls,4);assert.ok(cleared);
});
test('Cloud gateway saves with one write, polls metadata only, fetches changed files only and propagates conflict',async()=>{
  const env={HEYSO_PASSWORD:'test-only-workspace-password'},config={base:'https://cloud.example',origin:'https://heyso.example',token:'test',user:{username:'test'}};
  const files=[];for(let n=0;n<10;n++){const state=seed(),p=emptyProject('性能测试'+n);p.code='P'+n;p.startDate='2026-11-04';p.endDate='2026-11-05';state.projects=[p];for(const key of ['items','sprints','releases','notes','runs','events'])state[key]=[];files.push({content:projectFile(state,p.id),headId:'h'+n});}
  const calls=[];let conflict=false;
  const fetcher=async(url,init)=>{const path=new URL(url).pathname;calls.push(path);
    if(path==='/api/v1/heyso/files')return Response.json({files:files.map(f=>({id:f.content.id,head_id:f.headId}))});
    const file=files.find(f=>path.includes(f.content.id));assert.ok(file);
    if(path.endsWith('/action')){if(conflict)return Response.json({error:'VERSION_CONFLICT'},{status:409});const input=JSON.parse(init.body);assert.equal(input.headId,file.headId);const result=act(file.content.workspace,input.action);file.headId+='new';return Response.json({...file,result});}
    return Response.json(file);
  };
  const call=(path,input)=>{const req=new Request(config.origin+path,{method:input?'POST':'GET',headers:{cookie:sessionCookie(new Request(config.origin),env).split(';')[0],'x-heyso-client':'local-ui'}});return handleLoyo(req,config,env,input||{},fetcher);};
  const before=await (await call('/api/state')).json();assert.equal(calls.length,11);calls.length=0;
  const heads=files.map(f=>({fileId:f.content.id,headId:f.headId}));
  const unchanged=await (await call('/api/state',{heads})).json();assert.equal(unchanged.state.projects.length,0);assert.equal(calls.length,1);calls.length=0;
  const input={fileId:files[0].content.id,headId:files[0].headId,heads,requestId:'unique',action:{type:'item.create',payload:{projectId:before.projects[0].id,kind:'task',title:'新任务',startDate:'2026-11-04',endDate:'2026-11-05'}}};
  const saved=await (await call('/api/action',input)).json();assert.equal(calls.length,1);assert.equal(saved.state.items[0].title,'新任务');calls.length=0;
  const changed=await (await call('/api/state',{heads})).json();assert.equal(calls.length,2);assert.equal(changed.state.projects.length,1);
  conflict=true;await assert.rejects(()=>call('/api/action',input),e=>e.status===409);
  conflict=false;const current=await (await call('/api/state')).json();calls.length=0;
  await assert.rejects(()=>call('/api/action',{...input,revision:current.revision,action:{type:'project.update',payload:{id:current.projects[0].id,name:current.projects[1].name}}}),/项目名称不能重复/);
  assert.ok(!calls.some(path=>path.endsWith('/action')),'global project identifiers are checked before writing');
});

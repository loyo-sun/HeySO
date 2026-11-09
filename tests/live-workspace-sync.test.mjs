import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveWorkspaceSync} from '../src/live-workspace-sync.mjs';
import {projectPending} from '../src/durable-workspace-sync.mjs';
const ws=(title='original',head='h1')=>({revision:1,projects:[{id:'p',cloud:{fileId:'f',headId:head}}],items:[{id:'i',projectId:'p',title,description:'base'},{id:'j',projectId:'p',title:'other'}],sprints:[],releases:[],notes:[],runs:[],events:[]});
const memory=()=>({value:{state:ws(),queue:[]},async read(){return structuredClone(this.value);},async write(v){this.value=structuredClone(v);}});
const flush=()=>new Promise(r=>setImmediate(r));
async function idle(c){for(let i=0;i<100;i++){await flush();if(!c.processing)return;}throw Error('not idle');}
async function setup(t,opts={}){const storage=opts.storage||memory(),c=new LiveWorkspaceSync({scope:'a',storage,locks:null,setTimer:()=>1,clearTimer:()=>{},...opts});await c.ready;t.after(()=>c.dispose());return {c,storage};}
const ok=(title,head='h2')=>Response.json({state:ws(title,head),result:{id:'i',title}});
test('rejected operation is retained without blocking a later valid edit or refresh',async t=>{
 let sends=0;const {c,storage}=await setup(t,{fetcher:async path=>{if(path==='/api/live/state')return Response.json(ws('server'));return ++sends===1?Response.json({error:'invalid review'},{status:400}):ok('valid');}});
 await c.action('item.update',{id:'i',title:''},'p');await idle(c);assert.equal(c.queue.length,0);assert.equal(c.failed.length,1);assert.equal(storage.value.failed.length,1);
 await c.action('item.update',{id:'i',title:'valid'},'p');await idle(c);assert.equal(sends,2);assert.equal(c.confirmed.items[0].title,'valid');assert.equal(c.failed.length,1);
 await c.refresh();assert.equal(c.confirmed.items[0].title,'server');
});
test('legacy rejected outbox migrates to retained drafts, never replayed automatically',async t=>{
 const storage=memory();storage.value.queue=[{id:'old',type:'run.review',payload:{},phase:'rejected',error:'already reviewed'}];let sends=0;
 const {c}=await setup(t,{storage,fetcher:async path=>{assert.equal(path,'/api/live/state');sends++;return Response.json(ws());}});
 assert.equal(c.queue.length,0);assert.equal(c.failed.length,1);assert.equal(c.hasPending(),true);await c.refresh();assert.equal(sends,1);assert.equal(storage.value.failed[0].id,'old');
});
test('text base is captured before async persistence, with exact request replay after uncertain failure',async t=>{
 const storage=memory(),bodies=[];const {c}=await setup(t,{storage,fetcher:async(path,init)=>{bodies.push(init.body);throw Error('lost response');}});
 await c.action('item.update',{id:'i',description:'mine'},'p');await idle(c);const first=JSON.parse(bodies[0]);assert.deepEqual(first.baseFields,{description:'base'});assert.equal(first.consistency,'live-v1');
 c.dispose();const {c:next}=await setup(t,{storage,fetcher:async(path,init)=>{if(path==='/api/live/action')bodies.push(init.body);return path==='/api/live/action'?ok('done'):Response.json(ws());}});await next.refresh();await idle(next);
 assert.equal(bodies[0],bodies[1]);
});
test('failed text resubmission uses reviewed server text as base and a new request ID',async t=>{
 let body;const {c}=await setup(t,{fetcher:async(path,init)=>path==='/api/live/state'?Response.json({...ws(),items:[{...ws().items[0],description:'theirs'}]}):Response.json({error:'text conflict'},{status:409})});
 await c.action('item.update',{id:'i',description:'mine'},'p');await idle(c);const id=c.failed[0].id;await c.inspectFailed(id);
 c.fetcher=async(path,init)=>{body=JSON.parse(init.body);return ok('done');};await c.resolveFailed(id,true);await idle(c);
 assert.notEqual(body.requestId,id);assert.equal(body.baseFields.description,'theirs');assert.equal(c.failed.length,0);
});
test('optimistic projection keeps unrelated records and collections by reference',()=>{
 const state=ws();assert.equal(projectPending(state,[]),state);const next=projectPending(state,[{type:'item.update',payload:{id:'i',title:'new'}}]);assert.equal(next.items[0].title,'new');assert.equal(state.items[0].title,'original');assert.equal(next.items[1],state.items[1]);assert.equal(next.projects,state.projects);
});
test('a refresh finishing before write confirmation preserves the visible local draft',async t=>{
 let finish;const write=new Promise(r=>finish=r);const {c}=await setup(t,{fetcher:async path=>path==='/api/live/action'?write:Response.json(ws('remote'))});
 await c.action('item.update',{id:'i',title:'mine'},'p');await flush();await c.refresh();assert.equal(c.state.items[0].title,'mine');assert.equal(c.confirmed.items[0].title,'remote');
 finish(ok('mine'));await idle(c);assert.equal(c.state.items[0].title,'mine');assert.equal(c.queue.length,0);
});
test('local storage failure while isolating a rejection keeps the request recoverable',async t=>{
 const storage=memory();let fail=false;const original=storage.write;storage.write=async v=>{if(fail)throw Error('quota');return original.call(storage,v);};
 const {c}=await setup(t,{storage,fetcher:async()=>{fail=true;return Response.json({error:'invalid'},{status:400});}});
 await c.action('item.update',{id:'i',title:'draft'},'p');await idle(c);assert.equal(c.queue.length,1);assert.equal(c.failed.length,0);assert.equal(c.persistenceError,true);assert.equal(c.hasPending(),true);assert.equal(storage.value.queue[0].payload.title,'draft');
});
test('new gateway preserves authentication and routes state/actions as live protocol',async()=>{
 const {handleLoyo}=await import('../server/loyo-provider.mjs'),{sessionCookie}=await import('../server/hosted-auth.mjs');
 const env={HEYSO_PASSWORD:'test-only-password'},config={base:'https://cloud.test',origin:'https://heyso.test',token:'test',user:{username:'test'}};
 const calls=[],fetcher=async(url,init)=>{calls.push({url,body:init.body&&JSON.parse(init.body)});return Response.json({protocol:'live-v1',manifest:[],files:[]});};
 const req=new Request(config.origin+'/api/live/state',{method:'POST',headers:{cookie:sessionCookie(new Request(config.origin),env).split(';')[0],'X-HeySO-Client':'local-ui'}});
 const res=await handleLoyo(req,config,env,{heads:[]},fetcher);assert.equal(res.status,200);assert.equal((await res.json()).delta,true);assert.equal(calls.length,1);assert.ok(calls[0].url.endsWith('/api/v1/heyso/state'));
 const denied=await handleLoyo(new Request(config.origin+'/api/live/state',{method:'POST',headers:{'X-HeySO-Client':'local-ui'}}),config,env,{heads:[]},fetcher);assert.equal(denied.status,401);assert.equal(calls.length,1);
});
test('compact save result merges touched records and never regresses a newer cloud state',async()=>{
 const {mergeLive}=await import('../src/live-workspace-sync.mjs');const state=ws();state.projects[0].cloud.dataRevision=4;
 const patch={patch:true,project:{...state.projects[0],cloud:{...state.projects[0].cloud,headId:'h5',dataRevision:5}},changes:{items:{upsert:[{...state.items[0],title:'saved'}],remove:[]}},revision:5};
 const next=mergeLive(state,patch);assert.equal(next.items[0].title,'saved');assert.equal(next.items[1],state.items[1]);assert.equal(next.sprints,state.sprints);
 assert.equal(mergeLive(next,{...patch,project:state.projects[0]}),next);
 const older=ws('old');older.projects[0].cloud.dataRevision=3;assert.equal(mergeLive(next,{state:older}).items[0].title,'saved');
});
test('visible edit does not wait for a slow browser database write',async t=>{
 const storage=memory();let finish;const persisted=new Promise(r=>finish=r),write=storage.write;storage.write=async v=>{await persisted;return write.call(storage,v);};
 let sends=0;const {c}=await setup(t,{storage,fetcher:async()=>{sends++;return ok('instant');}});
 const action=c.action('item.update',{id:'i',title:'instant'},'p');await flush();assert.equal(c.state.items[0].title,'instant');assert.equal(c.status.localSaved,false);assert.equal(sends,0);
 finish();await action;await idle(c);assert.equal(sends,1);assert.equal(c.hasPending(),false);
});

test('compact reorder preserves server order and the next move passes concurrency checks',async()=>{
 const {seed,act}=await import('../server/model.mjs');
 const {mergeLive}=await import('../src/live-workspace-sync.mjs');
 const {roadmapSiblings}=await import('../shared/roadmap-order.mjs');
 const server=seed(),project=server.projects[0];
 for(const title of ['visible a','hidden','visible b'])act(server,{type:'item.create',payload:{projectId:project.id,kind:'task',title}});
 const source=server.items.find(i=>i.title==='visible b'),target=server.items.find(i=>i.title==='visible a');
 const initial=structuredClone(server);initial.projects[0].cloud={fileId:'f',headId:'h1'};

 act(server,{type:'item.reorder',payload:{projectId:project.id,id:source.id,targetId:target.id,position:'before',expectedSiblingIds:roadmapSiblings(server.items,source).map(i=>i.id)}});
 const changes=Object.fromEntries(['items','sprints','releases','notes','runs','events'].map(key=>[key,{upsert:server[key],remove:[],order:server[key].map(r=>r.id)}]));
 const merged=mergeLive(initial,{patch:true,project:{...server.projects[0],cloud:{fileId:'f',headId:'h2'}},revision:2,changes});
 assert.deepEqual(merged.items.map(i=>i.id),server.items.map(i=>i.id));
 act(server,{type:'item.reorder',payload:{projectId:project.id,id:source.id,targetId:target.id,position:'after',expectedSiblingIds:roadmapSiblings(merged.items,source).map(i=>i.id)}});
});

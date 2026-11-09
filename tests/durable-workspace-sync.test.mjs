import test from 'node:test';
import assert from 'node:assert/strict';
import {DurableWorkspaceSync,guardPending} from '../src/durable-workspace-sync.mjs';
import {handleDeployment} from '../server/deployment.mjs';
import {sessionCookie} from '../server/hosted-auth.mjs';
import {seal} from '../server/sealed-config.mjs';
const ws=(head='h1',title='original')=>({revision:1,projects:[{id:'p',name:'测试',code:'PX',nextItemNumber:2,cloud:{fileId:'f',headId:head}}],items:[{id:'i',projectId:'p',number:1,title}],sprints:[],releases:[],notes:[],runs:[],events:[]});
const saved=(head,title)=>({delta:true,state:ws(head,title),revision:2,result:{id:'i',title}});
const memory=()=>({value:null,fail:false,async read(){return structuredClone(this.value);},async write(v){if(this.fail)throw Error('quota');this.value=structuredClone(v);}});
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:v=>resolve(v)};};
const flush=()=>new Promise(r=>setImmediate(r));
async function idle(c){for(let i=0;i<30;i++){await flush();if(!c.processing)return;}throw Error('not idle');}
async function setup(t,options={}){const storage=options.storage||memory();const c=new DurableWorkspaceSync({scope:'account-A',locks:null,storage,setTimer:()=>123,clearTimer:()=>{},...options});t.after(()=>c.dispose());await c.ready;if(!c.confirmed&&!c.readOnly)c.receive(ws());await c.writing;return {c,storage};}
test('slow cloud: immediate local edit, frozen request persisted before sending, later draft survives earlier ACK',async t=>{
 const first=deferred(),second=deferred(),bodies=[];let storage;
 const ctx=await setup(t,{fetcher:async(path,init)=>{const body=JSON.parse(init.body);bodies.push(body);assert.deepEqual(storage.value.queue[0].body,body);return bodies.length===1?first.promise:second.promise;}});storage=ctx.storage;const {c}=ctx;
 assert.equal((await c.action('item.update',{id:'i',title:'first'},'p')).title,'first');await flush();await c.action('item.update',{id:'i',title:'second'},'p');assert.equal(storage.value.queue.length,2);
 first.resolve(Response.json(saved('h2','first')));await flush();await flush();assert.equal(c.state.items[0].title,'second');assert.equal(bodies[1].headId,'h2');
 second.resolve(Response.json(saved('h3','second')));await idle(c);assert.equal(c.status.phase,'synced');assert.equal(storage.value.queue.length,0);
});
test('lost response and reload replay the identical request and keep unconfirmed state visible',async t=>{
 const storage=memory(),bodies=[];const {c}=await setup(t,{storage,fetcher:async(path,init)=>{bodies.push(init.body);throw Error('lost ACK');}});
 await c.action('item.update',{id:'i',title:'local'},'p');await idle(c);assert.equal(c.status.phase,'retrying');assert.equal(c.hasPending(),true);c.dispose();
 const {c:next}=await setup(t,{storage,fetcher:async(path,init)=>{bodies.push(init.body);return Response.json(saved('h2','local'));}});assert.equal(next.state.items[0].title,'local');await next.refresh();await idle(next);assert.equal(bodies[0],bodies[1]);assert.equal(next.status.phase,'synced');
});
test('conflict stays blocked until explicit review, then uses a new request against the reviewed head',async t=>{
 let calls=0;const {c,storage}=await setup(t,{fetcher:async path=>{calls++;return path==='/api/state'?Response.json(ws('remote','other user')):Response.json({error:'conflict'},{status:409});}});
 await c.action('item.update',{id:'i',title:'mine'},'p');await idle(c);assert.equal(c.status.phase,'conflict');assert.equal(c.state.items[0].title,'mine');await c.retry();await c.refresh();assert.equal(calls,1);assert.equal(storage.value.queue.length,1);
 const id=c.queue[0].id;await c.inspect();c.fetcher=async(path,init)=>{const b=JSON.parse(init.body);assert.equal(b.headId,'remote');assert.notEqual(b.requestId,id);return Response.json(saved('h3','mine'));};await c.resolveFirst(true);await idle(c);assert.equal(c.queue.length,0);
});
test('401 preserves visible draft without unmounting the app or automatic repeated authentication attempts',async t=>{
 let expired=0,calls=0;const {c}=await setup(t,{onExpired:()=>expired++,fetcher:async()=>{calls++;return Response.json({error:'expired'},{status:401});}});
 await c.action('item.update',{id:'i',title:'mine'},'p');await idle(c);assert.equal(c.status.phase,'expired');assert.equal(expired,0);assert.equal(c.state.items[0].title,'mine');await c.refresh();assert.equal(calls,1);
});
test('local quota failure never claims saved or sends; protects draft and permits storage recovery',async t=>{
 let sends=0;const {c,storage}=await setup(t,{fetcher:async()=>{sends++;return Response.json(saved('h2','mine'));}});storage.fail=true;
 assert.equal(await c.action('item.update',{id:'i',title:'mine'},'p'),null);assert.equal(c.status.phase,'storage-error');assert.equal(c.status.localSaved,false);assert.equal(c.hasPending(),true);assert.equal(sends,0);
 storage.fail=false;await c.retry();await idle(c);assert.equal(c.status.phase,'synced');assert.equal(sends,1);
});
test('beforeunload is active only for outstanding writes, including local persistence in progress',async t=>{
 const {c}=await setup(t);const a=new Event('beforeunload',{cancelable:true});guardPending(c,a);assert.equal(a.defaultPrevented,false);c.localWrites=1;const b={defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},returnValue:null};guardPending(c,b);assert.equal(b.defaultPrevented,true);assert.equal(b.returnValue,'');c.localWrites=0;
});
test('second tab cannot overwrite another tab outbox',async t=>{
 const storage=memory();storage.value={state:ws(),queue:[{id:'unconfirmed'}]};const {c}=await setup(t,{storage,locks:{request:async(name,opts,fn)=>fn(null)}});assert.equal(c.status.phase,'locked');assert.equal(await c.action('item.update',{id:'i',title:'wrong'},'p'),null);assert.equal(storage.value.queue[0].id,'unconfirmed');
});
test('server returns an opaque account scope and rejects another account outbox before reaching upstream',async()=>{
 const origin='https://heyso.test',env={HEYSO_SETUP_KEY:'setup-key-for-scope-regression-0001'},config={provider:'loyocloud',base:'https://cloud.test',origin,token:'test-token',user:{id:'owner'},password:'gateway-test-password',mcpKey:'gateway-test-mcp-key',expires:Date.now()+60000};
 const cookie='heyso_config='+seal(config,env.HEYSO_SETUP_KEY,'config')+'; '+sessionCookie(new Request(origin),{HEYSO_PASSWORD:config.password}).split(';')[0],headers={Cookie:cookie,Origin:origin,'Content-Type':'application/json','X-HeySO-Client':'local-ui'};let calls=0;const fetcher=async()=>{calls++;throw Error('must not reach upstream');};
 const session=await (await handleDeployment(new Request(origin+'/api/session',{headers}),env,{fetcher})).json();assert.match(session.storageScope,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(session).includes('test-token'));
 const res=await handleDeployment(new Request(origin+'/api/action',{method:'POST',headers,body:JSON.stringify({storageScope:'different-account',action:{type:'item.update',payload:{id:'i',title:'wrong'}}})}),env,{fetcher});assert.equal(res.status,409);assert.equal(calls,0);assert.equal((await res.json()).scopeMismatch,true);
});
test('queued create replays its original request after lost ACK without duplicate creation',async t=>{
 const storage=memory(),requests=new Map();let creates=0,lost=true;
 const fetcher=async(path,init)=>{const b=JSON.parse(init.body);if(!requests.has(b.requestId)){creates++;const state=ws('h2');state.projects[0].nextItemNumber=3;state.items.push({id:'new',projectId:'p',number:2,title:'new'});requests.set(b.requestId,{delta:true,state,revision:2,result:state.items[1]});}if(lost){lost=false;throw Error('lost ACK');}return Response.json(requests.get(b.requestId));};
 const {c}=await setup(t,{storage,fetcher});assert.equal(await c.action('item.create',{projectId:'p',title:'new'},'p'),null);await idle(c);c.dispose();
 const {c:next}=await setup(t,{storage,fetcher});await next.refresh();await idle(next);assert.equal(creates,1);assert.equal(next.state.items.filter(i=>i.id==='new').length,1);
});
test('refresh started before local edit cannot overwrite its optimistic state or acknowledgement',async t=>{
 const old=deferred(),write=deferred();const {c}=await setup(t,{fetcher:async path=>path==='/api/state'?old.promise:write.promise});
 const refreshing=c.refresh();await flush();await c.action('item.update',{id:'i',title:'mine'},'p');old.resolve(Response.json(ws('old','stale')));await refreshing;assert.equal(c.state.items[0].title,'mine');write.resolve(Response.json(saved('h2','mine')));await idle(c);assert.equal(c.confirmed.projects[0].cloud.headId,'h2');
});

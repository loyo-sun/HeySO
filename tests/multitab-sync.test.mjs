import test from 'node:test';
import assert from 'node:assert/strict';
import {TabSyncStorage} from '../src/sync-storage.mjs';
import {LiveWorkspaceSync} from '../src/live-workspace-sync.mjs';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
function leases(){
 const held=new Set();
 return {held,async request(name,options,callback){
  if(typeof options==='function'){callback=options;options={};}
  if(held.has(name)){assert.equal(options.ifAvailable,true);return callback(null);}
  held.add(name);try{return await callback({name});}finally{held.delete(name);}
 }};
}
function database(){
 const records=new Map();
 return {records,slot(scope){return {
  async read(){return structuredClone(records.get(scope));},
  async write(value){records.set(scope,structuredClone(value));},
  async keys(){return [...records.keys()];},
  async adopt(from){
   const source=records.get(from),target=records.get(scope);if(!source)return;
   records.set(scope,structuredClone({...source,...target,state:target?.state||source.state,
    queue:[...(target?.queue||[]),...(source.queue||[])],failed:[...(target?.failed||[]),...(source.failed||[])]}));
   records.delete(from);
  }
 };}};
}
const state=(title='original')=>({revision:1,projects:[{id:'p',cloud:{fileId:'f',headId:'h1'}}],items:[{id:'i',projectId:'p',title}],sprints:[],releases:[],notes:[],runs:[],events:[]});
function tab(db,locks,id,scope='account'){
 return new TabSyncStorage(scope,{locks,id,storage:db.slot(scope+':tab:'+id)});
}
test('two live pages edit independently without stealing or overwriting an active outbox',async t=>{
 const db=database(),locks=leases(),a=tab(db,locks,'A');t.after(()=>a.dispose());
 await a.write({state:state(),queue:[],failed:[]});
 const b=tab(db,locks,'B');t.after(()=>b.dispose());await b.ready;
 assert.equal(await b.read(),undefined);
 await b.write({state:state(),queue:[],failed:[]});
 const sends=[];
 const fetcher=async(path,init)=>{sends.push(JSON.parse(init.body));throw Error('offline');};
 const first=new LiveWorkspaceSync({scope:'account',storage:a,locks,fetcher,setTimer:()=>1,clearTimer:()=>{}});
 const second=new LiveWorkspaceSync({scope:'account',storage:b,locks,fetcher,setTimer:()=>1,clearTimer:()=>{}});
 t.after(()=>{first.dispose();second.dispose();});await Promise.all([first.ready,second.ready]);
 await Promise.all([first.action('item.update',{id:'i',title:'from A'},'p'),second.action('item.update',{id:'i',title:'from B'},'p')]);
 for(let i=0;i<10;i++)await flush();
 assert.equal(first.readOnly,undefined);assert.equal(second.readOnly,undefined);
 assert.equal(sends.length,2);assert.notEqual(sends[0].requestId,sends[1].requestId);
 assert.equal((await a.read()).queue[0].payload.title,'from A');
 assert.equal((await b.read()).queue[0].payload.title,'from B');
 assert.equal(first.state.items[0].title,'from A');assert.equal(second.state.items[0].title,'from B');
});
test('closed page recovery preserves frozen request identity and failed drafts, leaving active pages and other accounts alone',async t=>{
 const db=database(),locks=leases(),a=tab(db,locks,'A');await a.ready;
 const frozen={requestId:'uncertain-write',headId:'old',action:{type:'item.create',payload:{title:'only once'}}};
 const record={state:state(),queue:[{id:'uncertain-write',body:frozen,phase:'retrying'}],failed:[{id:'rejected-draft',phase:'conflict'}]};
 await a.write(record);a.dispose();await flush();
 const active=tab(db,locks,'active');t.after(()=>active.dispose());await active.ready;
 assert.deepEqual((await active.read()).queue[0].body,frozen);
 assert.equal((await active.read()).failed[0].id,'rejected-draft');
 assert.equal(db.records.has('account:tab:A'),false);
 const other=tab(db,locks,'other','different-account');t.after(()=>other.dispose());await other.write(record);
 const next=tab(db,locks,'new');t.after(()=>next.dispose());await next.ready;
 assert.equal(await next.read(),undefined);assert.ok(db.records.has('account:tab:active'));
 assert.ok(db.records.has('different-account:tab:other'));
});
test('upgrade skips a legacy live owner, then recovers its queue after that page closes',async t=>{
 const db=database(),locks=leases();locks.held.add('heyso-sync:account');
 db.records.set('account',{state:state(),queue:[{id:'legacy-request',body:{requestId:'legacy-request'}}],failed:[]});
 const first=tab(db,locks,'new');t.after(()=>first.dispose());await first.ready;
 assert.equal(await first.read(),undefined);assert.ok(db.records.has('account'));
 locks.held.delete('heyso-sync:account');
 const recovery=tab(db,locks,'recovery');t.after(()=>recovery.dispose());await recovery.ready;
 assert.equal((await recovery.read()).queue[0].body.requestId,'legacy-request');
 assert.equal(db.records.has('account'),false);
});
test('an adoption failure releases the donor lease and leaves its original queue recoverable',async()=>{
 const db=database(),locks=leases();db.records.set('account',{state:state(),queue:[{id:'keep'}]});
 const storage=db.slot('account:tab:broken');storage.adopt=async()=>{throw Error('quota');};
 const broken=new TabSyncStorage('account',{locks,id:'broken',storage});
 await assert.rejects(broken.ready,/quota/);broken.dispose();await flush();
 assert.equal(locks.held.has('heyso-sync:account'),false);
 assert.equal(db.records.get('account').queue[0].id,'keep');
 const restored=tab(db,locks,'restored');await restored.ready;
 assert.equal((await restored.read()).queue[0].id,'keep');restored.dispose();
});

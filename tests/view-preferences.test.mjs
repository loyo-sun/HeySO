import test from 'node:test';
import assert from 'node:assert/strict';
import {ViewPreferencesStore} from '../src/view-preferences.mjs';
import {normalizeViewPatch} from '../shared/view-preferences.mjs';
const memory=()=>{const entries=new Map();return {getItem:key=>entries.get(key)||null,setItem:(key,value)=>entries.set(key,value)};};
const project={id:'p',cloud:{fileId:'file-a',base:'https://cloud.example',account:'A'}};
const defaults={query:'',status:'all',owner:'all',showSubtasks:false};
function backend(){const views={},ids=new Map(),calls=[];let fail=false;return {calls,views,fail:value=>{fail=value;},fetcher:async(url,init)=>{calls.push({url,...init});if(fail)throw Error('offline');const body=init.method==='POST'?JSON.parse(init.body):null;if(body&&!ids.has(body.requestId)){const before=views[body.view]||{values:{},revision:0};views[body.view]={values:{...before.values,...body.patch},revision:before.revision+1};ids.set(body.requestId,body);}return Response.json({fileId:'file-a',userId:'user-a',views});}};}
const store=(opts={})=>new ViewPreferencesStore({delay:100000,...opts});
test('all six views persist independently across reloads; projects and cloud files are isolated',()=>{
 const storage=memory(),one=store({storage});
 for(const view of ['roadmap','backlog','board','list','releases','reports']){const key=view==='reports'?'directoryQuery':'query',r=one.record('p',view,{[key]:''});one.update(r,{[key]:view});}
 const two=store({storage});for(const view of ['roadmap','backlog','board','list','releases','reports'])assert.equal(two.record('p',view,{[view==='reports'?'directoryQuery':'query']:''}).values[view==='reports'?'directoryQuery':'query'],view);
 assert.equal(two.record('other','board',{query:''}).values.query,'');assert.equal(two.record(project,'board',{query:''}).values.query,'');one.dispose();two.dispose();
});
test('cloud hydration merges pending local changes and restores settings in another device',async()=>{
 const b=backend(),a=store({storage:memory(),fetcher:b.fetcher}),r=a.record(project,'board',defaults);a.update(r,{query:'HS-20'});await a.connect(r);await a.flush(r);
 const other=store({storage:memory(),fetcher:b.fetcher}),s=other.record(project,'board',defaults);await other.connect(s);assert.equal(s.values.query,'HS-20');assert.equal(r.error,'');
 other.update(s,{owner:'乙'});await other.flush(s);a.update(r,{showSubtasks:true});await a.flush(r);await other.connect(s,true);assert.equal(s.values.owner,'乙');assert.equal(s.values.showSubtasks,true);assert.equal(s.values.query,'HS-20');a.dispose();other.dispose();
});
test('an interrupted write reuses the request id after reload and retains newer edits until next request',async()=>{
 const b=backend(),storage=memory(),a=store({storage,fetcher:b.fetcher,uuid:()=> 'one'}),r=a.record(project,'board',defaults);a.update(r,{query:'before'});b.fail(true);await a.flush(r);assert.equal(r.inflight.requestId,'one');a.update(r,{query:'after'});a.dispose();
 const reloaded=store({storage,fetcher:b.fetcher,uuid:()=> 'two'}),s=reloaded.record(project,'board',defaults);b.fail(false);await reloaded.flush(s);assert.equal(s.values.query,'after');assert.equal(s.dirty.query,'after');await reloaded.flush(s);
 const writes=b.calls.filter(c=>c.method==='POST').map(c=>JSON.parse(c.body));assert.equal(writes[0].requestId,writes[1].requestId);assert.equal(writes[1].patch.query,'before');assert.equal(writes[2].requestId,'two');assert.equal(b.views.board.values.query,'after');assert.deepEqual(s.dirty,{});reloaded.dispose();
});
test('a stale GET cannot replace a confirmed write or edits made while the write is in flight',async()=>{
 let finish;const b=backend(),fetcher=async(url,init)=>init.method==='GET'?new Promise(resolve=>{finish=()=>resolve(Response.json({fileId:'file-a',userId:'u',views:{board:{revision:0,values:{query:'old'}}}}));}):b.fetcher(url,init);
 const a=store({storage:memory(),fetcher}),r=a.record(project,'board',defaults),loading=a.connect(r);a.update(r,{query:'latest'});await a.flush(r);finish();await loading;assert.equal(r.values.query,'latest');a.dispose();
});
test('cached cloud response hydrates views mounted later, without overwriting them with component defaults',async()=>{
 const b=backend();b.views.releases={values:{filter:'released',query:'V1.0'},revision:3};const a=store({storage:memory(),fetcher:b.fetcher}),r=a.record(project,'board',defaults);await a.connect(r);
 const release=a.record(project,'releases',{filter:'unreleased',query:''});assert.equal(release.values.filter,'released');assert.equal(release.values.query,'V1.0');a.dispose();
});
test('browser storage failure does not prevent cloud sync and malformed personal fields never reach state',async()=>{
 const b=backend(),a=store({storage:{getItem(){throw Error('disabled');},setItem(){throw Error('quota');}},fetcher:b.fetcher}),r=a.record(project,'board',defaults);a.update(r,{query:'valid',showSubtasks:'invalid',workspace:{}});await a.flush(r);assert.equal(r.values.showSubtasks,false);assert.equal(r.values.workspace,undefined);assert.equal(b.views.board.values.query,'valid');
 assert.throws(()=>normalizeViewPatch('board',{workspace:{}},{strict:true}));assert.deepEqual(normalizeViewPatch('list',{filters:{status:['todo'],endDate:{from:'2026-11-01',to:'2026-11-08'}}}).filters.status,['todo']);a.dispose();
});
test('existing list column choices are migrated without overwriting an existing cloud preference',async()=>{
 const storage=memory();storage.setItem('heyso-backlog-columns:p',JSON.stringify({columns:['workItem','status'],sort:{key:'status',direction:'asc'}}));const b=backend(),a=store({storage,fetcher:b.fetcher}),r=a.record(project,'list',{columns:['workItem','owner'],sort:{key:'owner',direction:'desc'}});await a.connect(r);await a.flush(r);assert.deepEqual(b.views.list.values.columns,['workItem','status']);a.dispose();
 const other=store({storage:memory(),fetcher:b.fetcher}),s=other.record(project,'list',{columns:['workItem'],sort:{key:'workItem',direction:'asc'}});await other.connect(s);assert.deepEqual(s.values.columns,['workItem','status']);other.dispose();
});

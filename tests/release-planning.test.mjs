import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createStore} from '../server/store.mjs';
import {releaseStats,releaseState,releaseNotes} from '../src/release-model.mjs';
const call=(store,type,payload)=>store.dispatch({type,payload}).result;
function fresh(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'heyso-release-planning-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return createStore(path.join(dir,'state.json'));}
test('version dates are optional but calendar errors, reversed dates and duplicate project names roll back',t=>{
 const store=fresh(t),r=call(store,'release.create',{projectId:'p_heyso',name:'1.0.0'});assert.equal(r.startDate,'');
 call(store,'release.update',{id:r.id,startDate:'2026-11-05',plannedDate:'2026-11-20',goal:'首个版本'});
 const before=store.read();
 for(const patch of [{startDate:'2026-02-30'},{startDate:'2026-12-01'},{name:''}]){assert.throws(()=>call(store,'release.update',{id:r.id,...patch}));assert.deepEqual(store.read(),before);}
 assert.throws(()=>call(store,'release.create',{projectId:'p_heyso',name:' 1.0.0 '}),/同名/);assert.deepEqual(store.read(),before);
});
test('archiving preserves scope and history, prevents new assignments and publishing, and can be restored',t=>{
 const store=fresh(t),before=store.read();call(store,'release.archive',{id:'r1',archived:true});
 assert.deepEqual(store.read().items,before.items);
 const frozen=store.read();
 assert.throws(()=>call(store,'item.update',{id:'s12',releaseId:'r1'}),/归档/);
 assert.throws(()=>call(store,'release.publish',{id:'r1',notes:'交付'}),/归档/);
 assert.throws(()=>call(store,'release.update',{id:'r1',goal:'修改'}),/恢复/);assert.deepEqual(store.read(),frozen);
 call(store,'release.archive',{id:'r1',archived:false});call(store,'release.update',{id:'r1',goal:'恢复后编辑'});assert.equal(store.read().releases.find(r=>r.id==='r1').goal,'恢复后编辑');
});
test('assigning and removing a version never changes the selected sprint',t=>{
 const store=fresh(t),old=store.read().items.find(i=>i.id==='s1');call(store,'item.update',{id:old.id,releaseId:'r2'});
 assert.equal(store.read().items.find(i=>i.id===old.id).sprintId,old.sprintId);
 call(store,'item.update',{id:old.id,releaseId:null});assert.equal(store.read().items.find(i=>i.id===old.id).sprintId,old.sprintId);
});
test('release metrics and notes use immutable delivered snapshots and identify overdue dates',()=>{
 const project={id:'p'},items=[{id:'i',releaseId:'r',status:'done',kind:'story',title:'新标题',number:1}],release={id:'r',name:'1.0',status:'released',publishedStories:[{...items[0],title:'原始交付标题'}]};
 assert.equal(releaseStats(release,items,project).done[0].title,'原始交付标题');assert.match(releaseNotes(release,items,{...project,code:'HS'}),/原始交付标题/);
 assert.equal(releaseState({plannedDate:'2026-11-04'},'2026-11-05'),'已逾期');assert.equal(releaseState({plannedDate:'2026-11-05'},'2026-11-05'),'未发布');
 assert.equal(releaseState({...release,archived:true},'2026-11-05'),'已归档');
});
test('publishing records the actual date and rejects archived deferral targets without partial changes',t=>{
 const store=fresh(t);call(store,'release.archive',{id:'r2',archived:true});const state=store.read(),project=state.projects[0];
 const stats=releaseStats(state.releases.find(r=>r.id==='r1'),state.items,project),dispositions=Object.fromEntries(stats.unfinished.map(i=>[i.id,'r2']));
 assert.throws(()=>call(store,'release.publish',{id:'r1',notes:'交付说明',releasedDate:'2026-11-05',dispositions}),/去向/);assert.deepEqual(store.read(),state);
 call(store,'release.publish',{id:'r1',notes:'交付说明',releasedDate:'2026-11-05',dispositions:Object.fromEntries(stats.unfinished.map(i=>[i.id,'backlog']))});
 const after=store.read(),r=after.releases.find(r=>r.id==='r1');assert.equal(r.releasedDate,'2026-11-05');assert.equal(r.publishedStories.length,stats.done.length);
 for(const i of stats.unfinished)assert.equal(after.items.find(x=>x.id===i.id).sprintId,i.sprintId);
 call(store,'release.archive',{id:'r1',archived:true});assert.deepEqual(store.read().releases.find(r=>r.id==='r1').publishedStories,r.publishedStories);
});
test('creating work directly into an archived or published version is rejected atomically',t=>{
 const store=fresh(t),project=store.read().projects[0];call(store,'release.archive',{id:'r1',archived:true});const before=store.read();
 assert.throws(()=>call(store,'item.create',{projectId:project.id,kind:'task',title:'不能加入归档版本',startDate:project.startDate,endDate:project.endDate,releaseId:'r1'}),/归档/);assert.deepEqual(store.read(),before);
});

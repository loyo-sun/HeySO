import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createStore} from '../server/store.mjs';
import {terminal} from '../shared/work-config.mjs';
const summary={review:'交付了本轮可验收成果',retro:{wentWell:'范围清晰',improve:'估算需改进',actions:''}};
function fresh(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'heyso-sprint-planning-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return createStore(path.join(dir,'workspace.json'));}
const run=(store,type,payload)=>store.dispatch({type,payload}).result;
const pending=state=>state.items.filter(i=>i.sprintId==='sp1'&&!terminal(i,state.projects[0]));
function close(store,extra={}){return run(store,'sprint.close',{id:'sp1',...summary,dispositions:Object.fromEntries(pending(store.read()).map(i=>[i.id,'backlog'])),...extra});}
test('closing saves review and creates a carryover sprint in the same transaction, retaining the historical scope',t=>{
 const store=fresh(t),before=store.read(),id=pending(before)[0].id;
 close(store,{dispositions:Object.fromEntries(pending(before).map(i=>[i.id,i.id===id?'new':'backlog'])),nextSprint:{name:'后续冲刺',goal:'完成结转工作',startDate:'2026-11-16',endDate:'2026-11-29',capacity:20}});
 const after=store.read(),sp=after.sprints.find(s=>s.id==='sp1'),next=after.sprints.find(s=>s.name==='后续冲刺');
 assert.equal(sp.status,'closed');assert.equal(sp.review,summary.review);assert.equal(next.status,'planned');
 assert.equal(after.items.find(i=>i.id===id).sprintId,next.id);
 assert.equal(sp.finalStories.find(i=>i.id===id).sprintId,'sp1');
 assert.equal(sp.carryover.find(i=>i.id===id).to,next.id);
 assert.equal(after.revision,before.revision+1);
});
test('invalid carryover dates or missing dispositions roll back the summary, next sprint and item moves',t=>{
 const store=fresh(t),before=store.read(),id=pending(before)[0].id;
 for(const dates of [{startDate:'2026-02-30',endDate:'2026-03-10'},{startDate:'2026-11-30',endDate:'2026-11-01'}]){
 assert.throws(()=>close(store,{dispositions:{[id]:'new'},nextSprint:{name:'后续冲刺',goal:'继续交付',capacity:10,...dates}}),/日期/);assert.deepEqual(store.read(),before);
 }
 assert.throws(()=>close(store,{dispositions:{[id]:'new'},nextSprint:{name:'后续冲刺',goal:'继续交付',capacity:10,startDate:'2026-11-16',endDate:'2026-11-29'}}),/去向/);assert.deepEqual(store.read(),before);
});
test('starting confirms edited dates and goal with the baseline atomically and prevents parallel active sprints',t=>{
 const store=fresh(t),before=store.read();
 assert.throws(()=>run(store,'sprint.start',{id:'sp2',name:'不应写入'}),/当前冲刺/);assert.deepEqual(store.read(),before);
 close(store);
 const sp=store.read().sprints.find(s=>s.id==='sp2');
 run(store,'sprint.start',{id:sp.id,name:'确认后的冲刺',goal:'确认后的目标',startDate:'2026-11-16',endDate:'2026-11-29',capacity:25});
 const started=store.read().sprints.find(s=>s.id===sp.id);
 assert.equal(started.status,'active');assert.equal(started.name,'确认后的冲刺');assert.equal(started.startDate,'2026-11-16');assert.equal(started.capacity,25);assert.ok(started.baseline.length);
});
test('editing dates persists while invalid dates and capacity cannot change the stored plan',t=>{
 const store=fresh(t);
 run(store,'sprint.update',{id:'sp2',startDate:'2026-11-16',endDate:'2026-11-29'});
 const before=store.read();assert.equal(before.sprints.find(s=>s.id==='sp2').endDate,'2026-11-29');
 for(const patch of [{startDate:'2026-11-30'}, {endDate:'not-a-date'}, {capacity:-1}]){assert.throws(()=>run(store,'sprint.update',{id:'sp2',...patch}));assert.deepEqual(store.read(),before);}
});
test('invalid startup confirmation cannot change dates or capture a baseline',t=>{
 const store=fresh(t);close(store);const before=store.read();
 assert.throws(()=>run(store,'sprint.start',{id:'sp2',name:'无效确认',startDate:'2026-02-30',endDate:'2026-03-10'}),/有效日期/);
 assert.deepEqual(store.read(),before);
});

test('starting a sprint requires owners but permits blank or missing acceptance criteria',t=>{
 const store=fresh(t);close(store);
 const rows=store.read().items.filter(i=>i.sprintId==='sp2');assert.ok(rows.length);
 rows.forEach((item,index)=>run(store,'item.update',{id:item.id,owner:'我',acceptance:index?'   ':''}));
 run(store,'sprint.start',{id:'sp2'});
 const state=store.read(),sprint=state.sprints.find(sp=>sp.id==='sp2');
 assert.equal(sprint.status,'active');assert.ok(sprint.startedAt);assert.equal(sprint.baseline.length,rows.length);
 assert.ok(state.items.filter(i=>i.sprintId==='sp2').every(i=>!i.acceptance.trim()));
});
test('starting rejects an unassigned owner without changing sprint state or baseline',t=>{
 const store=fresh(t);close(store);
 const item=store.read().items.find(i=>i.sprintId==='sp2');
 run(store,'item.update',{id:item.id,owner:'',acceptance:'已有验收标准'});
 const before=store.read();assert.throws(()=>run(store,'sprint.start',{id:'sp2'}),/负责人/);assert.deepEqual(store.read(),before);
});

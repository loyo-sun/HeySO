import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,act,validate} from '../server/model.mjs';
import {migrateState} from '../server/migrate.mjs';
import {sprintHistoryItems} from '../src/sprint-items.mjs';
import {roadmapPlanRows,roadmapPlanWindow} from '../src/roadmap-model.mjs';

test('HS1-38/39 closing freezes all sprint types and inherited subtasks before carryover',()=>{
 const state=migrateState(seed()),p=state.projects[0],sp=state.sprints.find(s=>s.id==='sp1');
 const child=state.items.find(i=>i.kind==='subtask' && state.items.find(x=>x.id===i.parentId)?.sprintId===sp.id);
 const parent=state.items.find(i=>i.id===child?.parentId);
 assert.ok(child);state.items.find(i=>i.kind==='epic').sprintId=sp.id;
 const expected=state.items.filter(i=>i.sprintId===sp.id || i.kind==='subtask' && state.items.find(x=>x.id===i.parentId)?.sprintId===sp.id);
 const dispositions=Object.fromEntries(expected.filter(i=>i.kind!=='subtask').map(i=>[i.id,'backlog']));
 act(state,{type:'sprint.close',payload:{id:sp.id,review:'完成复盘',retro:{wentWell:'明确',improve:'继续',actions:''},dispositions}});validate(state);
 assert.deepEqual(sp.finalItems.map(i=>i.id),expected.map(i=>i.id));
 const snapshot=structuredClone(sp.finalItems);child.title='后续修改';parent.sprintId='sp2';
 assert.deepEqual(sprintHistoryItems(sp,state.items,p),snapshot);
 assert.ok(snapshot.some(i=>i.id===child.id && i.sprintId===sp.id));
 assert.ok(snapshot.some(i=>i.kind==='epic'));
});
test('HS1-38/39 legacy history preserves frozen values and labels recovered data',()=>{
 const p={};const frozen={id:'s',projectId:'p',kind:'story',title:'历史标题',sprintId:'old'};
 const sp={id:'old',projectId:'p',completedAt:'2026-11-08',finalStories:[frozen]};
 const items=[{...frozen,title:'现在标题',sprintId:'next'},{id:'c',projectId:'p',kind:'subtask',parentId:'s',createdAt:'2026-11-07'},{id:'future',projectId:'p',kind:'subtask',parentId:'s',createdAt:'2026-11-09'},{id:'e',projectId:'p',kind:'epic',sprintId:'old'}];
 const rows=sprintHistoryItems(sp,items,p);
 assert.equal(rows[0].title,'历史标题');assert.deepEqual(rows.map(i=>i.id),['s','e','c']);
 assert.equal(rows.find(i=>i.id==='c').historyRecovered,true);assert.equal(items[1].sprintId,undefined);
 assert.deepEqual(sprintHistoryItems({...sp,finalItems:[]},items,p),[]);
});
test('HS1-47 fit uses visible dated bars, excluding releases, hidden hierarchy and undated items',()=>{
 const p=seed().projects[0];
 const items=[{id:'a',kind:'story',number:1,title:'目标',startDate:'2026-11-09',endDate:'2026-11-10'},{id:'b',kind:'story',number:2,title:'其他',startDate:'2030-01-01',endDate:'2030-02-01'},{id:'u',kind:'story',number:3,title:'目标未排期',startDate:'2020-01-01'}];
 const rows=roadmapPlanRows(items,p,{query:'目标'},0,0);
 const fit=roadmapPlanWindow('2026-11-09','fit',p,rows.map(r=>r.item),[{plannedDate:'2040-01-01'}]);
 assert.equal(fit.startDate,'2026-11-02');assert.equal(fit.endDate,'2026-11-17');
 const empty=roadmapPlanWindow('2026-11-09','fit',p,[],[{plannedDate:'2040-01-01'}]);assert.equal(empty.days,15);
});
test('HS1-52 ongoing creation discards stale finite dates before validation and roundtrips',()=>{
 const state=migrateState(seed());
 const p=act(state,{type:'project.create',payload:{name:'长期回归',code:'LT',goal:'运营',longTerm:true,startDate:'2026-11-09',endDate:''}});
 assert.equal(p.startDate,'');assert.equal(p.endDate,'');assert.equal(p.longTerm,true);validate(state);
 assert.equal(validate(JSON.parse(JSON.stringify(state))).projects.find(i=>i.id===p.id).longTerm,true);
});

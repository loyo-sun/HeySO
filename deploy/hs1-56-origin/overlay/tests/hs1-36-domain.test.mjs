import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,act,validate} from '../vendor/heyso/server/model.mjs';
import {migrateState} from '../vendor/heyso/server/migrate.mjs';
import {effectiveSprintId} from '../vendor/heyso/shared/work-config.mjs';
test('HS1-38/39 closed snapshot retains every work type and inherited subtask before carryover',()=>{
 const s=migrateState(seed()),sp=s.sprints.find(x=>x.id==='sp1'),p=s.projects[0];
 s.items.find(i=>i.kind==='epic').sprintId=sp.id;
 const rows=s.items.filter(i=>effectiveSprintId(i,s.items,p)===sp.id);
 assert.ok(rows.some(i=>i.kind==='subtask'));
 act(s,{type:'sprint.close',payload:{id:sp.id,review:'发布验证',retro:{wentWell:'明确',improve:'继续',actions:''},dispositions:Object.fromEntries(rows.map(i=>[i.id,'backlog']))}});validate(s);
 assert.deepEqual(sp.finalItems.map(i=>i.id),rows.map(i=>i.id));
 const copy=structuredClone(sp.finalItems);rows[0].title='后续修改';assert.deepEqual(sp.finalItems,copy);
});
test('HS1-52 long-term mode ignores stale finite dates and roundtrips with date-independent work',()=>{
 const s=migrateState(seed()),p=act(s,{type:'project.create',payload:{name:'持续运营',code:'LT',goal:'持续',longTerm:true,startDate:'2026-11-09',endDate:''}});
 assert.equal(p.longTerm,true);assert.equal(p.startDate,'');assert.equal(p.endDate,'');
 act(s,{type:'item.create',payload:{projectId:p.id,kind:'story',title:'远期工作',startDate:'2040-01-01',endDate:'2040-02-01'}});validate(s);
 assert.equal(validate(JSON.parse(JSON.stringify(s))).projects.find(i=>i.id===p.id).longTerm,true);
 assert.throws(()=>act(s,{type:'project.create',payload:{name:'缺少日期',code:'FX',goal:'有限',longTerm:false}}),/同时填写/);
});

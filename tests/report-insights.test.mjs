import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultWorkConfig} from '../shared/work-config.mjs';
import {buildProductInsights} from '../src/report-insights.mjs';
const project={id:'p',workConfig:defaultWorkConfig()},at=d=>new Date(2026,10,d,12).toISOString(),now=+new Date(at(10));
const item=(id,extra={})=>({id,projectId:'p',kind:'story',status:'todo',createdAt:at(1),owner:'甲',points:3,...extra});
const build=extra=>buildProductInsights({project,items:[],runs:[],from:'2026-11-01',to:'2026-11-08',now,...extra});
test('risk totals deduplicate overlaps, ignore cancelled/planning/subtask and preserve zero-point estimates',()=>{
 const r=build({items:[item('a',{owner:'',endDate:'2026-11-02',points:0}),item('b',{status:'cancelled',owner:''}),item('c',{kind:'epic',owner:''}),item('d',{kind:'subtask',owner:''}),item('e',{projectId:'other'}),item('f',{status:'done',owner:''}),item('g',{points:null,sprintId:'s'})]});
 assert.deepEqual(r.rows.map(i=>i.id),['a','b','f','g']);assert.equal(r.riskRows.length,2);assert.equal(r.risks.find(r=>r.id==='unestimated').rows.length,1);assert.equal(r.risks[0].rows[0].id,'a');
});
test('goal progress follows descendants across levels without counting subtasks or summing cancelled work',()=>{
 const r=build({items:[item('goal',{kind:'epic'}),item('a',{parentId:'goal',status:'done'}),item('b',{parentId:'goal',status:'cancelled'}),item('sub',{kind:'subtask',parentId:'a'}),item('loose')]});
 assert.equal(r.goals[0].total,2);assert.equal(r.goals[0].percent,100);assert.equal(r.goals[0].done,1);assert.equal(r.unlinked.length,1);
 const filtered=build({items:[item('goal',{kind:'epic'}),item('a',{parentId:'goal',owner:'乙'})],match:i=>i.owner==='甲'});assert.equal(filtered.goals[0].total,0);assert.equal(filtered.goals[0].percent,null);
});
test('cycle-corrupted ancestry terminates and does not produce duplicate execution counts',()=>{
 const r=build({items:[item('g',{kind:'epic',parentId:'h'}),item('h',{kind:'epic',parentId:'g'}),item('a',{parentId:'g'})]});assert.equal(r.goals[0].total,1);assert.equal(r.goals[1].total,1);
});
test('AI reports include subtask executions, exclude foreign projects and use first review before period end',()=>{
 const items=[item('a'),item('sub',{kind:'subtask',parentId:'a'})];
 const runs=[{id:'one',projectId:'p',itemId:'a',createdAt:at(1),submittedAt:at(2),status:'accepted',reviews:[{decision:'changes',at:at(3)},{decision:'accept',at:at(4)}]},{id:'two',projectId:'p',itemId:'sub',createdAt:at(2),submittedAt:at(3),status:'accepted',reviews:[{decision:'accept',at:at(9)}]},{id:'old',projectId:'p',itemId:'a',createdAt:new Date(2026,9,1).toISOString(),submittedAt:new Date(2026,9,2).toISOString(),status:'review'},{id:'foreign',projectId:'other',itemId:'a',createdAt:at(1),submittedAt:at(2),status:'accepted'}];
 const r=build({items,runs});assert.equal(r.ai.submissions.length,2);assert.equal(r.ai.decisions.length,1);assert.equal(r.ai.acceptance,0);assert.equal(r.ai.changes.length,1);assert.equal(r.ai.averageReviewDays,1);assert.equal(r.ai.pending.length,1);assert.equal(r.ai.records.length,2);assert.equal(r.ai.series.find(d=>d.date==='2026-11-04').accepted,1);
});
test('missing review timestamps never fabricate acceptance or wait duration; matching scopes executions by target',()=>{
 const r=build({items:[item('a'),item('b',{owner:'乙'})],runs:[{id:'one',projectId:'p',storyId:'a',status:'accepted',createdAt:at(1),submittedAt:at(2),reviews:[]},{id:'two',projectId:'p',itemId:'b',status:'review',submittedAt:at(3)}],match:i=>i.owner==='甲'});
 assert.equal(r.ai.submissions.length,1);assert.equal(r.ai.records.length,1);assert.equal(r.ai.acceptance,null);assert.equal(r.ai.averageReviewDays,null);assert.equal(r.ai.pending.length,0);
});
test('nested planning goals retain tree order even when input is reversed; execution totals are never summed across levels',()=>{
 const nested={...project,workConfig:defaultWorkConfig(true)};
 const r=build({project:nested,items:[item('story',{parentId:'feature',status:'done'}),item('feature',{kind:'feature',parentId:'epic'}),item('epic',{kind:'epic',parentId:'theme'}),item('theme',{kind:'theme'})]});
 assert.deepEqual(r.goals.map(g=>g.item.id),['theme','epic','feature']);assert.equal(r.rows.length,1);assert.ok(r.goals.every(g=>g.total===1&&g.percent===100));
});
test('future execution records do not appear in current pending counts',()=>{
 const r=build({items:[item('a')],runs:[{id:'future',projectId:'p',itemId:'a',createdAt:at(15),submittedAt:at(16),status:'review'}]});assert.equal(r.ai.pending.length,0);assert.equal(r.ai.records.length,0);
});

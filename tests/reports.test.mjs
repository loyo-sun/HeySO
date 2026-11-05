import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultWorkConfig} from '../shared/work-config.mjs';
import {buildReports,sprintReport,reportCycle,statusHistory,reportStatusAt,reportCsv,reportDays,DAY} from '../src/reports-model.mjs';
const project={id:'p',code:'HS',workConfig:defaultWorkConfig()},at=d=>new Date(2026,10,d,12).toISOString(),now=+new Date(2026,10,8,12);
const item=(id,patch={})=>({id,projectId:'p',kind:'story',number:1,title:id,status:'todo',createdAt:at(1),points:3,owner:'甲',...patch});
const event=(id,d,before,after)=>({itemId:id,at:at(d),changes:[{field:'status',before,after}]});
const build=opts=>buildReports({project,items:[],events:[],from:'2026-11-01',to:'2026-11-08',now,...opts});
test('reports exclude planning layers, subtasks and other projects and keep zero-point estimates',()=>{
 const data=build({items:[item('a',{points:0}),item('b',{kind:'subtask'}),item('c',{kind:'epic'}),item('d',{projectId:'other'}),item('e',{points:null})]});
 assert.deepEqual(data.rows.map(i=>i.id),['a','e']);assert.equal(data.unestimated,1);assert.equal(data.distribution('owner')[0].rows.length,2);
});
test('completed trends require a real completion date, exclude cancelled work and support owner filters',()=>{
 const data=build({items:[item('a',{status:'done',completedAt:at(3)}),item('b',{status:'done'}),item('c',{status:'cancelled',completedAt:at(3)}),item('d',{owner:'乙',status:'done',completedAt:at(4)})],owner:'甲'});
 assert.equal(data.completions.length,1);assert.equal(data.series.reduce((s,d)=>s+d.resolved,0),1);assert.equal(data.cycles.length,0);
});
test('cycle time sums active, blocked and review intervals across reopening, excluding time in todo',()=>{
 const i=item('a',{status:'done',completedAt:at(7)}),history=statusHistory([event('a',2,'todo','active'),event('a',3,'active','done'),event('a',4,'done','todo'),event('a',5,'todo','active'),event('a',6,'active','review'),event('a',7,'review','done')],'a');
 const result=reportCycle(i,history,project);assert.equal(result.days,3);assert.equal(result.leadDays,6);
 assert.equal(reportCycle(item('no-history',{status:'done',completedAt:at(7)}),[],project),null);
});
test('missing history is unknown in past periods rather than copying current status backwards',()=>{
 const i=item('a',{status:'active'});assert.equal(reportStatusAt(i,[],+new Date(at(3)),now),null);assert.equal(reportStatusAt(i,[],now,now),'active');
 const report=build({items:[i]});assert.equal(report.series[2].unknown,1);assert.equal(report.series.at(-1).active,1);
});
test('velocity uses final closed snapshots and startup commitment, never live reassigned values',()=>{
 const s={id:'s',status:'closed',name:'Sprint 1',completedAt:at(6),baseline:[{id:'a',points:5}],finalStories:[item('a',{points:8,status:'done'}),item('b',{points:2,status:'cancelled'})]};
 const data=build({items:[item('a',{points:100,status:'todo'})],sprints:[s,{id:'next',status:'active',baseline:[]}],unit:'points'});
 assert.equal(data.velocity.length,1);assert.equal(data.velocity[0].committed,5);assert.equal(data.velocity[0].completed,8);
});
test('burndown uses daily point snapshots, keeps future actual values empty and calculates scope changes',()=>{
 const a=item('a',{sprintId:'s',status:'done'}),b=item('b',{sprintId:'s',points:2});
 const sprint={id:'s',status:'active',startDate:'2026-11-01',endDate:'2026-11-10',baseline:[{id:'a',points:3,status:'todo'},{id:'removed',points:5,status:'todo'}],snapshots:[{at:at(1),date:'2026-11-01',total:8,remaining:8},{at:at(3),date:'2026-11-03',total:5,remaining:2}]};
 const r=sprintReport(sprint,[a,b],project,'points',()=>true,+new Date(at(4)));
 assert.equal(r.commitment,8);assert.equal(r.completed,3);assert.deepEqual(r.added.map(i=>i.id),['b']);assert.equal(r.removed[0].id,'removed');assert.equal(r.chart[3].remaining,2);assert.equal(r.chart[4].remaining,null);
 assert.equal(sprintReport(sprint,[a,b],project,'count').available,false);
});
test('released versions use published snapshots and CSV output escapes formulas, quotes and newlines',()=>{
 const data=build({items:[item('a',{releaseId:'r',status:'todo'})],releases:[{id:'r',name:'1.0',status:'released',publishedStories:[item('a',{releaseId:'r',status:'done',points:5})]}],unit:'points'});
 assert.equal(data.versions[0].done,5);
 const csv=reportCsv([[' =1+1','a"b','a\nb']],['one','two','three']);assert.ok(csv.includes("' =1+1"));assert.ok(csv.includes('a""b'));assert.ok(csv.startsWith('\uFEFF'));
 assert.equal(reportDays('2026-02-27','2026-03-01').length,3);assert.equal(reportDays('2026-11-02','2026-11-01').length,0);
});

test('average age uses each historical day, recently created cohorts retain completion outcome, and resolution uses lead time',()=>{
 const a=item('a',{status:'done',completedAt:at(3)}),b=item('b',{createdAt:at(2),status:'active'});
 const data=build({items:[a,b],events:[event('a',2,'todo','active'),event('a',3,'active','done'),event('b',2,'todo','active')]});
 const second=data.series.find(d=>d.date==='2026-11-02'),third=data.series.find(d=>d.date==='2026-11-03');
 assert.equal(second.ageSamples,2);assert.ok(Math.abs(second.averageAge-1)<.00001);assert.deepEqual(third.ageIds,['b']);
 assert.equal(third.resolution,2);assert.equal(data.series[0].createdResolved,1);assert.equal(data.series[0].createdUnresolved,0);
});
test('control chart rolling averages and standard deviation boundaries are finite for small and empty samples',async()=>{
 const {cycleControlSamples}=await import('../src/reports-model.mjs');
 const samples=cycleControlSamples([{days:1},{days:3},{days:5}]);
 assert.equal(samples[1].rolling,3);assert.ok(samples[1].upper>samples[1].rolling);assert.ok(samples.every(r=>r.lower>=0&&Number.isFinite(r.upper)));
 assert.deepEqual(cycleControlSamples([]),[]);
});

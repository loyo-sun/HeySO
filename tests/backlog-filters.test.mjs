import test from 'node:test';
import assert from 'node:assert/strict';
import {formatBacklogTimestamp} from '../src/backlog-columns.mjs';
import {filterBacklogRows,backlogFilterOptions} from '../src/backlog-filters.mjs';
const context={project:{code:'HS'}},rows=[{number:1,title:'修复登录',owner:'甲',status:'todo',points:0},{number:10,title:'登录验证',owner:'乙',status:'active',points:null},{number:105,title:'修复权限',owner:'甲',status:'active',points:3},{number:200,title:'导出',owner:null,status:'todo'}];
test('column filters combine with AND while selections within a column combine with OR',()=>{
 assert.deepEqual(filterBacklogRows(rows,{owner:['甲','乙'],status:['active']},context).map(i=>i.number),[10,105]);
 assert.deepEqual(filterBacklogRows(rows,{workItem:'hs-10',owner:['甲']},context).map(i=>i.number),[105]);
 assert.deepEqual(filterBacklogRows(rows,{workItem:'登录'},context).map(i=>i.number),[1,10]);
 assert.equal(filterBacklogRows(rows,{},context).length,4);
});
test('filter options preserve numeric zero and missing values and deduplicate display choices',()=>{
 assert.deepEqual(filterBacklogRows(rows,{points:['0']},context).map(i=>i.number),[1]);
 assert.deepEqual(filterBacklogRows(rows,{owner:['']},context).map(i=>i.number),[200]);
 const options=backlogFilterOptions(rows,'points',context);
 assert.equal(options.length,3);assert.ok(options.some(o=>o.value==='0'&&o.label==='0'));assert.ok(options.some(o=>o.value===''&&o.label==='未估算'));
});

test('date ranges include both endpoints and support one-sided limits',()=>{
 const dated=[{number:1,startDate:'2026-11-01'},{number:2,startDate:'2026-11-04'},{number:3,startDate:'2026-11-05'},{number:4}];
 assert.deepEqual(filterBacklogRows(dated,{startDate:{from:'2026-11-01',to:'2026-11-04'}},context).map(i=>i.number),[1,2]);
 assert.deepEqual(filterBacklogRows(dated,{startDate:{from:'2026-11-04',to:''}},context).map(i=>i.number),[2,3]);
});
test('time ranges compare instants and include all milliseconds of the ending second',()=>{
 const at=seconds=>new Date(2026,10,4,12,30,seconds).toISOString();
 const timed=[{number:1,createdAt:at(1)},{number:2,createdAt:at(2).replace('.000','.999')},{number:3,createdAt:at(3)},{number:4}];
 assert.deepEqual(filterBacklogRows(timed,{createdAt:{from:'2026-11-04T12:30:01',to:'2026-11-04T12:30:02'}},context).map(i=>i.number),[1,2]);
 assert.equal(formatBacklogTimestamp(at(1)),'2026-11-04 12:30:01');
});
test('filter choices come only from current matching rows',()=>{
 const current=filterBacklogRows(rows,{status:['active']},context);
 assert.deepEqual(backlogFilterOptions(current,'owner',context).map(o=>o.value).sort(),['乙','甲'].sort());
 assert.equal(backlogFilterOptions([], 'owner',context).length,0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeBacklogPrefs,moveBacklogColumn,sortBacklog} from '../src/backlog-columns.mjs';
test('column preferences always keep work item first, reject unknown fields and preserve order',()=>{
  assert.deepEqual(normalizeBacklogPrefs({columns:['owner','workItem','owner','bad','points'],sort:{key:'bad',direction:'asc'}}),{columns:['workItem','owner','points'],workItemWidth:400,sort:{key:'workItem',direction:'asc'}});
  assert.deepEqual(moveBacklogColumn(['workItem','owner','points'],'points','owner'),['workItem','points','owner']);
  assert.deepEqual(moveBacklogColumn(['workItem','owner'],'owner','workItem'),['workItem','owner']);
});
test('sorting supports numeric and text directions, stable ties, missing values last and immutable input',()=>{
  const rows=[{id:'a',points:10,owner:'乙'},{id:'b',points:2,owner:'甲'},{id:'c',points:null},{id:'d',points:2,owner:'甲'}],before=structuredClone(rows);
  assert.deepEqual(sortBacklog(rows,{key:'points',direction:'asc'},{}).map(x=>x.id),['b','d','a','c']);
  assert.deepEqual(sortBacklog(rows,{key:'points',direction:'desc'},{}).map(x=>x.id),['a','b','d','c']);
  assert.deepEqual(rows,before);
});

test('work item sorting uses numeric display IDs instead of titles',()=>{
  const rows=[{number:200,title:'A'},{number:10,title:'Z'},{number:105,title:'B'},{number:1,title:'Y'}];
  assert.deepEqual(sortBacklog(rows,{key:'workItem',direction:'asc'},{}).map(i=>i.number),[1,10,105,200]);
  assert.deepEqual(sortBacklog(rows,{key:'workItem',direction:'desc'},{}).map(i=>i.number),[200,105,10,1]);
});

test('drag insertion follows the indicated edge in both directions and keeps work item fixed',()=>{
 const columns=['workItem','status','owner','points'];
 assert.deepEqual(moveBacklogColumn(columns,'status','owner','before'),columns);
 assert.deepEqual(moveBacklogColumn(columns,'status','owner','after'),['workItem','owner','status','points']);
 assert.deepEqual(moveBacklogColumn(columns,'points','status','before'),['workItem','points','status','owner']);
 assert.deepEqual(moveBacklogColumn(columns,'points','status','after'),['workItem','status','points','owner']);
 assert.deepEqual(moveBacklogColumn(columns,'owner','workItem','before'),columns);
});

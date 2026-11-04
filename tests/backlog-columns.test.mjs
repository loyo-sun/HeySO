import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeBacklogPrefs,moveBacklogColumn,sortBacklog} from '../src/backlog-columns.mjs';
test('column preferences always keep work item first, reject unknown fields and preserve order',()=>{
  assert.deepEqual(normalizeBacklogPrefs({columns:['owner','workItem','owner','bad','points'],sort:{key:'bad',direction:'asc'}}),{columns:['workItem','owner','points'],sort:{key:'workItem',direction:'asc'}});
  assert.deepEqual(moveBacklogColumn(['workItem','owner','points'],'points','owner'),['workItem','points','owner']);
  assert.deepEqual(moveBacklogColumn(['workItem','owner'],'owner','workItem'),['workItem','owner']);
});
test('sorting supports numeric and text directions, stable ties, missing values last and immutable input',()=>{
  const rows=[{id:'a',points:10,owner:'乙'},{id:'b',points:2,owner:'甲'},{id:'c',points:null},{id:'d',points:2,owner:'甲'}],before=structuredClone(rows);
  assert.deepEqual(sortBacklog(rows,{key:'points',direction:'asc'},{}).map(x=>x.id),['b','d','a','c']);
  assert.deepEqual(sortBacklog(rows,{key:'points',direction:'desc'},{}).map(x=>x.id),['a','b','d','c']);
  assert.deepEqual(rows,before);
});

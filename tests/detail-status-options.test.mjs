import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultWorkConfig} from '../shared/work-config.mjs';
import {detailStatusOptions} from '../src/detail-status-options.mjs';

test('title status menu follows standard workflow transitions',()=>{
 const project={workConfig:defaultWorkConfig()};
 assert.deepEqual(detailStatusOptions(project,{kind:'epic',status:'todo'}).map(s=>s.id),['todo','active','done']);
});
test('title status menu cannot bypass human acceptance for stories or subtasks',()=>{
 const project={workConfig:defaultWorkConfig()};
 for(const kind of ['story','subtask']){
  project.workConfig.workflowScheme.typeMappings[kind]='delivery';
  const review=detailStatusOptions(project,{kind,status:'review'}).map(s=>s.id);
  assert.ok(review.includes('active'));assert.ok(review.includes('review'));assert.ok(!review.includes('done'));
  const active=detailStatusOptions(project,{kind,status:'active'}).map(s=>s.id);
  assert.ok(active.includes('review'));assert.ok(active.includes('blocked'));assert.ok(!active.includes('done'));
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../server/store.mjs';
import { context } from '../server/model.mjs';

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heyso-ai-target-'));
  t.after(() => fs.rmSync(dir, {recursive:true, force:true}));
  const store = createStore(path.join(dir, 'state.json'));
  const act = (type, payload) => store.dispatch({type,payload}).result;
  act('item.update', {id:'s6', aiEnabled:true});
  const parent = store.read().items.find(i => i.id === 's6');
  const child = act('item.create', {projectId:parent.projectId, kind:'subtask', parentId:parent.id, title:'目标子任务', startDate:parent.startDate, endDate:parent.endDate});
  const sibling = act('item.create', {projectId:parent.projectId, kind:'subtask', parentId:parent.id, title:'其他子任务', startDate:parent.startDate, endDate:parent.endDate});
  act('item.update', {id:child.id, status:'todo'});
  act('item.update', {id:sibling.id, status:'todo'});
  const args = {itemId:child.id, storyVersion:context(store.read(), child.id).story.contentVersion, agent:'test'};
  const status = id => store.read().items.find(i => i.id === id).status;
  return {store,act,parent,child,sibling,args,status};
}

test('subtask progress, blocking, delivery and human acceptance update the target without completing its parent', t => {
  const c = setup(t);
  let run = c.act('run.progress', {...c.args, status:'active', message:'开始'});
  assert.equal(c.status(c.child.id), 'active');
  assert.equal(c.status(c.sibling.id), 'todo');
  run = c.act('run.progress', {...c.args, runId:run.id, status:'blocked', message:'等待环境'});
  assert.equal(c.status(c.child.id), 'blocked');
  c.act('run.progress', {...c.args, runId:run.id, status:'active', message:'恢复'});
  const delivery = {...c.args, runId:run.id, summary:'实现完成', verification:'通过', requestId:'child-delivery'};
  c.act('run.submit', delivery);
  const ctx = context(c.store.read(), c.child.id);
  assert.equal(ctx.targetTask.status, 'review');
  assert.equal(ctx.story.status, 'review');
  assert.equal(c.act('run.submit', delivery).id, run.id);
  c.act('review', {storyId:c.parent.id, runId:run.id, decision:'changes', comment:'需要修改'});
  assert.equal(c.status(c.child.id), 'active');
  run = c.act('run.progress', {...c.args, message:'返工'});
  c.act('run.submit', {...delivery, runId:run.id, requestId:'child-delivery-2'});
  c.act('review', {storyId:c.parent.id, runId:run.id, decision:'accept', comment:'通过'});
  assert.equal(c.status(c.child.id), 'done');
  assert.equal(c.status(c.parent.id), 'active');
  assert.equal(c.status(c.sibling.id), 'todo');
});

test('run IDs and delivery request IDs cannot be reused for another child of the same parent', t => {
  const c = setup(t);
  const run = c.act('run.progress', {...c.args, message:'开始'});
  const before = c.store.read();
  for (const type of ['run.progress', 'run.submit']) assert.throws(() => c.act(type, {...c.args, itemId:c.sibling.id, runId:run.id, message:'错误', summary:'错误', verification:'错误', requestId:'wrong-target'}), /不属于当前工作项/);
  assert.deepEqual(c.store.read(), before);
  c.act('run.submit', {...c.args, runId:run.id, summary:'完成', verification:'通过', requestId:'delivery'});
  assert.throws(() => c.act('run.submit', {...c.args, itemId:c.sibling.id, summary:'错误', verification:'错误', requestId:'delivery'}), /其他工作项/);
});

test('missing target review node rejects delivery atomically instead of leaving a stale child', t => {
  const c = setup(t);
  const config = structuredClone(c.store.read().projects.find(p => p.id === c.parent.projectId).workConfig);
  const childFlow = structuredClone(config.workflows.find(w => w.id === config.workflowScheme.defaultWorkflowId));
  childFlow.id = 'childflow';
  childFlow.name = '无验收子任务流程';
  childFlow.rules.requireReview = false;
  delete childFlow.rules.nodes.review;
  config.workflows.push(childFlow);
  config.workflowScheme.typeMappings.subtask = childFlow.id;
  c.act('project.workConfig', {id:c.parent.projectId, config});
  c.args.storyVersion = context(c.store.read(), c.child.id).story.contentVersion;
  const run = c.act('run.progress', {...c.args, message:'开始'});
  const before = c.store.read();
  assert.throws(() => c.act('run.submit', {...c.args, runId:run.id, summary:'完成', verification:'通过', requestId:'missing-review'}), /协作节点.*review/);
  assert.deepEqual(c.store.read(), before);
});

test('cancelling a child run resets that child and preserves sibling states', t => {
  const c = setup(t);
  const run = c.act('run.progress', {...c.args, message:'开始'});
  c.act('run.cancel', {id:run.id});
  assert.equal(c.status(c.child.id), 'todo');
  assert.equal(c.status(c.sibling.id), 'todo');
});

test('progress retries reuse the run without duplicating progress or changing another target', t => {
  const c = setup(t);
  const payload = {...c.args, message:'开始', requestId:'progress-1'};
  const run = c.act('run.progress', payload);
  assert.equal(c.act('run.progress', payload).id, run.id);
  assert.equal(c.store.read().runs.find(r => r.id === run.id).progress.length, 1);
  assert.throws(() => c.act('run.progress', {...payload, itemId:c.sibling.id}), /其他工作项/);
  assert.throws(() => c.act('run.submit', {...payload, summary:'完成', verification:'通过'}), /其他操作/);
});

test('accepting one child keeps another pending child available for review', t => {
  const c = setup(t);
  const deliver = (itemId, requestId) => c.act('run.submit', {...c.args, itemId, summary:'完成', verification:'通过', requestId});
  const first = deliver(c.child.id, 'first');
  const second = deliver(c.sibling.id, 'second');
  c.act('review', {storyId:c.parent.id, runId:first.id, decision:'accept', comment:'通过第一个'});
  assert.equal(c.status(c.child.id), 'done');
  assert.equal(c.status(c.sibling.id), 'review');
  assert.equal(c.status(c.parent.id), 'review');
  c.act('review', {storyId:c.parent.id, runId:second.id, decision:'accept', comment:'通过第二个'});
  assert.equal(c.status(c.sibling.id), 'done');
  assert.equal(c.status(c.parent.id), 'active');
});

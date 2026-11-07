import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {seed} from '../server/model.mjs';
import {createStore} from '../server/store.mjs';

function setup(t, configure = () => {}) {
  const state = seed(), project = state.projects[0];
  configure(project.workConfig);
  if (project.workConfig.workflowScheme.typeMappings.subtask === 'child') {
    for (const item of state.items.filter(i => i.kind === 'subtask')) item.status = 'todo';
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heyso-completion-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const file = path.join(dir, 'state.json');
  fs.writeFileSync(file, JSON.stringify(state));
  const store = createStore(file);
  const act = (type, payload) => store.dispatch({type, payload}).result;
  const make = (kind, extra = {}) => {
    const item = act('item.create', {projectId: project.id, kind, title: kind, ...extra});
    if (extra.status === 'done') {
      act('item.update', {id: item.id, status: 'review'});
      act('review', {storyId: item.id, decision: 'accept', comment: '已完成'});
    } else if (extra.status && item.status !== extra.status) act('item.update', {id: item.id, status: extra.status});
    if (extra.aiEnabled) act('item.update', {id: item.id, aiEnabled: true});
    return store.read().items.find(i => i.id === item.id);
  };
  const submit = item => act('run.submit', {itemId: item.id, storyVersion: store.read().items.find(i => i.id === (item.kind === 'subtask' ? item.parentId : item.id)).contentVersion, agent: 'test', summary: '交付', verification: '验证', requestId: 'delivery-' + item.id});
  const review = (item, run, decision = 'accept') => act('review', {storyId: item.id, ...(run ? {runId: run.id} : {}), decision, comment: '已检查'});
  return {store, act, make, submit, review, item: id => store.read().items.find(i => i.id === id)};
}

for (const kind of ['story', 'task', 'bug', 'research']) {
  test(`AI ${kind}: only human acceptance completes all direct subtasks and records attribution`, t => {
    const x = setup(t, c => c.types.push({id: 'research', name: '调研', level: 0, enabled: true}));
    const parent = x.make(kind, {aiEnabled: true});
    const children = ['todo', 'active', 'blocked', 'review', 'cancelled', 'done'].map(status => x.make('subtask', {parentId: parent.id, status}));
    const other = x.make('task', {aiEnabled: true});
    const unrelated = x.make('subtask', {parentId: other.id, status: 'todo'});
    const before = children.map(c => x.item(c.id));
    const run = x.submit(parent);
    assert.deepEqual(children.map(c => x.item(c.id)), before);
    x.review(parent, run, 'changes');
    assert.deepEqual(children.map(c => x.item(c.id)), before);
    const next = x.act('run.submit', {itemId: parent.id, storyVersion: x.item(parent.id).contentVersion, agent: 'test', summary: '修订', verification: '通过', requestId: 'retry-' + parent.id});
    x.review(parent, next);
    assert.equal(x.item(parent.id).status, 'done');
    for (const child of children.slice(0, -1)) {
      const completed = x.item(child.id);
      assert.equal(completed.status, 'done');
      assert.ok(completed.completedAt);
      assert.equal(completed.contentVersion, child.contentVersion);
      const event = x.store.read().events.find(e => e.itemId === child.id && e.triggerRunId === next.id);
      assert.equal(event.actor, '我');
      assert.equal(event.triggerItemId, parent.id);
      assert.ok(event.changes.some(c => c.field === 'status' && c.after === 'done'));
    }
    assert.deepEqual(x.item(children.at(-1).id), before.at(-1));
    assert.equal(x.item(unrelated.id).status, 'todo');
    const accepted = x.store.read();
    assert.throws(() => x.review(parent, next), /已结束/);
    assert.deepEqual(x.store.read(), accepted);
  });
}

test('subtask acceptance preserves parent, siblings and their execution records', t => {
  const x = setup(t), parent = x.make('task', {aiEnabled: true});
  const child = x.make('subtask', {parentId: parent.id});
  const sibling = x.make('subtask', {parentId: parent.id, status: 'todo'});
  const parentRun = x.submit(parent), childRun = x.submit(child);
  const beforeParent = x.item(parent.id), beforeRuns = x.store.read().runs.filter(r => r.id !== childRun.id);
  x.review(child, childRun);
  const acceptedChildRun = x.store.read().runs.find(r => r.id === childRun.id);
  assert.equal(x.item(child.id).status, 'done');
  assert.deepEqual(x.item(parent.id), beforeParent);
  assert.equal(x.item(sibling.id).status, 'todo');
  assert.deepEqual(x.store.read().runs.filter(r => r.id !== childRun.id), beforeRuns);
  x.review(parent, parentRun);
  assert.equal(x.item(sibling.id).status, 'done');
  assert.deepEqual(x.store.read().runs.find(r => r.id === childRun.id), acceptedChildRun);
});

test('manual delivery acceptance does not cascade and AI parent acceptance preserves independent child runs', t => {
  const x = setup(t), manual = x.make('task'), child = x.make('subtask', {parentId: manual.id, status: 'todo'});
  x.act('item.update', {id: manual.id, status: 'review'});
  x.review(manual);
  assert.equal(x.item(child.id).status, 'todo');
  const parent = x.make('task', {aiEnabled: true}), aiChild = x.make('subtask', {parentId: parent.id});
  const childRun = x.submit(aiChild), parentRun = x.submit(parent);
  const before = x.store.read().runs.find(r => r.id === childRun.id);
  x.review(parent, parentRun);
  assert.equal(x.item(aiChild.id).status, 'done');
  assert.deepEqual(x.store.read().runs.find(r => r.id === childRun.id), before);
});

test('custom subtask workflow uses its own done node without requiring intermediate child transitions', t => {
  const x = setup(t, c => {
    c.statuses.push({id: 'child_done', name: '子项完成', category: 'done', enabled: true});
    c.workflows.push({id: 'child', name: '子项', statusIds: ['todo', 'child_done'], initialStatus: 'todo', rules: {requireReview: false, nodes: {todo: 'todo', done: 'child_done'}}, transitions: []});
    c.workflowScheme.typeMappings.subtask = 'child';
  });
  const parent = x.make('task', {aiEnabled: true}), child = x.make('subtask', {parentId: parent.id});
  x.review(parent, x.submit(parent));
  assert.equal(x.item(child.id).status, 'child_done');
});

test('missing child completion node rejects acceptance atomically', t => {
  const x = setup(t, c => {
    c.workflows.push({id: 'child', name: '子项', statusIds: ['todo'], initialStatus: 'todo', rules: {requireReview: false, nodes: {todo: 'todo'}}, transitions: []});
    c.workflowScheme.typeMappings.subtask = 'child';
  });
  const parent = x.make('task', {aiEnabled: true});
  x.make('subtask', {parentId: parent.id});
  const run = x.submit(parent), before = x.store.read();
  assert.throws(() => x.review(parent, run), /没有配置完成节点/);
  assert.deepEqual(x.store.read(), before);
});

test('ordinary reacceptance of the same AI delivery completes reopened children and preserves run history', t => {
  const x = setup(t), parent = x.make('story', {aiEnabled: true});
  const child = x.make('subtask', {parentId: parent.id});
  const run = x.submit(parent);
  x.review(parent, run);
  x.act('item.update', {id: parent.id, status: 'todo'});
  x.act('item.update', {id: child.id, status: 'todo'});
  const beforeRuns = x.store.read().runs;
  x.act('item.update', {id: parent.id, status: 'review'});
  x.review(parent);
  assert.equal(x.item(parent.id).status, 'done');
  assert.equal(x.item(child.id).status, 'done');
  assert.deepEqual(x.store.read().runs, beforeRuns);
  const event = x.store.read().events.find(e => e.itemId === child.id && e.triggerRunId === run.id);
  assert.ok(event.triggerReviewId);
});

test('ordinary acceptance cannot reuse AI delivery evidence from an older content version', t => {
  const x = setup(t), parent = x.make('story', {aiEnabled: true});
  const child = x.make('subtask', {parentId: parent.id});
  x.review(parent, x.submit(parent));
  x.act('item.update', {id: parent.id, status: 'todo', description: 'Changed scope'});
  x.act('item.update', {id: child.id, status: 'todo'});
  x.act('item.update', {id: parent.id, status: 'review'});
  x.review(parent);
  assert.equal(x.item(child.id).status, 'todo');
});

test('AI permission alone is not AI delivery evidence for ordinary acceptance', t => {
  const x = setup(t), parent = x.make('story', {aiEnabled: true});
  const child = x.make('subtask', {parentId: parent.id, status: 'todo'});
  x.act('item.update', {id: parent.id, status: 'review'});
  x.review(parent);
  assert.equal(x.item(child.id).status, 'todo');
});

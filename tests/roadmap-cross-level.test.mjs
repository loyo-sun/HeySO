import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createStore} from '../server/store.mjs';
import {context} from '../server/model.mjs';
import {roadmapMovePlan,roadmapTreeSnapshot,roadmapDropPosition} from '../shared/roadmap-order.mjs';
import {roadmapPlanRows} from '../src/roadmap-model.mjs';

function setup(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'heyso-cross-level-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'state.json'),store=createStore(file);
  const act=(type,payload)=>store.dispatch({type,payload}).result;
  const project=store.read().projects[0],make=(kind,parentId=null,extra={})=>act('item.create',{projectId:project.id,kind,title:kind,parentId,...extra});
  const epic=make('epic'),otherEpic=make('epic'),story=make('story',epic.id),otherStory=make('story',otherEpic.id),task=make('task',epic.id),child=make('subtask',story.id);
  const read=id=>store.read().items.find(i=>i.id===id);
  const payload=(source,target,position)=>({projectId:project.id,id:source.id,targetId:target.id,position,expectedTree:roadmapTreeSnapshot(store.read().items,store.read().projects[0])});
  const move=(source,target,position)=>act('item.roadmap.move',payload(source,target,position));
  return {file,store,act,project,make,epic,otherEpic,story,otherStory,task,child,read,payload,move};
}

test('drop middle nests; top/bottom edges insert before/after',()=>{
  assert.equal(roadmapDropPosition(2,36),'before');
  assert.equal(roadmapDropPosition(18,36),'inside');
  assert.equal(roadmapDropPosition(34,36),'after');
});

test('peer task moves into story as a subtask with stable identity, history and status; reload retains hierarchy',t=>{
  const x=setup(t);
  x.act('item.update',{id:x.task.id,aiEnabled:true});
  const run=x.act('run.submit',{itemId:x.task.id,storyVersion:x.read(x.task.id).contentVersion,agent:'test',summary:'交付',verification:'验证',requestId:'cross-run'});
  const before=x.read(x.task.id),parentBefore=x.read(x.story.id);
  x.move(x.task,x.story,'inside');
  const persisted=createStore(x.file).read(),moved=persisted.items.find(i=>i.id===x.task.id);
  assert.equal(moved.kind,'subtask');assert.equal(moved.parentId,x.story.id);
  assert.equal(moved.number,before.number);assert.equal(moved.status,'review');assert.equal(moved.sprintId,null);
  assert.equal(moved.contentVersion,before.contentVersion+1);
  assert.equal(persisted.items.find(i=>i.id===x.story.id).contentVersion,parentBefore.contentVersion+1);
  assert.deepEqual(persisted.runs.find(r=>r.id===run.id),run);
  assert.ok(context(persisted,x.task.id).tasks.some(i=>i.id===x.task.id));
  assert.equal(context(persisted,x.task.id).targetTask.id,x.task.id);
  const rows=roadmapPlanRows(persisted.items,x.project,{collapsed:new Set()},10,-1);
  assert.equal(rows.find(r=>r.item.id===x.task.id).depth,rows.find(r=>r.item.id===x.story.id).depth+1);
  assert.ok(persisted.events.find(e=>e.itemId===x.task.id)?.changes.some(c=>c.field==='parentId'));
  const states=persisted.items.filter(i=>![x.task.id,x.story.id].includes(i.id));
  assert.equal(states.find(i=>i.id===x.child.id).parentId,x.story.id);
});

test('child task drags out before its story and recovers a standalone task with inherited sprint',t=>{
  const x=setup(t),sp=x.store.read().sprints.find(s=>s.status==='active');
  x.act('item.update',{id:x.story.id,sprintId:sp.id});
  const before=x.read(x.child.id);
  x.move(x.child,x.story,'before');
  const moved=x.read(x.child.id);
  assert.equal(moved.kind,'task');assert.equal(moved.parentId,x.epic.id);
  assert.equal(moved.sprintId,sp.id);assert.equal(moved.id,before.id);assert.equal(moved.number,before.number);
  const rows=roadmapPlanRows(createStore(x.file).read().items,x.project,{collapsed:new Set()},10,-1).map(r=>r.item.id);
  assert.equal(rows.indexOf(x.child.id)+1,rows.indexOf(x.story.id));
  assert.equal(context(x.store.read(),x.child.id).targetTask,null);
  assert.ok(x.store.read().sprints.find(s=>s.id===sp.id).scopeChanges.some(c=>c.storyId===x.child.id&&c.action==='加入'));
});

test('moving a story between epics keeps its entire subtree; moving subtasks between stories invalidates both parents',t=>{
  const x=setup(t),beforeChild=x.read(x.child.id);
  x.move(x.story,x.otherEpic,'inside');
  assert.equal(x.read(x.story.id).parentId,x.otherEpic.id);
  assert.equal(x.read(x.child.id).parentId,x.story.id);assert.equal(x.read(x.child.id).kind,beforeChild.kind);
  const oldParent=x.read(x.story.id),newParent=x.read(x.otherStory.id);
  x.move(x.child,x.otherStory,'inside');
  assert.equal(x.read(x.child.id).parentId,x.otherStory.id);
  assert.equal(x.read(x.story.id).contentVersion,oldParent.contentVersion+1);
  assert.equal(x.read(x.otherStory.id).contentVersion,newParent.contentVersion+1);
});

test('subtask can drag out to root; a task with children cannot be flattened into a subtask',t=>{
  const x=setup(t),root=x.make('story');
  x.move(x.child,root,'after');
  assert.equal(x.read(x.child.id).kind,'task');assert.equal(x.read(x.child.id).parentId,null);
  x.make('subtask',x.task.id);
  const before=x.store.read();assert.throws(()=>x.move(x.task,x.story,'inside'),/含有子项/);assert.deepEqual(x.store.read(),before);
});

test('date violations, cycles, cross-project moves, stale versions/order and illegal type nesting are atomic',t=>{
  const x=setup(t),short=x.make('story',x.epic.id,{startDate:x.project.startDate,endDate:x.project.startDate});
  x.act('item.update',{id:x.task.id,startDate:x.project.startDate,endDate:x.project.endDate});
  let before=x.store.read();
  for(const operation of [()=>x.move(x.task,short,'inside'),()=>x.move(x.epic,x.child,'inside'),()=>x.move(x.story,x.story,'inside'),()=>x.move(x.story,x.otherStory,'inside'),()=>x.act('item.roadmap.move',{...x.payload(x.task,x.story,'inside'),projectId:'wrong'})]) {
    assert.throws(operation);assert.deepEqual(x.store.read(),before);
  }
  const stale=x.payload(x.task,x.story,'inside');x.act('item.update',{id:x.story.id,title:'并发修改'});before=x.store.read();
  assert.throws(()=>x.act('item.roadmap.move',stale),/已有更新/);assert.deepEqual(x.store.read(),before);
  const p=x.act('project.create',{name:'另一个项目',goal:'测试隔离',startDate:x.project.startDate,endDate:x.project.endDate}),foreign=x.act('item.create',{projectId:p.id,title:'外部'});
  before=x.store.read();assert.throws(()=>x.move(x.task,foreign,'inside'),/当前项目/);assert.deepEqual(x.store.read(),before);
});

test('converting to a subtask removes separate sprint membership and preserves dates, assignment and points',t=>{
  const x=setup(t),sp=x.store.read().sprints.find(s=>s.status==='active');
  x.act('item.update',{id:x.task.id,sprintId:sp.id,owner:x.project.owner,points:3,startDate:x.project.startDate,endDate:x.project.endDate});
  const before=x.read(x.task.id);x.move(x.task,x.story,'inside');
  const moved=x.read(x.task.id);
  assert.equal(moved.sprintId,null);
  for(const key of ['owner','points','startDate','endDate','status','releaseId'])assert.equal(moved[key],before[key]);
  assert.ok(x.store.read().sprints.find(s=>s.id===sp.id).scopeChanges.some(c=>c.storyId===x.task.id&&c.action==='移出'));
});

test('custom workflow without matching blocked stage refuses type conversion instead of silently changing state',t=>{
  const x=setup(t),c=structuredClone(x.store.read().projects[0].workConfig);
  c.workflowScheme.typeMappings.subtask='standard';
  x.act('project.workConfig',{id:x.project.id,config:c,statusMigration:{backlog:'todo',review:'active',blocked:'active'}});
  x.act('item.update',{id:x.task.id,status:'blocked'});
  const before=x.store.read();
  assert.throws(()=>x.move(x.task,x.story,'inside'),/对应状态/);assert.deepEqual(x.store.read(),before);
  const latest=x.store.read();
  assert.match(roadmapMovePlan(latest.projects[0],latest.items,x.read(x.task.id),x.read(x.story.id),'inside').error,/对应状态/);
});

test('drop preflight returns a reason for forbidden hierarchy and date moves without modifying data',t=>{
  const x=setup(t);
  x.act('item.update',{id:x.story.id,startDate:x.project.startDate,endDate:x.project.startDate});
  x.act('item.update',{id:x.task.id,startDate:x.project.startDate,endDate:x.project.endDate});
  const before=x.store.read(),plan=(source,target)=>roadmapMovePlan(before.projects[0],before.items,x.read(source.id),x.read(target.id),'inside');
  assert.match(plan(x.task,x.story).error,/计划日期/);
  assert.match(plan(x.story,x.story).error,/其他工作项/);
  assert.match(plan(x.epic,x.child).error,/自身或自己的子项/);
  assert.match(plan(x.story,x.otherStory).error,/不能放入/);
  assert.deepEqual(x.store.read(),before);
});

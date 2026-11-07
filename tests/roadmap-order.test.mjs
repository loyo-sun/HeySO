import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createStore} from '../server/store.mjs';
import {roadmapSiblings, reorderedSiblingIds} from '../shared/roadmap-order.mjs';
import {roadmapPlanRows} from '../src/roadmap-model.mjs';

function setup(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'heyso-roadmap-order-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'workspace.json'),store=createStore(file);
  const act=(type,payload)=>store.dispatch({type,payload}).result;
  const project=store.read().projects[0];
  const make=(kind,parentId=null)=>act('item.create',{projectId:project.id,kind,title:kind,parentId});
  const parent=make('epic'),other=make('epic');
  const a=make('story',parent.id),child=make('subtask',a.id),b=make('task',parent.id),c=make('bug',parent.id),outside=make('task',other.id);
  const payload=(item,target,position='before')=>({id:item.id,projectId:project.id,targetId:target.id,position,expectedSiblingIds:roadmapSiblings(store.read().items,item).map(i=>i.id)});
  return {file,store,act,project,parent,other,a,b,c,child,outside,make,payload};
}

test('sibling ordering supports before/after and treats invalid or unchanged moves as no-ops',()=>{
  const siblings=['a','b','c'].map(id=>({id}));
  assert.deepEqual(reorderedSiblingIds(siblings,'c','a','before'),['c','a','b']);
  assert.deepEqual(reorderedSiblingIds(siblings,'a','c','after'),['b','c','a']);
  for(const [id,target,position] of [['a','a','before'],['a','b','before'],['a','missing','after'],['a','b','invalid']]) assert.equal(reorderedSiblingIds(siblings,id,target,position),null);
});

test('manual order persists, carries the subtree in rendering, and changes neither hierarchy nor planning',t=>{
  const x=setup(t),before=x.store.read(),itemBefore=before.items.find(i=>i.id===x.c.id);
  x.act('item.reorder',x.payload(x.c,x.a));
  const saved=createStore(x.file).read();
  assert.deepEqual(roadmapSiblings(saved.items,x.a).map(i=>i.id),[x.c.id,x.a.id,x.b.id]);
  const rows=roadmapPlanRows(saved.items,x.project,{collapsed:new Set()},10,-1).map(r=>r.item.id);
  assert.deepEqual(rows.slice(rows.indexOf(x.parent.id),rows.indexOf(x.parent.id)+5),[x.parent.id,x.c.id,x.a.id,x.child.id,x.b.id]);
  for(const item of before.items) {
    const next=saved.items.find(i=>i.id===item.id);
    assert.deepEqual({...next,updatedAt:item.updatedAt},item);
  }
  assert.equal(saved.items.find(i=>i.id===x.c.id).contentVersion,itemBefore.contentVersion);
  assert.deepEqual(saved.runs,before.runs);
  const event=saved.events.find(e=>e.itemId===x.c.id&&e.title==='调整线路图顺序');
  assert.equal(event.actor,'我');assert.deepEqual(event.changes.map(c=>[c.before,c.after]),[[3,1]]);
  // Inline insertion still follows the manually ordered source.
  const created=x.act('item.create',{projectId:x.project.id,kind:'task',title:'插入',parentId:x.parent.id,afterId:x.c.id});
  assert.deepEqual(roadmapSiblings(x.store.read().items,x.a).map(i=>i.id),[x.c.id,created.id,x.a.id,x.b.id]);
});

test('root and subtask order can be changed without moving other projects or sibling groups',t=>{
  const x=setup(t),secondChild=x.make('subtask',x.a.id),before=x.store.read();
  x.act('item.reorder',x.payload(secondChild,x.child));
  x.act('item.reorder',x.payload(x.other,x.parent));
  const saved=x.store.read();
  assert.deepEqual(roadmapSiblings(saved.items,x.child).map(i=>i.id),[secondChild.id,x.child.id]);
  const roots=roadmapSiblings(saved.items,x.parent).map(i=>i.id);
  assert.equal(roots.indexOf(x.other.id)+1,roots.indexOf(x.parent.id));
  assert.deepEqual(roadmapSiblings(saved.items,x.a).map(i=>i.id),[x.a.id,x.b.id,x.c.id]);
  const foreign=before.items.filter(i=>i.projectId!==x.project.id);
  assert.deepEqual(saved.items.filter(i=>i.projectId!==x.project.id),foreign);
});

test('stale order, insertion, reparenting, cross-parent, cross-project and invalid positions reject atomically',t=>{
  const x=setup(t),stale=x.payload(x.c,x.a);
  x.act('item.reorder',x.payload(x.b,x.a));
  let before=x.store.read();
  assert.throws(()=>x.act('item.reorder',stale),/已有更新/);assert.deepEqual(x.store.read(),before);
  const beforeInsert=x.payload(x.c,x.a);x.make('story',x.parent.id);before=x.store.read();
  assert.throws(()=>x.act('item.reorder',beforeInsert),/已有更新/);assert.deepEqual(x.store.read(),before);
  for(const invalid of [x.payload(x.a,x.outside),{...x.payload(x.c,x.a),projectId:'other'},{...x.payload(x.c,x.a),position:'invalid'},{...x.payload(x.c,x.a),expectedSiblingIds:undefined},{...x.payload(x.c,x.a),targetId:'missing'}]) {
    assert.throws(()=>x.act('item.reorder',invalid));assert.deepEqual(x.store.read(),before);
  }
  const beforeMove=x.payload(x.c,x.a);
  x.act('item.update',{id:x.c.id,parentId:x.other.id});before=x.store.read();
  assert.throws(()=>x.act('item.reorder',beforeMove),/同一父级/);assert.deepEqual(x.store.read(),before);
});

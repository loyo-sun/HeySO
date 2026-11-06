import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createStore} from '../server/store.mjs';
import {act, seed, context} from '../server/model.mjs';
import {projectFile, readProjectFile} from '../server/project-file.mjs';
import {memoryHistory} from '../shared/memory.mjs';

const dispatch = (state, type, payload, actor='测试成员')=>act(state,{type,payload,actor});
function fixture() {
  const state=seed(), projectId=state.projects[0].id;
  const note=dispatch(state,'note.create',{projectId,title:'技术栈',body:'旧内容',type:'context'});
  return {state,projectId,note};
}
test('memory keeps attributed immutable snapshots; MCP receives only current active content',()=>{
  const {state,projectId,note}=fixture(), item=state.items.find(i=>i.projectId===projectId&&i.kind==='story');
  const original=structuredClone(note.history[0]);
  dispatch(state,'note.update',{projectId,id:note.id,expectedVersion:1,title:'架构决定',body:'新内容',type:'decision'},'另一位成员');
  assert.deepEqual(note.history[0],original);
  assert.deepEqual(note.history.map(h=>h.operation),['create','update']);
  assert.equal(note.history[1].actor,'另一位成员');
  assert.equal(note.history[1].body,'新内容');
  assert.equal(note.author,'测试成员');
  const memory=context(state,item.id).memory.find(n=>n.id===note.id);
  assert.equal(memory.body,'新内容');assert.equal(memory.history,undefined);
  dispatch(state,'note.delete',{projectId,id:note.id,expectedVersion:2});
  assert.equal(note.history[2].operation,'delete');assert.equal(note.deletedBy,'测试成员');
  assert.equal(context(state,item.id).memory.some(n=>n.id===note.id),false);
  assert.throws(()=>dispatch(state,'note.update',{projectId,id:note.id,expectedVersion:3,title:'恢复',body:'内容',type:'context'}),/已删除/);
  assert.throws(()=>dispatch(state,'note.delete',{projectId,id:note.id,expectedVersion:3}),/已删除/);
});
test('stale versions, wrong projects and invalid edits cannot overwrite a memory',()=>{
  const {state,projectId,note}=fixture(), before=structuredClone(note);
  const payload={projectId,id:note.id,expectedVersion:1,title:'标题',body:'内容',type:'context'};
  for(const [patch,pattern] of [[{expectedVersion:0},/已有更新/],[{expectedVersion:undefined},/已有更新/],[{projectId:'other'},/不存在/],[{body:'  '},/内容/],[{title:''},/标题/],[{type:'invalid'},/类型/]]){
    assert.throws(()=>dispatch(state,'note.update',{...payload,...patch}),pattern);assert.deepEqual(note,before);
  }
  assert.throws(()=>dispatch(state,'note.delete',{...payload,expectedVersion:0}),/已有更新/);
  dispatch(state,'note.update',{...payload,title:note.title,body:note.body});
  assert.equal(note.history.length,1);assert.equal(note.contentVersion,1);
  assert.throws(()=>dispatch(state,'note.create',{projectId:'other',title:'标题',body:'内容'}),/项目不存在/);
  assert.throws(()=>dispatch(state,'note.create',{projectId,title:'标题',body:'内容',type:'invalid'}),/类型/);
});
test('legacy memories retain original content when first edited or deleted; project files preserve history',()=>{
  for(const operation of ['note.update','note.delete']){
    const state=seed(), legacy=state.notes[0], original=structuredClone(legacy);
    assert.equal(legacy.history,undefined);assert.equal(memoryHistory(legacy)[0].body,original.body);
    dispatch(state,operation,{projectId:legacy.projectId,id:legacy.id,expectedVersion:1,title:'新标题',body:'新内容',type:'context'});
    assert.equal(legacy.history.length,2);assert.equal(legacy.history[0].body,original.body);
    assert.equal(legacy.history[0].actor,original.author);
    const roundtrip=readProjectFile(JSON.parse(JSON.stringify(projectFile(state,legacy.projectId))));
    assert.deepEqual(roundtrip.workspace.notes.find(n=>n.id===legacy.id),legacy);
  }
});
test('saved memory history and deletion survive server restart',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'heyso-memory-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'workspace.json'),store=createStore(file),projectId=store.read().projects[0].id;
  const note=store.dispatch({type:'note.create',payload:{projectId,title:'栈',body:'React'}}).result;
  store.dispatch({type:'note.update',payload:{projectId,id:note.id,expectedVersion:1,title:'栈',body:'React 19',type:'context'}});
  store.dispatch({type:'note.delete',payload:{projectId,id:note.id,expectedVersion:2}});
  const saved=createStore(file).read().notes.find(n=>n.id===note.id);
  assert.ok(saved.deletedAt);assert.deepEqual(saved.history.map(h=>h.body),['React','React 19','React 19']);
});

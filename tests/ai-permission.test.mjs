import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,act} from '../server/model.mjs';
import {aiExecutionEnabled} from '../shared/work-config.mjs';
test('a child can revoke inherited AI permission without changing its parent, and changes retain actor and time',()=>{
  const state=seed(),child=state.items.find(i=>i.id==='t3'),parent=state.items.find(i=>i.id===child.parentId);
  assert.equal(aiExecutionEnabled(child,state.items),true);
  act(state,{type:'item.update',actor:'测试负责人',payload:{id:child.id,aiEnabled:false}});
  assert.equal(child.aiDisabled,true);assert.equal(parent.aiEnabled,true);assert.equal(aiExecutionEnabled(child,state.items),false);
  const event=state.events.find(e=>e.itemId===child.id&&e.changes?.some(c=>c.field==='aiEnabled'));
  assert.equal(event.actor,'测试负责人');assert.ok(Number.isFinite(Date.parse(event.at)));assert.equal(event.changes.find(c=>c.field==='aiEnabled').afterText,'关闭');
  const payload={itemId:child.id,storyVersion:parent.contentVersion,itemVersion:child.contentVersion,agent:'Test AI',message:'权限验证',status:'active'};
  assert.throws(()=>act(state,{type:'run.progress',payload}),e=>e.status===403);
  act(state,{type:'item.update',payload:{id:child.id,aiEnabled:true}});assert.equal(aiExecutionEnabled(child,state.items),true);
  act(state,{type:'run.progress',payload:{...payload,storyVersion:parent.contentVersion,itemVersion:child.contentVersion}});
  assert.equal(state.events[0].actor,'Test AI');
});

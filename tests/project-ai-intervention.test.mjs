import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createStore} from '../server/store.mjs';
import {context} from '../server/model.mjs';
import {aiExecutionEnabled} from '../shared/work-config.mjs';
function setup(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'heyso-ai-mode-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const store=createStore(path.join(dir,'workspace.json'));
  const act=(type,payload)=>store.dispatch({type,payload}).result;
  const initialRuns=store.read().runs.length;
  const project=()=>store.read().projects[0];
  const create=(kind,parentId)=>act('mcp.item.create',{projectId:project().id,kind,parentId,title:'test '+kind,agent:'test',expectedRevision:store.read().revision,requestId:crypto.randomUUID()});
  return {store,act,project,create,initialRuns};
}
test('manual mode permits epic children, edits and reparenting without enabling or executing AI',t=>{
  const x=setup(t),epic=x.create('epic'),other=x.create('epic'),task=x.create('task',epic.id);
  assert.equal(x.project().aiIntervention,'manual');
  assert.equal(task.aiEnabled,false);
  assert.equal(x.store.read().runs.length,x.initialRuns);
  const args={projectId:x.project().id,itemId:task.id,expectedRevision:x.store.read().revision,requestId:'edit',agent:'test',patch:{title:'edited',parentId:other.id}};
  const result=x.act('mcp.item.update',args);
  assert.equal(result.title,'edited');assert.equal(result.parentId,other.id);assert.equal(result.aiEnabled,false);
  const progress={itemId:task.id,storyVersion:result.contentVersion,agent:'test',message:'start'};
  assert.throws(()=>x.act('run.progress',progress),e=>e.code==='AI_EXECUTION_DISABLED');
  const before=x.store.read();
  assert.throws(()=>x.create('epic',task.id),e=>e.code==='INVALID_HIERARCHY');
  assert.throws(()=>x.create('subtask',epic.id),e=>e.code==='INVALID_HIERARCHY');
  assert.deepEqual(x.store.read(),before);
  assert.equal(x.act('mcp.item.update',args).id,task.id);
  assert.throws(()=>x.act('mcp.item.update',{...args,requestId:'stale'}),e=>e.code==='VERSION_CONFLICT');
  assert.deepEqual(x.store.read().items.find(i=>i.id===task.id),result);
});
test('all grants every type including epics, custom planning and subtasks, with no automatic runs',t=>{
  const x=setup(t),epic=x.create('epic'),task=x.create('task',epic.id),child=x.create('subtask',task.id);
  const config=structuredClone(x.project().workConfig);
  config.types.push({id:'initiative',name:'倡议',level:1,enabled:true});
  x.act('project.workConfig',{id:x.project().id,config});
  const custom=x.create('initiative');
  x.act('project.update',{id:x.project().id,aiIntervention:'all'});
  x.act('item.update',{id:child.id,aiEnabled:false});
  assert.equal(x.store.read().runs.length,x.initialRuns);
  for(const item of [epic,task,child,custom]) {
    assert.equal(aiExecutionEnabled(item,x.store.read().items,x.project()),true);
    const ctx=context(x.store.read(),item.id);
    const run=x.act('run.progress',{itemId:item.id,storyVersion:ctx.story.contentVersion,itemVersion:ctx.targetTask?.contentVersion??ctx.story.contentVersion,agent:'test',message:'start'});
    assert.equal(run.itemId,item.id);
    const current=context(x.store.read(),item.id);
    const delivery=x.act('run.submit',{itemId:item.id,storyVersion:current.story.contentVersion,agent:'test',runId:run.id,summary:'done',verification:'checked',requestId:'submit-'+item.id});
    assert.equal(delivery.status,'review');
    x.act('review',{storyId:item.id,runId:run.id,decision:'changes',comment:'revise'});
  }
  const fresh=x.create('task',epic.id);
  assert.equal(fresh.aiEnabled,false);assert.equal(x.store.read().runs.some(r=>r.itemId===fresh.id),false);
  x.act('project.update',{id:x.project().id,aiIntervention:'manual'});
  assert.equal(aiExecutionEnabled(fresh,x.store.read().items,x.project()),false);
  assert.throws(()=>x.act('project.update',{id:x.project().id,aiIntervention:'invalid'}));
});
test('manual mode requires each item icon, including new children of enabled parents',t=>{
  const x=setup(t),parent=x.create('task');
  x.act('item.update',{id:parent.id,aiEnabled:true});
  const child=x.create('subtask',parent.id);
  assert.equal(aiExecutionEnabled(child,x.store.read().items,x.project()),false);
  const ctx=context(x.store.read(),child.id);
  assert.throws(()=>x.act('run.progress',{itemId:child.id,storyVersion:ctx.story.contentVersion,agent:'test',message:'start'}),e=>e.code==='AI_EXECUTION_DISABLED');
  x.act('item.update',{id:child.id,aiEnabled:true});
  assert.equal(aiExecutionEnabled(x.store.read().items.find(i=>i.id===child.id),x.store.read().items,x.project()),true);
});

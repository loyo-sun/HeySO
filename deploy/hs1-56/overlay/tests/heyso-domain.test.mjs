import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,act,validate,context} from '../vendor/heyso/server/model.mjs';
import {roadmapTreeSnapshot} from '../vendor/heyso/shared/roadmap-order.mjs';

function fixture(){
  let state=seed(); const project=state.projects[0];
  const dispatch=(type,payload)=>{const next=structuredClone(state);const result=act(next,{type,payload,actor:'release-test'});validate(next);state=next;return result;};
  const make=(kind,parentId=null)=>dispatch('item.create',{projectId:project.id,kind,title:'test '+kind,parentId});
  return {read:()=>state,project,dispatch,make};
}

test('cloud roadmap moves preserve identity, reject stale trees and support reversing hierarchy changes',()=>{
 const x=fixture(),epic=x.make('epic'),story=x.make('story',epic.id),task=x.make('task',epic.id);
 const move=(targetId,position,expectedTree=roadmapTreeSnapshot(x.read().items,x.project))=>x.dispatch('item.roadmap.move',{projectId:x.project.id,id:task.id,targetId,position,expectedTree});
 const tree=roadmapTreeSnapshot(x.read().items,x.project);
 move(story.id,'inside');let item=x.read().items.find(i=>i.id===task.id);
 assert.equal(item.kind,'subtask');assert.equal(item.parentId,story.id);assert.equal(item.number,task.number);
 const before=structuredClone(x.read());assert.throws(()=>move(story.id,'after',tree),/已有更新/);assert.deepEqual(x.read(),before);
 move(story.id,'after');item=x.read().items.find(i=>i.id===task.id);assert.equal(item.kind,'task');assert.equal(item.parentId,epic.id);
});

test('cloud memory keeps versioned history while excluding deleted notes and history from AI context',()=>{
 const x=fixture(),projectId=x.project.id,note=x.dispatch('note.create',{projectId,title:'decision',body:'before',type:'context'});
 x.dispatch('note.update',{projectId,id:note.id,expectedVersion:1,title:'decision',body:'after',type:'decision'});
 const before=structuredClone(x.read());assert.throws(()=>x.dispatch('note.delete',{projectId,id:note.id,expectedVersion:1}),/已有更新/);assert.deepEqual(x.read(),before);
 const current=context(x.read(),'s3').memory.find(n=>n.id===note.id);assert.equal(current.body,'after');assert.equal(current.history,undefined);
 x.dispatch('note.delete',{projectId,id:note.id,expectedVersion:2});assert.equal(context(x.read(),'s3').memory.some(n=>n.id===note.id),false);
 assert.deepEqual(x.read().notes.find(n=>n.id===note.id).history.map(h=>h.operation),['create','update','delete']);
});

test('cloud MCP creates a title-only item with blank optional planning fields',()=>{
 const x=fixture();
 const item=x.dispatch('mcp.item.create',{projectId:x.project.id,title:'title only',expectedRevision:x.read().revision||0,requestId:'minimal-item',agent:'test'});
 assert.equal(item.kind,'story');assert.equal(item.startDate,'');assert.equal(item.endDate,'');assert.equal(item.owner,'');assert.equal(item.aiEnabled,false);
});

for(const scenario of ['same-version','changed-version','no-delivery']){
 test('ordinary reacceptance cascades only with accepted delivery of current version: '+scenario,()=>{
  const x=fixture(),parent=x.make('story'),child=x.make('subtask',parent.id);
  const item=id=>x.read().items.find(i=>i.id===id);
  x.dispatch('item.update',{id:parent.id,aiEnabled:true});
  let run;
  if(scenario!=='no-delivery'){
   run=x.dispatch('run.submit',{itemId:parent.id,storyVersion:item(parent.id).contentVersion,agent:'test',summary:'delivery',verification:'checked',requestId:'reaccept-test'});
   x.dispatch('review',{storyId:parent.id,runId:run.id,decision:'accept',comment:'verified'});
   x.dispatch('item.update',{id:parent.id,status:'todo',...(scenario==='changed-version'?{description:'changed scope'}:{})});
   x.dispatch('item.update',{id:child.id,status:'todo'});
  }
  const beforeRuns=structuredClone(x.read().runs),beforeChildStatus=item(child.id).status;
  x.dispatch('item.update',{id:parent.id,status:'review'});
  x.dispatch('review',{storyId:parent.id,decision:'accept',comment:'verified again'});
  assert.equal(item(parent.id).status,'done');
  assert.equal(item(child.id).status,scenario==='same-version'?'done':beforeChildStatus);
  assert.deepEqual(x.read().runs,beforeRuns);
  if(scenario==='same-version')assert.ok(x.read().events.some(e=>e.itemId===child.id&&e.triggerRunId===run.id&&e.triggerReviewId));
 });
}

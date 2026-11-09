import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,act,validate} from '../server/model.mjs';
import {migrateState} from '../server/migrate.mjs';
import {closedSprintFor,sprintMutationReason,effectiveSprintId} from '../shared/work-config.mjs';
import {workItemEntries} from '../src/work-item-actions.mjs';

function fixture() {
 const s=migrateState(seed()),project=s.projects[0],sp=s.sprints.find(sp=>sp.id==='sp1');
 const child=s.items.find(i=>i.kind==='subtask'&&effectiveSprintId(i,s.items,project)===sp.id);
 const item=s.items.find(i=>i.id===child.parentId);
 sp.status='closed';
 return {s,project,sp,child,item};
}
function rejectUnchanged(s,type,payload) {
 const before=structuredClone(s);
 assert.throws(()=>act(s,{type,payload}),/已完成.*(?:仅可查看|不能添加或移入)/);
 assert.deepEqual(s,before,`${type} must reject before changing state`);
}
test('closed sprint blocks every item field, deletion and both move APIs before mutation',()=>{
 const {s,item}=fixture();
 for(const patch of [{title:'修改'},{description:'修改'},{acceptance:'修改'},{owner:'我'},{priority:'low'},{points:8},{status:'active'},{startDate:'2026-11-09'},{sprintId:null},{sprintId:'sp2'},{releaseId:null},{parentId:null},{kind:'bug'},{aiEnabled:true},{boardRank:3},{sprintRank:4}]) rejectUnchanged(s,'item.update',{id:item.id,...patch});
 rejectUnchanged(s,'item.move',{id:item.id,projectId:item.projectId,parentId:null});
 rejectUnchanged(s,'item.delete',{id:item.id});
 rejectUnchanged(s,'item.reorder',{id:item.id,targetId:'s1',position:'before'});
 rejectUnchanged(s,'item.roadmap.move',{id:item.id,targetId:'s1',position:'inside'});
});
test('subtasks inherit read-only from their parent and cannot be edited or detached',()=>{
 const {s,project,child,sp}=fixture();
 assert.equal(closedSprintFor(child,s.items,s.sprints,project),sp);
 for(const patch of [{title:'修改'},{status:'active'},{parentId:'s1'},{sprintId:null}])rejectUnchanged(s,'item.update',{id:child.id,...patch});
 rejectUnchanged(s,'item.delete',{id:child.id});
});
test('closed sprint cannot receive new items or children, or existing items from other sprints',()=>{
 const {s,sp,item}=fixture(),outside=s.items.find(i=>i.kind==='story'&&i.sprintId!==sp.id);
 assert.ok(outside);
 rejectUnchanged(s,'item.create',{projectId:item.projectId,kind:'story',title:'新增',sprintId:sp.id});
 rejectUnchanged(s,'item.create',{projectId:item.projectId,kind:'subtask',title:'新增子任务',parentId:item.id});
 rejectUnchanged(s,'item.update',{id:outside.id,sprintId:sp.id});
 rejectUnchanged(s,'item.roadmap.move',{id:outside.id,targetId:item.id,position:'inside'});
});
test('closed descendants cannot be indirectly resized through a planning ancestor',()=>{
 const {s,item}=fixture();
 const parent=s.items.find(i=>i.id===item.parentId);
 assert.ok(parent);
 rejectUnchanged(s,'item.update',{id:parent.id,startDate:'2026-01-01',endDate:'2026-12-31',scheduleMode:'move'});
});
test('AI progress, delivery, run cancellation and human review cannot bypass sprint read-only',()=>{
 const {s,item,child}=fixture();
 for(const target of [item,child]) {
  for(const type of ['run.progress','run.submit'])rejectUnchanged(s,type,{itemId:target.id,status:'active',summary:'修改'});
  rejectUnchanged(s,'review',{storyId:target.id,decision:'accept',comment:'通过'});
 }
 s.runs.push({id:'locked-run',itemId:child.id,storyId:item.id,status:'active'});
 rejectUnchanged(s,'run.cancel',{id:'locked-run'});
});
test('MCP item writes share the same closed-sprint check',()=>{
 const {s,item}=fixture();
 rejectUnchanged(s,'mcp.item.update',{projectId:item.projectId,itemId:item.id,expectedRevision:s.revision,requestId:'readonly-update',agent:'测试',patch:{title:'修改'}});
});
test('current-item menus expose only read and copy actions for closed sprint membership',()=>{
 const {s,project,item,child}=fixture();
 for(const target of [item,child]) {
  const entries=workItemEntries({item:target,project,data:s,handlers:{}});
  assert.deepEqual(entries.map(e=>e.label),['查看详情（只读）','已完成冲刺 · 只读','复制']);
  assert.equal(entries[1].disabled,true);
 }
});
test('closing freezes historical snapshots while unfinished carried-over work and its child remain editable',()=>{
 const s=migrateState(seed()),project=s.projects[0],sp=s.sprints.find(sp=>sp.id==='sp1');
 const child=s.items.find(i=>i.kind==='subtask'&&effectiveSprintId(i,s.items,project)===sp.id),item=s.items.find(i=>i.id===child.parentId);
 assert.ok(!['done','cancelled'].includes(item.status));
 act(s,{type:'sprint.close',payload:{id:sp.id,review:'完成复盘',retro:{wentWell:'明确',improve:'继续',actions:''},dispositions:Object.fromEntries(s.items.filter(i=>i.sprintId===sp.id).map(i=>[i.id,'backlog']))}});
 const snapshot=structuredClone(sp.finalItems);
 assert.equal(closedSprintFor(item,s.items,s.sprints,project),null);
 assert.equal(closedSprintFor(child,s.items,s.sprints,project),null);
 act(s,{type:'item.update',payload:{id:item.id,title:'结转后修改'}});
 act(s,{type:'item.update',payload:{id:child.id,title:'结转子任务修改'}});
 validate(s);assert.deepEqual(sp.finalItems,snapshot);
 assert.equal(sprintMutationReason(s,'item.update',{id:item.id,title:'继续修改'}),'');
});

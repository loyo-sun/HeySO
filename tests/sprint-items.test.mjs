import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultWorkConfig} from '../shared/work-config.mjs';
import {sprintPlanningItems,canMoveSprintItem} from '../src/sprint-items.mjs';

test('sprint planning includes every type and derives subtask membership without changing stored data',()=>{
 const project={workConfig:defaultWorkConfig()};
 project.workConfig.types.push({id:'design',level:0,enabled:true});
 const items=[{id:'e',kind:'epic'},{id:'s',kind:'story',sprintId:'sp1'},
  {id:'t',kind:'task'},{id:'b',kind:'bug'},{id:'d',kind:'design'},
  {id:'c',kind:'subtask',parentId:'s',sprintId:null}];
 const rows=sprintPlanningItems(items,project);
 assert.deepEqual(rows.map(i=>i.id),items.map(i=>i.id));
 const child=rows.find(i=>i.id==='c');
 assert.equal(child.sprintId,'sp1');assert.equal(items.at(-1).sprintId,null);
 assert.equal(canMoveSprintItem(child,'sp1',project),true);
 assert.equal(canMoveSprintItem(child,'sp2',project),false);
 assert.equal(canMoveSprintItem(child,null,project),false);
 assert.equal(canMoveSprintItem(rows[0],'sp2',project),true);
 items[1].sprintId='sp2';
 assert.equal(sprintPlanningItems(items,project).at(-1).sprintId,'sp2');
});

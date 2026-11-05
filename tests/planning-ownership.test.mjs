import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createStore} from '../server/store.mjs';
import {effectiveSprintId,isSubtask} from '../shared/work-config.mjs';
import {context,storiesIn} from '../server/model.mjs';
import {backlogValue} from '../src/backlog-columns.mjs';
import {filterBacklogRows} from '../src/backlog-filters.mjs';
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'heyso-planning-ownership-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return createStore(path.join(dir,'workspace.json'));}
const act=(store,type,payload)=>store.dispatch({type,payload}).result;
test('epics, tasks and bugs can own release and sprint fields without duplicating sprint estimates',t=>{
 const store=fixture(t),p=store.read().projects[0];
 for(const kind of ['epic','task','bug']){
 const item=act(store,'item.create',{projectId:p.id,kind,title:'规划字段 '+kind,startDate:p.startDate,endDate:p.endDate,releaseId:'r2',sprintId:'sp2',points:5});
 assert.equal(item.releaseId,'r2');assert.equal(item.sprintId,'sp2');
 assert.equal(storiesIn(store.read(),'sp2').some(i=>i.id===item.id),kind!=='epic');
 }
});
test('a subtask owns its version while sprint follows parent moves, reparenting and list filters',t=>{
 const store=fixture(t),p=store.read().projects[0],child=store.read().items.find(i=>isSubtask(i,p)),parent=store.read().items.find(i=>i.id===child.parentId);
 act(store,'item.update',{id:child.id,releaseId:'r2'});
 act(store,'item.update',{id:parent.id,sprintId:'sp2'});
 let state=store.read(),item=state.items.find(i=>i.id===child.id);
 assert.equal(item.sprintId,null);assert.equal(item.releaseId,'r2');assert.equal(effectiveSprintId(item,state.items,p),'sp2');
 assert.equal(context(state,item.id).release.id,'r2');assert.equal(context(state,item.id).sprint.id,'sp2');
 const ctx={project:p,items:state.items,sprints:state.sprints,releases:state.releases};
 assert.equal(backlogValue(item,'sprintId',ctx),state.sprints.find(s=>s.id==='sp2').name);
 assert.equal(filterBacklogRows([item],{sprintId:['sp2'],releaseId:['r2']},ctx).length,1);
 assert.throws(()=>act(store,'item.update',{id:child.id,sprintId:'sp1'}),/跟随父级/);
 const next=state.items.find(i=>i.kind==='story'&&i.id!==parent.id&&i.sprintId==='sp1');
 act(store,'item.update',{id:child.id,parentId:next.id});state=store.read();item=state.items.find(i=>i.id===child.id);
 assert.equal(effectiveSprintId(item,state.items,p),'sp1');assert.equal(item.releaseId,'r2');
});

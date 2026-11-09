import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createStore} from '../server/store.mjs';
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'heyso-longterm-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return createStore(path.join(dir,'workspace.json'));}
const act=(s,type,payload)=>s.dispatch({type,payload}).result;
test('long-term creation, dated work, persistence, bounded conversion and rollback',t=>{
 const s=fixture(t),p=act(s,'project.create',{name:'长期项目',goal:'持续运营',longTerm:true});
 assert.equal(p.startDate,'');assert.equal(p.endDate,'');
 const item=act(s,'item.create',{projectId:p.id,kind:'story',title:'独立周期',startDate:'2040-01-01',endDate:'2040-01-10'});
 act(s,'item.update',{id:item.id,startDate:'2030-01-01',endDate:'2045-01-10'});
 assert.equal(s.read().projects.find(x=>x.id===p.id).longTerm,true);
 assert.throws(()=>act(s,'project.update',{id:p.id,longTerm:false,startDate:'2035-01-01',endDate:'2040-01-01'}),/超出项目周期/);
 assert.equal(s.read().projects.find(x=>x.id===p.id).longTerm,true);
 act(s,'project.update',{id:p.id,longTerm:false,startDate:'2020-01-01',endDate:'2050-01-01'});
 assert.throws(()=>act(s,'item.update',{id:item.id,endDate:'2060-01-01'}),/超出项目周期/);
 act(s,'project.update',{id:p.id,longTerm:true});
 assert.equal(s.read().projects.find(x=>x.id===p.id).startDate,'');
 act(s,'item.update',{id:item.id,endDate:'2060-01-01'});
});
test('finite projects still require dates, date ordering and parent limits remain',t=>{
 const s=fixture(t);assert.throws(()=>act(s,'project.create',{name:'缺少日期',goal:'test'}),/同时填写/);
 const p=act(s,'project.create',{name:'长期',goal:'test',longTerm:true});
 assert.throws(()=>act(s,'item.create',{projectId:p.id,kind:'story',title:'倒序',startDate:'2040-02-01',endDate:'2040-01-01'}),/不能早于/);
 const parent=act(s,'item.create',{projectId:p.id,kind:'story',title:'父',startDate:'2040-01-01',endDate:'2040-02-01'});
 assert.throws(()=>act(s,'item.create',{projectId:p.id,kind:'subtask',title:'子',parentId:parent.id,startDate:'2030-01-01',endDate:'2040-01-01'}),/父级|周期/);
});

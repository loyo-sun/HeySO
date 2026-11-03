import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createStore} from '../server/store.mjs';
import {checkWorkConfig} from '../shared/work-config.mjs';
const act=(s,type,payload)=>s.dispatch({type,payload}).result;
function fresh(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'heyso-custom-flow-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'state.json'),s=createStore(file);const p=act(s,'project.create',{name:'自定义流程',goal:'验证独立配置',startDate:'2026-10-29',endDate:'2026-12-31'});return {s,p,file};}
const make=(s,p,kind='task',extra={})=>act(s,'item.create',{projectId:p.id,kind,title:'工作项',owner:p.owner,startDate:p.startDate,endDate:p.endDate,...extra});
const cfg=(s,p)=>structuredClone(s.read().projects.find(x=>x.id===p.id).workConfig);
const save=(s,p,config,extra={})=>act(s,'project.workConfig',{id:p.id,config,...extra});
test('custom workflows: per-type initial state, directed/global/self transitions and persistence',t=>{
 const {s,p,file}=fresh(t),c=cfg(s,p);
 c.statuses.push({id:'triage',name:'待分诊',category:'todo',enabled:true},{id:'fixed',name:'已修复',category:'done',enabled:true});
 c.workflows.push({id:'bugflow',name:'缺陷处理',statusIds:['triage','active','fixed'],initialStatus:'triage',rules:{requireReview:false,nodes:{}},positions:{triage:{x:24,y:52}},transitions:[{id:'begin',name:'处理',from:'triage',to:'active'},{id:'finish',name:'修复',from:'active',to:'fixed'},{id:'reopen',name:'重新分诊',from:'*',to:'triage'},{id:'self',name:'复核',from:'active',to:'active'}]});
 c.workflowScheme.typeMappings.bug='bugflow';save(s,p,c);
 const bug=make(s,p,'bug'),task=make(s,p);assert.equal(bug.status,'triage');assert.equal(task.status,'todo');
 let before=s.read();assert.throws(()=>act(s,'item.update',{id:bug.id,status:'fixed'}),/不允许/);assert.deepEqual(s.read(),before);
 for(const status of ['active','active','fixed','triage'])act(s,'item.update',{id:bug.id,status});
 act(s,'item.update',{id:task.id,status:'done'});
 assert.deepEqual(createStore(file).read(),s.read());
 assert.deepEqual(cfg(s,p).types,p.workConfig.types);
});
test('workflow publishing: status migration is explicit, atomic and stores previous version',t=>{
 const {s,p}=fresh(t),item=make(s,p),c=cfg(s,p);act(s,'item.update',{id:item.id,status:'active'});
 c.statuses.push({id:'queue',name:'排队中',category:'todo',enabled:true});
 c.workflows.push({id:'queueflow',name:'队列流程',statusIds:['queue','done'],initialStatus:'queue',transitions:[],rules:{requireReview:false,nodes:{}}});c.workflowScheme.typeMappings.task='queueflow';
 const before=s.read();assert.throws(()=>save(s,p,c),/迁移目标/);assert.deepEqual(s.read(),before);
 assert.throws(()=>save(s,p,c,{statusMigration:{'queueflow::active':'active'}}),/迁移目标/);assert.deepEqual(s.read(),before);
 save(s,p,c,{statusMigration:{'queueflow::active':'queue'}});
 const after=s.read();assert.equal(after.items.find(i=>i.id===item.id).status,'queue');
 const next=after.projects.find(x=>x.id===p.id);assert.equal(next.workflowRevision,2);assert.equal(next.workflowHistory[0].workflowScheme.typeMappings.task,undefined);
 assert.deepEqual(next.workConfig.types,p.workConfig.types);assert.deepEqual(next.workConfig.levels,p.workConfig.levels);
});
test('workflow review is opt-in; AI requires explicit collaboration nodes',t=>{
 const {s,p}=fresh(t),task=make(s,p);let before=s.read();assert.throws(()=>act(s,'item.update',{id:task.id,aiEnabled:true}),/执行、验收和完成节点/);assert.deepEqual(s.read(),before);
 const c=cfg(s,p);c.workflowScheme.typeMappings.task='delivery';save(s,p,c);act(s,'item.update',{id:task.id,aiEnabled:true});
 assert.throws(()=>act(s,'item.update',{id:task.id,status:'done'}),/不允许|人工验收/);
 const invalid=cfg(s,p);invalid.statuses[0].category='review';assert.throws(()=>checkWorkConfig(invalid),/状态类别/);
 const broken=cfg(s,p);broken.workflows[0].transitions[0].to='missing';assert.throws(()=>checkWorkConfig(broken),/起点和终点/);
 const pos=cfg(s,p);pos.workflows[0].positions={todo:{x:Infinity,y:0}};assert.throws(()=>checkWorkConfig(pos),/位置/);
});

test('collaboration roles cannot share a state and ambiguous config cannot overwrite data',t=>{
 const {s,p}=fresh(t),c=cfg(s,p),w=c.workflows.find(w=>w.id==='delivery');
 w.rules.nodes.review=w.rules.nodes.active;
 const before=s.read();assert.throws(()=>save(s,p,c),/不同协作节点/);assert.deepEqual(s.read(),before);
});


test('workflow canvas: wide positions persist and out-of-range positions cannot overwrite data',t=>{
 const {s,p}=fresh(t),c=cfg(s,p),w=c.workflows[0];
 w.positions={[w.initialStatus]:{x:1800,y:220}};
 save(s,p,c);
 assert.equal(s.read().projects.find(x=>x.id===p.id).workConfig.workflows[0].positions[w.initialStatus].x,1800);
 const before=s.read(),invalid=cfg(s,p);invalid.workflows[0].positions[w.initialStatus].x=4001;
 assert.throws(()=>save(s,p,invalid),/位置/);assert.deepEqual(s.read(),before);
});

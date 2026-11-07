import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {emptyProject,context} from '../server/model.mjs';
import {createStore} from '../server/store.mjs';
import {createItemSchema,updateItemSchema} from '../server/mcp-item-schema.mjs';
const act=(store,type,payload)=>store.dispatch({type,payload}).result;
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'heyso-details-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return createStore(path.join(dir,'workspace.json'));}
test('every enabled item type can be created with only a title in an undated project, then assigned and cleared',t=>{
 const store=fixture(t),p=emptyProject('先收集想法');
 store.restore({schemaVersion:4,revision:store.read().revision,projects:[p],items:[],releases:[],sprints:[],notes:[],runs:[],events:[]},store.read().revision);
 const config=p.workConfig;
 for(const kind of config.types.filter(t=>t.enabled&&!t.hidden).map(t=>t.id)){
  const item=act(store,'item.create',{projectId:p.id,kind,title:'仅标题 '+kind});
  assert.equal(item.owner,'');assert.equal(item.startDate,'');assert.equal(item.endDate,'');assert.equal(item.parentId,null);
  if(kind==='subtask')assert.throws(()=>context(store.read(),item.id),/先为子任务选择所属工作项/);
  act(store,'item.update',{id:item.id,owner:p.owner});
  assert.equal(act(store,'item.update',{id:item.id,owner:''}).owner,'');
 }
 assert.equal(act(store,'item.create',{projectId:p.id,title:'默认类型'}).kind,'story');
 const before=store.read();
 assert.throws(()=>act(store,'item.create',{projectId:p.id,title:'   '}),/标题/);
 assert.throws(()=>act(store,'item.create',{projectId:p.id,title:'错误负责人',owner:'陌生人'}),/负责人/);
 assert.deepEqual(store.read(),before);
});
test('work item dates accept single endpoints, clearing and empty values without weakening range or hierarchy validation',t=>{
 const store=fixture(t),p=store.read().projects[0];
 const item=act(store,'item.create',{projectId:p.id,title:'后排期',startDate:p.startDate});
 assert.equal(item.endDate,'');
 act(store,'item.update',{id:item.id,endDate:p.endDate});
 const cleared=act(store,'item.update',{id:item.id,startDate:'',endDate:''});
 assert.equal(cleared.dueDate,'');
 const before=store.read();
 assert.throws(()=>act(store,'item.update',{id:item.id,startDate:'2026-02-30'}),/有效日期/);
 assert.throws(()=>act(store,'item.update',{id:item.id,startDate:p.endDate,endDate:p.startDate}),/不能早于/);
 assert.throws(()=>act(store,'item.update',{id:item.id,startDate:'1900-01-01'}),/项目周期/);
 assert.throws(()=>act(store,'item.create',{projectId:p.id,kind:'subtask',title:'非法父级',parentId:'ep1'}),/父级/);
 assert.deepEqual(store.read(),before);
});
test('MCP item schemas allow omitted business fields and explicit clearing while retaining required protocol metadata',()=>{
 const args={projectId:'p',title:'先记录',expectedRevision:1,requestId:'r',agent:'test'};
 assert.equal(createItemSchema.safeParse(args).success,true);
 assert.equal(createItemSchema.safeParse({...args,title:''}).success,false);
 assert.equal(createItemSchema.safeParse({...args,requestId:undefined}).success,false);
 const {title,...common}=args;
 assert.equal(updateItemSchema.safeParse({...common,itemId:'i',patch:{owner:'',startDate:'',endDate:''}}).success,true);
});

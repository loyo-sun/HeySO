import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createStore} from '../server/store.mjs';
import {seed} from '../server/model.mjs';
import {checkIdentifiers,migrateIdentifiers} from '../shared/identifiers.mjs';
function fresh(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'heyso-identifiers-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'workspace.json');
  return {file,store:createStore(file)};
}
test('project name/code uniqueness, normalization and immutable code; failed writes are atomic',t=>{
  const {store}=fresh(t), p=store.read().projects[0];
  const create=(name,code)=>store.dispatch({type:'project.create',payload:{name,code,goal:'测试',startDate:p.startDate,endDate:p.endDate}}).result;
  const pr=create('第二项目','lc'); assert.equal(pr.code,'LC');
  const before=store.read();
  assert.throws(()=>create(p.name,'XX'),/名称不能重复/);
  assert.throws(()=>create('其他项目','hs'),/ID 不能重复/);
  assert.throws(()=>create('非法 ID','1X'),/项目 ID/);
  assert.throws(()=>store.dispatch({type:'project.update',payload:{id:pr.id,name:p.name}}),/名称不能重复/);
  assert.throws(()=>store.dispatch({type:'project.update',payload:{id:pr.id,code:'NEW'}}),/不可修改/);
  assert.deepEqual(store.read(),before);
});
test('all item types share permanent sequence; deleting highest and restarting never reuses number',t=>{
  let {store,file}=fresh(t); const p=store.read().projects[0];
  const create=(kind,parentId)=>store.dispatch({type:'item.create',payload:{projectId:p.id,kind,parentId,title:'编号验证',startDate:p.startDate,endDate:p.endDate}}).result;
  const epic=create('epic'), story=create('story',epic.id), subtask=create('subtask',story.id);
  assert.equal(story.number,epic.number+1);assert.equal(subtask.number,story.number+1);
  store.dispatch({type:'item.delete',payload:{id:subtask.id}});
  store=createStore(file);
  assert.equal(create('bug').number,subtask.number+1);
});
test('legacy upgrade preserves numbers, repairs project collisions and includes historical maximum; idempotent',()=>{
  const s=seed();delete s.numberingVersion;
  const pr=structuredClone(s.projects[0]);pr.id='other';s.projects.push(pr);
  delete s.items[0].number;
  s.sprints[0].baseline.push({id:'deleted',number:928});
  migrateIdentifiers(s);checkIdentifiers(s);
  assert.equal(s.items.find(i=>i.id==='s1').number,1);
  assert(s.items[0].number>928);
  assert.notEqual(s.projects[0].code,s.projects[1].code);
  assert.notEqual(s.projects[0].name,s.projects[1].name);
  assert.deepEqual(migrateIdentifiers(structuredClone(s)),s);
});
test('project uniqueness is scoped to account when account IDs are present',()=>{
  const s=seed();s.projects[0].accountId='account-a';
  const second={...structuredClone(s.projects[0]),id:'other',accountId:'account-b'};s.projects.push(second);
  checkIdentifiers(s);
  second.accountId='account-a';assert.throws(()=>checkIdentifiers(s),/名称不能重复/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createStore} from '../server/store.mjs';
import {defaultWorkConfig} from '../shared/work-config.mjs';
import {roadmapPlanRows} from '../src/roadmap-model.mjs';
import {roadmapCreateTarget,roadmapFieldBounds} from '../src/roadmap-editing.mjs';
const project={id:'p',startDate:'2026-01-01',endDate:'2026-12-31',workConfig:defaultWorkConfig()};
const epic={id:'e',projectId:'p',kind:'epic',startDate:'2026-02-01',endDate:'2026-11-01'},story={id:'s',projectId:'p',kind:'story',parentId:'e',startDate:'2026-03-01',endDate:'2026-10-01'},child={id:'c',projectId:'p',kind:'subtask',parentId:'s'};
const items=[epic,story,child];
test('inline creation keeps same-level siblings under their parent and lower-level work under the clicked row',()=>{
 assert.equal(roadmapCreateTarget(project,items,story,'task').id,'e');
 assert.equal(roadmapCreateTarget(project,items,story,'subtask').id,'s');
 assert.equal(roadmapCreateTarget(project,items,child,'subtask').id,'s');
 assert.equal(roadmapCreateTarget(project,items,story,'epic'),null);
});
test('inline date editor uses both project and parent bounds and the opposite endpoint',()=>{
 assert.deepEqual(roadmapFieldBounds(project,items,story,'startDate'),{min:'2026-02-01',max:'2026-10-01'});
 assert.deepEqual(roadmapFieldBounds(project,items,story,'endDate'),{min:'2026-03-01',max:'2026-11-01'});
});
test('created siblings retain insertion order across persistence and reject a stale anchor atomically',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'heyso-inline-create-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'workspace.json'),store=createStore(file),p=store.read().projects[0];
 const source=store.read().items.find(i=>i.kind==='story');
 const created=store.dispatch({type:'item.create',payload:{projectId:p.id,kind:'task',title:'行下新建',parentId:source.parentId,afterId:source.id}}).result;
 const persisted=createStore(file).read();
 const rows=roadmapPlanRows(persisted.items,p,{collapsed:new Set()},10,-1).map(r=>r.item.id);
 assert.equal(rows.indexOf(created.id),rows.indexOf(source.id)+1);
 const before=store.read();
 assert.throws(()=>store.dispatch({type:'item.create',payload:{projectId:p.id,title:'失效位置',afterId:'missing'}}),/新建位置/);
 assert.deepEqual(store.read(),before);
});

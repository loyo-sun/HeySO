import test from 'node:test';import assert from 'node:assert/strict';
import {seed,act,validate} from '../vendor/heyso/server/model.mjs';
import {normalizeViewPatch} from '../vendor/heyso/shared/view-preferences.mjs';
test('deployed domain accepts long-term project dates and personal list width',()=>{
 const s=seed();const p=act(s,{type:'project.create',payload:{name:'长期云项目',goal:'持续运营',longTerm:true}});
 const i=act(s,{type:'item.create',payload:{projectId:p.id,kind:'story',title:'远期任务',startDate:'2040-01-01',endDate:'2040-02-01'}});
 validate(s);assert.equal(i.startDate,'2040-01-01');assert.equal(p.endDate,'');
 assert.deepEqual(normalizeViewPatch('list',{workItemWidth:640},{strict:true}),{workItemWidth:640});
});

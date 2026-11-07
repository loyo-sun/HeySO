import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeBacklogPrefs} from '../src/backlog-columns.mjs';
import {normalizeViewPatch} from '../shared/view-preferences.mjs';
import {publishedSoftwareVersion} from '../src/about-version.mjs';
test('width survives normalization and is constrained at the cloud boundary',()=>{
 assert.equal(normalizeBacklogPrefs({columns:['workItem'],workItemWidth:512}).workItemWidth,512);
 assert.equal(normalizeBacklogPrefs({columns:['workItem'],workItemWidth:9999}).workItemWidth,1200);
 assert.deepEqual(normalizeViewPatch('list',{workItemWidth:512},{strict:true}),{workItemWidth:512});
 for(const value of [100,1201,'400',NaN])assert.throws(()=>normalizeViewPatch('list',{workItemWidth:value},{strict:true}));
});
test('software version uses the current project latest published release, including archived releases',()=>{
 const p={id:'p'};assert.equal(publishedSoftwareVersion(p,[]),'尚无已发布版本');
 assert.equal(publishedSoftwareVersion(p,[{projectId:'p',name:'future',status:'planning'},{projectId:'other',name:'other',status:'released',releasedAt:'2030'},{projectId:'p',name:'v1',status:'released',releasedAt:'2026-01'},{projectId:'p',name:'v2',status:'released',archived:true,releasedAt:'2026-02'}]),'v2');
});

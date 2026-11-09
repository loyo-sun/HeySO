import test from 'node:test';
import assert from 'node:assert/strict';
import {roadmapPlanWindow,shiftRoadmap} from '../src/roadmap-model.mjs';
import {normalizeViewPatch} from '../shared/view-preferences.mjs';
import {reorderedSiblingIds} from '../shared/roadmap-order.mjs';
test('month/week views persist and navigate across month and leap year boundaries',()=>{
 for(const scale of ['month','week'])assert.equal(normalizeViewPatch('roadmap',{scale}).scale,scale);
 assert.equal(roadmapPlanWindow('2026-11-09','week',{}).endDate,'2026-11-15');
 assert.equal(shiftRoadmap('2026-12-29','week',1),'2027-01-05');
 assert.equal(roadmapPlanWindow('2028-01-31','month',{}).endDate,'2028-02-28');
 assert.equal(roadmapPlanWindow('2026-11-09','month',{}).endDate,'2026-12-08');
 assert.equal(roadmapPlanWindow('2026-11-09','custom',{},[],[],{startDate:'2026-12-30',endDate:'2027-01-02'}).days,4);
});
test('filtered reorder uses full sibling order and preserves hidden relative order',()=>{
 const siblings=['hidden-a','visible-a','hidden-b','visible-b','hidden-c'].map(id=>({id}));
 assert.deepEqual(reorderedSiblingIds(siblings,'visible-b','visible-a','before'),['hidden-a','visible-b','visible-a','hidden-b','hidden-c']);
});

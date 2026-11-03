import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultWorkConfig } from '../shared/work-config.mjs';
import { roadmapTimeline, dragRoadmapDates, dayNumber, roadmapWindow, shiftRoadmap, roadmapBar, roadmapPoint, roadmapRows, roadmapProgress, itemRange } from '../src/roadmap-model.mjs';
const project = { code: 'HS', workConfig: defaultWorkConfig() };

test('roadmap calendar handles leap years, quarter boundaries and navigation across years', () => {
  assert.equal(dayNumber('2026-02-29'), null);
  assert.equal(dayNumber('2026-13-01'), null);
  const leap = roadmapWindow('2024-02-20', 'month');
  assert.equal(leap.days, 29); assert.equal(leap.endDate, '2024-02-29');
  const q4 = roadmapWindow('2026-11-03', 'quarter');
  assert.equal(q4.startDate, '2026-10-01'); assert.equal(q4.endDate, '2026-12-31');
  assert.equal(shiftRoadmap('2026-12-31', 'quarter', 1), '2027-03-01');
  assert.equal(roadmapWindow(shiftRoadmap('2026-12-31', 'quarter', 1), 'quarter').startDate, '2027-01-01');
  assert.equal(shiftRoadmap('2026-01-31', 'month', 1), '2026-02-01');
  assert.equal(roadmapWindow('2024-08-01','year').days, 366);
});
test('timeline includes the final day, clips spans without changing data, and separates missing dates from offscreen work', () => {
  const window = roadmapWindow('2026-11-03', 'month');
  const item = { startDate: '2026-10-29', endDate: '2026-12-31' };
  const snapshot = structuredClone(item);
  assert.deepEqual(roadmapBar(item, window), { left: 0, width: 100, clippedStart: true, clippedEnd: true });
  const last = roadmapBar({ startDate: '2026-11-30', endDate: '2026-11-30' }, window);
  assert.equal(last.left, 29 / 30 * 100); assert.equal(last.width, 1 / 30 * 100);
  assert.equal(roadmapBar({ startDate: '2026-12-01', endDate: '2026-12-02' },window),null);
  assert.equal(itemRange({ startDate: '2026-11-02' }),null);
  assert.equal(itemRange({ startDate: '2026-11-03', endDate: '2026-11-01' }),null);
  assert.equal(itemRange({ startDate: '2026-11-03', dueDate: '2026-11-05' }).endDate,'2026-11-05');
  assert.equal(roadmapPoint('2026-12-01',window),null);
  assert.equal(roadmapPoint('2026-11-30',window),(29.5 / 30) * 100);
  assert.deepEqual(item,snapshot);
});
const items = [
  { id: 'e', kind: 'epic', title: '规划', number: 1, status: 'todo' },
  { id: 's', kind: 'story', title: '搜索功能', number: 2, parentId: 'e', status: 'done', owner: '我' },
  { id: 't', kind: 'subtask', title: '搜索测试', number: 3, parentId: 's', status: 'done', owner: '我' },
  { id: 'b', kind: 'bug', title: '修复', number: 4, parentId: 'e', status: 'todo', owner: '其他成员' },
  { id: 'r', kind: 'task', title: '未归类', number: 5, status: 'todo', owner: '我' },
];
test('roadmap filters retain ancestor paths, find hidden descendants and distinguish subtask visibility', () => {
  assert.deepEqual(roadmapRows(items,project).map(r=>r.item.id),['e','s','b','r']);
  assert.deepEqual(roadmapRows(items,project,{collapsed:new Set(['e'])}).map(r=>r.item.id),['e','r']);
  const match=roadmapRows(items,project,{query:'HS-3',subtask:true,collapsed:new Set(['e','s'])});
  assert.deepEqual(match.map(r=>r.item.id),['e','s','t']);
  assert.deepEqual(match.map(r=>r.contextOnly),[true,true,false]);
  assert.deepEqual(roadmapRows(items,project,{status:'done',owner:'我'}).map(r=>r.item.id),['e','s']);
  assert.equal(roadmapRows(items,project,{query:'不存在'}).length,0);
});
test('planning progress counts standard work only, so completed subtasks never inflate epic completion', () => {
  assert.deepEqual(roadmapProgress(items[0],items,project),{done:1,total:2,percent:50});
  assert.deepEqual(roadmapProgress(items[1],items,project),{done:1,total:1,percent:100});
  assert.deepEqual(roadmapProgress({...items[0],id:'empty'},items,project),{done:0,total:0,percent:0});
});

test('dragging preserves duration across month boundaries within project and parent dates', () => {
  const project = { startDate: '2024-01-01', endDate: '2024-04-30' };
  const parent = { id: 'parent', startDate: '2024-02-01', endDate: '2024-03-10' };
  const item = { id: 'work', parentId: 'parent', startDate: '2024-02-28', endDate: '2024-03-02' };
  assert.deepEqual(dragRoadmapDates(item, [parent,item], project, 'move', 1), { startDate: '2024-02-29', endDate: '2024-03-03', limited: false });
  assert.deepEqual(dragRoadmapDates(item, [parent,item], project, 'move', 100), { startDate: '2024-03-07', endDate: '2024-03-10', limited: true });
  assert.deepEqual(dragRoadmapDates(item, [parent,item], project, 'move', -100), { startDate: '2024-02-01', endDate: '2024-02-04', limited: true });
  assert.equal(item.startDate, '2024-02-28');
});
test('linked gestures allow shrinking a parent with same-day children without reversing its dates', () => {
  const project = { startDate: '2026-01-01', endDate: '2026-12-31' };
  const item = { id: 'parent', startDate: '2026-02-01', endDate: '2026-02-28' };
  const child = { id: 'child', parentId: 'parent', startDate: '2026-02-01', endDate: '2026-02-28' };
  const before = structuredClone([item,child]);
  assert.deepEqual(dragRoadmapDates(item, [item,child], project, 'move', 10, true), { startDate: '2026-02-11', endDate: '2026-03-10', limited: false });
  assert.deepEqual(dragRoadmapDates(item, [item,child], project, 'start', 10, true), { startDate: '2026-02-11', endDate: '2026-02-28', limited: false });
  assert.deepEqual(dragRoadmapDates(item, [item,child], project, 'end', -10, true), { startDate: '2026-02-01', endDate: '2026-02-18', limited: false });
  assert.deepEqual(dragRoadmapDates(item, [item,child], project, 'start', 100, true), { startDate: '2026-02-28', endDate: '2026-02-28', limited: true });
  assert.deepEqual(dragRoadmapDates(item, [item,child], project, 'end', -100, true), { startDate: '2026-02-01', endDate: '2026-02-01', limited: true });
  assert.deepEqual([item,child], before);
  assert.equal(dragRoadmapDates({}, [], project, 'move', 1), null);
});
test('daily zoom shows fourteen dated days across leap days and year boundaries', () => {
  const leap = roadmapWindow('2024-02-28', 'day');
  assert.equal(leap.days, 14);
  assert.equal(leap.ticks.length, 14);
  assert.equal(leap.ticks[1].date, '2024-02-29');
  assert.equal(leap.endDate, '2024-03-12');
  assert.equal(leap.segments.length, 2);
  assert.equal(leap.segments.reduce((sum, s) => sum + s.width, 0), 100);
  assert.equal(shiftRoadmap('2026-12-25', 'day', 1), '2027-01-08');
  assert.equal(shiftRoadmap('2027-01-08', 'day', -1), '2026-12-25');
  assert.equal(roadmapWindow('2026-12-25', 'day').endDate, '2027-01-07');
  const last = roadmapBar({ startDate: leap.endDate, endDate: leap.endDate }, leap);
  assert.ok(Math.abs(last.width - 100 / 14) < 1e-10);
});


test('all zoom levels include the full project, work and release span beyond the selected period', () => {
  const project = { startDate: '2025-12-20', endDate: '2027-03-15' };
  const item = { startDate: '2025-11-01', endDate: '2027-04-10' };
  for (const scale of ['year', 'quarter', 'month', 'day']) {
    const timeline = roadmapTimeline('2026-11-03', scale, project, [item], [{ plannedDate: '2027-05-01' }]);
    assert.ok(timeline.startDate <= item.startDate);
    assert.ok(timeline.endDate >= '2027-05-01');
    assert.equal(roadmapBar(item, timeline).clippedStart, false);
    assert.equal(roadmapBar(item, timeline).clippedEnd, false);
    assert.ok(Math.abs(timeline.segments.reduce((sum,s) => sum+s.width,0)-100)<1e-8);
    assert.equal(new Set(timeline.ticks.map(t=>t.date)).size,timeline.ticks.length);
    assert.ok(timeline.ticks.every(t=>t.left>=0 && t.left<100));
  }
});

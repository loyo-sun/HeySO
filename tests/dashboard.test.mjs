import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultWorkConfig } from '../shared/work-config.mjs';
import { dashboardTodos, matchesTodoScope, localDay } from '../src/dashboard.mjs';

test('dashboard aggregates actionable work across projects with each project’s workflow', () => {
  const first = { id: 'a', name: '甲', code: 'A', workConfig: defaultWorkConfig() };
  first.workConfig.workflowScheme.defaultWorkflowId = 'delivery';
  const second = { id: 'b', name: '乙', code: 'B', workConfig: defaultWorkConfig() };
  second.workConfig.statuses.push({ id: 'verified', name: '已验证', category: 'done', enabled: true });
  second.workConfig.types.push({ id: 'custom-task', name: '自定义任务', level: 0, enabled: true });
  const rows = [
    { id: 'future', projectId: 'a', kind: 'task', status: 'todo', endDate: '2026-11-06' },
    { id: 'due', projectId: 'b', kind: 'custom-task', status: 'active', dueDate: '2026-11-04' },
    { id: 'late', projectId: 'b', kind: 'subtask', status: 'todo', endDate: '2026-11-03' },
    { id: 'done', projectId: 'a', kind: 'story', status: 'done' },
    { id: 'cancelled', projectId: 'a', kind: 'task', status: 'cancelled' },
    { id: 'custom-done', projectId: 'b', kind: 'custom-task', status: 'verified' },
    { id: 'epic', projectId: 'a', kind: 'epic', status: 'todo' },
    { id: 'orphan', projectId: 'missing', kind: 'task', status: 'todo' },
    { id: 'no-date', projectId: 'a', kind: 'bug', status: 'blocked' },
  ];
  const data = { projects: [first, second], items: rows };
  const snapshot = structuredClone(data);
  const todos = dashboardTodos(data, '2026-11-04');
  assert.deepEqual(todos.map(row => row.item.id), ['late', 'due', 'future', 'no-date']);
  assert.equal(todos[0].project, second);
  assert.equal(todos.filter(row => matchesTodoScope(row, 'overdue')).length, 1);
  assert.equal(todos.filter(row => matchesTodoScope(row, 'today')).length, 1);
  assert.equal(todos.filter(row => matchesTodoScope(row, 'blocked')).length, 1);
  assert.equal(todos.filter(row => matchesTodoScope(row, 'review')).length, 0);
  assert.deepEqual(data, snapshot);
});

test('empty workspaces and local calendar dates are supported', () => {
  assert.deepEqual(dashboardTodos({ projects: [], items: [] }), []);
  assert.equal(localDay(new Date(2026, 10, 4, 0, 15)), '2026-11-04');
});

test('relative deadlines count calendar days over month and year boundaries', async () => {
  const {relativeDueDate} = await import('../src/dashboard.mjs');
  assert.equal(relativeDueDate('', '2026-12-31'), '未设截止日期');
  assert.equal(relativeDueDate('2026-12-31', '2026-12-31'), '今天');
  assert.equal(relativeDueDate('2027-01-01', '2026-12-31'), '明天');
  assert.equal(relativeDueDate('2026-12-30', '2026-12-31'), '昨天 · 已逾期');
  assert.equal(relativeDueDate('2026-12-28', '2026-12-31'), '已逾期 3 天');
  assert.equal(relativeDueDate('2027-01-02', '2026-12-31'), '2 天后');
});

test('sprint summaries include inherited children and frozen history without counting cancelled as done', async () => {
  const {dashboardSprints} = await import('../src/dashboard.mjs');
  const project = {id:'p', workConfig:defaultWorkConfig()};
  project.workConfig.workflowScheme.defaultWorkflowId = 'delivery';
  const data = {projects:[project],items:[
    {id:'parent',projectId:'p',sprintId:'live',kind:'story',status:'done'},
    {id:'child',parentId:'parent',projectId:'p',kind:'subtask',status:'todo'},
    {id:'cancelled',projectId:'p',sprintId:'live',kind:'task',status:'cancelled'},
  ],sprints:[{id:'old',projectId:'p',status:'closed',finalItems:[{id:'historic',kind:'task',status:'done'}]}, {id:'live',projectId:'p',status:'active'}, {id:'empty',projectId:'p',status:'planning'}]};
  const before = structuredClone(data), rows = dashboardSprints(data);
  assert.equal(rows[0].sprint.id,'live');
  assert.deepEqual([rows[0].total,rows[0].done,rows[0].cancelled,rows[0].percent],[3,1,1,33]);
  assert.equal(rows.find(r=>r.sprint.id==='old').percent,100);
  assert.equal(rows.find(r=>r.sprint.id==='empty').percent,0);
  assert.deepEqual(dashboardSprints(data,'missing'),[]);
  assert.deepEqual(data,before);
});

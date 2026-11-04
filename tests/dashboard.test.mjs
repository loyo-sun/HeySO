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

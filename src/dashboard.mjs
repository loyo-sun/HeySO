import { sprintHistoryItems } from './sprint-items.mjs';
import { isWorkItem, isSubtask, terminal, categoryOf, effectiveSprintId } from '../shared/work-config.mjs';

export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function dashboardTodos(data, today = localDay()) {
  const projects = new Map(data.projects.map(project => [project.id, project]));
  return data.items.flatMap(item => {
    const project = projects.get(item.projectId);
    if (!project || (!isWorkItem(item, project) && !isSubtask(item, project)) || terminal(item, project)) return [];
    const dueDate = item.endDate || item.dueDate || '';
    return [{ item, project, dueDate, overdue: !!dueDate && dueDate < today, today: dueDate === today, stage: categoryOf(project, item.status, item.kind) }];
  }).sort((a, b) => Number(b.overdue) - Number(a.overdue)
    || (a.dueDate || '9999').localeCompare(b.dueDate || '9999')
    || ({ high: 0, medium: 1, low: 2 }[a.item.priority] ?? 3) - ({ high: 0, medium: 1, low: 2 }[b.item.priority] ?? 3)
    || a.project.name.localeCompare(b.project.name, 'zh-CN') || a.item.number - b.item.number);
}

export const matchesTodoScope = (row, scope) => scope === 'all' || (scope === 'overdue' ? row.overdue : scope === 'today' ? row.today : row.stage === scope);

// Calendar-day arithmetic avoids DST changing a day into 23 or 25 hours.
export function relativeDueDate(value, today = localDay()) {
  if (!value) return '未设截止日期';
  const day = date => {const [y,m,d] = date.split('-').map(Number); return Date.UTC(y,m-1,d) / 86400000;};
  const distance = day(value) - day(today);
  if (!Number.isFinite(distance)) return value;
  return distance === 0 ? '今天' : distance === 1 ? '明天' : distance === -1 ? '昨天 · 已逾期' : distance < 0 ? `已逾期 ${-distance} 天` : `${distance} 天后`;
}

export function dashboardSprints(data, projectId = 'all') {
  const projects = new Map(data.projects.map(p => [p.id,p]));
  return (data.sprints || []).filter(s => projects.has(s.projectId) && (projectId === 'all' || s.projectId === projectId)).map(sprint => {
    const project = projects.get(sprint.projectId);
    const rows = (sprint.status === 'closed' ? sprintHistoryItems(sprint,data.items,project) : data.items.filter(i => i.projectId === project.id && effectiveSprintId(i,data.items,project) === sprint.id)).filter(i => isWorkItem(i,project) || isSubtask(i,project));
    const done = rows.filter(i => categoryOf(project,i.status,i.kind) === 'done').length;
    const cancelled = rows.filter(i => categoryOf(project,i.status,i.kind) === 'cancelled').length;
    return {sprint,project,total:rows.length,done,cancelled,percent:rows.length ? Math.round(done / rows.length * 100) : 0};
  }).sort((a,b) => ({active:0,planned:1,planning:1,closed:2}[a.sprint.status] ?? 3) - ({active:0,planned:1,planning:1,closed:2}[b.sprint.status] ?? 3) || (b.sprint.endDate || '').localeCompare(a.sprint.endDate || ''));
}

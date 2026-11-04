import { isWorkItem, isSubtask, terminal, categoryOf } from '../shared/work-config.mjs';

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

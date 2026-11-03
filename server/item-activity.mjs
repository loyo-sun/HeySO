import { typeNames, statusNamesFor } from '../shared/work-config.mjs';

const fields = [
  ['title','标题'], ['description','描述与上下文'], ['acceptance','验收标准'],
  ['kind','类型'], ['status','状态'], ['owner','负责人'], ['priority','优先级'],
  ['points','故事点'], ['startDate','开始日期'], ['endDate','结束日期'],
  ['parentId','父级工作项'], ['sprintId','冲刺'], ['releaseId','版本'],
  ['aiEnabled','AI 执行'], ['goal','目标'],
];
const value = (item, field) => field === 'endDate' ? item.endDate || item.dueDate || null : field === 'aiEnabled' ? !!item.aiEnabled : item[field] ?? null;
function display(state, item, field, raw) {
  if (field === 'aiEnabled') return raw ? '开启' : '关闭';
  if (raw === null || raw === '') return field === 'parentId' ? '根层级 / 未归类' : '未设置';
  const project = state.projects.find(p => p.id === item.projectId);
  if (field === 'kind') return typeNames(project)[raw] || raw;
  if (field === 'status') return statusNamesFor(project)[raw] || raw;
  if (field === 'priority') return ({high:'高',medium:'中',low:'低'})[raw] || raw;
  if (field === 'parentId') {
    const parent = state.items.find(i => i.id === raw);
    return parent ? `${project.code}-${parent.number} · ${parent.title}` : String(raw);
  }
  if (field === 'sprintId') return state.sprints.find(i => i.id === raw)?.name || String(raw);
  if (field === 'releaseId') return state.releases.find(i => i.id === raw)?.name || String(raw);
  return String(raw);
}
export function captureItemActivity(state) {
  return new Map(state.items.map(item => [item.id, fields.map(([field,label]) => {
    const raw = value(item,field);
    return { field, label, value: raw, text: display(state,item,field,raw) };
  })]));
}
export function itemActivityChanges(before, state, item) {
  const previous = before.get(item.id);
  if (!previous) return [];
  return previous.flatMap(old => {
    const raw = value(item,old.field);
    if (old.value === raw || ((old.value === null || old.value === '') && (raw === null || raw === ''))) return [];
    return [{ field: old.field, label: old.label, before: old.value, after: raw, beforeText: old.text, afterText: display(state,item,old.field,raw) }];
  });
}
export function activityDetail(changes, note = '') {
  return [...changes.map(c => `${c.label}：${c.beforeText} → ${c.afterText}`), note].filter(Boolean).join('\n');
}

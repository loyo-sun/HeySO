import {canParent, typeFor, categoryOf, statusFor, workflowFor, aiReady} from './work-config.mjs';

// The stored item order is the roadmap's default sibling order.
export function roadmapSiblings(items, item) {
  return items.filter(candidate => candidate.projectId === item.projectId && (candidate.parentId || null) === (item.parentId || null));
}

export function reorderedSiblingIds(siblings, id, targetId, position) {
  const ids = siblings.map(item => item.id);
  if (id === targetId || !ids.includes(id) || !ids.includes(targetId) || !['before', 'after'].includes(position)) return null;
  const next = ids.filter(value => value !== id);
  next.splice(next.indexOf(targetId) + (position === 'after' ? 1 : 0), 0, id);
  return next.every((value, index) => value === ids[index]) ? null : next;
}

export function roadmapTreeSnapshot(items, project) {
  return JSON.stringify([project.workflowRevision||0, project.hierarchyRevision||0,
    items.filter(i=>i.projectId===project.id).map(i=>[i.id,i.parentId||null,i.kind,i.contentVersion||1,i.status,i.sprintId||null])]);
}

export function roadmapMovePlan(project, items, source, target, position) {
  if (!source || !target || source.projectId!==project.id || target.projectId!==project.id) return {error:'只能在当前项目内移动'};
  if (source.id===target.id || !['before','inside','after'].includes(position)) return {error:'请选择其他工作项作为放置位置'};
  let ancestor=target,seen=new Set();
  while (ancestor) {
    if (ancestor.id===source.id || seen.has(ancestor.id)) return {error:'不能移入自身或自己的子项'};
    seen.add(ancestor.id);ancestor=items.find(i=>i.id===ancestor.parentId);
  }
  const parent=position==='inside'?target:items.find(i=>i.id===target.parentId);
  let kind=source.kind;
  if (kind==='task' && typeFor(project,parent?.kind)?.level===0) kind='subtask';
  else if (kind==='subtask' && (!parent || typeFor(project,parent.kind)?.level>0)) kind='task';
  const type=typeFor(project,kind);
  if (!type?.enabled || type.hidden) return {error:'目标层级需要的工作项类型尚未启用'};
  if (kind!==source.kind && items.some(i=>i.parentId===source.id)) return {error:'含有子项的任务不能转为子任务，请先调整其子项'};
  if (parent && !canParent(project,kind,parent)) return {error:'当前工作项类型不能放入该层级'};
  if(kind!==source.kind){
    const stage=categoryOf(project,source.status,source.kind),next=statusFor(project,stage,kind);
    if(!next||categoryOf(project,next,kind)!==stage)return {error:'目标类型工作流缺少对应状态，请先配置后再移动'};
    if(source.aiEnabled&&!aiReady(workflowFor(project,kind)))return {error:'目标类型未配置 AI 执行和验收节点'};
  }
  if(parent&&(source.parentId!==parent.id||source.kind!==kind)){
    const end=source.endDate||source.dueDate;
    if(source.startDate&&parent.startDate&&source.startDate<parent.startDate||end&&parent.endDate&&end>parent.endDate)return {error:'计划日期超出目标工作项的周期，请先调整日期'};
  }
  return {parentId:parent?.id||null,kind};
}

export function roadmapDropPosition(offset, height) {
  const fraction=offset/height;
  return fraction<.25?'before':fraction>.75?'after':'inside';
}

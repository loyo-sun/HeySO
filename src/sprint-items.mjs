import {effectiveSprintId,isSubtask} from '../shared/work-config.mjs';

export const sprintPlanningItems=(items,project)=>items.map(item=>({...item,sprintId:effectiveSprintId(item,items,project)}));
export const canMoveSprintItem=(item,target,project)=>!isSubtask(item,project)||(item.sprintId||null)===target;

// New snapshots retain every type and inherited child membership at close time.
export function sprintHistoryItems(sprint, items, project) {
  if (Array.isArray(sprint.finalItems)) return sprint.finalItems;
  const frozen = sprint.finalStories || [];
  const ids = new Set(frozen.map(i=>i.id));
  const candidates = items.filter(i=>i.projectId===sprint.projectId && !ids.has(i.id) && (!i.createdAt || !sprint.completedAt || i.createdAt<=sprint.completedAt));
  const recovered = candidates.filter(i=>!isSubtask(i,project) && i.sprintId===sprint.id);
  const parents = new Set([...ids,...recovered.map(i=>i.id)]);
  for (const i of candidates) if (isSubtask(i,project) && parents.has(i.parentId)) recovered.push(i);
  // Legacy child values were never captured: expose their provenance explicitly.
  return [...frozen,...recovered.map(i=>({...i,sprintId:sprint.id,historyRecovered:true}))];
}

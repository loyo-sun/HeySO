import {effectiveSprintId,isSubtask} from '../shared/work-config.mjs';

export const sprintPlanningItems=(items,project)=>items.map(item=>({...item,sprintId:effectiveSprintId(item,items,project)}));
export const canMoveSprintItem=(item,target,project)=>!isSubtask(item,project)||(item.sprintId||null)===target;

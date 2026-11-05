import {allowedTransition,categoryOf,hasStatus,isExecutionItem,workflowFor,workflowStatuses} from '../shared/work-config.mjs';

export function detailStatusOptions(project,item) {
 return workflowStatuses(project,item.kind).filter(status=>status.id===item.status || (
  status.enabled && allowedTransition(project,item.status,status.id,item.kind) &&
  (!isExecutionItem(item,project)||!workflowFor(project,item.kind).rules?.requireReview||categoryOf(project,status.id,item.kind)!=='done'||hasStatus(item,project,'done'))
 ));
}

import {runTargetId} from './work-config.mjs';

// Acceptance closes only older unreviewed deliveries belonging to this exact item.
// Deterministic IDs make this safe to repeat when loading older project files.
export function closeSupersededRuns(state,accepted){
  if(accepted?.status!=='accepted')return [];
  const runs=state.runs||[],acceptedIndex=runs.indexOf(accepted),target=runTargetId(accepted);
  const at=accepted.reviews?.findLast(r=>r.decision==='accept')?.at||accepted.submittedAt||accepted.createdAt;
  if(!at||!target)return [];
  const closed=[];
  for(const [index,run] of runs.entries()){
    if(run===accepted||run.status!=='review'||run.projectId!==accepted.projectId||runTargetId(run)!==target)continue;
    const earlier=run.createdAt&&accepted.createdAt?(run.createdAt<accepted.createdAt||(run.createdAt===accepted.createdAt&&index<acceptedIndex)):index<acceptedIndex;
    if(!earlier||(run.submittedAt&&run.submittedAt>at))continue;
    const review={id:`review_auto_${run.id}_${accepted.id}`,decision:'changes',comment:'新任务已执行',author:'系统',at,storyVersion:run.itemVersion??run.storyVersion,automatic:true,reason:'new_run_accepted',triggerRunId:accepted.id};
    run.reviews??=[];run.reviews.push(review);run.status='changes';
    run.supersededByRunId=accepted.id;
    state.events??=[];
    state.events.unshift({id:`event_auto_${run.id}_${accepted.id}`,projectId:run.projectId,itemId:target,runId:run.id,type:'review',title:'系统自动闭环执行记录',detail:`新任务已执行。新执行 ${accepted.id} 验收通过，系统自动将较早的待验收记录 ${run.id} 标记为要求修改，完成历史执行闭环。`,actor:'系统',at,automatic:true,reason:'new_run_accepted',triggerRunId:accepted.id,changes:[{field:'run.status',label:'执行记录状态',before:'review',after:'changes',beforeText:'待验收',afterText:'要求修改'}]});
    closed.push(run.id);
  }
  return closed;
}
export function reconcileSupersededRuns(state){
  for(const run of state.runs||[])if(run.status==='accepted')closeSupersededRuns(state,run);
  return state;
}

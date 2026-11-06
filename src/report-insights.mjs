import {isWorkItem,isExecutionItem,typeFor} from '../shared/work-config.mjs';
import {DAY,localReportDay,reportStage,reportDays,dayEnd} from './reports-model.mjs';

const stamp=value=>value?new Date(value).getTime():NaN;
export function buildProductInsights({project,items=[],runs=[],from,to,match=()=>true,now=Date.now()}){
 const today=localReportDay(now),all=items.filter(i=>i.projectId===project.id),byId=new Map(all.map(i=>[i.id,i]));
 const rows=all.filter(i=>isWorkItem(i,project)&&match(i));
 const stage=i=>reportStage(project,i.status,i.kind),open=rows.filter(i=>!['done','cancelled'].includes(stage(i)));
 const risks=[
  {id:'overdue',label:'已逾期',description:'结束日期已过，工作仍未完成',rows:open.filter(i=>i.endDate&&i.endDate<today)},
  {id:'blocked',label:'被阻塞',description:'当前处于阻塞阶段',rows:open.filter(i=>stage(i)==='blocked')},
  {id:'unassigned',label:'未分配负责人',description:'尚未明确由谁推进',rows:open.filter(i=>!i.owner)},
  {id:'unscheduled',label:'未安排交付',description:'尚未关联冲刺或版本',rows:open.filter(i=>!i.sprintId&&!i.releaseId)},
  {id:'unestimated',label:'未估算',description:'没有故事点估算，0 点视为已估算',rows:open.filter(i=>i.points===null||i.points===undefined)},
 ];
 const riskIds=new Set(risks.flatMap(r=>r.rows.map(i=>i.id))),riskRows=open.filter(i=>riskIds.has(i.id));
 function ancestors(item){const result=[],seen=new Set([item.id]);let parent=byId.get(item.parentId);while(parent&&!seen.has(parent.id)){seen.add(parent.id);result.push(parent);parent=byId.get(parent.parentId);}return result;}
 const goals=all.filter(i=>(typeFor(project,i.kind)?.level??0)>0).map(item=>{
  const descendants=rows.filter(i=>ancestors(i).some(a=>a.id===item.id));
  const done=descendants.filter(i=>stage(i)==='done'),cancelled=descendants.filter(i=>stage(i)==='cancelled');
  const denominator=descendants.length-cancelled.length;
  return {item,rows:descendants,done:done.length,total:descendants.length,cancelled:cancelled.length,percent:denominator?Math.round(done.length/denominator*100):null,overdue:descendants.filter(i=>risks[0].rows.includes(i)).length,depth:ancestors(item).length};
 }).filter(g=>g.total||match(g.item));
 const goalMap=new Map(goals.map(g=>[g.item.id,g])),orderedGoals=[],seenGoals=new Set();
 const visitGoal=g=>{if(seenGoals.has(g.item.id))return;seenGoals.add(g.item.id);orderedGoals.push(g);for(const child of goals.filter(c=>c.item.parentId===g.item.id))visitGoal(child);};
 for(const g of goals.filter(g=>!goalMap.has(g.item.parentId)))visitGoal(g);
 for(const g of goals)visitGoal(g);
 const unlinked=rows.filter(i=>!ancestors(i).some(a=>(typeFor(project,a.kind)?.level??0)>0));
 const start=stamp(from+'T00:00:00'),end=Math.min(dayEnd(to),now),inPeriod=value=>Number.isFinite(stamp(value))&&stamp(value)>=start&&stamp(value)<=end;
 const scopedRuns=runs.filter(r=>(!r.createdAt||!Number.isFinite(stamp(r.createdAt))||stamp(r.createdAt)<=now)&&r.projectId===project.id&&byId.has(r.itemId||r.storyId)&&isExecutionItem(byId.get(r.itemId||r.storyId),project)&&match(byId.get(r.itemId||r.storyId)));
 const records=scopedRuns.filter(r=>inPeriod(r.createdAt)||inPeriod(r.submittedAt)||(r.reviews||[]).some(v=>inPeriod(v.at))).map(run=>({run,item:byId.get(run.itemId||run.storyId)})).sort((a,b)=>stamp(b.run.submittedAt||b.run.createdAt)-stamp(a.run.submittedAt||a.run.createdAt));
 const submissions=scopedRuns.filter(r=>inPeriod(r.submittedAt));
 const decisions=submissions.flatMap(run=>{const review=(run.reviews||[]).filter(v=>['accept','changes'].includes(v.decision)&&stamp(v.at)>=stamp(run.submittedAt)&&stamp(v.at)<=end).sort((a,b)=>stamp(a.at)-stamp(b.at))[0];return review?[{run,review}]:[];});
 const pending=scopedRuns.filter(r=>r.status==='review'),active=scopedRuns.filter(r=>['active','blocked'].includes(r.status));
 const accepted=decisions.filter(d=>d.review.decision==='accept'),changes=decisions.filter(d=>d.review.decision==='changes');
 const reviewTimes=decisions.map(d=>(stamp(d.review.at)-stamp(d.run.submittedAt))/DAY);
 const aiSeries=reportDays(from,to).map(date=>({date,label:date.slice(5),submitted:submissions.filter(r=>localReportDay(r.submittedAt)===date).length,accepted:scopedRuns.filter(r=>(r.reviews||[]).some(v=>v.decision==='accept'&&inPeriod(v.at)&&localReportDay(v.at)===date)).length,changes:scopedRuns.filter(r=>(r.reviews||[]).some(v=>v.decision==='changes'&&inPeriod(v.at)&&localReportDay(v.at)===date)).length}));
 return {rows,open,actionable:rows.filter(i=>stage(i)!=='cancelled'),done:rows.filter(i=>stage(i)==='done'),risks,riskRows,goals:orderedGoals,unlinked,ai:{records,pendingRecords:pending.map(run=>({run,item:byId.get(run.itemId||run.storyId)})),submissions,decisions,accepted,changes,pending,active,series:aiSeries,acceptance:decisions.length?Math.round(accepted.length/decisions.length*100):null,averageReviewDays:reviewTimes.length?reviewTimes.reduce((s,d)=>s+d,0)/reviewTimes.length:null}};
}

import {isWorkItem,categoryOf as workflowCategory,statusNamesFor,typeNames} from '../shared/work-config.mjs';
import {releaseRows} from './release-model.mjs';
export const reportStage=(project,status,kind)=>status==='cancelled'?'cancelled':workflowCategory(project,status,kind);
const categoryOf=reportStage;
export const DAY=86400000;
export const localReportDay=(value=new Date())=>{const d=new Date(value);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
export const dayEnd=day=>new Date(day+'T23:59:59.999').getTime();
export function reportDays(from,to){const a=new Date(from+'T12:00:00'),b=new Date(to+'T12:00:00'),days=[];if(!Number.isFinite(+a)||!Number.isFinite(+b)||a>b)return days;while(a<=b&&days.length<366){days.push(localReportDay(a));a.setDate(a.getDate()+1);}return days;}
export const reportPoints=rows=>rows.reduce((sum,i)=>sum+(Number(i.points)||0),0);
export const measure=(rows,unit)=>unit==='points'?reportPoints(rows):rows.length;
const timestamp=value=>value?new Date(value).getTime():NaN;
export function statusHistory(events,itemId){return events.filter(e=>e.itemId===itemId&&e.changes?.some(c=>c.field==='status')).flatMap(e=>e.changes.filter(c=>c.field==='status').map(c=>({at:timestamp(e.at),before:c.before,after:c.after}))).filter(e=>Number.isFinite(e.at)).sort((a,b)=>a.at-b.at);}
export function completedTime(item,history,project){if(categoryOf(project,item.status,item.kind)!=='done')return null;const event=history.findLast(h=>categoryOf(project,h.after,item.kind)==='done');const time=timestamp(item.completedAt)||event?.at;return Number.isFinite(time)?time:null;}
export function reportCycle(item,history,project){
 const end=completedTime(item,history,project);if(!end)return null;
 const working=status=>['active','review','blocked'].includes(categoryOf(project,status,item.kind));
 let start=null,duration=0,entered=false;
 for(const h of history){if(h.at>end)break;if(start!==null)duration+=Math.max(0,h.at-start);start=working(h.after)?h.at:null;if(start!==null)entered=true;}
 if(start!==null)duration+=Math.max(0,end-start);
 return entered?{item,end,days:duration/DAY,leadDays:Number.isFinite(timestamp(item.createdAt))?Math.max(0,(end-timestamp(item.createdAt))/DAY):null}:null;
}
export function reportStatusAt(item,history,at,now){
 const created=timestamp(item.createdAt);if(!Number.isFinite(created)||created>at)return undefined;
 if(at>=now)return item.status;
 const change=history.findLast(h=>h.at<=at);if(change)return change.after;
 if(history.length)return history[0].before;
 const completed=timestamp(item.completedAt);return Number.isFinite(completed)&&completed<=at?item.status:null;
}
export function buildReports({project,items,sprints=[],releases=[],events=[],from,to,owner='all',kind='all',release='all',unit='count',now=Date.now()}){
 const projectItems=items.filter(i=>i.projectId===project.id),match=i=>(owner==='all'||(i.owner||'')===owner)&&(kind==='all'||i.kind===kind)&&(release==='all'||(i.releaseId||'')===release);
 const rows=projectItems.filter(i=>isWorkItem(i,project)&&match(i)&&(!i.createdAt||timestamp(i.createdAt)<=dayEnd(to)));
 const histories=new Map(rows.map(i=>[i.id,statusHistory(events,i.id)])),done=rows.filter(i=>categoryOf(project,i.status,i.kind)==='done'),unfinished=rows.filter(i=>!['done','cancelled'].includes(categoryOf(project,i.status,i.kind)));
 const days=reportDays(from,to),start=timestamp(from+'T00:00:00'),end=Math.min(dayEnd(to),now),completions=done.map(item=>({item,at:completedTime(item,histories.get(item.id),project)})).filter(r=>r.at!==null&&r.at>=start&&r.at<=end);
 const series=days.map(date=>{const at=Math.min(dayEnd(date),now),groups={todo:[],active:[],review:[],blocked:[],done:[],cancelled:[],unknown:[]};
  for(const item of rows){const status=reportStatusAt(item,histories.get(item.id),at,now);if(status===undefined)continue;const stage=status===null?'unknown':categoryOf(project,status,item.kind);(groups[stage==='backlog'?'todo':stage]||groups.unknown).push(item);}
  const open=[...groups.todo,...groups.active,...groups.review,...groups.blocked];
  const resolved=completions.filter(r=>localReportDay(r.at)===date&&Number.isFinite(timestamp(r.item.createdAt)));
  const cohort=rows.filter(i=>i.createdAt&&localReportDay(i.createdAt)===date&&timestamp(i.createdAt)<=now);
  const cohortDone=cohort.filter(i=>{const doneAt=completedTime(i,histories.get(i.id),project);return doneAt!==null&&doneAt<=end;});
  return {date,averageAge:open.length?open.reduce((a,i)=>a+Math.max(0,(at-timestamp(i.createdAt))/DAY),0)/open.length:null,ageSamples:open.length,ageIds:open.map(i=>i.id),resolution:resolved.length?resolved.reduce((a,r)=>a+Math.max(0,(r.at-timestamp(r.item.createdAt))/DAY),0)/resolved.length:null,createdResolved:cohortDone.length,createdUnresolved:cohort.length-cohortDone.length,created:rows.filter(i=>i.createdAt&&localReportDay(i.createdAt)===date&&timestamp(i.createdAt)<=now).length,resolved:completions.filter(r=>localReportDay(r.at)===date).length,...Object.fromEntries(Object.entries(groups).map(([key,items])=>[key,items.length]))};
 });
 const cycles=done.map(i=>reportCycle(i,histories.get(i.id),project)).filter(r=>r&&r.end>=start&&r.end<=end).sort((a,b)=>a.end-b.end),values=cycles.map(r=>r.days).sort((a,b)=>a-b),average=values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
 const aging=rows.filter(i=>{const status=reportStatusAt(i,histories.get(i.id),end,now);return status!==undefined&&status!==null&&!['done','cancelled'].includes(categoryOf(project,status,i.kind));}).filter(i=>Number.isFinite(timestamp(i.createdAt))).map(item=>({item,days:Math.max(0,(end-timestamp(item.createdAt))/DAY)})).sort((a,b)=>b.days-a.days);
 const distribution=field=>{const groups=new Map();for(const i of rows){const value=i[field]||'',label=field==='status'?(statusNamesFor(project)[value]||value):field==='kind'?(typeNames(project)[value]||value):field==='priority'?({high:'高',medium:'中',low:'低'})[value]||'未设置':field==='releaseId'?releases.find(r=>r.id===value)?.name||'未安排版本':field==='sprintId'?sprints.find(r=>r.id===value)?.name||'未安排冲刺':value||'未分配';if(!groups.has(value))groups.set(value,{key:value,label,rows:[]});groups.get(value).rows.push(i);}return [...groups.values()].map(g=>({...g,value:measure(g.rows,unit)})).sort((a,b)=>b.value-a.value);};
 const velocity=sprints.filter(s=>s.status==='closed').sort((a,b)=>String(a.completedAt).localeCompare(String(b.completedAt))).slice(-10).map(s=>{const actual=(s.finalStories||[]).filter(i=>isWorkItem(i,project)&&match(i)),baseline=(s.baseline||[]).filter(i=>match({...projectItems.find(x=>x.id===i.id),...i}));return {id:s.id,name:s.name,committed:measure(baseline,unit),completed:measure(actual.filter(i=>categoryOf(project,i.status,i.kind)==='done'),unit),rows:actual};});
 const versions=releases.filter(r=>release==='all'||r.id===release).map(r=>{const scope=releaseRows(r,projectItems).filter(i=>isWorkItem(i,project)&&match(i)),accepted=scope.filter(i=>categoryOf(project,i.status,i.kind)==='done');return {release:r,rows:scope,total:measure(scope,unit),done:measure(accepted,unit),count:scope.length,unestimated:scope.filter(i=>i.points===null||i.points===undefined).length};});
 return {rows,done,unfinished,completions,series,cycles,average,median:values.length?(values[Math.floor((values.length-1)/2)]+values[Math.ceil((values.length-1)/2)])/2:null,p85:values.length?values[Math.ceil(values.length*.85)-1]:null,aging,distribution,velocity,versions,unknownHistory:rows.filter(i=>!histories.get(i.id).length).length,unestimated:rows.filter(i=>i.points===null||i.points===undefined).length,match};
}
export function sprintReport(sprint,items,project,unit='count',match=()=>true,now=Date.now()){
 if(!sprint)return null;
 const current=(sprint.status==='closed'?sprint.finalStories||[]:items.filter(i=>i.sprintId===sprint.id)).filter(i=>isWorkItem(i,project)&&match(i));
 const baseline=(sprint.baseline||[]).filter(i=>match({...items.find(x=>x.id===i.id),...i}));
 const done=current.filter(i=>categoryOf(project,i.status,i.kind)==='done'),unfinished=current.filter(i=>!['done','cancelled'].includes(categoryOf(project,i.status,i.kind))),baselineIds=new Set(baseline.map(i=>i.id));
 const added=current.filter(i=>!baselineIds.has(i.id)),removed=baseline.filter(i=>!current.some(x=>x.id===i.id));
 // Aggregate snapshots contain points but not per-owner/type history. Never invent a filtered burn line.
 const snapshots=[...(sprint.snapshots||[])].sort((a,b)=>String(a.at).localeCompare(String(b.at))),pointsOnly=unit==='points';
 const available=sprint.status!=='planned'&&snapshots.length>0&&pointsOnly;
 const endDate=sprint.status==='closed'?localReportDay(sprint.completedAt||sprint.endDate):localReportDay(Math.min(dayEnd(sprint.endDate),now));
 const dates=available?reportDays(sprint.startDate,sprint.endDate):[],initial=reportPoints(baseline.filter(i=>!['done','cancelled'].includes(categoryOf(project,i.status,items.find(x=>x.id===i.id)?.kind||'story'))));
 const chart=dates.map((date,index)=>{const snapshot=snapshots.findLast(s=>localReportDay(s.at||s.date)===date)||snapshots.findLast(s=>localReportDay(s.at||s.date)<date);return {date,ideal:initial*(1-index/Math.max(1,dates.length-1)),remaining:date<=endDate&&snapshot?snapshot.remaining:null,scope:date<=endDate&&snapshot?snapshot.total:null};});
 return {current,baseline,done,unfinished,added:sprint.status==='planned'?[]:added,removed,chart,available,total:measure(current,unit),completed:measure(done,unit),commitment:measure(baseline,unit),changes:sprint.scopeChanges||[]};
}
export function reportCsv(rows,headers){const cell=value=>'"'+String(value??'').replaceAll('"','""').replace(/^\s*[=+@-]/,"'$&")+'"';return '\uFEFF'+[headers,...rows].map(row=>row.map(cell).join(',')).join('\r\n');}

export function cycleControlSamples(cycles){
 const windowSize=Math.max(5,Math.ceil(cycles.length*.2)|1),half=Math.floor(windowSize/2);
 return cycles.map((sample,index)=>{const window=cycles.slice(Math.max(0,index-half),Math.min(cycles.length,index+half+1)),average=window.reduce((s,r)=>s+r.days,0)/window.length,deviation=Math.sqrt(window.reduce((s,r)=>s+(r.days-average)**2,0)/window.length);return {...sample,rolling:average,lower:Math.max(0,average-deviation),upper:average+deviation};});
}

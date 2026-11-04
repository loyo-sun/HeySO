import {configFor,typeNames,statusNamesFor} from '../shared/work-config.mjs';
export const backlogColumns=[
  ['workItem','工作项',320],['status','状态',110],['priority','优先级',105],['owner','负责人',130],['points','故事点',90],
  ['kind','类型',100],['startDate','开始日期',120],['endDate','结束日期',120],['sprintId','冲刺',145],['releaseId','版本',130],['createdAt','创建时间',170],['updatedAt','更新时间',170],
].map(([id,label,width])=>({id,label,width}));
export const defaultBacklogPrefs=()=>({columns:['workItem','status','priority','owner','points'],sort:{key:'priority',direction:'desc'}});
export function normalizeBacklogPrefs(value){
  if(!value||!Array.isArray(value.columns))return defaultBacklogPrefs();
  const valid=new Set(backlogColumns.map(c=>c.id)),columns=['workItem',...new Set(value.columns.filter(id=>valid.has(id)&&id!=='workItem'))];
  const sort=columns.includes(value.sort?.key)&&['asc','desc'].includes(value.sort?.direction)?value.sort:{key:'workItem',direction:'asc'};
  return {columns,sort};
}
export function moveBacklogColumn(columns,from,to,edge){
  if(from===to||from==='workItem'||to==='workItem'||!columns.includes(from)||!columns.includes(to))return columns;
  const next=columns.filter(id=>id!==from),index=edge?next.indexOf(to)+(edge==='after'?1:0):columns.indexOf(to);next.splice(index,0,from);return next;
}
export function backlogValue(item,key,{project,items=[],sprints=[],releases=[]}){
  if(key==='workItem')return item.number===null||item.number===undefined?null:Number(item.number);
  if(key==='kind')return typeNames(project)[item.kind]||item.kind;
  if(key==='status')return statusNamesFor(project)[item.status]||item.status;
  if(key==='priority')return ({high:'高',medium:'中',low:'低'})[item.priority]||item.priority;
  if(key==='sprintId')return sprints.find(s=>s.id===item.sprintId)?.name;
  if(key==='releaseId')return releases.find(r=>r.id===item.releaseId)?.name;
  return item[key]??null;
}
export function sortBacklog(rows,sort,context){
  const collator=new Intl.Collator('zh-CN',{numeric:true,sensitivity:'base'}),direction=sort.direction==='desc'?-1:1;
  const value=i=>sort.key==='priority'?({high:3,medium:2,low:1})[i.priority]:sort.key==='status'?configFor(context.project).statuses.findIndex(s=>s.id===i.status):sort.key==='points'?i.points:backlogValue(i,sort.key,context);
  return rows.map((item,index)=>({item,index})).sort((a,b)=>{const x=value(a.item),y=value(b.item),empty=v=>v===null||v===undefined||v==='';if(empty(x)||empty(y))return empty(x)===empty(y)?a.index-b.index:empty(x)?1:-1;const cmp=typeof x==='number'&&typeof y==='number'?x-y:collator.compare(String(x),String(y));return cmp*direction||a.index-b.index;}).map(x=>x.item);
}

import {backlogValue} from './backlog-columns.mjs';
export const backlogRangeType=key=>['createdAt','updatedAt'].includes(key)?'datetime-local':['startDate','endDate'].includes(key)?'date':null;
export const hasBacklogFilter=value=>Array.isArray(value)||typeof value==='string'?value.length>0:!!(value?.from||value?.to);
export function backlogFilterValue(item,key){
  const value=item[key];
  return value===null||value===undefined?'':String(value);
}
export function backlogFilterOptions(rows,key,context){
  const options=new Map();
  for(const item of rows){
    const value=backlogFilterValue(item,key),label=backlogValue(item,key,context);
    options.set(value,{value,label:label===null||label===undefined||label===''?(key==='owner'?'未分配':key==='points'?'未估算':'未设置'):String(label)});
  }
  return [...options.values()].sort((a,b)=>a.label.localeCompare(b.label,'zh-CN',{numeric:true}));
}
export function filterBacklogRows(rows,filters,context){
  return rows.filter(item=>Object.entries(filters).every(([key,value])=>{
    if(key==='workItem')return `${context.project.code}-${item.number} ${item.title}`.toLowerCase().includes(String(value).trim().toLowerCase());
    const rangeType=backlogRangeType(key);
    if(rangeType){
      if(!hasBacklogFilter(value))return true;
      const raw=item[key];if(!raw)return false;
      if(rangeType==='date')return (!value.from||raw>=value.from)&&(!value.to||raw<=value.to);
      const time=new Date(raw).getTime(),from=value.from?new Date(value.from).getTime():-Infinity,to=value.to?new Date(value.to).getTime()+999:Infinity;
      return Number.isFinite(time)&&time>=from&&time<=to;
    }
    return !value.length||value.includes(backlogFilterValue(item,key));
  }));
}

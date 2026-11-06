import {canParent,configFor} from '../shared/work-config.mjs';
export function roadmapCreateTarget(project,items,source,kind){
 const parent=items.find(i=>i.id===source?.parentId);
 return source&&canParent(project,kind,source)?source:parent&&canParent(project,kind,parent)?parent:null;
}
export function roadmapCreateTypes(project){return configFor(project).types.filter(t=>t.enabled&&!t.hidden);}
export function roadmapFieldBounds(project,items,item,field){
 const parent=items.find(i=>i.id===item.parentId);
 const lower=[project.startDate,parent?.startDate,field==='endDate'?item.startDate:null].filter(Boolean).sort().at(-1);
 const upper=[project.endDate,parent?.endDate,field==='startDate'?item.endDate||item.dueDate:null].filter(Boolean).sort()[0];
 return {min:lower,max:upper};
}

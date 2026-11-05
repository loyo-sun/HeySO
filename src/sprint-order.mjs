export const sprintRank=item=>Number.isFinite(item.sprintRank)?item.sprintRank:item.number||0;
export const sortSprintItems=rows=>[...rows].sort((a,b)=>sprintRank(a)-sprintRank(b)||String(a.id).localeCompare(String(b.id)));
export function sprintInsertRank(rows,beforeId){
 const ordered=sortSprintItems(rows),index=beforeId?ordered.findIndex(i=>i.id===beforeId):-1;
 if(index<0)return ordered.length?sprintRank(ordered.at(-1))+1:0;
 return index?sprintRank(ordered[index-1])+(sprintRank(ordered[index])-sprintRank(ordered[index-1]))/2:sprintRank(ordered[0])-1;
}

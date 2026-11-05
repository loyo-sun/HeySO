export const boardRank = item => Number.isFinite(item.boardRank) ? item.boardRank : item.number || 0;
export const sortBoardItems = rows => [...rows].sort((a,b)=>boardRank(a)-boardRank(b)||String(a.id).localeCompare(String(b.id)));
export function boardInsertRank(rows, beforeId) {
  const ordered=sortBoardItems(rows),index=beforeId?ordered.findIndex(i=>i.id===beforeId):-1;
  if(index<0)return ordered.length?boardRank(ordered.at(-1))+1:0;
  return index?boardRank(ordered[index-1])+(boardRank(ordered[index])-boardRank(ordered[index-1]))/2:boardRank(ordered[0])-1;
}

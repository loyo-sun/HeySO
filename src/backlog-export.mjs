import {backlogValue,formatBacklogTimestamp} from './backlog-columns.mjs';

// Call with the complete filtered/sorted rows, before progressive rendering.
export function backlogExportRows(rows,columns,context){
  return [columns.map(c=>c.label),...rows.map(item=>columns.map(({id})=>{
    if(id==='workItem')return `${context.project.code}-${item.number} ${item.title}`;
    if(id==='owner')return item.owner||'未分配';
    if(['createdAt','updatedAt'].includes(id))return formatBacklogTimestamp(item[id]);
    const value=backlogValue(item,id,context);
    return value===null||value===undefined||value===''?'—':String(value);
  }))];
}
export function backlogCsv(rows,columns,context){
  const quote=value=>{
    const text=String(value??'');
    // Preserve text when spreadsheet applications interpret a leading formula.
    const safe=/^\s*[=+@-]/.test(text)?"'"+text:text;
    return '"'+safe.replaceAll('"','""')+'"';
  };
  return '\ufeff'+backlogExportRows(rows,columns,context).map(row=>row.map(quote).join(',')).join('\r\n');
}

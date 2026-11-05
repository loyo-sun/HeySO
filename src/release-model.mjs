import {categoryOf} from '../shared/work-config.mjs';
export const releaseRows=(release,items)=>release.status==='released' ? release.publishedStories||[] : items.filter(i=>i.releaseId===release.id);
export function releaseStats(release,items,project){
 const rows=releaseRows(release,items),groups={todo:[],active:[],done:[],cancelled:[]};
 for(const item of rows){const stage=categoryOf(project,item.status,item.kind);groups[stage==='done'?'done':stage==='cancelled'?'cancelled':['active','review','blocked'].includes(stage)?'active':'todo'].push(item);}
 return {...groups,rows,total:rows.length,unfinished:[...groups.todo,...groups.active],percent:rows.length?Math.round(groups.done.length/rows.length*100):0};
}
export function releaseState(release,today){return release.archived?'已归档':release.status==='released'?'已发布':release.plannedDate&&release.plannedDate<today?'已逾期':'未发布';}
export function releaseNotes(release,items,project){
 const stats=releaseStats(release,items,project);
 return `# ${release.name}\n\n${release.goal||'本次版本交付'}\n\n## 已完成工作\n\n`+stats.done.map(i=>`- ${project.code}-${i.number} ${i.title}`).join('\n');
}

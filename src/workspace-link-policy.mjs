import {safeMarkdownUrl} from './markdown-policy.mjs';
import {typeNames,typeColor,typeFor,statusNamesFor} from '../shared/work-config.mjs';
export function resolveWorkspaceLink(href,{project,items=[],baseUrl='http://localhost/'}={}){
  const safe=safeMarkdownUrl(href,'href');
  if(!safe)return {kind:'invalid',href:''};
  let url,base;try{base=new URL(baseUrl);url=new URL(safe,base);}catch{return {kind:'invalid',href:''};}
  if(!['http:','https:','mailto:'].includes(url.protocol))return {kind:'invalid',href:''};
  const loopback=h=>['localhost','127.0.0.1','[::1]'].includes(h);
  const sameOrigin=url.origin===base.origin||(loopback(url.hostname)&&loopback(base.hostname)&&url.port===base.port&&url.protocol===base.protocol);
  const projectId=url.searchParams.get('project')||project?.id;
  const itemId=url.searchParams.get('item')||url.searchParams.get('itemId');
  if(project&&sameOrigin&&url.pathname===base.pathname&&!url.username&&!url.password&&projectId===project.id&&itemId){
    const item=items.find(i=>i.projectId===project.id&&(i.id===itemId||`${project.code}-${i.number}`===itemId));
    if(!item)return {kind:'missing',href:url.href};
    return {kind:'internal',href:url.href,item,type:typeNames(project)[item.kind]||item.kind,status:statusNamesFor(project)[item.status]||item.status,title:item.title,code:`${project.code}-${item.number}`,color:typeColor(typeFor(project,item.kind))};
  }
  return {kind:'external',href:url.href,host:url.hostname||url.protocol};
}

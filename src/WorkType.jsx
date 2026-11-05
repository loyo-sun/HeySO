import React from 'react';
import {useWorkProject} from './WorkConfigContext.jsx';
import {typeFor,typeColor,typeIcon} from '../shared/work-config.mjs';
import {workTypeSymbols} from './work-type-symbols.mjs';
export const workTypeColor=(kind,type)=>typeColor(type||{id:kind});
export function TypeIcon({kind,type,size=14}){
 const project=useWorkProject(),resolved=type||typeFor(project,kind),symbol=workTypeSymbols[typeIcon(resolved)]||workTypeSymbols.task;
 return <svg className="builtin-work-type-svg" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{flexShrink:0}}><rect width="24" height="24" rx="4" fill={workTypeColor(kind,resolved)}/><g fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{__html:symbol.body}}/></svg>;
}
export default function WorkType({kind,type,iconOnly=false}){
 const project=useWorkProject(),resolved=type||typeFor(project,kind),color=workTypeColor(kind,resolved);
 return iconOnly?<span className="work-type-icon" role="img" aria-label={resolved?.name||kind} title={resolved?.name||kind}><TypeIcon kind={kind} type={resolved}/></span>:<span className="kind work-type" style={{color,backgroundColor:color+'12'}}><TypeIcon kind={kind} type={resolved}/>{resolved?.name||kind}</span>;
}

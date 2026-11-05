import React from 'react';
import Kind from './WorkType.jsx';
import {PriorityIcon} from './Select.jsx';
import {progressCategory,statusNamesFor} from '../shared/work-config.mjs';
import './sprint-workspace.css';
export const workStatusClass=(project,status)=>({todo:'todo',in_progress:'active',done:'done'}[progressCategory(project,status)]||status);
export default function SprintWorkRow({item:i,project,onOpen,className='',...props}) {
 return <div className={'sprint-work-row'+(className?' '+className:'')} data-work-item-id={i.id} {...props}>
  <button className="sprint-item-open" draggable={props.draggable||false} title={i.title} onClick={()=>onOpen(i)}><Kind kind={i.kind} iconOnly/><span>{i.title}</span></button>
  <div className="sprint-item-meta"><span className={'badge '+workStatusClass(project,i.status)}>{statusNamesFor(project)[i.status]||i.status}</span><span className="sprint-item-key">{project.code}-{i.number}</span><span className={'sprint-item-priority priority '+i.priority} role="img" aria-label={'优先级：'+({high:'高',medium:'中',low:'低'}[i.priority]||'未设置')} title={'优先级：'+({high:'高',medium:'中',low:'低'}[i.priority]||'未设置')}><PriorityIcon value={i.priority}/></span><span className="sprint-item-owner" title={i.owner||'未分配'}><span className="avatar">{(i.owner||'?').slice(0,1)}</span><span>{i.owner||'未分配'}</span></span><span className="sprint-item-points" aria-label={i.points?i.points+' 故事点':'未估算'} title={i.points?i.points+' 故事点':'未估算'}>{i.points||'—'}</span></div>
 </div>;
}

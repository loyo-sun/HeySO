import {ReplicaButton} from './ReplicaControls.jsx';
import {WorkListRow,AntTag,AntAvatar} from './AntStructures.jsx';
import React from 'react';
import Kind from './WorkType.jsx';
import {PriorityIcon} from './Select.jsx';
import {progressCategory,statusNamesFor} from '../shared/work-config.mjs';

export const workStatusClass=(project,status)=>({todo:'todo',in_progress:'active',done:'done'}[progressCategory(project,status)]||status);
export default function SprintWorkRow({item:i,project,onOpen,className='',...props}) {
 return <WorkListRow className={'sprint-work-row'+(className?' '+className:'')} data-work-item-id={i.id} {...props}>
  <ReplicaButton className="sprint-item-open" draggable={props.draggable||false} title={i.title} onClick={()=>onOpen(i)}><Kind kind={i.kind} iconOnly/><span>{i.title}</span></ReplicaButton>
  <div className="sprint-item-meta"><AntTag className={'badge '+workStatusClass(project,i.status)}>{statusNamesFor(project)[i.status]||i.status}</AntTag><span className="sprint-item-key">{project.code}-{i.number}</span><span className={'sprint-item-priority priority '+i.priority} role="img" aria-label={'优先级：'+({high:'高',medium:'中',low:'低'}[i.priority]||'未设置')} title={'优先级：'+({high:'高',medium:'中',low:'低'}[i.priority]||'未设置')}><PriorityIcon value={i.priority}/></span><span className="sprint-item-owner" title={i.owner||'未分配'}><AntAvatar className="avatar">{(i.owner||'?').slice(0,1)}</AntAvatar><span>{i.owner||'未分配'}</span></span><span className="sprint-item-points" aria-label={i.points?i.points+' 故事点':'未估算'} title={i.points?i.points+' 故事点':'未估算'}>{i.points||'—'}</span></div>
 </WorkListRow>;
}

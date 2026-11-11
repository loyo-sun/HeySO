import useViewPreferences from './useViewPreferences.jsx';
import {ReplicaField,ReplicaForm,ReplicaModal,ReplicaInput,ReplicaButton,ReplicaTextArea} from './ReplicaControls.jsx';
import {AntList,AntAlert,AntCount,AntEmpty} from './AntStructures.jsx';
import React, {useState,useRef,useEffect} from 'react';
import {Plus, Search, X, Calendar, ChevronDown, ChevronRight, Flag, ArrowUpRight} from 'lucide-react';
import Select, {PriorityIcon} from './Select.jsx';
import Kind from './WorkType.jsx';
import {hasStatus, terminal, progressCategory, isSubtask, isWorkItem} from '../shared/work-config.mjs';
import {canMoveSprintItem} from './sprint-items.mjs';
import {DateFields} from './Schedule.jsx';
import Presence from './Presence.jsx';
import RichTextEditor from './RichTextEditor.jsx';
import SprintWorkRow from './SprintWorkRow.jsx';
import SubtaskFilter from './SubtaskFilter.jsx';
import {sortSprintItems,sprintInsertRank} from './sprint-order.mjs';


export function sprintDate(value = new Date()) {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function sprintEnd(start, weeks = 2) {
  const d = new Date(start+'T12:00:00');d.setDate(d.getDate()+weeks*7-1);return sprintDate(d);
}
export default function SprintWorkspace({project, stories, sprints, releases = [], onRelease, busy, action, onOpen, onOpenSnapshot, onCreate, renderSprint}) {
  const prefs=useViewPreferences(project,'backlog',{query:'',history:false,showSubtasks:false,backlogExpanded:true,versionsOpen:false,versionFilter:'all',expandedSprints:{}});
  const [query,setQuery]=prefs.field('query'),[history,setHistory]=prefs.field('history'),[showSubtasks,setShowSubtasks]=prefs.field('showSubtasks'),[backlogExpanded,setBacklogExpanded]=prefs.field('backlogExpanded'),[versionsOpen,setVersionsOpen]=prefs.field('versionsOpen'),[versionFilter,setVersionFilter]=prefs.field('versionFilter');
  const [dragging,setDragging]=useState(null),[over,setOver]=useState(undefined),[dialog,setDialog]=useState(null);
  const dragItemRef=useRef(null),gestureRef=useRef(null),suppressClick=useRef(false);
  const [dragPoint,setDragPoint]=useState(null);
  useEffect(()=>()=>gestureRef.current?.cancel(),[]);
  const [insertBefore,setInsertBefore]=useState(null),[moveNotice,setMoveNotice]=useState('');
  const live=sprints.filter(s=>s.status!=='closed');
  const matches=i=>(showSubtasks||!isSubtask(i,project)) && (versionFilter === "all" || (versionFilter === "none" ? !i.releaseId : i.releaseId === versionFilter)) && `${project.code}-${i.number} ${i.title} ${i.owner||''}`.toLowerCase().includes(query.trim().toLowerCase());
  const backlog=stories.filter(i=>(!i.sprintId || !sprints.some(s=>s.id===i.sprintId)) && !terminal(i,project));
  const groups=(history?sprints.filter(s=>s.status==='closed'):live).slice().sort((a,b)=>history?String(b.completedAt).localeCompare(String(a.completedAt)):(a.status==='active'?-1:b.status==='active'?1:0));
  const canDrop=target=>{const item=stories.find(i=>i.id===dragItemRef.current);return !!item&&!busy&&canMoveSprintItem(item,target,project)&&(!terminal(item,project)||(item.sprintId||null)===target);};
  const insertion=(e,id=dragItemRef.current)=>[...e.currentTarget.querySelectorAll('.sprint-work-row')].find(node=>node.dataset.workItemId!==id&&e.clientY<node.getBoundingClientRect().top+node.getBoundingClientRect().height/2)?.dataset.workItemId||null;
  const clearDrag=()=>{dragItemRef.current=null;setDragging(null);setOver(undefined);setInsertBefore(null);};
  async function move(id,target,beforeId) {
    const item=stories.find(i=>i.id===id);
    if(busy||!item||!canMoveSprintItem(item,target,project)||(terminal(item,project)&&(item.sprintId||null)!==target)||(item.sprintId&&sprints.some(s=>s.id===item.sprintId&&s.status==='closed')))return;
    if(target&&!live.some(s=>s.id===target))return;
    const destination=(target===null?backlog:stories.filter(i=>i.sprintId===target)).filter(i=>i.id!==id),sprintRank=sprintInsertRank(destination,beforeId);
    const result=await action('item.update',{id,...(!isSubtask(item,project)?{sprintId:target}:{}),sprintRank,reason:(item.sprintId||null)===target?'调整冲刺内工作项顺序':'冲刺规划调整'});
    if(result)setMoveNotice(`${project.code}-${item.number} 已移动到${target?sprints.find(s=>s.id===target)?.name:'待办池'}的指定位置`);
  }
  function dropProps(target) {return {
    onDragOver:e=>{if(!dragItemRef.current)return;e.preventDefault();e.dataTransfer.dropEffect=canDrop(target)?'move':'none';if(canDrop(target)){setOver(target);setInsertBefore(insertion(e));}else{setOver(undefined);setInsertBefore(null);}},
    onDragLeave:e=>{if(!e.currentTarget.contains(e.relatedTarget)){setOver(undefined);setInsertBefore(null);}},
    onDrop:e=>{e.preventDefault();const id=(e.dataTransfer.getData('application/x-heyso-sprint-item')||e.dataTransfer.getData('text/plain')),beforeId=insertion(e,id),valid=canDrop(target);clearDrag();if(id&&valid)move(id,target,beforeId);},
  };}
  function beginSort(event,item){
    if(item.readOnly||busy||event.button!==0||!event.isPrimary||gestureRef.current)return;
    suppressClick.current=false;dragItemRef.current=item.id;
    const g={id:item.id,x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY,moved:false,target:undefined,beforeId:null,releaseId:null};
    gestureRef.current=g;
    const hover=(x,y)=>{
      const hit=document.elementFromPoint(x,y),release=hit?.closest('[data-release-drop]'),zone=hit?.closest('[data-sprint-drop]');
      document.querySelectorAll('.sprint-version-entry.is-drop-target').forEach(el=>el.classList.remove('is-drop-target'));
      g.target=undefined;g.beforeId=null;g.releaseId=null;
      if(release){g.releaseId=release.dataset.releaseDrop;release.classList.add('is-drop-target');setOver(undefined);setInsertBefore(null);return;}
      const target=zone?(zone.dataset.sprintDrop||null):undefined;
      if(zone&&canDrop(target)){g.target=target;g.beforeId=[...zone.querySelectorAll('.sprint-work-row')].find(el=>el.dataset.workItemId!==g.id&&y<el.getBoundingClientRect().top+el.getBoundingClientRect().height/2)?.dataset.workItemId||null;setOver(target);setInsertBefore(g.beforeId);}else{setOver(undefined);setInsertBefore(null);}
    };
    const onMove=e=>{if(e.pointerId!==event.pointerId)return;g.lastX=e.clientX;g.lastY=e.clientY;if(!g.moved&&Math.hypot(e.clientX-g.x,e.clientY-g.y)<5)return;g.moved=true;setDragging(g.id);setMoveNotice('');setDragPoint({x:e.clientX,y:e.clientY,title:item.title,number:item.number});hover(e.clientX,e.clientY);e.preventDefault();};
    let frame;
    const tick=()=>{if(g.moved){const delta=g.lastY<80?-12:g.lastY>globalThis.innerHeight-70?12:0;if(delta){globalThis.scrollBy(0,delta);hover(g.lastX,g.lastY);}}frame=requestAnimationFrame(tick);};
    const cleanup=()=>{cancelAnimationFrame(frame);document.removeEventListener('pointermove',onMove);document.removeEventListener('pointerup',onUp);document.removeEventListener('pointercancel',cancel);document.removeEventListener('keydown',onKey);document.querySelectorAll('.sprint-version-entry.is-drop-target').forEach(el=>el.classList.remove('is-drop-target'));gestureRef.current=null;setDragPoint(null);clearDrag();};
    const cancel=()=>{if(g.moved)suppressClick.current=true;cleanup();};
    const onKey=e=>{if(e.key==='Escape'){e.preventDefault();cancel();}};
    const onUp=e=>{if(e.pointerId!==event.pointerId)return;if(!g.moved){cleanup();return;}e.preventDefault();suppressClick.current=true;setTimeout(()=>{suppressClick.current=false;},0);hover(e.clientX,e.clientY);const target=g.target,before=g.beforeId,releaseId=g.releaseId;cleanup();if(releaseId)action('item.update',{id:g.id,releaseId});else if(target!==undefined)move(g.id,target,before);};
    g.cancel=cancel;document.addEventListener('pointermove',onMove,{passive:false});document.addEventListener('pointerup',onUp);document.addEventListener('pointercancel',cancel);document.addEventListener('keydown',onKey);frame=requestAnimationFrame(tick);
  }
  function workRows(rows,sp) {
    const editable=sp?.status!=='closed';
    const filtered=sortSprintItems(rows.filter(matches));
    return <AntList className="sprint-work-list" aria-label={sp?sp.name+'工作项':'产品待办池工作项'}>
      {filtered.map(i=><React.Fragment key={i.id}>{dragging&&over===(sp?.id||null)&&insertBefore===i.id&&<div className="sprint-insert-line" aria-hidden="true"/>}<SprintWorkRow item={i} project={project} onOpen={item=>{if(suppressClick.current)return;(sp?.status==='closed'?onOpenSnapshot:onOpen)(item);}} className={dragging===i.id?'is-dragging':''} draggable={false} onPointerDown={editable?e=>beginSort(e,i):undefined} data-reorderable={editable&&!busy&&!i.readOnly}/></React.Fragment>)}
      {dragging&&over===(sp?.id||null)&&!insertBefore&&<div className="sprint-insert-line" aria-hidden="true"/>}
      {!filtered.length&&<AntEmpty className="sprint-drop-empty">{query?'没有符合条件的工作项':sp?.status==='closed'?'本次冲刺没有工作项':'拖入工作项，或通过右键菜单安排冲刺'}</AntEmpty>}
    </AntList>;
  }
  return <div className="sprint-workspace"><span className="sprint-sort-feedback" role="status" aria-live="polite">{moveNotice}</span>
    <div className="sprint-plan-toolbar"><div className="search"><Search size={15}/><ReplicaInput aria-label="搜索冲刺工作项" placeholder="搜索工作项、编号、负责人" value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="sprint-plan-actions"><SubtaskFilter checked={showSubtasks} onChange={setShowSubtasks}/><ReplicaButton aria-pressed={versionsOpen} onClick={()=>setVersionsOpen(!versionsOpen)}><Flag size={14}/>版本</ReplicaButton><ReplicaButton aria-pressed={history} onClick={()=>setHistory(!history)}>{history?'返回规划':'历史冲刺'}</ReplicaButton></div></div>
    <div className={'sprint-planning-layout'+(versionsOpen?' with-versions':'')}>
    {versionsOpen&&<aside className="sprint-versions" aria-label="版本面板"><div className="sprint-version-heading"><strong>版本</strong><ReplicaButton className="icon-btn" aria-label="关闭版本面板" onClick={()=>setVersionsOpen(false)}><X size={13}/></ReplicaButton></div><ReplicaButton aria-pressed={versionFilter==='all'} className={versionFilter==='all'?'is-selected':''} onClick={()=>setVersionFilter('all')}>全部工作项</ReplicaButton><ReplicaButton aria-pressed={versionFilter==='none'} className={versionFilter==='none'?'is-selected':''} onClick={()=>setVersionFilter('none')}>未安排版本</ReplicaButton>{releases.filter(r=>!r.archived&&r.status!=='released').map(r=><div data-release-drop={r.id} className={"sprint-version-entry"+(versionFilter===r.id?" is-selected":"")} key={r.id} onDragOver={e=>{if(dragging){e.preventDefault();e.currentTarget.classList.add('is-drop-target');}}} onDragLeave={e=>e.currentTarget.classList.remove('is-drop-target')} onDrop={e=>{e.preventDefault();e.currentTarget.classList.remove('is-drop-target');const id=(e.dataTransfer.getData('application/x-heyso-sprint-item')||e.dataTransfer.getData('text/plain'));setDragging(null);setOver(undefined);if(stories.some(i=>i.id===id&&!i.readOnly))action('item.update',{id,releaseId:r.id});}}><ReplicaButton className="sprint-version-select" aria-pressed={versionFilter===r.id} title={r.name} onClick={()=>setVersionFilter(r.id)}><span>{r.name}</span><small aria-label={stories.filter(i=>i.releaseId===r.id).length+" 个工作项"}>{stories.filter(i=>i.releaseId===r.id).length}</small></ReplicaButton><ReplicaButton className="sprint-version-link" aria-label={'查看版本'+r.name} onClick={()=>onRelease(r.id)}><ArrowUpRight size={12}/></ReplicaButton></div>)}<p>拖入工作项关联版本，所属冲刺保持不变。</p><ReplicaButton className="text-btn" onClick={()=>onRelease(null)}>管理版本<ArrowUpRight size={12}/></ReplicaButton></aside>}
    <div className="sprint-planning-content">
    {versionFilter!=='all'&&<div className="sprint-version-filter-note">{versionFilter==='none'?'未安排版本':releases.find(r=>r.id===versionFilter)?.name}<ReplicaButton className="text-btn" onClick={()=>setVersionFilter('all')}>清除版本筛选</ReplicaButton></div>}
    {groups.map(sp=><div key={sp.id} data-sprint-drop={sp.id} className={'sprint-drop-zone'+(over===sp.id?' is-over':'')} {...(history?{}:dropProps(sp.id))}>{renderSprint(sp,{workRows:rows=>workRows(rows,sp),onStart:()=>setDialog({type:'start',sprint:sp}),onEdit:()=>setDialog({type:'edit',sprint:sp}),onClose:()=>setDialog({type:'close',sprint:sp}),busy,scopeFilter:matches,onCreate:()=>onCreate(undefined,null,{sprintId:sp.id,...(!['all','none'].includes(versionFilter)?{releaseId:versionFilter}:{})}),activeSprint:live.find(s=>s.status==='active')})}</div>)}
    {!groups.length&&history&&<AntEmpty className="sprint-drop-empty">还没有已结束的冲刺</AntEmpty>}
    {!history&&<section className={'panel sprint-backlog'+(over===null?' is-over':'')} data-work-scope="backlog" data-sprint-drop="" {...dropProps(null)}><div className="sprint-backlog-heading"><ReplicaButton className="sprint-backlog-toggle" aria-expanded={backlogExpanded} onClick={()=>setBacklogExpanded(!backlogExpanded)}>{backlogExpanded?<ChevronDown size={14}/>:<ChevronRight size={14}/>}<h2>待办池</h2><span className="sprint-item-count">（{backlog.filter(matches).length} 个工作项）</span></ReplicaButton><div className="sprint-backlog-actions"><SprintStatusCounts rows={backlog.filter(matches)} project={project}/><ReplicaButton disabled={busy} onClick={()=>setDialog({type:'create'})}>创建冲刺</ReplicaButton></div></div>{backlogExpanded&&<>{workRows(backlog)}<div className="sprint-create-row"><ReplicaButton className="text-btn" disabled={busy} onClick={()=>onCreate()}><Plus size={15}/>新建工作项</ReplicaButton></div></>}{!live.length&&<AntEmpty className="sprint-plan-empty"><Calendar size={20}/><span>创建冲刺，再从待办池安排本轮工作。</span><ReplicaButton disabled={busy} onClick={()=>setDialog({type:'create'})}>创建第一个冲刺</ReplicaButton></AntEmpty>}</section>}
    </div></div>
    {dragPoint&&<div className="sprint-drag-preview" style={{left:Math.min(dragPoint.x+14,globalThis.innerWidth-260),top:dragPoint.y+14}}>{project.code}-{dragPoint.number} · {dragPoint.title}</div>}
    <Presence present={!!dialog} onClose={()=>!busy&&setDialog(null)}>{dialog&&<SprintDialog key={dialog.type+(dialog.sprint?.id||'')} dialog={dialog} project={project} stories={stories} sprints={sprints} busy={busy} action={action} onClose={()=>setDialog(null)}/>}</Presence>
  </div>;
}

export function SprintStatusCounts({rows,project}) {
  return <div className="sprint-state-counts" role="group" aria-label="工作项状态统计">{[['todo','待办'],['in_progress','进行中'],['done','完成']].map(([category,label])=>{const count=rows.filter(i=>progressCategory(project,i.status)===category).length;return <AntCount key={category} className={'sprint-state-count '+category} aria-label={label+'：'+count+' 项'} title={label+'：'+count+' 项'}>{count}</AntCount>;})}</div>;
}

function SprintDialog({dialog,project,stories,sprints,busy,action,onClose}) {
  const [editorBusy,setEditorBusy]=useState(0);
  const imageBusy=delta=>setEditorBusy(n=>Math.max(0,n+delta));
  const sp=dialog.sprint,closing=dialog.type==='close',starting=dialog.type==='start';
  const [start,setStart]=useState(closing ? sprintDate(new Date(new Date(sp.endDate+'T12:00:00').getTime()+86400000)) : sp?.startDate||sprintDate()),[end,setEnd]=useState(closing ? sprintEnd(sprintDate(new Date(new Date(sp.endDate+'T12:00:00').getTime()+86400000))) : sp?.endDate||sprintEnd(sprintDate())),[duration,setDuration]=useState(sp?'custom':'2'),[error,setError]=useState(''),[destination,setDestination]=useState('backlog');
  const rows=stories.filter(i=>isWorkItem(i,project)&&i.sprintId===sp?.id),unfinished=rows.filter(i=>!terminal(i,project)),done=rows.filter(i=>hasStatus(i,project,'done'));
  const missing=rows.filter(i=>!i.owner?.trim());
  const title=closing?'完成冲刺':starting?'启动冲刺':sp?'编辑冲刺':'创建冲刺';
  async function submit(e){e.preventDefault();if(busy||editorBusy)return;const f=new FormData(e.currentTarget),get=k=>String(f.get(k)||'').trim();setError('');let result;
    if(closing){if(['review','wentWell','improve'].some(k=>!get(k))){setError('请填写评审总结、做得好的地方和需要改进的地方。');return;}const dispositions=Object.fromEntries(unfinished.map(i=>[i.id,get('dest:'+i.id)||destination]));result=await action('sprint.close',{id:sp.id,review:get('review'),retro:{wentWell:get('wentWell'),improve:get('improve'),actions:get('actions')},dispositions,createImprovement:f.has('improvement'),...(Object.values(dispositions).includes('new')?{nextSprint:{name:get('nextName'),goal:get('nextGoal'),startDate:start,endDate:end,capacity:sp.capacity||0}}:{})});}
    else {const payload={projectId:project.id,...(sp?{id:sp.id}:{}),name:get('name'),goal:get('goal'),startDate:start,endDate:end,capacity:Number(get('capacity'))};result=await action(starting?'sprint.start':sp?'sprint.update':'sprint.create',payload);}
    if(result)onClose();else setError('操作未完成，请根据提示检查后重试。');
  }
  const dates=<><ReplicaField className="field"><span>持续时间</span><Select aria-label="冲刺持续时间" value={duration} onChange={e=>{setDuration(e.target.value);if(e.target.value!=='custom')setEnd(sprintEnd(start,Number(e.target.value)));}}><option value="custom">自定义日期</option><option value="1">1 周</option><option value="2">2 周</option><option value="4">4 周</option></Select></ReplicaField><DateFields start={start} end={end} setStart={value=>{setStart(value);if(value&&duration!=='custom')setEnd(sprintEnd(value,Number(duration)));}} setEnd={value=>{setEnd(value);setDuration('custom');}}/></>;
  return <div className="replica-dialog-host"><ReplicaModal className="modal sprint-plan-dialog" role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><ReplicaButton className="icon-btn" aria-label="关闭冲刺弹窗" disabled={busy} onClick={onClose}><X size={18}/></ReplicaButton></header><ReplicaForm onSubmit={submit}><div className="modal-body">
    {closing?<><p><b>{sp.name}</b> · 已完成 {done.length} 项，未完成 {unfinished.length} 项</p><p className="muted">完成情况将保存为历史记录；未完成工作按下方选择结转。</p><div className="field"><span>评审总结</span><RichTextEditor name="review" label="评审总结" defaultValue={sp.review} placeholder="冲刺目标达成了吗？实际交付了什么？" onBusyChange={imageBusy} disabled={busy}/></div><div className="field"><span>做得好的地方</span><RichTextEditor name="wentWell" label="做得好的地方" defaultValue={sp.retro?.wentWell} onBusyChange={imageBusy} disabled={busy}/></div><div className="field"><span>需要改进的地方</span><RichTextEditor name="improve" label="需要改进的地方" defaultValue={sp.retro?.improve} onBusyChange={imageBusy} disabled={busy}/></div><div className="field"><span>下次采取的行动（可选）</span><RichTextEditor name="actions" label="下次采取的行动" defaultValue={sp.retro?.actions} onBusyChange={imageBusy} disabled={busy}/></div><label className="check-label"><ReplicaInput type="checkbox" name="improvement" defaultChecked/>将改进行动创建为后续工作项</label>
      {!!unfinished.length&&<><ReplicaField className="field"><span>未完成工作项的默认去向</span><Select aria-label="未完成工作项的默认去向" value={destination} onChange={e=>setDestination(e.target.value)}><option value="backlog">待办池</option>{sprints.filter(s=>s.status==='planned').map(s=><option value={s.id} key={s.id}>{s.name}</option>)}<option value="new">新建后续冲刺</option></Select></ReplicaField>{destination==='new'&&<div className="sprint-next-plan"><ReplicaField className="field"><span>后续冲刺名称</span><ReplicaInput name="nextName" required defaultValue={sp.name+' · 下一轮'}/></ReplicaField><div className="field"><span>后续冲刺目标</span><RichTextEditor name="nextGoal" label="后续冲刺目标" placeholder="下一轮要达成什么成果？" onBusyChange={imageBusy} disabled={busy}/></div>{dates}</div>}{unfinished.map(i=><ReplicaField className="field" key={i.id}><span>{project.code}-{i.number} · {i.title}</span><Select aria-label={`${i.title}未完成去向`} key={destination} name={'dest:'+i.id} defaultValue={destination}><option value="backlog">待办池</option>{sprints.filter(s=>s.status==='planned').map(s=><option value={s.id} key={s.id}>{s.name}</option>)}{destination==='new'&&<option value="new">新建后续冲刺</option>}</Select></ReplicaField>)}</>}
    </>:<><ReplicaField className="field"><span>冲刺名称</span><ReplicaInput name="name" required autoFocus defaultValue={sp?.name||`Sprint ${sprints.length+1}`}/></ReplicaField><ReplicaField className="field"><span>冲刺目标</span><ReplicaTextArea name="goal" required defaultValue={sp?.goal} placeholder="本轮准备达成什么成果？"/></ReplicaField>{dates}<ReplicaField className="field"><span>计划容量（故事点，可选）</span><ReplicaInput type="number" min="0" name="capacity" defaultValue={sp?.capacity||0}/></ReplicaField>{starting&&<><p className="muted">本次将纳入 {rows.length} 个工作项、{rows.reduce((n,i)=>n+(i.points||0),0)} SP，启动后保存范围基线。</p>{!!missing.length&&<AntAlert className="warning">{missing.length} 项尚缺负责人，请先在工作项详情中补齐。</AntAlert>}</>}</>}
    {error&&<AntAlert className="danger" role="alert">{error}</AntAlert>}</div><footer><ReplicaButton type="button" disabled={busy} onClick={onClose}>取消</ReplicaButton><ReplicaButton type="submit" className="primary" disabled={busy||editorBusy>0||(starting&&(!rows.length||missing.length>0))}>{busy?'正在保存…':title}</ReplicaButton></footer></ReplicaForm></ReplicaModal></div>;
}

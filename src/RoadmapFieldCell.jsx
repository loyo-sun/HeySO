import React,{useRef,useState} from 'react';
import {DatePicker,InputNumber,Select,Tooltip} from 'antd';
import dayjs from 'dayjs';
import {ReplicaButton} from './ReplicaControls.jsx';
import {StatusIcon} from './Select.jsx';
import {detailStatusOptions} from './detail-status-options.mjs';
import {roadmapFieldBounds} from './roadmap-editing.mjs';

export default function RoadmapFieldCell({item,column,project,items,releases,value,busy,onSave}){
 const [editing,setEditing]=useState(false),[draft,setDraft]=useState(item[column.id]??''),[error,setError]=useState(''),[saving,setSaving]=useState(false),pending=useRef(false),cancelled=useRef(false),base=useRef(item[column.id]??'');
 const field=column.id,label=column.label+'：'+item.title;
 async function save(next){
  if(item.readOnly||pending.current||cancelled.current)return;
  if((next??'')===(item[field]??'')){setEditing(false);return;}
  if((item[field]??'')!==base.current){setError('字段已有更新，请按 Esc 取消后重新编辑。');return;}
  if(field==='points'&&(!Number.isFinite(next)||next<0||next>1000)){setError('故事点须在 0 至 1000 之间');return;}
  pending.current=true;setSaving(true);setError('');
  try{const result=await onSave(item,{[field]:next});if(result===null||result===false){setError('未保存，请重试');return;}setEditing(false);}
  catch(e){setError(e.message||'未保存，请重试');}
  finally{pending.current=false;setSaving(false);}
 }
 const edit=()=>{if(item.readOnly)return;cancelled.current=false;base.current=item[field]??'';setDraft(item[field]??'');setError('');setEditing(true);};
 const disabled=busy||saving||item.readOnly;
 let control;
 if(editing){
  if(field==='startDate'||field==='endDate'){
   const bounds=roadmapFieldBounds(project,items,item,field);
   control=<DatePicker autoFocus defaultOpen aria-label={label} value={draft?dayjs(draft):null} format="YYYY/MM/DD" placeholder="未安排" allowClear disabled={disabled} minDate={bounds.min?dayjs(bounds.min):undefined} maxDate={bounds.max?dayjs(bounds.max):undefined} onChange={d=>{const next=d?.format('YYYY-MM-DD')||'';setDraft(next);save(next);}} onOpenChange={open=>{if(!open&&!pending.current&&!error)setEditing(false);}}/>;
  }else if(field==='points'){
   control=<InputNumber autoFocus aria-label={label} value={draft===''?null:Number(draft)} min={0} max={1000} disabled={disabled} onChange={n=>setDraft(n??0)} onBlur={()=>save(Number(draft)||0)} onPressEnter={e=>e.currentTarget.blur()}/>;
  }else{
   const options=field==='owner'?[{value:'',label:'未分配'},...project.members.map(v=>({value:v,label:v}))]:field==='releaseId'?[{value:'',label:'未安排'},...releases.filter(r=>(!r.archived&&r.status!=='released')||r.id===item.releaseId).map(r=>({value:r.id,label:r.name}))]:detailStatusOptions(project,item).map(s=>({value:s.id,label:s.name}));
   control=<Select className="heyso-select" autoFocus defaultOpen aria-label={label} value={draft||''} disabled={disabled} popupMatchSelectWidth={false} options={options} onChange={v=>{setDraft(v);save(field==='releaseId'?(v||null):v);}} onOpenChange={open=>{if(!open&&!pending.current&&!error)setEditing(false);}}/>;
  }
 }
 return <div className={'roadmap-editable-cell field-'+field+(editing?' is-editing':'')} onKeyDown={e=>{if(e.key==='Escape'&&!pending.current){cancelled.current=true;e.stopPropagation();setEditing(false);}}}>
  {editing?control:<ReplicaButton className="roadmap-field-value" aria-label={label} disabled={busy||item.readOnly} onClick={edit} title={item.readOnlyReason||'点击编辑'+column.label+'：'+value}>{field==='owner'&&<i>{(item.owner||'?').slice(0,1)}</i>}{field==='status'&&<StatusIcon value={item.status}/>}<span>{value===''||value==null?'—':value}</span></ReplicaButton>}
  {error&&<Tooltip title={error} open><ReplicaButton className="roadmap-field-retry" type="button" aria-label={'重试保存'+column.label} onClick={()=>save(field==='points'?Number(draft):field==='releaseId'?(draft||null):draft)}>重试</ReplicaButton></Tooltip>}
 </div>;
}

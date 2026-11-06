import React,{useEffect,useRef,useState} from 'react';
import {Input,Select} from 'antd';
import {X} from 'lucide-react';
import {ReplicaButton} from './ReplicaControls.jsx';
import {roadmapCreateTarget,roadmapCreateTypes} from './roadmap-editing.mjs';
import {TypeIcon} from './WorkType.jsx';

export default function RoadmapInlineCreate({project,items,source,depth=0,onSave,onCancel}){
 const types=roadmapCreateTypes(project),[kind,setKind]=useState(()=>types.find(t=>t.id===source?.kind)?.id||types.find(t=>t.level===0)?.id||types[0]?.id||'');
 const [title,setTitle]=useState(''),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 const input=useRef(null),root=useRef(null),pending=useRef(false),timer=useRef(null);
 const parent=roadmapCreateTarget(project,items,source,kind);
 useEffect(()=>{input.current?.focus();return()=>clearTimeout(timer.current);},[]);
 async function commit(){
  if(pending.current)return;
  if(!title.trim()){setError('请填写标题');return;}
  pending.current=true;setSaving(true);setError('');
  try{const item=await onSave({kind,title:title.trim(),parentId:parent?.id||null,...(source?{afterId:source.id}:{})});
   if(!item){setError('保存未完成，草稿已保留，请重试。');return;}
  }catch(e){setError(e.message||'保存未完成，草稿已保留，请重试。');}
  finally{pending.current=false;setSaving(false);}
 }
 function blur(e){
  if(e.relatedTarget?.closest('[data-cancel-create]'))return;
  clearTimeout(timer.current);timer.current=setTimeout(()=>{
   const focus=document.activeElement;
   if(root.current?.contains(focus)||focus?.closest('.roadmap-create-type-popup'))return;
   commit();
  },0);
 }
 return <div className="roadmap-inline-create" ref={root} onBlur={blur} onKeyDown={e=>{if(e.key==='Escape'&&!pending.current){e.preventDefault();e.stopPropagation();onCancel();}}}>
  <div className="roadmap-create-controls" style={{paddingLeft:12+Math.min(depth,6)*16}}>
   <Select aria-label="新工作项类型" className="heyso-select roadmap-create-type" value={kind} disabled={saving} popupMatchSelectWidth={false} classNames={{popup:{root:'roadmap-create-type-popup'}}} options={types.map(t=>({value:t.id,label:<><TypeIcon kind={t.id}/><span>{t.name}</span></>}))} onChange={v=>{setKind(v);setError('');input.current?.focus();}}/>
   <span className="required-mark" aria-hidden="true">*</span><Input ref={input} aria-label="新工作项标题" aria-required="true" status={error?'error':undefined} placeholder="输入标题，失焦保存" value={title} disabled={saving} maxLength={20000} onChange={e=>{setTitle(e.target.value);setError('');}} onKeyDown={e=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing){e.preventDefault();e.currentTarget.blur();}}}/>
   <ReplicaButton type="button" data-cancel-create aria-label="取消行内新建" className="icon-btn" disabled={saving} onMouseDown={e=>e.preventDefault()} onClick={onCancel}><X size={14}/></ReplicaButton>
  </div>
  <div className="roadmap-create-hint" role={error?'alert':'status'}>{error|| (saving?'正在保存…':parent?'所属：'+parent.title:'同级新建 · Enter 或失焦保存')}</div>
  {error&&<ReplicaButton type="button" className="roadmap-create-retry text-btn" disabled={saving} onClick={commit}>重试保存</ReplicaButton>}
 </div>;
}

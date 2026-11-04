import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {backlogFilterOptions,backlogRangeType} from './backlog-filters.mjs';

export default function BacklogFilter({column,anchor,rows,context,value,onApply,onClose}){
  const rangeType=backlogRangeType(column.id);
  const empty=rangeType?{from:'',to:''}:column.id==='workItem'?'':[];
  const [draft,setDraft]=useState(value??empty);
  const invalidRange=rangeType&&draft.from&&draft.to&&draft.from>draft.to;
  const [search,setSearch]=useState(''),[bounds,setBounds]=useState(()=>anchor.getBoundingClientRect());
  const panel=useRef(null),input=useRef(null);
  const options=backlogFilterOptions(rows,column.id,context).filter(o=>o.label.toLowerCase().includes(search.toLowerCase()));
  useEffect(()=>{
    input.current?.focus({preventScroll:true});
    setBounds(anchor.getBoundingClientRect());
    const outside=e=>{if(!panel.current?.contains(e.target)&&!anchor.contains(e.target))onClose();};
    const escape=e=>{if(e.key==='Escape'){e.preventDefault();onClose();anchor.focus();}};
    const scroll=e=>{if(!(e.target instanceof Node&&panel.current?.contains(e.target)))setBounds(anchor.getBoundingClientRect());};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
    window.addEventListener('resize',onClose);window.addEventListener('scroll',scroll,true);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);window.removeEventListener('resize',onClose);window.removeEventListener('scroll',scroll,true);};
  },[anchor,onClose]);
  const rect=bounds,width=Math.min(280,window.innerWidth-24),left=Math.max(12,Math.min(rect.left,window.innerWidth-width-12));
  const below=window.innerHeight-rect.bottom>=250;
  const position=below?{top:rect.bottom+8,maxHeight:window.innerHeight-rect.bottom-20}:{bottom:window.innerHeight-rect.top+8,maxHeight:rect.top-20};
  return createPortal(<section ref={panel} className="backlog-filter-popover" role="dialog" aria-label={column.label+'筛选'} style={{left,width,...position}}>
    <strong>{column.label}筛选</strong>
    {rangeType?<div className="backlog-range-fields"><label>从<input ref={input} type={rangeType} step={rangeType==='datetime-local'?1:undefined} aria-label={column.label+'范围开始'} value={draft.from} max={draft.to||undefined} onChange={e=>setDraft(old=>({...old,from:e.target.value}))}/></label><label>至<input type={rangeType} step={rangeType==='datetime-local'?1:undefined} aria-label={column.label+'范围结束'} value={draft.to} min={draft.from||undefined} onChange={e=>setDraft(old=>({...old,to:e.target.value}))}/></label>{invalidRange&&<p className="rich-text-error" role="alert">结束不能早于开始</p>}</div>:column.id==='workItem'?<input ref={input} aria-label="筛选工作项标题或 ID" placeholder="输入标题或 ID…" value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')onApply(draft.trim());}}/>:<>
      <input ref={input} aria-label={'搜索'+column.label+'选项'} placeholder="搜索选项…" value={search} onChange={e=>setSearch(e.target.value)}/>
      <div className="backlog-filter-options">{options.map(option=><label key={option.value}><input type="checkbox" checked={draft.includes(option.value)} onChange={e=>setDraft(old=>e.target.checked?[...old,option.value]:old.filter(v=>v!==option.value))}/><span>{option.label}</span></label>)}{!options.length&&<p className="muted">没有匹配的选项</p>}</div>
    </>}
    <footer><button type="button" className="text-btn" onClick={()=>onApply(empty)}>清除此项</button><button type="button" className="primary" disabled={!!invalidRange} onClick={()=>onApply(typeof draft==='string'?draft.trim():draft)}>应用筛选</button></footer>
  </section>,document.body);
}

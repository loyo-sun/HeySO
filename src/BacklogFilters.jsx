import {ReplicaInput,ReplicaButton} from './ReplicaControls.jsx';
import {AntAlert} from './AntStructures.jsx';
import React,{useEffect,useRef,useState} from 'react';

import {backlogFilterOptions,backlogRangeType} from './backlog-filters.mjs';

export default function BacklogFilter({column,anchor,rows,context,value,onApply,onClose}){
  const rangeType=backlogRangeType(column.id);
  const empty=rangeType?{from:'',to:''}:column.id==='workItem'?'':[];
  const [draft,setDraft]=useState(value??empty);
  const invalidRange=rangeType&&draft.from&&draft.to&&draft.from>draft.to;
  const [search,setSearch]=useState('');
  const input=useRef(null);
  const options=backlogFilterOptions(rows,column.id,context).filter(o=>o.label.toLowerCase().includes(search.toLowerCase()));
  useEffect(()=>{input.current?.focus({preventScroll:true});},[]);
  return <section className="backlog-filter-popover" role="dialog" aria-label={column.label+'筛选'}>
    <strong>{column.label}筛选</strong>
    {rangeType?<div className="backlog-range-fields"><label>从<ReplicaInput ref={input} type={rangeType} step={rangeType==='datetime-local'?1:undefined} aria-label={column.label+'范围开始'} value={draft.from} max={draft.to||undefined} onChange={e=>setDraft(old=>({...old,from:e.target.value}))}/></label><label>至<ReplicaInput type={rangeType} step={rangeType==='datetime-local'?1:undefined} aria-label={column.label+'范围结束'} value={draft.to} min={draft.from||undefined} onChange={e=>setDraft(old=>({...old,to:e.target.value}))}/></label>{invalidRange&&<AntAlert className="rich-text-error" role="alert">结束不能早于开始</AntAlert>}</div>:column.id==='workItem'?<ReplicaInput ref={input} aria-label="筛选工作项标题或 ID" placeholder="输入标题或 ID…" value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')onApply(draft.trim());}}/>:<>
      <ReplicaInput ref={input} aria-label={'搜索'+column.label+'选项'} placeholder="搜索选项…" value={search} onChange={e=>setSearch(e.target.value)}/>
      <div className="backlog-filter-options">{options.map(option=><label key={option.value}><ReplicaInput type="checkbox" checked={draft.includes(option.value)} onChange={e=>setDraft(old=>e.target.checked?[...old,option.value]:old.filter(v=>v!==option.value))}/><span>{option.label}</span></label>)}{!options.length&&<p className="muted">没有匹配的选项</p>}</div>
    </>}
    <footer><ReplicaButton type="button" className="text-btn" onClick={()=>onApply(empty)}>清除此项</ReplicaButton><ReplicaButton type="button" className="primary" disabled={!!invalidRange} onClick={()=>onApply(typeof draft==='string'?draft.trim():draft)}>应用筛选</ReplicaButton></footer>
  </section>;
}

import React, {useState} from 'react';
import {Plus, X, Trash2, BookOpen} from 'lucide-react';
import {ReplicaButton, ReplicaDrawer, ReplicaForm, ReplicaField, ReplicaInput} from './ReplicaControls.jsx';
import {AntAlert, AntConfirm} from './AntStructures.jsx';
import Select from './Select.jsx';
import RichTextEditor from './RichTextEditor.jsx';
import MarkdownPreview from './MarkdownPreview.jsx';
import {memoryTypes, memoryVersion, memoryHistory} from '../shared/memory.mjs';

const date = value => value ? new Date(value).toLocaleString('zh-CN', {hour12:false}) : '时间未记录';
const operationNames = {create:'记录记忆', update:'编辑记忆', delete:'删除记忆'};

export default function MemoryPanel({notes, projectId, action, busy}) {
  const [selected, setSelected] = useState(null), [deleted, setDeleted] = useState(false);
  const rows = notes.filter(note => !!note.deletedAt === deleted);
  const current = notes.find(note => note.id === selected);
  return <section className="memory-workspace">
    <div className="memory-toolbar">
      <div className="segmented" role="group" aria-label="记忆筛选">
        <ReplicaButton type="button" className={!deleted?'active':''} onClick={()=>setDeleted(false)}>项目记忆</ReplicaButton>
        <ReplicaButton type="button" className={deleted?'active':''} onClick={()=>setDeleted(true)}>已删除</ReplicaButton>
      </div>
      <ReplicaButton type="button" className="primary" onClick={()=>setSelected('new')}><Plus size={16}/>记录记忆</ReplicaButton>
    </div>
    <div className="memory-table-scroll">
      <table className="memory-table">
        <thead><tr><th>标题</th><th>类型</th><th>{deleted?'删除人':'更新人'}</th><th>{deleted?'删除时间':'更新时间'}</th></tr></thead>
        <tbody>{rows.map(note=><tr key={note.id} onClick={()=>setSelected(note.id)}>
          <td><button type="button" className="memory-title" onClick={()=>setSelected(note.id)}><BookOpen size={15}/>{note.title}</button></td>
          <td>{memoryTypes[note.type] || note.type}</td><td>{note.deletedBy || note.updatedBy || note.author}</td>
          <td>{date(note.deletedAt || note.updatedAt || note.createdAt)}</td>
        </tr>)}</tbody>
      </table>
      {!rows.length&&<p className="memory-empty">{deleted?'暂无已删除的记忆':'暂无项目记忆，点击“记录记忆”开始。'}</p>}
    </div>
    {(selected === 'new' || current) && <MemoryDrawer key={selected} note={current} projectId={projectId} action={action} busy={busy} onClose={()=>setSelected(null)} onCreated={note=>setSelected(note.id)}/>}
  </section>;
}

function MemoryDrawer({note, projectId, action, busy, onClose, onCreated}) {
  const [draft, setDraft] = useState(()=>({type:note?.type || 'context', title:note?.title || '', body:note?.body || ''}));
  const [baseVersion, setBaseVersion] = useState(()=>note ? memoryVersion(note) : null);
  const [tab, setTab] = useState('content'), [confirm, setConfirm] = useState(null), [error, setError] = useState(''), [images, setImages] = useState(0);
  const [saved, setSaved] = useState(()=>({...draft}));
  const isDeleted = !!note?.deletedAt, dirty = JSON.stringify(draft)!==JSON.stringify(saved);
  const conflict = note && memoryVersion(note)!==baseVersion;
  const close = ()=>{if(busy||images)return;if(dirty&&!isDeleted)setConfirm('discard');else onClose();};
  const change = (key,value)=>setDraft(d=>({...d,[key]:value}));
  async function save(event) {
    event.preventDefault();
    if(busy||images||conflict||isDeleted)return;
    if(!draft.title.trim()||!draft.body.trim()){setError('请填写标题和内容');return;}
    const result = await action(note?'note.update':'note.create', {projectId, ...draft, ...(note?{id:note.id,expectedVersion:baseVersion}:{})});
    if(!result){setError('保存未完成，请核对最新内容后重试。当前草稿已保留。');return;}
    setError('');setSaved({...draft});setBaseVersion(memoryVersion(result));
    if(!note)onCreated(result);
  }
  async function remove() {
    if(busy||images||conflict)return;
    const result = await action('note.delete',{projectId,id:note.id,expectedVersion:baseVersion});
    if(result)onClose();else {setConfirm(null);setError('删除未完成，请重新打开记忆后重试。');}
  }
  return <>
    <ReplicaDrawer className="memory-drawer" onClose={close} aria-label={note?'编辑项目记忆':'记录项目记忆'}>
      <header><div><h2>{note?(isDeleted?'已删除的记忆':'项目记忆'):'记录项目记忆'}</h2></div><ReplicaButton type="button" className="icon-btn" title="关闭记忆" onClick={close} disabled={busy||!!images}><X size={20}/></ReplicaButton></header>
      <div className="drawer-body">
        <div className="memory-tabs" role="tablist" aria-label="记忆详情">
          <ReplicaButton type="button" role="tab" aria-selected={tab==='content'} className={tab==='content'?'active':''} onClick={()=>setTab('content')}>内容</ReplicaButton>
          {note&&<ReplicaButton type="button" role="tab" aria-selected={tab==='history'} className={tab==='history'?'active':''} onClick={()=>setTab('history')}>修改历史（{memoryHistory(note).length}）</ReplicaButton>}
        </div>
        {isDeleted&&<AntAlert className="warning">此记忆已删除，不再提供给 AI。历史记录仍可查看。</AntAlert>}
        {conflict&&!isDeleted&&<AntAlert className="warning">此记忆已在其他位置更新，草稿已保留。请复制草稿，关闭后重新打开核对。</AntAlert>}
        {error&&<p className="error" role="alert">{error}</p>}
        <div hidden={tab!=='content'}>
          {isDeleted?<><h3>{note.title}</h3><p className="muted">{memoryTypes[note.type]}</p><MarkdownPreview value={note.body}/></>:
          <ReplicaForm onSubmit={save}>
            <ReplicaField><span>记忆类型</span><Select name="noteType" value={draft.type} onChange={e=>change('type',e.target.value)} disabled={busy||conflict}>{Object.entries(memoryTypes).map(([key,label])=><option key={key} value={key}>{label}</option>)}</Select></ReplicaField>
            <ReplicaField><span>标题</span><ReplicaInput name="title" value={draft.title} required maxLength={20000} onChange={e=>change('title',e.target.value)} disabled={busy||conflict}/></ReplicaField>
            <ReplicaField><span>内容</span><RichTextEditor name="body" label="记忆内容" value={draft.body} onChange={value=>change('body',value)} onBusyChange={delta=>setImages(n=>Math.max(0,n+delta))} disabled={busy||conflict}/></ReplicaField>
            <div className="memory-drawer-actions">
              {note&&<ReplicaButton type="button" className="danger-button" onClick={()=>setConfirm('delete')} disabled={busy||!!images||conflict}><Trash2 size={14}/>删除记忆</ReplicaButton>}
              <ReplicaButton type="submit" className="primary" disabled={busy||!!images||conflict||!!note&&!dirty}>{busy?'正在保存…':'保存'}</ReplicaButton>
            </div>
          </ReplicaForm>}
          {note&&<p className="memory-metadata">{note.author} · 记录于 {date(note.createdAt)}{note.updatedAt&&<> · {note.updatedBy} 更新于 {date(note.updatedAt)}</>}</p>}
        </div>
        {tab==='history'&&note&&<div className="memory-history">{[...memoryHistory(note)].reverse().map(entry=><article key={entry.version}>
          <header><strong>版本 {entry.version} · {operationNames[entry.operation]}</strong><small>{entry.actor} · {date(entry.at)}</small></header>
          <p className="muted">{memoryTypes[entry.type]}</p><h3>{entry.title}</h3><MarkdownPreview value={entry.body}/>
        </article>)}</div>}
      </div>
    </ReplicaDrawer>
    {confirm&&<AntConfirm>
      <h2>{confirm==='delete'?'删除这条记忆？':'放弃未保存的修改？'}</h2>
      <p>{confirm==='delete'?'删除后不再向 AI 提供此记忆，内容与修改历史保留在“已删除”列表中。':'关闭后，当前未保存的修改将丢失。'}</p>
      <div><ReplicaButton type="button" onClick={()=>setConfirm(null)} disabled={busy}>取消</ReplicaButton><ReplicaButton type="button" className={confirm==='delete'?'danger-button':'primary'} disabled={busy} onClick={confirm==='delete'?remove:onClose}>{confirm==='delete'?'确认删除':'放弃修改'}</ReplicaButton></div>
    </AntConfirm>}
  </>;
}

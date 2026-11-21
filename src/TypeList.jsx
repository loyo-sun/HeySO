import {useOverlayContainer} from './extensions/OverlayContext.jsx';
import {ReplicaInput,ReplicaButton,ReplicaModal,ReplicaForm,ReplicaField} from './ReplicaControls.jsx';
import {AntHtmlTable} from './AntStructures.jsx';
import React, { useState } from 'react';
import {createPortal} from 'react-dom';
import { Plus, X, Pencil, Check } from 'lucide-react';
import Select from './Select.jsx';
import WorkType, { TypeIcon } from './WorkType.jsx';
import { builtinTypes, typePalette, typeColor, typeIcon, typeIcons } from '../shared/work-config.mjs';

const availability = type => !type.enabled ? 'disabled' : type.hidden ? 'archived' : 'active';
const availabilityNames = {active:'展示中', archived:'已归档', disabled:'已停用'};

export default function TypeList({ config, setConfig, items, busy }) {
 const overlayContainer=useOverlayContainer();
  const [draft, setDraft] = useState(null), [error, setError] = useState('');
  const types = config.types.filter(t => !(t.retiredBuiltin && ['theme','feature'].includes(t.id)));
  const open = type => { if (busy) return; setError(''); setDraft(type ? {...type} : {name:'', icon:'task', color:typePalette[config.types.length % typePalette.length][0], level:0, enabled:true, hidden:false}); };
  const count = draft ? items.filter(i => i.kind === draft.id).length : 0;
  const lastExecution = draft?.id && draft.level === 0 && config.types.filter(t => t.id !== draft.id && t.enabled && !t.hidden && t.level === 0).length === 0;
  function save(e) {
    e.preventDefault(); if (busy) return;
    const name = draft.name.trim();
    if (!name || config.types.some(t => t.id !== draft.id && t.name.trim() === name)) {setError('请输入不重复的工作类型名称。'); return;}
    const value = {...draft, name, id:draft.id || 'type_' + crypto.randomUUID().slice(0,8)};
    setConfig(old => {const next = structuredClone(old), index = next.types.findIndex(t => t.id === value.id); if (index < 0) next.types.push(value); else next.types[index] = value; return next;});
    setDraft(null);
  }
  return <section className="work-types-manager" aria-label="工作类型列表">
    <div className="work-types-toolbar"><div><strong>{types.length} 种工作类型</strong><span>双击列表行编辑名称、外观和可用性。</span></div><ReplicaButton type="button" className="primary" disabled={busy || config.types.length >= 40} onClick={() => open()}><Plus size={15}/>新建工作类型</ReplicaButton></div>
    <div className="type-table-wrap"><AntHtmlTable className="type-management-table"><thead><tr><th>工作类型</th><th>来源</th><th>可用性</th><th>关联工作项</th><th>操作</th></tr></thead><tbody>{types.map(type => <tr key={type.id} data-type-row={type.id} tabIndex={0} onDoubleClick={() => open(type)} onKeyDown={e => {if (e.target === e.currentTarget && ['Enter','F2'].includes(e.key)) {e.preventDefault(); open(type);}}}>
      <td><span className="work-type-identity"><span className="work-type-glyph" style={{'--type-color':typeColor(type)}}><TypeIcon type={type} size={20}/></span><strong>{type.name}</strong></span></td>
      <td><span className="work-type-origin">{builtinTypes.some(t => t.id === type.id) ? '内置类型' : '自定义'}</span></td>
      <td><span className={'work-type-availability '+availability(type)}><i/>{availabilityNames[availability(type)]}</span></td>
      <td><span className="work-type-count">{items.filter(i => i.kind === type.id).length}</span></td>
      <td><ReplicaButton className="work-type-edit" type="button" disabled={busy} aria-label={'编辑'+type.name} onClick={() => open(type)}><Pencil size={14}/><span>编辑</span></ReplicaButton></td>
    </tr>)}</tbody></AntHtmlTable></div>
    <p className="work-types-save-hint">修改后点击下方「保存工作项配置」应用到项目。</p>
    {draft && createPortal(<div onSubmit={e => e.stopPropagation()}><ReplicaModal className="modal type-edit-dialog"><header><div><h2>{draft.id ? '编辑工作类型' : '新建工作类型'}</h2><p>统一工作类型的名称、外观与使用范围。</p></div><ReplicaButton type="button" className="icon-btn" aria-label="关闭" disabled={busy} onClick={() => setDraft(null)}><X size={18}/></ReplicaButton></header><ReplicaForm className="type-edit-form" onSubmit={save}>
      <div className="type-edit-fields">
        <div className="work-type-preview"><span>效果预览</span><WorkType type={{...draft,name:draft.name.trim() || '工作类型名称'}}/></div>
        <ReplicaField><span>名称</span><ReplicaInput aria-label="工作类型名称" placeholder="例如：调研、设计、运营" value={draft.name} maxLength={40} disabled={busy} onChange={e => {setDraft({...draft,name:e.target.value});setError('');}}/><small>名称须唯一，最多 40 个字。</small></ReplicaField>
        <fieldset className="work-type-icon-options" aria-label="工作类型图标"><legend>图标 <span>{typeIcons[typeIcon(draft)]}</span></legend><div>{Object.entries(typeIcons).map(([id,label]) => <ReplicaButton type="button" key={id} aria-label={'使用'+label+'图标'} title={label} aria-pressed={typeIcon(draft) === id} disabled={busy} onClick={() => setDraft({...draft,icon:id})}><TypeIcon type={{...draft,icon:id}} size={22}/></ReplicaButton>)}</div></fieldset>
        <fieldset className="work-type-color-options" aria-label="工作类型颜色"><legend>颜色</legend><div className="work-type-palette">{typePalette.map(([color,label]) => <ReplicaButton type="button" key={color} aria-label={'使用'+label+'颜色'} aria-pressed={typeColor(draft).toLowerCase() === color.toLowerCase()} title={label} style={{'--swatch-color':color}} disabled={busy} onClick={() => setDraft({...draft,color})}>{typeColor(draft).toLowerCase() === color.toLowerCase() && <Check size={14}/>}</ReplicaButton>)}<span className="work-type-custom-color"><ReplicaInput type="color" aria-label="自定义类型颜色" value={typeColor(draft)} disabled={busy} onChange={e => setDraft({...draft,color:e.target.value})}/><span>{typeColor(draft).toUpperCase()}</span></span></div></fieldset>
        <ReplicaField><span>可用性</span><Select aria-label="工作类型可用性" searchable={false} value={availability(draft)} disabled={busy} onChange={e => setDraft({...draft,enabled:e.target.value !== 'disabled',hidden:e.target.value !== 'active'})}><option value="active">展示中</option><option value="archived" disabled={lastExecution}>已归档</option><option value="disabled" disabled={count > 0 || lastExecution}>已停用</option></Select><small>{lastExecution ? '至少保留一种展示中的标准工作类型。' : count > 0 ? '已有工作项使用此类型，可归档，不能停用。' : '归档后隐藏新建入口，已有工作项保留。'}</small></ReplicaField>
        {error && <p className="type-edit-error" role="alert">{error}</p>}
      </div>
      <footer><span>确认后保存项目配置以生效</span><ReplicaButton type="button" disabled={busy} onClick={() => setDraft(null)}>取消</ReplicaButton><ReplicaButton type="submit" className="primary" disabled={busy}>确定</ReplicaButton></footer>
    </ReplicaForm></ReplicaModal></div>, overlayContainer())}
  </section>;
}

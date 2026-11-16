import {ReplicaInput,ReplicaButton,ReplicaModal,ReplicaForm,ReplicaField} from './ReplicaControls.jsx';
import {AntHtmlTable} from './AntStructures.jsx';
import React, { useState } from 'react';
import {createPortal} from 'react-dom';
import { Plus, X } from 'lucide-react';
import Select from './Select.jsx';
import WorkType, { TypeIcon } from './WorkType.jsx';
import { builtinTypes, typePalette, typeColor, typeIcon, typeIcons } from '../shared/work-config.mjs';

export default function TypeList({ config, setConfig, items, busy }) {
  const [draft, setDraft] = useState(null), [error, setError] = useState('');
  const open = type => { if (busy) return; setError(''); setDraft(type ? {...type} : {name:'', icon:'box', color:typePalette[config.types.length % typePalette.length][0], level:0, enabled:true, hidden:false}); };
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
  return <>
    <div className="type-table-wrap"><AntHtmlTable className="type-management-table"><thead><tr><th>名称</th><th>图标</th><th>颜色</th><th>可用性</th><th>工作项</th><th>操作</th></tr></thead><tbody>{config.types.filter(t => !(t.retiredBuiltin && ['theme','feature'].includes(t.id))).map(type => <tr key={type.id} data-type-row={type.id} tabIndex={0} onDoubleClick={() => open(type)} onKeyDown={e => {if (e.target === e.currentTarget && ['Enter','F2'].includes(e.key)) {e.preventDefault(); open(type);}}}>
      <td><WorkType type={type}/><small>{builtinTypes.some(t => t.id === type.id) ? '内置类型' : '自定义类型'}</small></td><td><TypeIcon type={type} size={18}/></td><td><span className="type-color-swatch" style={{background:typeColor(type)}}/>{typeColor(type)}</td><td>{!type.enabled ? '已停用' : type.hidden ? '已归档' : '展示中'}</td><td>{items.filter(i => i.kind === type.id).length}</td><td><ReplicaButton type="button" disabled={busy} onClick={() => open(type)}>编辑</ReplicaButton></td>
    </tr>)}</tbody></AntHtmlTable></div>
    <ReplicaButton type="button" disabled={busy || config.types.length >= 40} onClick={() => open()}><Plus size={14}/>新建工作类型</ReplicaButton>
    {draft && createPortal(<div onSubmit={e => e.stopPropagation()}><ReplicaModal className="modal type-edit-dialog"><header><h2>{draft.id ? '编辑工作类型' : '新建工作类型'}</h2><ReplicaButton type="button" aria-label="关闭" disabled={busy} onClick={() => setDraft(null)}><X size={18}/></ReplicaButton></header><ReplicaForm onSubmit={save}>
      <ReplicaField><span>名称</span><ReplicaInput aria-label="工作类型名称" value={draft.name} maxLength={40} disabled={busy} onChange={e => setDraft({...draft,name:e.target.value})}/></ReplicaField>
      <ReplicaField><span>图标</span><Select aria-label="工作类型图标" value={typeIcon(draft)} disabled={busy} onChange={e => setDraft({...draft,icon:e.target.value})}>{Object.entries(typeIcons).map(([id,label]) => <option key={id} value={id}>{label}</option>)}</Select></ReplicaField>
      <ReplicaField><span>颜色</span><ReplicaInput type="color" aria-label="工作类型颜色" value={typeColor(draft)} disabled={busy} onChange={e => setDraft({...draft,color:e.target.value})}/></ReplicaField>
      <ReplicaField><span>可用性</span><Select aria-label="工作类型可用性" value={!draft.enabled ? 'disabled' : draft.hidden ? 'archived' : 'active'} disabled={busy} onChange={e => setDraft({...draft,enabled:e.target.value !== 'disabled',hidden:e.target.value !== 'active'})}><option value="active">展示中</option><option value="archived" disabled={lastExecution}>已归档</option><option value="disabled" disabled={count > 0 || lastExecution}>已停用</option></Select></ReplicaField>
      <WorkType type={draft}/>{error && <p role="alert">{error}</p>}<footer><ReplicaButton type="button" disabled={busy} onClick={() => setDraft(null)}>取消</ReplicaButton><ReplicaButton type="submit" className="primary" disabled={busy}>确定</ReplicaButton></footer>
    </ReplicaForm></ReplicaModal></div>, document.body)}
  </>;
}

import {ReplicaButton,ReplicaInput} from './ReplicaControls.jsx';
import {AntCard,AntEmpty} from './AntStructures.jsx';
import React, { useState } from "react";
import { GripVertical, Archive, RotateCcw, X, Sparkles, Plus, Trash2 } from "lucide-react";
import WorkType from "./WorkType.jsx";
import Select from "./Select.jsx";
import InfoTip from "./InfoTip.jsx";
import { hierarchyLevels, levelFamily, planTypeHierarchy } from "../shared/work-config.mjs";

export default function TypeHierarchy({ config, setConfig, items, busy, project }) {
  const [dragging, setDragging] = useState(null), [over, setOver] = useState(null), [message, setMessage] = useState("");
  const [adding, setAdding] = useState(false), [levelTitle, setLevelTitle] = useState("");
  const levels = hierarchyLevels(config), active = config.types.filter((t) => t.enabled && !t.hidden), parked = config.types.filter((t) => !t.enabled || t.hidden);
  const edit = (fn) => setConfig((old) => { const next = structuredClone(old); fn(next); return next; });
  const count = (id) => items.filter((i) => i.kind === id).length;
  function move(id, target) {
    const type = config.types.find((t) => t.id === id), level = config.levels.find((l) => l.id === target);
    setDragging(null); setOver(null);
    if (!type || busy) return;
    if (target === "park" && type.level === 0 && active.filter((t) => t.level === 0).length <= 1 && active.some((t) => t.id === id)) { setMessage("至少保留一种展示中的标准工作类型。"); return; }
    if (level && type.id === "subtask" && level.rank !== -1) { setMessage("子任务类型须放在子任务层。"); return; }
    if (level && count(id) && levelFamily(type.level) !== levelFamily(level.rank)) { setMessage("此类型已有工作项，不能跨规划、标准和子任务类别移动。请先转换现有工作项。"); return; }
    if (!["park", "restore"].includes(target) && !level) return;
    edit((c) => { const t = c.types.find((t) => t.id === id); t.hidden = target === "park"; if (target !== "park") t.enabled = true; if (level) t.level = level.rank; });
    setMessage(target === "park" ? `「${type.name}」已归档。保存后生效。` : `「${type.name}」${level ? "已移至「" + level.name + "」" : "已恢复展示"}。保存后生效。`);
  }
  function applyPlan(mode) {
    const next = planTypeHierarchy(config, items, mode), archived = next.types.filter((t) => t.hidden);
    setConfig(next);
    setMessage(mode === "recommend" ? `推荐展示 ${next.types.length - archived.length} 种类型，归档 ${archived.length} 种类型。保存后生效。` : "已恢复默认分组，使用中的扩展层会保留。保存后生效。");
  }
  const drop = (e, target) => { e.preventDefault(); e.stopPropagation(); move(e.dataTransfer.getData("application/x-heyso-type") || dragging, target); };
  const zone = (id) => ({ onDragOver: (e) => { if (dragging) { e.preventDefault(); e.stopPropagation(); setOver(id); e.dataTransfer.dropEffect = "move"; } }, onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(null); }, onDrop: (e) => drop(e, id) });
  const card = (type, archived = false) => <AntCard className={"level-type-card" + (dragging === type.id ? " is-dragging" : "")} data-type-id={type.id} key={type.id} draggable={!busy} onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData("application/x-heyso-type", type.id); e.dataTransfer.effectAllowed = "move"; setDragging(type.id); }} onDragEnd={() => { setDragging(null); setOver(null); }}>
    <div className="level-type-title"><GripVertical size={14} className="muted"/><WorkType type={type}/><span className="level-type-count" title="已有工作项数量">{count(type.id)}</span><ReplicaButton className="icon-btn" type="button" disabled={busy} aria-label={type.name + (archived ? "恢复展示" : "移至归档")} title={archived ? "恢复展示" : "移至归档"} onClick={() => move(type.id, archived ? "restore" : "park")}>{archived ? <RotateCcw size={14}/> : <Archive size={14}/>}</ReplicaButton></div>
    {!archived && <Select aria-label={type.name + "所属层级"} value={config.levels.find((l) => l.rank === type.level)?.id || ""} disabled={busy} onChange={(e) => move(type.id, e.target.value)}>{levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select>}
  </AntCard>;
  return <div className="type-hierarchy-editor">
    <div className="hierarchy-actions"><span>将工作类型拖入层级分组</span><ReplicaButton type="button" disabled={busy || config.levels.length >= 12 || Math.max(...levels.map((l) => l.rank)) >= 99} onClick={() => setAdding((v) => !v)}><Plus size={14}/>添加层级</ReplicaButton><ReplicaButton type="button" disabled={busy} onClick={() => applyPlan("default")}><RotateCcw size={14}/>恢复默认</ReplicaButton><ReplicaButton type="button" className="recommend-button" disabled={busy} onClick={() => applyPlan("recommend")}><Sparkles size={14}/>智能推荐</ReplicaButton></div>
    {adding && <div className="add-hierarchy-level"><ReplicaInput aria-label="新层级名称" placeholder="例如：战略目标、计划" maxLength={40} value={levelTitle} onChange={(e) => setLevelTitle(e.target.value)} autoFocus/><ReplicaButton type="button" disabled={busy || !levelTitle.trim() || levels.some((l) => l.name === levelTitle.trim())} onClick={() => { edit((c) => c.levels.push({ id: "level_" + crypto.randomUUID().slice(0, 8), name: levelTitle.trim(), rank: Math.max(...c.levels.map((l) => l.rank)) + 1, kind: "custom" })); setLevelTitle(""); setAdding(false); }}>添加</ReplicaButton><ReplicaButton type="button" onClick={() => setAdding(false)}>取消</ReplicaButton></div>}
    {message && <div className="type-hierarchy-message" role="status"><span>{message}</span><ReplicaButton type="button" className="icon-btn" aria-label="关闭层级提示" onClick={() => setMessage("")}><X size={13}/></ReplicaButton></div>}
    <div className="type-hierarchy-layout grouped-hierarchy"><div className="hierarchy-levels">
      {levels.map((level) => { const types = active.filter((t) => t.level === level.rank), occupied = config.types.some((t) => t.level === level.rank); return <section className={"hierarchy-level" + (over === level.id ? " is-target" : "")} key={level.id} data-level-id={level.id} {...zone(level.id)}>
        <header className="hierarchy-level-heading"><span className="hierarchy-rank">{level.rank}</span><ReplicaInput style={{width: Math.min(180, Math.max(48, level.name.length * 13))}} aria-label={level.name + "层级名称"} maxLength={40} value={level.name} disabled={busy} onChange={(e) => edit((c) => { c.levels.find((l) => l.id === level.id).name = e.target.value; })}/><InfoTip label={level.name + "层级"}>{level.kind === "standard" ? "故事、任务、缺陷等标准工作类型在这一层并列，可归属上层工作项，并拆分子任务。" : level.kind === "subtask" ? "子任务必须关联一个标准工作项，不能再包含子项。" : "本层的工作类型并列。实际工作项的父子关系在工作项详情或工作项层级中设置。"}</InfoTip>{level.legacy && <span className="legacy-level-tag">历史扩展</span>}<span className="level-type-total">{types.length} 种类型</span>{level.kind === "custom" && <ReplicaButton className="icon-btn" type="button" title={occupied ? "请先移出该层的全部类型（含归档类型）" : "移除空层级"} aria-label={"移除" + level.name} disabled={busy || occupied} onClick={() => edit((c) => { c.levels = c.levels.filter((l) => l.id !== level.id); })}><Trash2 size={13}/></ReplicaButton>}</header>
        <div className="hierarchy-level-types">{types.map((t) => card(t))}{!types.length && <AntEmpty className="empty-level-drop">拖入工作类型</AntEmpty>}</div>
      </section>; })}
    </div><section className={"type-parking" + (over === "park" ? " is-target" : "")} aria-label="归档类型区域" {...zone("park")}><header><Archive size={17}/><h3 className="heading-with-info">归档<InfoTip label="类型归档">归档只控制类型在创建入口中的可用性，不是工作项的进度状态。拖回层级分组或点击恢复可重新展示。</InfoTip></h3><span>{parked.length} 种类型</span></header><div className="type-parking-cards">{parked.map((t) => card(t, true))}{!parked.length && <AntEmpty className="type-parking-empty">拖入暂不使用的类型</AntEmpty>}</div></section>
    </div>
    <div className="hierarchy-version-note">层级方案 v{project?.hierarchyRevision || 1} · 保存层级变更会保留上一版本</div>
  </div>;
}

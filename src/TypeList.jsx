import React, { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import Select from "./Select.jsx";
import WorkType, { TypeIcon } from "./WorkType.jsx";
import { builtinTypes, typePalette, typeColor, typeIcon, typeIcons } from "../shared/work-config.mjs";

export default function TypeList({ config, setConfig, items, busy }) {
  const [name, setName] = useState("");
  const table = useRef(null);
  useEffect(() => {
    const closeOutside = (event) => {
      for (const details of table.current?.querySelectorAll('details[open][name="type-attribute-picker"]') || []) if (!details.contains(event.target)) details.open = false;
    };
    const escape = (event) => {
      if (event.key !== "Escape") return;
      const details = table.current?.querySelector('details[open][name="type-attribute-picker"]');
      if (details) { event.preventDefault(); details.open = false; details.querySelector("summary")?.focus(); }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", escape); };
  }, []);
  const edit = (fn) => setConfig((old) => { const next = structuredClone(old); fn(next); return next; });
  return <>
    <div className="type-table-wrap" ref={table}><table className="type-management-table"><thead><tr><th>名称</th><th>图标</th><th>颜色</th><th>可用性</th><th>工作项</th></tr></thead><tbody>{config.types.map((type, index) => {
      if (type.retiredBuiltin && ['theme', 'feature'].includes(type.id)) return null;
      const count = items.filter((i) => i.kind === type.id).length;
      const builtin = builtinTypes.some((t) => t.id === type.id);
      const currentState = !type.enabled ? "disabled" : type.hidden ? "archived" : "active";
      const lastExecution = currentState === "active" && type.level === 0 && config.types.filter((t) => t.enabled && !t.hidden && t.level === 0).length === 1;
      return <tr key={type.id} data-type-row={type.id}>
        <td className="type-name-cell"><input aria-label={type.name + "类型名称"} value={type.name} maxLength={40} disabled={busy} onChange={(e) => edit((c) => { c.types[index].name = e.target.value; })}/><small>{builtin ? "内置类型" : "自定义类型"}</small></td>
        <td><details className="type-icon-picker" name="type-attribute-picker"><summary aria-label={type.name + "图标"} title="选择类型图标"><TypeIcon type={type} size={18}/></summary><div className="type-icon-popover"><strong>选择图标</strong><div className="type-icon-grid">{Object.entries(typeIcons).map(([id, label]) => <button type="button" key={id} aria-label={type.name + "使用" + label + "图标"} aria-pressed={typeIcon(type) === id} title={label} disabled={busy} onClick={() => edit((c) => { c.types[index].icon = id; })}><TypeIcon type={{ ...type, icon: id }} size={18}/></button>)}</div><WorkType type={type}/></div></details></td>
        <td><details className="type-color-picker" name="type-attribute-picker"><summary aria-label={type.name + "颜色"} title="选择类型颜色"><span style={{ background: typeColor(type) }}/></summary><div className="type-color-popover"><strong>类型颜色</strong><div className="type-color-grid">{typePalette.map(([color, label]) => <button key={color} type="button" aria-label={type.name + "使用" + label} title={label} aria-pressed={typeColor(type).toLowerCase() === color.toLowerCase()} style={{ background: color }} disabled={busy} onClick={() => edit((c) => { c.types[index].color = color; })}>{typeColor(type).toLowerCase() === color.toLowerCase() ? "✓" : ""}</button>)}</div><label>自定义颜色<input type="color" aria-label={type.name + "自定义颜色"} value={typeColor(type)} disabled={busy} onChange={(e) => edit((c) => { c.types[index].color = e.target.value; })}/></label><WorkType type={type}/></div></details></td>
        <td><Select aria-label={type.name + "类型可用性"} value={currentState} disabled={busy} onChange={(e) => edit((c) => { c.types[index].enabled = e.target.value !== "disabled"; c.types[index].hidden = e.target.value !== "active"; })}><option value="active">展示中</option><option value="archived" disabled={lastExecution}>已归档</option><option value="disabled" disabled={count > 0 || lastExecution}>已停用</option></Select></td>
        <td className="type-usage-cell">{count}</td>
      </tr>;
    })}</tbody></table></div>
    <div className="config-add"><input aria-label="新类型名称" placeholder="例如：调研、设计、运营" maxLength={40} value={name} disabled={busy} onChange={(e) => setName(e.target.value)}/><button type="button" disabled={busy || !name.trim() || config.types.length >= 40 || config.types.some((t) => t.name.trim() === name.trim())} onClick={() => {
      const id = "type_" + crypto.randomUUID().slice(0, 8);
      edit((c) => { c.types.push({ id, name: name.trim(), icon: "box", color: typePalette[c.types.length % typePalette.length][0], level: 0, enabled: true, hidden: false }); }); setName("");
    }}><Plus size={14}/>添加类型</button></div>
  </>;
}

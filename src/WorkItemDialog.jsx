import React, { useState } from "react";
import RichTextEditor from "./RichTextEditor.jsx";
import MarkdownPreview from "./MarkdownPreview.jsx";
import { X } from "lucide-react";
import { DateFields } from "./Schedule.jsx";
import { isExecutionItem, typeNames, statusNamesFor } from "../shared/work-config.mjs";

export default function WorkItemDialog({ modal, project, items, action, busy, onClose }) {
  const i = modal.item;
  const [start, setStart] = useState(i.startDate || "");
  const [end, setEnd] = useState(i.endDate || i.dueDate || "");
  const [error, setError] = useState("");
  const [imagePending,setImagePending] = useState(0);
  const imageBusy = delta => setImagePending(n=>Math.max(0,n+delta));
  const snapshot = modal.type === "workSnapshot";
  const parent = items.find((p) => p.id === i.parentId);
  const ready = !!(project.startDate && project.endDate);
  const min = [project.startDate,parent?.startDate].filter(Boolean).sort().at(-1);
  const max = [project.endDate,parent?.endDate].filter(Boolean).sort()[0];
  return <div className="modal-layer"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="work-item-dialog-title">
    <header><h2 id="work-item-dialog-title">{snapshot ? "历史工作项快照" : "编辑工作项"}</h2><button className="icon-btn" aria-label="关闭" disabled={busy} onClick={onClose}><X size={18}/></button></header>
    {snapshot ? <><div className="modal-body"><p className="muted">此处保留历史记录，当前工作项可能已有变化。</p><h3>{i.title}</h3><p>{typeNames(project)[i.kind] || i.kind} · {statusNamesFor(project)[i.status] || i.status}</p><p>负责人：{i.owner || "未记录"} · 故事点：{i.points ?? "未记录"}</p><p>日期：{i.startDate || "未记录"} 至 {i.endDate || "未记录"}</p><h4>描述</h4><MarkdownPreview value={i.description} empty="此快照未记录描述"/>{i.acceptance && <><h4>验收标准</h4><MarkdownPreview value={i.acceptance}/></>}</div><footer><button onClick={onClose}>关闭</button></footer></> :
    <form onSubmit={async (e) => {
      e.preventDefault(); if (busy || imagePending) return;
      const f = new FormData(e.currentTarget);
      const patch = {id:i.id,title:String(f.get("title")).trim(),description:String(f.get("description") || "")};
      if (isExecutionItem(i,project)) patch.acceptance = String(f.get("acceptance") || "");
      if (ready && (start !== (i.startDate || "") || end !== (i.endDate || i.dueDate || ""))) Object.assign(patch,{startDate:start,endDate:end});
      const result = await action("item.update",patch);
      if (result) onClose(); else setError("保存失败，请根据页面提示调整后重试。");
    }}><div className="modal-body">
      <label className="field"><span>标题</span><input name="title" autoFocus required defaultValue={i.title} disabled={busy}/></label>
      <div className="field"><span>描述</span><RichTextEditor name="description" label="描述" defaultValue={i.description} disabled={busy} onBusyChange={imageBusy}/></div>
      {isExecutionItem(i,project) && <div className="field"><span>验收标准</span><RichTextEditor name="acceptance" label="验收标准" defaultValue={i.acceptance} disabled={busy} onBusyChange={imageBusy}/></div>}
      <DateFields start={start} end={end} setStart={setStart} setEnd={setEnd} min={min} max={max} disabled={busy || !ready}/>
      {!ready && <p className="muted">请先在项目设置中补全项目日期，再编辑工作项日期。</p>}
      {error && <p role="alert" className="error">{error}</p>}
    </div><footer><button type="button" disabled={busy} onClick={onClose}>取消</button><button className="primary" disabled={busy || imagePending > 0}>保存</button></footer></form>}
  </section></div>;
}

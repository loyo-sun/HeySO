import React from 'react';
import MarkdownPreview from './MarkdownPreview.jsx';
import {X} from 'lucide-react';
import {typeNames,statusNamesFor} from '../shared/work-config.mjs';
export default function WorkItemDialog({modal,project,onClose}) {
  const i=modal.item;
  return <div className="modal-layer"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="work-item-dialog-title"><header><h2 id="work-item-dialog-title">历史工作项快照</h2><button className="icon-btn" aria-label="关闭" onClick={onClose}><X size={18}/></button></header>
<><div className="modal-body"><p className="muted">此处保留历史记录，当前工作项可能已有变化。</p><h3>{i.title}</h3><p>{typeNames(project)[i.kind] || i.kind} · {statusNamesFor(project)[i.status] || i.status}</p><p>负责人：{i.owner || "未记录"} · 故事点：{i.points ?? "未记录"}</p><p>日期：{i.startDate || "未记录"} 至 {i.endDate || "未记录"}</p><h4>描述</h4><MarkdownPreview value={i.description} empty="此快照未记录描述"/>{i.acceptance && <><h4>验收标准</h4><MarkdownPreview value={i.acceptance}/></>}</div><footer><button onClick={onClose}>关闭</button></footer></>
</section></div>;
}

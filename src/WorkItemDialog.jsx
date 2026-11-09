import {ReplicaDrawer,ReplicaButton} from './ReplicaControls.jsx';
import React from 'react';
import MarkdownPreview from './MarkdownPreview.jsx';
import WorkType from './WorkType.jsx';
import {StatusIcon,PriorityIcon} from './Select.jsx';
import {X,History,LockKeyhole,Info,CalendarDays,UserRound,Flag,Hash} from 'lucide-react';
import {typeFor,statusNamesFor} from '../shared/work-config.mjs';
import './work-item-snapshot.css';

export default function WorkItemDialog({modal,project,onClose}) {
  const i=modal.item,live=!!modal.readOnlyReason;
  const date=i.startDate||i.endDate ? `${i.startDate||'未记录开始日期'} — ${i.endDate||'未记录结束日期'}` : '未记录日期';
  return <div className="replica-dialog-host"><ReplicaDrawer className="drawer snapshot-drawer" onClose={onClose} role="dialog" aria-modal="true" aria-labelledby="work-item-dialog-title"><header>
    <h2 id="work-item-dialog-title" className="snapshot-heading">{live?<LockKeyhole size={18}/>:<History size={18}/>}<span>{live?'工作项详情':'历史工作项快照'}</span><span className="snapshot-readonly"><LockKeyhole size={12}/>只读</span></h2>
    <ReplicaButton type="button" className="icon-btn" aria-label="关闭" onClick={onClose}><X size={18}/></ReplicaButton>
  </header><div className="drawer-body">
    <div className="snapshot-identity"><WorkType kind={i.kind} type={typeFor(project,i.kind)}/><span className="snapshot-code">{i.number?`${project.code}-${i.number}`:'未记录编号'}</span><span className="snapshot-status"><StatusIcon value={i.status}/>{statusNamesFor(project)[i.status]||i.status}</span></div>
    <h3 className="snapshot-title">{i.title}</h3>
    <div className="snapshot-notice"><Info size={16}/><p>{live?modal.readOnlyReason:i.historyRecovered?'此项由当前数据补充，仅供查看；原冲刺未保存此项的历史快照。':'此处展示冲刺完成时保存的记录，后续工作项的变化不会影响此快照。'}</p></div>
    <dl className="snapshot-properties">
      <div><dt><UserRound size={14}/>负责人</dt><dd>{i.owner?<><span className="snapshot-avatar">{i.owner.slice(0,1)}</span>{i.owner}</>:'未记录'}</dd></div>
      <div><dt><Flag size={14}/>优先级</dt><dd>{i.priority?<><PriorityIcon value={i.priority}/>{{high:'高',medium:'中',low:'低'}[i.priority]||i.priority}</>:'未记录'}</dd></div>
      <div><dt><Hash size={14}/>故事点</dt><dd>{i.points??'未记录'}</dd></div>
      <div className="snapshot-date"><dt><CalendarDays size={14}/>计划周期</dt><dd>{date}</dd></div>
    </dl>
    <section className="snapshot-section"><h4>工作描述</h4><MarkdownPreview value={i.description} empty={live?'暂无工作描述':'此快照未记录工作描述'}/></section>
    <section className="snapshot-section"><h4>验收标准</h4><MarkdownPreview value={i.acceptance} empty={live?'暂无验收标准':'此快照未记录验收标准'}/></section>
  </div></ReplicaDrawer></div>;
}

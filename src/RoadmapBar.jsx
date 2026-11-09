import {ReplicaButton} from './ReplicaControls.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fitChildSchedules } from '../shared/schedule.mjs';
import { dragRoadmapDates, roadmapBar } from './roadmap-model.mjs';

export default function RoadmapBar({ item, items, project, window, progress, color, overdue, title, status, compact=false, summary=false, busy, onOpen, onSchedule }) {
  const [preview, setPreview] = useState(null), [saving, setSaving] = useState(false);
  const gesture = useRef(null), suppressClick = useRef(false), latest = useRef(null);
  latest.current = { item, items, project, busy };
  useEffect(() => {
    const cancel = e => { if (e.key === 'Escape' && gesture.current) { gesture.current = null; suppressClick.current = true; setPreview(null); e.preventDefault(); } };
    document.addEventListener('keydown', cancel);
    return () => document.removeEventListener('keydown', cancel);
  }, []);
  function begin(e, mode) {
    if (item.readOnly || busy || saving || gesture.current || !e.isPrimary || e.button !== 0) return;
    e.stopPropagation();
    suppressClick.current = false;
    const track = e.currentTarget.closest('.roadmap-track');
    gesture.current = { pointerId: e.pointerId, mode, x: e.clientX, scroll: track.closest('.roadmap-scroll').scrollLeft, width: track.getBoundingClientRect().width, item, items, project, moved: false, dates: null };
    setPreview({ startDate: item.startDate, endDate: item.endDate || item.dueDate, x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e) {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    const scroll = e.currentTarget.closest('.roadmap-scroll').scrollLeft;
    const dx = e.clientX - g.x + scroll - g.scroll;
    if (!g.moved && Math.abs(dx) < 4) return;
    g.moved = true; suppressClick.current = true;
    g.dates = dragRoadmapDates(g.item, g.items, g.project, g.mode, dx / g.width * window.days, true);
    if (g.dates) setPreview({ ...g.dates, x: e.clientX, y: e.clientY });
    e.preventDefault();
  }
  async function finish(e, cancel = false) {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    gesture.current = null;
    if (cancel || !g.moved || !g.dates) { setPreview(null); return; }
    const { startDate, endDate } = g.dates;
    if (startDate === g.item.startDate && endDate === (g.item.endDate || g.item.dueDate)) { setPreview(null); return; }
    // Polling may refresh the item or its constraints during a gesture. Never overwrite it.
    const current = latest.current;
    const fresh = dragRoadmapDates(g.item, current.items, current.project, g.mode, g.mode === 'end' ? (Date.parse(endDate) - Date.parse(g.item.endDate || g.item.dueDate)) / 86400000 : (Date.parse(startDate) - Date.parse(g.item.startDate)) / 86400000, true);
    if (current.item.readOnly || current.busy || current.item.contentVersion !== g.item.contentVersion || current.item.startDate !== g.item.startDate || current.item.endDate !== g.item.endDate || current.item.parentId !== g.item.parentId || fresh?.startDate !== startDate || fresh?.endDate !== endDate || current.items.length !== g.items.length || g.items.some(before => { const after = current.items.find(i => i.id === before.id); return !after || before.startDate !== after.startDate || before.endDate !== after.endDate || before.parentId !== after.parentId; })) { setPreview(null); return; }
    setSaving(true);
    try { await onSchedule(item, { startDate, endDate, scheduleMode: g.mode }); }
    finally { setSaving(false); setPreview(null); }
  }
  const affected = preview ? fitChildSchedules(items, item, { ...item, ...preview }, gesture.current?.mode).length : 0;
  const parent = items.find(i => i.id === item.parentId);
  const boundary = parent ? `已到达项目或父级「${parent.title}」的周期边界，或起止日期已重合` : '已到达项目周期边界，或起止日期已重合';
  const position = roadmapBar(preview ? { ...item, ...preview } : item, window);
  if (!position) return null;
  const events = mode => ({ onPointerDown: e => begin(e, mode), onPointerMove: move, onPointerUp: e => finish(e), onPointerCancel: e => finish(e, true), onLostPointerCapture: e => finish(e, true) });
  const blocked = busy || saving;
  return <>
    <div className={`roadmap-bar${compact ? ' is-compact' : ''}${summary ? ' is-summary' : ''}${position.clippedStart ? ' clipped-start' : ''}${position.clippedEnd ? ' clipped-end' : ''}${preview ? ' is-dragging' : ''}${saving ? ' is-saving' : ''}`} style={{ left: `${position.left}%`, width: `${position.width}%`, '--bar-color': color }} title={preview ? undefined : title}>
      <span className="roadmap-bar-progress" style={{ width: `${progress.percent}%` }}/>
      <ReplicaButton className="roadmap-bar-body" {...(item.readOnly ? {} : events('move'))} disabled={blocked} onClick={() => { if (!suppressClick.current) onOpen(item); suppressClick.current = false; }} aria-label={`查看详情：${title.replaceAll('\n', '，')}`} aria-describedby="roadmap-drag-help"><span className="roadmap-bar-title">{overdue && <i aria-label="计划已逾期"/>}{item.title}</span><small>{progress.total ? `${progress.percent}%` : status}</small></ReplicaButton>
      {!item.readOnly && !position.clippedStart && <ReplicaButton className="roadmap-resize roadmap-resize-start" {...events('start')} disabled={blocked} onClick={e => e.stopPropagation()} aria-label={'调整开始日期：' + item.title} title="拖动调整开始日期"/>}
      {!item.readOnly && !position.clippedEnd && <ReplicaButton className="roadmap-resize roadmap-resize-end" {...events('end')} disabled={blocked} onClick={e => e.stopPropagation()} aria-label={'调整结束日期：' + item.title} title="拖动调整结束日期"/>}
    </div>
    {preview && !saving && createPortal(<div className="roadmap-drag-tooltip" role="status" style={{ left: Math.max(8, Math.min(preview.x - 120, globalThis.innerWidth - 270)), top: Math.max(8, preview.y - 65) }}><strong>{preview.startDate} → {preview.endDate}</strong><span>{preview.limited ? boundary : affected ? `将同步调整 ${affected} 个子项 · 松开保存 · Esc 取消` : '松开保存 · Esc 取消'}</span></div>, document.body)}
  </>;
}

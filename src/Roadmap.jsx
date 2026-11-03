import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, ChevronDown, Search, Flag, Plus, X, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { TypeIcon } from './WorkType.jsx';
import Select from './Select.jsx';
import { configFor, typeColor, typeFor, terminal, statusNamesFor } from '../shared/work-config.mjs';
import { dayNumber, localDay, itemRange, roadmapTimeline, shiftRoadmap, roadmapBar, roadmapPoint, roadmapRows, roadmapProgress } from './roadmap-model.mjs';
import './roadmap.css';
import RoadmapBar from './RoadmapBar.jsx';

export default function Roadmap({ project, items, releases, onOpen, onEdit, onCreate, onReleases, onProjectSettings, onSchedule, busy }) {
  const today = localDay();
  const [anchor, setAnchor] = useState(() => today < project.startDate || today > project.endDate ? project.startDate || today : today);
  const [scale, setScale] = useState('quarter'), [query, setQuery] = useState(''), [status, setStatus] = useState('all'), [owner, setOwner] = useState('all');
  const [subtask, setSubtask] = useState(false), [collapsed, setCollapsed] = useState(new Set()), [space, setSpace] = useState(650);
  const scroll = useRef(null), headerScroll = useRef(null), dock = useRef(null), panel = useRef(null);
  const [dockBounds, setDockBounds] = useState({ left: 0, width: 0, visible: false });
  const names = statusNamesFor(project), window = roadmapTimeline(anchor, scale, project, items, releases);
  const syncScroll = source => {
    headerScroll.current?.style.setProperty('--roadmap-scroll-x', `${source.scrollLeft}px`);
    for (const el of [scroll.current, headerScroll.current, dock.current]) if (el && el !== source && Math.abs(el.scrollLeft - source.scrollLeft) > .5) el.scrollLeft = source.scrollLeft;
  };
  useEffect(() => {
    const el = scroll.current; if (!el) return;
    const measure = () => {
      setSpace(Math.max(200, el.clientWidth - parseFloat(getComputedStyle(el).getPropertyValue('--roadmap-label-width'))));
      const rect = el.getBoundingClientRect(), section = panel.current.getBoundingClientRect();
      const visible = section.bottom > 70 && section.top < globalThis.innerHeight;
      setDockBounds(old => old.left === rect.left && old.width === rect.width && old.visible === visible ? old : { left: rect.left, width: rect.width, visible });
    };
    measure(); const observer = new ResizeObserver(measure); observer.observe(el);
    globalThis.addEventListener('scroll', measure, true); globalThis.addEventListener('resize', measure);
    return () => { observer.disconnect(); globalThis.removeEventListener('scroll', measure, true); globalThis.removeEventListener('resize', measure); };
  }, []);
  const axisWidth = Math.max(space, window.days * ({ day: 48, month: 24, quarter: 10, year: 3 }[scale]));
  useLayoutEffect(() => {
    if (!scroll.current) return;
    scroll.current.scrollLeft = (dayNumber(anchor) - window.start) / window.days * axisWidth;
    syncScroll(scroll.current);
  }, [anchor, scale, window.start, axisWidth, window.days]);
  const focusDate = value => {
    setAnchor(value);
    if (scroll.current) { scroll.current.scrollLeft = (dayNumber(value) - window.start) / window.days * axisWidth; syncScroll(scroll.current); }
  };
  const rows = roadmapRows(items, project, { query, status, owner, subtask, collapsed });
  const todayX = roadmapPoint(today, window), undated = rows.filter(r => !itemRange(r.item)).length;
  const visible = rows.filter(r => roadmapBar(r.item, window)).length;
  const filtered = !!query || status !== 'all' || owner !== 'all';
  const toggle = id => setCollapsed(old => { const next = new Set(old); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const grid = <div className="roadmap-grid" aria-hidden="true">{window.ticks.map(t => <span key={t.date} style={{ left: `${t.left}%` }}/>)}</div>;
  const nowLine = todayX !== null && <span className="roadmap-today-line" style={{ left: `${todayX}%` }} aria-hidden="true"/>;
  return <>
    <div className="page-heading"><div><h1>Roadmap <span className="roadmap-heading-subtitle">产品路线图</span></h1><p className="roadmap-description">把目标、工作与版本放在同一条时间线上。</p></div><button className="primary" onClick={onCreate}><Plus size={16}/>新建工作项</button></div>
    <section className="panel roadmap-panel" ref={panel} aria-label="产品路线图" style={{ '--roadmap-axis-width': `${axisWidth}px` }}>
      <div className="roadmap-sticky-header">
      <div className="roadmap-controls">
        <div className="roadmap-period"><button className="icon-btn" aria-label="上一个时间段" onClick={() => setAnchor(shiftRoadmap(anchor, scale, -1))}><ChevronLeft size={17}/></button><strong>{window.label}</strong><button className="icon-btn" aria-label="下一个时间段" onClick={() => setAnchor(shiftRoadmap(anchor, scale, 1))}><ChevronRight size={17}/></button><button onClick={() => focusDate(today)}>今天</button><button onClick={() => { focusDate(project.startDate || today); setScale('quarter'); }}>项目起点</button></div>
        <div className="roadmap-scale" role="group" aria-label="时间颗粒度">{[['year','年'],['quarter','季'],['month','月'],['day','天']].map(([value,label]) => <button key={value} aria-pressed={scale === value} onClick={() => { setScale(value); }}>{label}</button>)}</div>
      </div>
      <div className="roadmap-filters">
        <div className="roadmap-search"><Search size={15}/><input aria-label="搜索路线图工作项" placeholder="搜索工作项、编号或类型…" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button className="icon-btn" aria-label="清除路线图搜索" onClick={() => setQuery('')}><X size={13}/></button>}</div>
        <Select aria-label="路线图状态筛选" value={status} onChange={e => setStatus(e.target.value)}><option value="all">所有状态</option>{configFor(project).statuses.filter(s => s.enabled).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        <Select aria-label="路线图负责人筛选" value={owner} onChange={e => setOwner(e.target.value)}><option value="all">所有负责人</option>{project.members.map(m => <option key={m}>{m}</option>)}</Select>
        <label className="roadmap-subtasks"><input type="checkbox" checked={subtask} onChange={e => setSubtask(e.target.checked)}/>显示子任务</label>
        <button className="icon-btn" aria-label="展开全部路线图工作项" title="全部展开" disabled={filtered} onClick={() => setCollapsed(new Set())}><ChevronsUpDown size={16}/></button><button className="icon-btn" aria-label="收起全部路线图工作项" title="全部收起" disabled={filtered} onClick={() => setCollapsed(new Set(items.map(i => i.id)))}><ChevronsDownUp size={16}/></button>
      </div>
      {(!project.startDate || !project.endDate) && <div className="roadmap-notice">项目周期待设置，工作项仍可查看。<button className="text-btn" onClick={onProjectSettings}>设置项目周期</button></div>}
      <div className="roadmap-header-scroll" ref={headerScroll} onScroll={e => syncScroll(e.currentTarget)}><div className="roadmap-table"><div className="roadmap-ruler"><div className="roadmap-label roadmap-label-heading">工作项 <span>{rows.length}</span></div><div className="roadmap-axis"><div className="roadmap-major">{window.segments.map((s,i) => <span key={i} style={{ left: `${s.left}%`, width: `${s.width}%` }}><b style={{ marginLeft: `clamp(0px, calc(var(--roadmap-scroll-x, 0px) - ${s.left / 100 * axisWidth}px), ${Math.max(0, s.width / 100 * axisWidth - 110)}px)` }}>{s.label}</b></span>)}</div><div className="roadmap-minor">{window.ticks.map(t => <span key={t.date} className={t.weekend ? 'is-weekend' : ''} style={{ left: `${t.left}%` }}>{t.label}</span>)}</div>{todayX !== null && <span className="roadmap-today-marker" style={{ left: `${todayX}%` }}>今天</span>}</div></div></div></div>
      </div>
      <div className="roadmap-scroll" ref={scroll} onScroll={e => syncScroll(e.currentTarget)} tabIndex={0} aria-label="路线图时间轴，可横向滚动">
        <div className="roadmap-table" style={{ '--roadmap-axis-width': `${axisWidth}px` }}>

          {!rows.length && <div className="roadmap-empty"><Calendar size={26}/><h3>{items.length ? '没有符合条件的工作项' : '从第一个目标开始规划'}</h3><p>{items.length ? '调整搜索或筛选条件，再查看路线图。' : '新建工作项并设置计划周期，即可在时间轴上查看。'}</p>{items.length ? <button onClick={() => { setQuery(''); setStatus('all'); setOwner('all'); }}>清除筛选</button> : <button onClick={onCreate}>新建工作项</button>}</div>}
          {rows.map(({ item, depth, hasChildren, collapsed: folded, contextOnly }) => {
            const range = itemRange(item), bar = roadmapBar(item, window), progress = roadmapProgress(item, items, project);
            const overdue = range && range.end < dayNumber(today) && !terminal(item, project);
            const type = typeFor(project, item.kind), title = `${item.title} · ${names[item.status] || item.status} · ${item.owner || '未分配'}\n${range ? `${range.startDate} 至 ${range.endDate}` : '日期待设置'}${progress.total ? `\n已完成 ${progress.done}/${progress.total} · ${progress.percent}%` : ''}`;
            return <div key={item.id} className={`roadmap-row${contextOnly ? ' context-only' : ''}${overdue ? ' is-overdue' : ''}`} data-work-item-id={item.id} tabIndex={0}>
              <div className="roadmap-label" style={{ paddingLeft: 12 + Math.min(depth, 6) * 16 }}>
                {hasChildren ? <button className="roadmap-fold icon-btn" aria-label={(folded ? '展开' : '收起') + item.title} aria-expanded={!folded} onClick={() => toggle(item.id)} disabled={filtered}>{folded ? <ChevronRight size={14}/> : <ChevronDown size={14}/>}</button> : <span className="roadmap-fold-placeholder"/>}
                <TypeIcon kind={item.kind}/><button className="roadmap-item-name" onClick={() => onOpen(item)} title={title}><span>{item.title}</span><small>{project.code}-{item.number} · {item.owner || '未分配'}</small></button>
                <button className="roadmap-edit icon-btn" aria-label={'调整日期：' + item.title} title="调整计划日期" disabled={busy} onClick={() => onEdit(item)}><Calendar size={14}/></button>
              </div>
              <div className="roadmap-track">{grid}{nowLine}{bar ? <RoadmapBar item={item} items={items} project={project} window={window} progress={progress} color={typeColor(type)} overdue={overdue} title={title} status={names[item.status]} busy={busy} onEdit={onEdit} onSchedule={onSchedule}/> : <div className="roadmap-outside">{range ? <><span>当前时间段外 · {range.startDate} — {range.endDate}</span><button className="text-btn" onClick={() => setAnchor(range.startDate)}>定位</button></> : <button className="roadmap-unscheduled" disabled={busy} onClick={() => onEdit(item)}>待排期 · 设置日期</button>}</div>}</div>
            </div>;
          })}
          {releases.length > 0 && <><div className="roadmap-section-heading"><Flag size={14}/>版本里程碑<span>计划发布日期</span><button className="text-btn" onClick={onReleases}>管理版本</button></div>{releases.map(r => {
            const point = roadmapPoint(r.plannedDate, window);
            return <div className="roadmap-row roadmap-release-row" key={r.id}><div className="roadmap-label"><Flag size={14}/><button className="roadmap-item-name" onClick={onReleases}><span>{r.name}</span><small>{r.status === 'released' ? '已发布' : '计划中'} · {r.plannedDate || '日期待设置'}</small></button></div><div className="roadmap-track">{grid}{nowLine}{point !== null ? <button className={'roadmap-milestone' + (r.status === 'released' ? ' released' : '')} style={{ left: `${point}%` }} onClick={onReleases} title={`${r.name} · 计划发布 ${r.plannedDate}`} aria-label={`${r.name}，计划发布 ${r.plannedDate}`}><i/><span>{r.name}</span></button> : <div className="roadmap-outside">{dayNumber(r.plannedDate) !== null ? <><span>计划发布 {r.plannedDate}</span><button className="text-btn" onClick={() => setAnchor(r.plannedDate)}>定位</button></> : <button className="text-btn" onClick={onReleases}>设置发布日期</button>}</div>}</div></div>;
          })}</>}
        </div>
      </div>
      <div className="roadmap-interaction-help" id="roadmap-drag-help">拖动时间条调整周期 · 拖动两端调整起止日期 · 点击时间条编辑 · 移动时子项跟随，收缩时越界子项同步收拢 · Esc 取消拖动</div>
      <div className="roadmap-footer"><span><i className="roadmap-legend-progress"/>条内深色区域表示已完成比例</span><span><i className="roadmap-legend-overdue"/>逾期未完成</span><span><i className="roadmap-legend-release"/>版本里程碑</span><small>{visible} 项位于当前时间段 · {undated} 项待排期</small></div>
      <div ref={dock} className="roadmap-scroll-dock" style={{ left: dockBounds.left, width: dockBounds.width, visibility: dockBounds.visible ? 'visible' : 'hidden' }} onScroll={e => syncScroll(e.currentTarget)} tabIndex={0} role="region" aria-label="横向滚动时间轴"><div style={{ width: `calc(var(--roadmap-label-width) + ${axisWidth}px)` }}/></div>
    </section>
  </>;
}

import {ReplicaNativeSelect,ReplicaButton,ReplicaInput} from './ReplicaControls.jsx';
import {AntCard,AntSegments,AntDisclosure,AntEmpty} from './AntStructures.jsx';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, ChevronDown, Search, Flag, X, ChevronsDownUp, ChevronsUpDown, SlidersHorizontal, Columns3, Download, Link2, Check, Settings2 } from 'lucide-react';
import { TypeIcon, workTypeColor } from './WorkType.jsx';
import { configFor, typeFor, terminal, statusNamesFor } from '../shared/work-config.mjs';
import { dayNumber, localDay, itemRange, shiftRoadmap, roadmapBar, roadmapPoint, roadmapProgress, roadmapPlanWindow, roadmapPlanRows } from './roadmap-model.mjs';

import RoadmapBar from './RoadmapBar.jsx';
import PageTitle from './PageTitle.jsx';
import SubtaskFilter from './SubtaskFilter.jsx';
import {StatusIcon} from './Select.jsx';
import {categoryOf} from '../shared/work-config.mjs';
import {releaseState} from './release-model.mjs';

export default function Roadmap({ project, items, releases, onOpen, onCreate, onReleases, onProjectSettings, onSchedule, busy }) {
  const today = localDay();
  const [anchor, setAnchor] = useState(() => today < project.startDate || today > project.endDate ? project.startDate || today : today);
  const [scale, setScale] = useState('quarter'), [query, setQuery] = useState(''), [status, setStatus] = useState('all'), [owner, setOwner] = useState('all'), [version,setVersion] = useState('all'), [showReleases,setShowReleases] = useState(true);
  const config=configFor(project);
  const levels=[...config.levels].sort((a,b)=>b.rank-a.rank).map(l=>({...l,name:config.types.filter(t=>t.level===l.rank&&(t.enabled&&!t.hidden||items.some(i=>i.kind===t.id))).map(t=>t.name).join(' / ')||l.name}));
  const [top,setTop]=useState(()=>Math.max(...levels.map(l=>l.rank))),[bottom,setBottom]=useState(0);
  const [fields,setFields]=useState(()=>globalThis.innerWidth<1000?['startDate','endDate']:['startDate','endDate','owner','releaseId']),[barLabels,setBarLabels]=useState(false),[colorBy,setColorBy]=useState('type'),[notice,setNotice]=useState('');
  const [custom,setCustom]=useState({startDate:project.startDate||today,endDate:project.endDate||today});
  const columns=[{id:'startDate',label:'开始日期',width:88},{id:'endDate',label:'结束日期',width:88},{id:'status',label:'状态',width:100},{id:'owner',label:'负责人',width:100},{id:'releaseId',label:'版本',width:112},{id:'points',label:'故事点',width:72}];
  const shownFields=fields.map(id=>columns.find(c=>c.id===id)).filter(Boolean),fieldsWidth=shownFields.reduce((n,c)=>n+c.width,0);
  const [collapsed, setCollapsed] = useState(new Set()), [space, setSpace] = useState(650);
  const scroll = useRef(null), headerScroll = useRef(null), dock = useRef(null), panel = useRef(null);
  const [dockBounds, setDockBounds] = useState({ left: 0, width: 0, visible: false });
  const names = statusNamesFor(project), window = roadmapPlanWindow(anchor, scale, project, items, releases, custom);
  const syncScroll = source => {
    headerScroll.current?.style.setProperty('--roadmap-scroll-x', `${source.scrollLeft}px`);
    for (const el of [scroll.current, headerScroll.current, dock.current]) if (el && el !== source && Math.abs(el.scrollLeft - source.scrollLeft) > .5) el.scrollLeft = source.scrollLeft;
  };
  useEffect(() => {
    const el = scroll.current; if (!el) return;
    const measure = () => {
      setSpace(Math.max(180, el.clientWidth - parseFloat(getComputedStyle(el).getPropertyValue('--roadmap-label-width')) - fieldsWidth));
      const rect = el.getBoundingClientRect(), section = panel.current.getBoundingClientRect();
      const visible = section.bottom > 70 && section.top < globalThis.innerHeight;
      setDockBounds(old => old.left === rect.left && old.width === rect.width && old.visible === visible ? old : { left: rect.left, width: rect.width, visible });
    };
    measure(); const observer = new ResizeObserver(measure); observer.observe(el);
    globalThis.addEventListener('scroll', measure, true); globalThis.addEventListener('resize', measure);
    return () => { observer.disconnect(); globalThis.removeEventListener('scroll', measure, true); globalThis.removeEventListener('resize', measure); };
  }, [fieldsWidth]);
  const axisWidth = scale==='fit'||scale==='custom'?space:Math.max(space,window.days*(scale==='year'?2.5:7));
  useLayoutEffect(() => {
    if (!scroll.current) return;
    scroll.current.scrollLeft = scale==='fit'||scale==='custom'?0:(dayNumber(anchor) - window.start) / window.days * axisWidth;
    syncScroll(scroll.current);
  }, [anchor, scale, window.start, axisWidth, window.days]);
  const focusDate = value => {
    setAnchor(value);
    if (scroll.current) { scroll.current.scrollLeft = (dayNumber(value) - window.start) / window.days * axisWidth; syncScroll(scroll.current); }
  };
  const rows = roadmapPlanRows(items, project, { query, status, owner, version, collapsed },top,bottom);
  let lastTick=-Infinity;
  const axisTicks=window.ticks.filter(t=>{if((t.left-lastTick)/100*axisWidth<40)return false;lastTick=t.left;return true;});
  const todayX = roadmapPoint(today, window), undated = rows.filter(r => !itemRange(r.item)).length;
  const visible = rows.filter(r => roadmapBar(r.item, window)).length;
  const filtered = !!query || status !== 'all' || owner !== 'all' || version !== 'all';
  const visibleReleases = releases.filter(r=>!r.archived && (version==='all'||version.includes(r.id)));
  const toggle = id => setCollapsed(old => { const next = new Set(old); next.has(id) ? next.delete(id) : next.add(id); return next; });
  function fieldValue(item,id){if(id==='status')return names[item.status]||item.status;if(id==='releaseId')return releases.find(r=>r.id===item.releaseId)?.name||'';if(id==='endDate')return item.endDate||item.dueDate||'';return item[id]??'';}
  const grid = <div className="roadmap-grid" aria-hidden="true">{window.ticks.map(t => <span key={t.date} style={{ left: `${t.left}%` }}/>)}</div>;
  const nowLine = todayX !== null && <span className="roadmap-today-line" style={{ left: `${todayX}%` }} aria-hidden="true"/>;
  return <>
    <div className="page-heading roadmap-page-heading"><div><PageTitle view="roadmap"/></div><div className="roadmap-plan-actions"><ReplicaButton onClick={()=>{const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';const text='\ufeff'+[['ID','标题',...shownFields.map(c=>c.label)],...rows.map(({item:i})=>[project.code+'-'+i.number,i.title,...shownFields.map(c=>fieldValue(i,c.id))])].map(r=>r.map(v=>quote(/^[\s]*[=+@-]/.test(String(v))?"'"+v:v)).join(',')).join('\r\n');const a=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));a.href=url;a.download=project.code+'-线路计划.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}><Download size={14}/>导出</ReplicaButton></div></div>
    {notice&&<div className="roadmap-copy-notice" role="status">{notice}<ReplicaButton aria-label="关闭提示" onClick={()=>setNotice('')}><X size={13}/></ReplicaButton></div>}
    <AntCard className="panel roadmap-panel roadmap-plan" ref={panel} aria-label="产品路线图" style={{ '--roadmap-axis-width': `${axisWidth}px`,'--roadmap-fields-width':fieldsWidth+'px','--roadmap-field-columns':shownFields.map(c=>c.width+'px').join(' ') }}>
      <div className="roadmap-sticky-header">
      <div className="roadmap-plan-toolbar">
        <div className="roadmap-hierarchy"><span>层级</span><ReplicaNativeSelect aria-label="最高显示层级" value={top} onChange={e=>{const n=Number(e.target.value);setTop(n);if(bottom>n)setBottom(n);}}>{levels.map(l=><option key={l.id} value={l.rank}>{l.name}</option>)}</ReplicaNativeSelect><span>至</span><ReplicaNativeSelect aria-label="最低显示层级" value={bottom} onChange={e=>setBottom(Number(e.target.value))}>{levels.filter(l=>l.rank<=top).map(l=><option key={l.id} value={l.rank}>{l.name}</option>)}</ReplicaNativeSelect></div>
        <SubtaskFilter checked={bottom<=-1} onChange={checked=>{setBottom(checked?-1:0);if(top<0)setTop(0);}}/><PlanMenu label="筛选" icon={SlidersHorizontal} active={filtered}><div className="roadmap-search"><Search size={15}/><ReplicaInput aria-label="搜索路线图工作项" placeholder="搜索工作项、编号或类型…" value={query} onChange={e=>setQuery(e.target.value)}/></div><MultiFilter label="状态" value={status} onChange={setStatus} options={configFor(project).statuses.filter(s=>s.enabled||items.some(i=>i.status===s.id)).map(s=>({value:s.id,label:s.name}))}/><MultiFilter label="负责人" searchable value={owner} onChange={setOwner} options={[...new Set([...project.members,...items.map(i=>i.owner||'')])].map(m=>({value:m,label:m||'未分配'}))}/><MultiFilter label="版本" value={version} onChange={setVersion} options={releases.filter(r=>!r.archived).map(r=>({value:r.id,label:r.name}))}/><ReplicaButton className="text-btn" onClick={()=>{setQuery('');setStatus('all');setOwner('all');setVersion('all');}}>清除筛选</ReplicaButton></PlanMenu>
        <div className="roadmap-plan-time"><AntSegments className="roadmap-scale" role="group" aria-label="时间范围">{[['quarter','3 个月'],['year','1 年'],['fit','适应']].map(([v,label])=><ReplicaButton key={v} aria-pressed={scale===v} onClick={()=>{setScale(v);if(v==='quarter'||v==='year')setAnchor(today);}}>{label}</ReplicaButton>)}</AntSegments><PlanMenu label="自定义日期"><label>开始日期<ReplicaInput type="date" aria-label="时间轴开始日期" value={custom.startDate} onInput={e=>{const value=e.currentTarget.value;setCustom(old=>({...old,startDate:value}));}} onChange={e=>{const value=e.target.value;setCustom(old=>({...old,startDate:value}));}}/></label><label>结束日期<ReplicaInput type="date" aria-label="时间轴结束日期" value={custom.endDate} onInput={e=>{const value=e.currentTarget.value;setCustom(old=>({...old,endDate:value}));}} onChange={e=>{const value=e.target.value;setCustom(old=>({...old,endDate:value}));}}/></label><ReplicaButton disabled={dayNumber(custom.startDate)===null||dayNumber(custom.endDate)===null||custom.endDate<custom.startDate} data-close-disclosure onClick={()=>setScale('custom')}>应用日期范围</ReplicaButton></PlanMenu></div>
        <PlanMenu label="视图设置" icon={Settings2}><label><ReplicaInput type="checkbox" checked={showReleases} onChange={e=>setShowReleases(e.target.checked)}/>显示版本里程碑</label><label><ReplicaInput type="checkbox" checked={barLabels} onChange={e=>setBarLabels(e.target.checked)}/>显示时间条文字</label><label>时间条颜色<ReplicaNativeSelect aria-label="时间条颜色" value={colorBy} onChange={e=>setColorBy(e.target.value)}><option value="type">按工作项类型</option><option value="status">按工作项状态</option></ReplicaNativeSelect></label></PlanMenu>
      </div>
      <div className="roadmap-plan-secondary"><div className="roadmap-scope-tools"><span>范围 <b>{rows.length}</b></span><ReplicaButton className="icon-btn" aria-label="展开全部路线图工作项" title="全部展开" disabled={filtered} onClick={()=>setCollapsed(new Set())}><ChevronsUpDown size={15}/></ReplicaButton><ReplicaButton className="icon-btn" aria-label="收起全部路线图工作项" title="全部收起" disabled={filtered} onClick={()=>setCollapsed(new Set(items.map(i=>i.id)))}><ChevronsDownUp size={15}/></ReplicaButton><PlanMenu label="字段" icon={Columns3}>{columns.map(c=><label key={c.id}><ReplicaInput type="checkbox" checked={fields.includes(c.id)} onChange={e=>setFields(old=>e.target.checked?[...old,c.id]:old.filter(id=>id!==c.id))}/>{c.label}</label>)}</PlanMenu></div><div className="roadmap-period"><ReplicaButton className="icon-btn" aria-label="上一个时间段" disabled={scale==='fit'||scale==='custom'} onClick={()=>setAnchor(shiftRoadmap(anchor,scale,-1))}><ChevronLeft size={15}/></ReplicaButton><span>{window.label}</span><ReplicaButton className="icon-btn" aria-label="下一个时间段" disabled={scale==='fit'||scale==='custom'} onClick={()=>setAnchor(shiftRoadmap(anchor,scale,1))}><ChevronRight size={15}/></ReplicaButton><ReplicaButton onClick={()=>{setScale('quarter');focusDate(today);}}>今天</ReplicaButton></div></div>
      {(!project.startDate || !project.endDate) && <div className="roadmap-notice">项目周期待设置，工作项仍可查看。<ReplicaButton className="text-btn" onClick={onProjectSettings}>设置项目周期</ReplicaButton></div>}
      <div className="roadmap-header-scroll" ref={headerScroll} onScroll={e => syncScroll(e.currentTarget)}><div className="roadmap-table"><div className="roadmap-ruler"><div className="roadmap-label roadmap-label-heading">工作项</div><div className="roadmap-fields roadmap-field-headings">{shownFields.map(c=><span key={c.id}>{c.label}</span>)}</div><div className="roadmap-axis"><div className="roadmap-major">{window.segments.map((s,i) => <span key={i} style={{ left: `${s.left}%`, width: `${s.width}%` }}><b style={{ marginLeft: `clamp(0px, calc(var(--roadmap-scroll-x, 0px) - ${s.left / 100 * axisWidth}px), ${Math.max(0, s.width / 100 * axisWidth - 110)}px)` }}>{s.label}</b></span>)}</div><div className="roadmap-minor">{axisTicks.map(t => <span key={t.date} className={t.weekend ? 'is-weekend' : ''} style={{ left: `${t.left}%` }}>{t.label}</span>)}</div>{showReleases&&visibleReleases.map(r=>{const x=roadmapPoint(r.releasedDate||r.plannedDate,window);return x!==null&&<ReplicaButton key={r.id} className={"roadmap-ruler-release "+(r.status==='released'?'released':'')} style={{left:x+'%'}} onClick={()=>onReleases(r.id)} title={r.name+' · '+(r.releasedDate||r.plannedDate)} aria-label={'版本里程碑：'+r.name}><i/></ReplicaButton>;})}{todayX !== null && <span className="roadmap-today-marker" style={{ left: `${todayX}%` }}>今天</span>}</div></div></div></div>
      </div>
      <div className="roadmap-scroll" ref={scroll} onScroll={e => syncScroll(e.currentTarget)} tabIndex={0} aria-label="路线图时间轴，可横向滚动">
        <div className="roadmap-table" style={{ '--roadmap-axis-width': `${axisWidth}px` }}>

          {!rows.length && <AntEmpty className="roadmap-empty"><Calendar size={26}/><h3>{items.length ? '没有符合条件的工作项' : '从第一个目标开始规划'}</h3><p>{items.length ? '调整搜索或筛选条件，再查看路线图。' : '新建工作项并设置计划周期，即可在时间轴上查看。'}</p>{items.length ? <ReplicaButton onClick={() => { setQuery(''); setStatus('all'); setOwner('all');setVersion('all'); }}>清除筛选</ReplicaButton> : <ReplicaButton onClick={onCreate}>新建工作项</ReplicaButton>}</AntEmpty>}
          {rows.map(({ item, depth, hasChildren, collapsed: folded, contextOnly }) => {
            const range = itemRange(item), bar = roadmapBar(item, window), progress = roadmapProgress(item, items, project);
            const overdue = range && range.end < dayNumber(today) && !terminal(item, project);
            const type = typeFor(project, item.kind), title = `${item.title} · ${names[item.status] || item.status} · ${item.owner || '未分配'}\n${range ? `${range.startDate} 至 ${range.endDate}` : '日期待设置'}${progress.total ? `\n已完成 ${progress.done}/${progress.total} · ${progress.percent}%` : ''}`;
            return <div key={item.id} className={`roadmap-row${contextOnly ? ' context-only' : ''}${overdue ? ' is-overdue' : ''}${hasChildren?' is-parent':''}`} data-work-item-id={item.id} tabIndex={0}>
              <div className="roadmap-label" style={{ paddingLeft: 12 + Math.min(depth, 6) * 16 }}>
                {hasChildren ? <ReplicaButton className="roadmap-fold icon-btn" aria-label={(folded ? '展开' : '收起') + item.title} aria-expanded={!folded} onClick={() => toggle(item.id)} disabled={filtered}>{folded ? <ChevronRight size={14}/> : <ChevronDown size={14}/>}</ReplicaButton> : <span className="roadmap-fold-placeholder"/>}
                <TypeIcon kind={item.kind}/><ReplicaButton className="roadmap-item-name" onClick={() => onOpen(item)} title={title}><small>{project.code}-{item.number}</small><span>{item.title}</span></ReplicaButton>
                <ReplicaButton className="roadmap-edit icon-btn" aria-label={'调整日期：' + item.title} title="调整计划日期" disabled={busy} onClick={() => onOpen(item)}><Calendar size={14}/></ReplicaButton>
              </div>
              <div className="roadmap-fields">{shownFields.map(c=><ReplicaButton key={c.id} className={'roadmap-field-value field-'+c.id} aria-label={c.label+'：'+item.title} onClick={()=>onOpen(item)} title={c.label+'：'+fieldValue(item,c.id)}>{c.id==='owner'&&<i>{(item.owner||'?').slice(0,1)}</i>}{c.id==='status'&&<StatusIcon value={item.status}/>}<span>{fieldValue(item,c.id)||'—'}</span></ReplicaButton>)}</div>
              <div className="roadmap-track" onClick={e=>{if(!e.target.closest("button"))onOpen(item);}}>{grid}{nowLine}{bar ? <RoadmapBar item={item} items={items} project={project} window={window} progress={progress} color={colorBy==='status'?({done:'#36B37E',active:'#4BADE8',review:'#6554C0',blocked:'#FF5630',cancelled:'#8993a4'}[categoryOf(project,item.status,item.kind)]||'#8993a4'):workTypeColor(item.kind,type)} compact={!barLabels} summary={hasChildren} overdue={overdue} title={title} status={names[item.status]} busy={busy} onOpen={onOpen} onSchedule={onSchedule}/> : <div className="roadmap-outside">{range ? <><span>当前时间段外 · {range.startDate} — {range.endDate}</span><ReplicaButton className="text-btn" onClick={() => setAnchor(range.startDate)}>定位</ReplicaButton></> : <ReplicaButton className="roadmap-unscheduled" disabled={busy} onClick={() => onOpen(item)}>待排期 · 设置日期</ReplicaButton>}</div>}</div>
            </div>;
          })}
          {showReleases && visibleReleases.length > 0 && <><div className="roadmap-section-heading"><Flag size={14}/>版本里程碑<span>计划 / 实际发布日期</span><ReplicaButton className="text-btn" onClick={()=>onReleases()}>管理版本</ReplicaButton></div>{visibleReleases.map(r => {
            const date = r.status==='released' ? r.releasedDate || r.publishedAt?.slice(0,10) || r.plannedDate : r.plannedDate;
            const point = roadmapPoint(date, window), state = releaseState(r,today);
            return <div className="roadmap-row roadmap-release-row" key={r.id}><div className="roadmap-label"><Flag size={14}/><ReplicaButton className="roadmap-item-name" onClick={()=>onReleases(r.id)}><span>{r.name}</span><small>{state} · {date || '日期待设置'}</small></ReplicaButton></div><div className="roadmap-fields">{shownFields.map(c=><span key={c.id} className="roadmap-release-field">{c.id==='endDate'?date:c.id==='status'?state:'—'}</span>)}</div><div className="roadmap-track">{grid}{nowLine}{point !== null ? <ReplicaButton className={'roadmap-milestone' + (r.status === 'released' ? ' released' : state==='已逾期'?' overdue':'')} style={{ left: `${point}%` }} onClick={()=>onReleases(r.id)} title={`${r.name} · ${state} ${date}`} aria-label={`${r.name}，${state} ${date}`}><i/><span>{r.name}</span></ReplicaButton> : <div className="roadmap-outside">{dayNumber(date) !== null ? <><span>{state} {date}</span><ReplicaButton className="text-btn" onClick={() => setAnchor(date)}>定位</ReplicaButton></> : <ReplicaButton className="text-btn" onClick={()=>onReleases(r.id)}>设置发布日期</ReplicaButton>}</div>}</div></div>;
          })}</>}

        </div>
      </div>
      <div className="roadmap-interaction-help" id="roadmap-drag-help">拖动时间条调整周期 · 拖动两端调整起止日期 · 点击时间条查看详情 · 移动时子项跟随，收缩时越界子项同步收拢 · Esc 取消拖动</div>
      <div className="roadmap-footer"><span><i className="roadmap-legend-progress"/>条内深色区域表示已完成比例</span><span><i className="roadmap-legend-overdue"/>逾期未完成</span><span><i className="roadmap-legend-summary"/>斜纹表示父级计划</span><span><i className="roadmap-legend-release"/>版本里程碑</span><small>{visible} 项位于当前时间段 · {undated} 项待排期</small></div>
      <div ref={dock} className="roadmap-scroll-dock" style={{ left: dockBounds.left, width: dockBounds.width, visibility: dockBounds.visible ? 'visible' : 'hidden' }} onScroll={e => syncScroll(e.currentTarget)} tabIndex={0} role="region" aria-label="横向滚动时间轴"><div style={{ width: `calc(var(--roadmap-label-width) + var(--roadmap-fields-width) + ${axisWidth}px)` }}/></div>
    </AntCard>
  </>;
}

function MultiFilter({label,value,onChange,options,searchable=false}) {
  const [search,setSearch]=useState(''),searchRef=useRef(null);
  const shown=options.filter(o=>o.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const ref=useRef(null),all=value==='all',selected=all?options.map(o=>o.value):value;
  const toggle=(option,checked)=>{const next=checked?[...selected,option]:selected.filter(x=>x!==option);onChange(next.length===options.length?'all':next);};
  return <AntDisclosure className="roadmap-multi-filter" ref={ref} onToggle={e=>{if(e.currentTarget.open)searchRef.current?.focus();else setSearch('');}}><summary aria-label={'路线图'+label+'筛选'}>{all?'所有'+label:label+' ('+selected.length+')'}<ChevronDown size={13}/></summary><div className="roadmap-multi-options" role="group" aria-label={label+'多选'}>{searchable&&<div className="roadmap-filter-search"><Search size={14}/><ReplicaInput ref={searchRef} type="search" aria-label="搜索负责人" placeholder="搜索负责人…" value={search} onChange={e=>setSearch(e.target.value)}/></div>}<label><ReplicaInput type="checkbox" checked={all} onChange={e=>onChange(e.target.checked?'all':[])}/>全选{label}</label>{shown.map(option=><label key={option.value}><ReplicaInput type="checkbox" checked={selected.includes(option.value)} onChange={e=>toggle(option.value,e.target.checked)}/>{option.label}</label>)}{!shown.length&&<p className="roadmap-filter-empty" role="status">没有匹配的{label}</p>}</div></AntDisclosure>;
}

function PlanMenu({label,icon:Icon,active,children}) {
 const ref=useRef(null);
 return <AntDisclosure ref={ref} className={'roadmap-plan-menu'+(active?' is-active':'')}><summary>{Icon&&<Icon size={14}/>}<span>{label}</span><ChevronDown size={12}/></summary><div className="roadmap-plan-popover">{children}</div></AntDisclosure>;
}

import { typeFor, isSubtask, isWorkItem, hasStatus } from '../shared/work-config.mjs';
const DAY = 86400000;
export function dayNumber(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const date = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(date) && new Date(date).toISOString().slice(0, 10) === value ? date / DAY : null;
}
const iso = value => new Date(value * DAY).toISOString().slice(0, 10);
export const localDay = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function roadmapWindow(anchor, scale = 'quarter') {
  const stamp = dayNumber(anchor);
  if (stamp === null) throw Error('无效的时间轴日期');
  const date = new Date(stamp * DAY), year = date.getUTCFullYear(), month = date.getUTCMonth();
  if (scale === 'day') {
    const start = stamp, end = start + 13, days = 14, segments = [], ticks = [];
    for (let n = start; n <= end; n++) {
      const d = new Date(n * DAY);
      if (n === start || d.getUTCDate() === 1) {
        const nextMonth = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / DAY;
        segments.push({ label: `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月`, left: (n - start) / days * 100, width: (Math.min(nextMonth, end + 1) - n) / days * 100 });
      }
      ticks.push({ date: iso(n), left: (n - start) / days * 100, label: `${d.getUTCDate()} ${['日','一','二','三','四','五','六'][d.getUTCDay()]}`, weekend: [0,6].includes(d.getUTCDay()) });
    }
    return { start, end, days, startDate: iso(start), endDate: iso(end), segments, ticks, label: `${iso(start)} — ${iso(end)}` };
  }
  const first = scale === 'year' ? 0 : scale === 'quarter' ? Math.floor(month / 3) * 3 : month;
  const length = scale === 'year' ? 12 : scale === 'quarter' ? 3 : 1;
  const start = Date.UTC(year, first, 1) / DAY, end = Date.UTC(year, first + length, 1) / DAY - 1;
  const days = end - start + 1, segments = [], ticks = [];
  const step = scale === 'year' ? 3 : 1;
  for (let m = first; m < first + length; m += step) {
    const a = Date.UTC(year, m, 1) / DAY, b = Date.UTC(year, m + step, 1) / DAY;
    segments.push({ label: scale === 'year' ? `${year} Q${Math.floor(m / 3) + 1}` : `${year}年${m + 1}月`, left: (a - start) / days * 100, width: (b - a) / days * 100 });
  }
  for (let n = start; n <= end; n++) {
    const d = new Date(n * DAY);
    if (scale === 'month' || (scale === 'quarter' && (n === start || d.getUTCDay() === 1)) || (scale === 'year' && d.getUTCDate() === 1)) ticks.push({ date: iso(n), left: (n - start) / days * 100, label: scale === 'month' ? String(d.getUTCDate()) : scale === 'year' ? `${d.getUTCMonth() + 1}月` : String(d.getUTCDate()), weekend: [0, 6].includes(d.getUTCDay()) });
  }
  return { start, end, days, startDate: iso(start), endDate: iso(end), segments, ticks, label: scale === 'year' ? `${year}年` : scale === 'quarter' ? `${year}年 · 第${Math.floor(first / 3) + 1}季度` : `${year}年${month + 1}月` };
}
// The zoom changes spacing; it never hides the rest of the project's schedule.
export function roadmapTimeline(anchor, scale, project, items = [], releases = []) {
  const focus = roadmapWindow(anchor, scale);
  const dates = [project.startDate, project.endDate, ...items.flatMap(i => [i.startDate, i.endDate || i.dueDate]), ...releases.map(r => r.plannedDate)].map(dayNumber).filter(n => n !== null);
  const first = Math.min(focus.start, ...dates), last = Math.max(focus.end, ...dates);
  const start = scale === 'day' ? first : roadmapWindow(iso(first), scale).start;
  const end = scale === 'day' ? last : roadmapWindow(iso(last), scale).end;
  const days = end - start + 1, segments = [], ticks = [];
  for (let n = start; n <= end; n++) {
    const d = new Date(n * DAY), month = d.getUTCMonth(), year = d.getUTCFullYear();
    if (n === start || (d.getUTCDate() === 1 && (scale !== 'year' || month % 3 === 0))) {
      const next = Date.UTC(year, scale === 'year' ? Math.floor(month / 3) * 3 + 3 : month + 1, 1) / DAY;
      segments.push({ label: scale === 'year' ? `${year} Q${Math.floor(month / 3) + 1}` : `${year}年${month + 1}月`, left: (n - start) / days * 100, width: (Math.min(next, end + 1) - n) / days * 100 });
    }
    if (scale === 'day' || scale === 'month' || (scale === 'quarter' && (n === start || d.getUTCDay() === 1)) || (scale === 'year' && d.getUTCDate() === 1)) {
      ticks.push({ date: iso(n), left: (n - start) / days * 100, label: scale === 'day' ? `${d.getUTCDate()} ${['日','一','二','三','四','五','六'][d.getUTCDay()]}` : scale === 'year' ? `${month + 1}月` : String(d.getUTCDate()), weekend: [0,6].includes(d.getUTCDay()) });
    }
  }
  return { ...focus, start, end, days, startDate: iso(start), endDate: iso(end), segments, ticks };
}
export function shiftRoadmap(anchor, scale, direction) {
  if (scale === 'day') return iso(dayNumber(anchor) + direction * 14);
  const date = new Date(dayNumber(anchor) * DAY);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + direction * (scale === 'year' ? 12 : scale === 'quarter' ? 3 : 1), 1)).toISOString().slice(0, 10);
}
export function itemRange(item) {
  const start = dayNumber(item.startDate), end = dayNumber(item.endDate || item.dueDate);
  return start !== null && end !== null && start <= end ? { start, end, startDate: iso(start), endDate: iso(end) } : null;
}
// Roadmap gestures can fit children into the changed parent range atomically.
export function dragRoadmapDates(item, items, project, mode, delta, fitChildren = false) {
  const range = itemRange(item);
  if (!range || !['move', 'start', 'end'].includes(mode) || !Number.isFinite(delta)) return null;
  const parent = item.parentId ? items.find(i => i.id === item.parentId) : null;
  const lower = Math.max(...[project.startDate, parent?.startDate].map(dayNumber).filter(n => n !== null), -Infinity);
  const upper = Math.min(...[project.endDate, parent?.endDate].map(dayNumber).filter(n => n !== null), Infinity);
  const children = fitChildren ? [] : items.filter(i => i.parentId === item.id);
  const firstChild = Math.min(...children.map(i => dayNumber(i.startDate)).filter(n => n !== null), Infinity);
  const lastChild = Math.max(...children.map(i => dayNumber(i.endDate || i.dueDate)).filter(n => n !== null), -Infinity);
  let min, max;
  if (mode === 'move') { min = Math.max(lower - range.start, lastChild - range.end); max = Math.min(upper - range.end, firstChild - range.start); }
  else if (mode === 'start') { min = lower - range.start; max = Math.min(range.end, firstChild) - range.start; }
  else { min = Math.max(range.start, lastChild) - range.end; max = upper - range.end; }
  if (min > max) return null;
  const days = Math.max(min, Math.min(max, Math.round(delta)));
  return { startDate: iso(range.start + (mode === 'end' ? 0 : days)), endDate: iso(range.end + (mode === 'start' ? 0 : days)), limited: days !== Math.round(delta) };
}
export function roadmapBar(item, window) {
  const range = itemRange(item);
  if (!range || range.end < window.start || range.start > window.end) return null;
  const start = Math.max(range.start, window.start), end = Math.min(range.end, window.end);
  return { left: (start - window.start) / window.days * 100, width: (end - start + 1) / window.days * 100, clippedStart: range.start < window.start, clippedEnd: range.end > window.end };
}
export function roadmapPoint(value, window) {
  const day = dayNumber(value);
  return day === null || day < window.start || day > window.end ? null : (day - window.start + .5) / window.days * 100;
}
export function roadmapRows(items, project, { query = '', status = 'all', owner = 'all', version = 'all', subtask = false, collapsed = new Set() } = {}) {
  const byId = new Map(items.map(i => [i.id, i])), children = new Map();
  for (const i of items) { const parent = byId.has(i.parentId) ? i.parentId : null; if (!children.has(parent)) children.set(parent, []); children.get(parent).push(i); }
  const matches = new Set(items.filter(i => (subtask || !isSubtask(i, project)) && (version === 'all' || version.includes(i.releaseId || '')) && (status === 'all' || (Array.isArray(status)?status.includes(i.status):i.status===status)) && (owner === 'all' || (Array.isArray(owner)?owner.includes(i.owner||''):i.owner===owner)) && (!query.trim() || `${i.title} ${project.code}-${i.number} ${typeFor(project, i.kind)?.name || ''}`.toLowerCase().includes(query.trim().toLowerCase()))).map(i => i.id));
  const included = new Set(matches);
  for (const id of matches) { let parent = byId.get(id)?.parentId; const visited = new Set([id]); while (parent && byId.has(parent) && !visited.has(parent)) { visited.add(parent); included.add(parent); parent = byId.get(parent).parentId; } }
  const filtered = !!query.trim() || status !== 'all' || owner !== 'all' || version !== 'all', rows = [];
  function walk(parent, depth, path = new Set()) {
    for (const item of children.get(parent) || []) {
      if (!included.has(item.id) || path.has(item.id)) continue;
      const hasChildren = (children.get(item.id) || []).some(x => included.has(x.id));
      rows.push({ item, depth, hasChildren, contextOnly: !matches.has(item.id), collapsed: !filtered && collapsed.has(item.id) });
      if (filtered || !collapsed.has(item.id)) walk(item.id, depth + 1, new Set([...path, item.id]));
    }
  }
  walk(null, 0); return rows;
}
export function roadmapProgress(item, items, project) {
  const all = [], seen = new Set([item.id]); let parents = [item.id];
  while (parents.length) { const next = items.filter(i => parents.includes(i.parentId) && !seen.has(i.id)); for (const i of next) { seen.add(i.id); all.push(i); } parents = next.map(i => i.id); }
  const work = isWorkItem(item, project) ? [item] : all.filter(i => isWorkItem(i, project));
  const done = work.filter(i => hasStatus(i, project, 'done')).length;
  return { done, total: work.length, percent: work.length ? Math.round(done / work.length * 100) : 0 };
}

// A plan view has an explicit visible date range; zooming never mutates schedules.
export function roadmapPlanWindow(anchor, mode, project, items = [], releases = [], custom = {}) {
  let start, end;
  if (mode === 'custom' && dayNumber(custom.startDate) !== null && dayNumber(custom.endDate) !== null && dayNumber(custom.endDate) >= dayNumber(custom.startDate)) {
    start = dayNumber(custom.startDate); end = dayNumber(custom.endDate);
  } else if (mode === 'fit') {
    const dates = items.flatMap(i => {const range=itemRange(i);return range?[range.start,range.end]:[];});
    if (!dates.length) dates.push(dayNumber(anchor) ?? dayNumber(localDay()));
    start = Math.min(...dates) - 7; end = Math.max(...dates) + 7;
  } else {
    start = dayNumber(anchor); const d = new Date(start * DAY);
    end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + (mode === 'year' ? 12 : 3), d.getUTCDate()) / DAY - 1;
  }
  // Keep very long project plans practical while retaining all dates in fit mode.
  const days = end - start + 1, segments = [], ticks = [], monthly = days > 180;
  for (let n = start; n <= end; n++) {
    const d = new Date(n * DAY), month = d.getUTCMonth(), year = d.getUTCFullYear();
    if (n === start || d.getUTCDate() === 1) {
      const next = Date.UTC(year, month + 1, 1) / DAY;
      segments.push({label:`${year}年${month + 1}月`,left:(n-start)/days*100,width:(Math.min(next,end+1)-n)/days*100});
    }
    if (n === start || (monthly ? d.getUTCDate() === 1 : d.getUTCDay() === 1)) ticks.push({date:iso(n),left:(n-start)/days*100,label:`${month+1}/${d.getUTCDate()}`,weekend:[0,6].includes(d.getUTCDay())});
  }
  return {start,end,days,startDate:iso(start),endDate:iso(end),segments,ticks,label:`${iso(start)} — ${iso(end)}`};
}
export function roadmapPlanRows(items, project, options, top, bottom) {
  const byId = new Map(items.map(i=>[i.id,i]));
  const inRange = i => {const level=typeFor(project,i.kind)?.level ?? 0; return level<=top&&level>=bottom;};
  const collapsed = new Set([...options.collapsed||[]].filter(id=>byId.has(id)&&inRange(byId.get(id))));
  return roadmapRows(items,project,{...options,subtask:bottom<=-1,collapsed}).filter(r=>inRange(r.item)).map(r=>{
    let depth=0,parent=byId.get(r.item.parentId),seen=new Set([r.item.id]);
    while(parent&&!seen.has(parent.id)){seen.add(parent.id);if(inRange(parent))depth++;parent=byId.get(parent.parentId);}
    return {...r,depth,hasChildren:r.hasChildren&&(typeFor(project,r.item.kind)?.level??0)>bottom};
  });
}

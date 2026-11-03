const DAY = 86400000;
const stamp = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? Date.parse(value + 'T00:00:00Z') / DAY : NaN;
const iso = value => new Date(value * DAY).toISOString().slice(0,10);

// A move carries the subtree by the same delta. A resize only clips dates that
// would fall outside the new parent range. Unchanged records are not returned.
export function fitChildSchedules(items, original, updated, mode) {
  const patches = [], seen = new Set([original.id]);
  const shift = mode === 'move' ? stamp(updated.startDate) - stamp(original.startDate) : 0;
  const children = new Map();
  for (const item of items) {
    if (!children.has(item.parentId)) children.set(item.parentId, []);
    children.get(item.parentId).push(item);
  }
  const queue = [updated];
  for (let n = 0; n < queue.length; n++) {
    const parent = queue[n], lower = stamp(parent.startDate), upper = stamp(parent.endDate);
    if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower > upper) continue;
    for (const child of children.get(parent.id) || []) {
      if (seen.has(child.id) || child.projectId !== original.projectId) continue;
      seen.add(child.id);
      const start = stamp(child.startDate), end = stamp(child.endDate || child.dueDate);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      const startDate = iso(Math.max(lower, Math.min(upper, start + shift)));
      const endDate = iso(Math.max(lower, Math.min(upper, end + shift)));
      const next = { ...child, startDate, endDate };
      if (startDate !== child.startDate || endDate !== (child.endDate || child.dueDate)) patches.push({ id: child.id, startDate, endDate });
      queue.push(next);
    }
  }
  return patches;
}

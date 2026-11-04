import { upgradeWorkflowConfig, validateWorkflows, workflowStage, workflowNode, workflowAllows } from "./workflows.mjs";
export { progressCategories, collaborationNodes, workflowFor, workflowStatuses, workflowMigrationGroups, aiReady, progressCategory, boardStatuses } from "./workflows.mjs";
export const statusCategories = {
  backlog: "待规划", todo: "待开始", active: "执行中", blocked: "阻塞",
  review: "待验收", done: "已完成", cancelled: "已取消",
};
export const typePalette = [
  ["#E87942", "橙色"], ["#8163C5", "紫色"], ["#5279C7", "蓝色"],
  ["#379282", "青色"], ["#579451", "绿色"], ["#B48730", "金色"],
  ["#CD5966", "红色"], ["#A76398", "粉紫"], ["#67758A", "灰蓝"],
];
export function aiExecutionEnabled(item,items=[]) {
  if(!item||item.aiDisabled)return false;
  if(item.aiEnabled)return true;
  const parent=items.find(i=>i.id===item.parentId);
  return !!(parent?.aiEnabled&&!parent.aiDisabled);
}
export const typeIcons = {
  target: "目标", layers: "层叠", box: "方块", book: "故事", checklist: "任务",
  bug: "缺陷", branch: "分支", flag: "旗帜", sparkles: "灵感", code: "代码",
  palette: "设计", search: "调研", file: "文档", rocket: "发布", circle: "圆形", diamond: "菱形",
};
export const typeIcon = (type) => type?.icon || ({ theme: "target", epic: "layers", feature: "box", story: "book", task: "checklist", bug: "bug", subtask: "branch" }[type?.id]) || "box";
export function typeColor(type) {
  return type?.color || ({ theme: "#8163C5", epic: "#5279C7", feature: "#579451", story: "#B48730", task: "#379282", bug: "#CD5966", subtask: "#67758A" }[type?.id]) || "#E87942";
}
export const builtinTypes = [
  { id: "theme", name: "战略主题", level: 1, enabled: true, hidden: true },
  { id: "epic", name: "史诗", level: 1, enabled: true },
  { id: "feature", name: "特性", level: 1, enabled: true, hidden: true },
  { id: "story", name: "故事", level: 0, enabled: true },
  { id: "task", name: "任务", level: 0, enabled: true },
  { id: "bug", name: "缺陷", level: 0, enabled: true },
  { id: "subtask", name: "子任务", level: -1, enabled: true },
];
export const defaultHierarchyLevels = () => [
  { id: "epic", name: "Epic", rank: 1, kind: "epic" },
  { id: "standard", name: "标准工作项", rank: 0, kind: "standard" },
  { id: "subtask", name: "子任务", rank: -1, kind: "subtask" },
];
export function legacyHierarchyConfig(input) {
  const config = structuredClone(input);
  const epicRank = config.types.find((t) => t.id === "epic")?.level || 1;
  config.levels = [...new Set([epicRank, 0, -1, ...config.types.map((t) => t.level)])].sort((a, b) => b - a).map((rank) => ({
    id: rank === 0 ? "standard" : rank === -1 ? "subtask" : rank === epicRank ? "epic" : "legacy_" + rank,
    name: rank === 0 ? "标准工作项" : rank === -1 ? "子任务" : rank === epicRank ? "Epic" : "历史扩展层 " + rank,
    rank, kind: rank === 0 ? "standard" : rank === -1 ? "subtask" : rank === epicRank ? "epic" : "custom",
    ...(rank > 0 && rank !== epicRank ? { legacy: true } : {}),
  }));
  for (const type of config.types) delete type.parents;
  config.hierarchyVersion = 2;
  return config;
}
export function defaultWorkConfig(legacyExtended = false) {
  const types = structuredClone(builtinTypes).map((t) => ({ ...t, color: typeColor(t) }));
  const statuses = Object.entries(statusCategories).map(([id, name]) => ({ id, name, category: id, enabled: true }));
  const config = { hierarchyVersion: 2, levels: defaultHierarchyLevels(), types, statuses, initialStatus: "backlog", transitions: Object.fromEntries(statuses.map((s) => [s.id, statuses.filter((t) => t.id !== s.id).map((t) => t.id)])) };
  // Only the imported demo/legacy fixture retains its original five-level structure.
  if (legacyExtended) {
    for (const t of config.types) { t.hidden = false; if (t.id === "theme") t.level = 3; if (t.id === "epic") t.level = 2; if (t.id === "feature") t.level = 1; }
    return upgradeWorkflowConfig(legacyHierarchyConfig(config), true);
  }
  return upgradeWorkflowConfig(config);
}
export const hierarchyLevels = (config) => config.levels.slice().sort((a, b) => b.rank - a.rank);
export const levelFor = (config, rank) => config.levels.find((l) => l.rank === rank);
export const levelFamily = (rank) => rank === -1 ? "subtask" : rank === 0 ? "standard" : "planning";
export const levelName = (project, rank) => levelFor(configFor(project), rank)?.name || "未配置层级";
export const configFor = (project) => project?.workConfig || defaultWorkConfig();
export const typeFor = (project, kind) => configFor(project).types.find((t) => t.id === kind);
export const isWorkItem = (item, project) => typeFor(project, item?.kind)?.level === 0;
export const isExecutionItem = (item, project) => isWorkItem(item, project) || isSubtask(item, project);
export const runTargetId = (run) => run.itemId || run.storyId;
export const isSubtask = (item, project) => typeFor(project, item?.kind)?.level === -1;
export const typeNames = (project) => Object.fromEntries(configFor(project).types.map((t) => [t.id, t.name]));
export const statusNamesFor = (project) => Object.fromEntries(configFor(project).statuses.map((s) => [s.id, s.name]));
export const categoryOf = (project, status, kind) => workflowStage(project, status, kind);
export const hasStatus = (item, project, category) => categoryOf(project, item.status, item.kind) === category;
export const terminal = (item, project) => ["done", "cancelled"].includes(categoryOf(project, item.status, item.kind));
export const statusFor = (project, category, kind) => workflowNode(project, category, kind);
export const allowedTransition = (project, from, to, kind) => workflowAllows(project, from, to, kind);
export function canParent(project, kind, parent) {
  const type = typeFor(project, kind), p = typeFor(project, parent?.kind);
  return !!type && !!p && p.enabled && p.level > type.level && (type.level !== -1 || p.level === 0);
}
export function parentCandidates(project, items, kind, currentId = null) {
  const excluded = new Set(currentId ? [currentId] : []);
  let count = -1;
  while (count !== excluded.size) {
    count = excluded.size;
    for (const item of items) if (excluded.has(item.parentId)) excluded.add(item.id);
  }
  return items.filter((p) => p.projectId === project.id && !excluded.has(p.id) && canParent(project, kind, p));
}
export function childTypes(project, parentKind) {
  return configFor(project).types.filter((t) => t.enabled && !t.hidden && canParent(project, t.id, {kind: parentKind}))
    .sort((a, b) => b.level - a.level);
}
export function hierarchyConflicts(project, items, config) {
  const draft = { ...project, workConfig: config };
  return items.filter((i) => i.projectId === project.id).flatMap((item) => {
    if (!typeFor(draft, item.kind)?.enabled) return [{ item, reason: "类型仍在使用，不能停用" }];
    const originalType = typeFor(project, item.kind), nextType = typeFor(draft, item.kind);
    if (originalType && levelFamily(originalType.level) !== levelFamily(nextType.level)) return [{ item, reason: "已有数据的类型不能跨规划、标准和子任务类别移动，请先转换工作项" }];
    const parent = items.find((p) => p.id === item.parentId);
    if (parent && !canParent(draft, item.kind, parent)) return [{ item, parent, reason: "现有父级不符合新规则" }];
    return [];
  });
}
// Plan configuration only. Never move or remove an existing work item.
export function planTypeHierarchy(config, items, mode = "recommend") {
  const next = structuredClone(config), defaults = defaultWorkConfig();
  const used = new Set(items.map((i) => i.kind));
  // Preserve used type placements, including all legacy/custom grouping levels.
  const epicType = next.types.find((t) => t.id === "epic");
  const epicRank = used.has("epic") ? epicType.level : 1;
  const ranks = new Set([-1, 0, epicRank, ...next.types.filter((t) => used.has(t.id)).map((t) => t.level)]);
  for (const type of next.types) {
    const builtin = defaults.types.find((t) => t.id === type.id);
    if (!used.has(type.id)) type.level = builtin ? (builtin.level > 0 ? epicRank : builtin.level) : (type.level > 0 ? epicRank : type.level);
    ranks.add(type.level);
    type.enabled = true;
    type.hidden = mode === "recommend" ? !used.has(type.id) : !!builtin?.hidden && !used.has(type.id);
    delete type.parents;
  }
  next.levels = [...ranks].sort((a, b) => b - a).map((rank) => {
    const old = config.levels.find((l) => l.rank === rank);
    return { id: rank === epicRank ? "epic" : rank === 0 ? "standard" : rank === -1 ? "subtask" : old?.id === "epic" ? "legacy_" + rank : old?.id || "level_" + rank,
      name: rank === epicRank ? "Epic" : rank === 0 ? "标准工作项" : rank === -1 ? "子任务" : old?.name || "历史扩展层 " + rank,
      rank, kind: rank === epicRank ? "epic" : rank === 0 ? "standard" : rank === -1 ? "subtask" : "custom",
      ...(old?.legacy ? { legacy: true } : {}), };
  });
  if (!next.types.some((t) => t.level === 0 && !t.hidden)) (next.types.find((t) => t.id === "story") || next.types.find((t) => t.level === 0)).hidden = false;
  return next;
}
export function checkWorkConfig(config) {
  const bad = (message) => { const e = Error(message); e.status = 400; throw e; };
  if (!config || !Array.isArray(config.types) || !Array.isArray(config.statuses)) bad("工作项配置格式无效");
  if (config.types.length > 40 || config.statuses.length > 40) bad("类型和状态分别最多支持 40 项");
  for (const [list, label] of [[config.types, "类型"], [config.statuses, "状态"]]) {
    if (!list.length || list.some((x) => !x || typeof x.id !== "string" || (!/^[a-z][a-z0-9_]{0,47}$/.test(x.id) || ["constructor", "prototype"].includes(x.id)) || typeof x.name !== "string" || !x.name.trim() || x.name.length > 40 || typeof x.enabled !== "boolean")) bad(label + "需有有效标识、1 至 40 字的名称和启用状态");
    if (new Set(list.map((x) => x.id)).size !== list.length || new Set(list.map((x) => x.name.trim())).size !== list.length) bad(label + "标识与名称不能重复");
  }
  if (config.hierarchyVersion !== 2 || !Array.isArray(config.levels) || config.levels.length < 3 || config.levels.length > 12) bad("层级配置格式无效，请刷新到最新版本");
  const ids = new Set(), ranks = new Set(), names = new Set();
  for (const level of config.levels) {
    if (!level || typeof level.id !== "string" || !/^[a-z][a-z0-9_]{0,47}$/.test(level.id) || typeof level.name !== "string" || !level.name.trim() || level.name.length > 40 || !Number.isInteger(level.rank) || level.rank < -1 || level.rank > 99 || !["epic", "standard", "subtask", "custom"].includes(level.kind)) bad("层级标识、名称或位置无效");
    if (ids.has(level.id) || ranks.has(level.rank) || names.has(level.name.trim())) bad("层级标识和位置不能重复");
    if (level.kind === "standard" && level.rank !== 0 || level.kind === "subtask" && level.rank !== -1 || ["epic", "custom"].includes(level.kind) && level.rank <= 0) bad("标准和子任务层的位置固定，扩展层须位于标准层之上");
    ids.add(level.id); ranks.add(level.rank); names.add(level.name.trim());
  }
  for (const kind of ["epic", "standard", "subtask"]) if (config.levels.filter((l) => l.kind === kind).length !== 1) bad("必须保留唯一的 Epic、标准工作项和子任务层");
  for (const type of config.types) {
    if (type.hidden !== undefined && typeof type.hidden !== "boolean") bad("类型展示配置无效");
    if (type.icon !== undefined && !Object.hasOwn(typeIcons, type.icon)) bad("类型图标无效，请选择支持的图标");
    if (type.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(type.color)) bad("类型颜色须为有效的六位色值");
    if (!config.levels.some((l) => l.rank === type.level)) bad("工作类型必须属于已配置的层级");
    if (Object.hasOwn(type, "parents")) bad("类型父级规则已改为层级分组，请刷新后重试");
    if (type.id === "subtask" && type.level !== -1) bad("子任务类型必须属于子任务层");
  }
  if (builtinTypes.some((t) => !config.types.some((x) => x.id === t.id))) bad("内置类型可停用，但不能删除");
  if (!config.types.some((t) => t.enabled && !t.hidden && t.level === 0)) bad("至少展示一种启用的执行层工作项类型");
  validateWorkflows(config, bad);
  return config;
}

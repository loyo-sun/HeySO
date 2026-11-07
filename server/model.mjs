import { createItemSchema, updateItemSchema } from './mcp-item-schema.mjs';
import {memoryTypes, memoryVersion, memoryEntry, memoryHistory} from '../shared/memory.mjs';
import {closeSupersededRuns} from '../shared/run-closure.mjs';
import {roadmapSiblings, reorderedSiblingIds, roadmapMovePlan, roadmapTreeSnapshot} from '../shared/roadmap-order.mjs';
import { captureItemActivity, itemActivityChanges, activityDetail } from './item-activity.mjs';
import { fitChildSchedules } from '../shared/schedule.mjs';
import { availableProjectCode, allocateItemNumber, checkIdentifiers, migrateIdentifiers } from "../shared/identifiers.mjs";
import { rolesForMembers, checkMemberRoles, defaultRoles, defaultMemberRole } from "../shared/member-roles.mjs";
import { randomUUID, createHash } from "node:crypto";
import { effectiveSprintId, aiExecutionEnabled, isExecutionItem, runTargetId, defaultWorkConfig, configFor, typeFor, isWorkItem, isSubtask, typeNames, categoryOf, hasStatus, terminal, statusFor, allowedTransition, canParent, checkWorkConfig, workflowFor, workflowStatuses, workflowMigrationGroups, aiReady } from "../shared/work-config.mjs";
export const statuses = [
  "backlog",
  "todo",
  "active",
  "blocked",
  "review",
  "done",
  "cancelled",
];
export const kindLabels = {
  theme: "战略主题",
  epic: "史诗",
  feature: "特性",
  story: "故事",
  task: "任务",
  bug: "缺陷",
  subtask: "子任务",
};
export const now = () => new Date().toISOString();
export const uid = (prefix = "id") => `${prefix}_${randomUUID().slice(0, 8)}`;
export function fail(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  throw e;
}
const required = (s, label) => {
  if (typeof s !== "string" || !s.trim() || s.length > 20000)
    fail(`${label}不能为空，且需少于 20000 字`);
  return s.trim();
};
function validDate(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    fail(`${label}必须是有效日期`);
  const date = new Date(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    fail(`${label}必须是有效日期`);
}
function dateRange(start, end, label, mandatory = false) {
  if (!mandatory && !start && !end) return;
  if (!start || !end) fail(`${label}需要同时填写开始日期和结束日期`);
  validDate(start, `${label}开始日期`);
  validDate(end, `${label}结束日期`);
  if (start > end) fail(`${label}结束日期不能早于开始日期`);
}
function checkReleasePlan(s, release) {
  release.name = required(release.name, "版本名称");
  if (s.releases.some(r => r.id !== release.id && r.projectId === release.projectId && r.name.trim().normalize("NFKC").toLowerCase() === release.name.normalize("NFKC").toLowerCase())) fail("当前项目已存在同名版本");
  if (release.startDate) validDate(release.startDate, "版本开始日期");
  if (release.plannedDate) validDate(release.plannedDate, "计划发布日期");
  if (release.startDate && release.plannedDate && release.startDate > release.plannedDate) fail("计划发布日期不能早于开始日期");
  if (typeof release.goal !== "string") fail("版本描述必须是文本");
}
function itemDates(item, project, mandatory = false) {
  if (item.startDate) validDate(item.startDate, `「${item.title}」开始日期`);
  if (item.endDate) validDate(item.endDate, `「${item.title}」结束日期`);
  if (item.startDate && item.endDate && item.startDate > item.endDate) fail(`「${item.title}」结束日期不能早于开始日期`);
  if (
    (item.startDate || item.endDate) &&
    (!project.startDate || !project.endDate)
  )
    fail("请先在项目设置中填写项目开始日期和结束日期");
  const end = item.endDate || item.dueDate;
  if (item.dueDate) validDate(item.dueDate, `「${item.title}」原计划完成日期`);
  if (
    project.startDate &&
    project.endDate &&
    [item.startDate, end]
      .filter(Boolean)
      .some((date) => date < project.startDate || date > project.endDate)
  )
    fail(
      `「${item.title}」日期超出项目周期（${project.startDate} 至 ${project.endDate}），请先调整需求日期或扩大项目周期`,
    );
}
export function emptyProject(name = "新项目", description = "") {
  return {
    id: uid("project"),
    name: required(name, "项目名称"),
    description,
    code: "HS",
    nextItemNumber: 1,
    owner: "我",
    members: ["我"],
    roles: defaultRoles(),
    memberRoles: { "我": defaultMemberRole },
    goal: "",
    startDate: "",
    endDate: "",
    definitionOfDone: "验收标准全部满足；成果可检查；由故事负责人确认。",
    workingAgreements: "",
    workConfig: defaultWorkConfig(false),
    createdAt: now(),
  };
}
export function seed() {
  const date = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const p = {
    ...emptyProject(
      "HeySO 产品研发",
      "让人与 AI 围绕共同目标，持续交付可验收的成果。",
    ),
    id: "p_heyso",
    workConfig: defaultWorkConfig(true),
    owner: "我",
    members: ["我", "林溪", "陈默"],
    memberRoles: rolesForMembers(["我", "林溪", "陈默"]),
    goal: "完成 alpha_0.1 的敏捷管理与 AI 协作闭环。",
    startDate: date(-14),
    endDate: date(60),
  };
  const s = {
    schemaVersion: 4,
    revision: 0,
    projects: [p],
    items: [],
    releases: [],
    sprints: [],
    notes: [],
    runs: [],
    events: [],
  };
  const item = (id, kind, title, parentId, extra = {}) => ({
    id,
    projectId: p.id,
    kind,
    title,
    parentId: parentId || null,
    startDate: p.startDate,
    endDate: extra.endDate || extra.dueDate || p.endDate,
    status: "backlog",
    owner: "我",
    priority: "medium",
    description: "",
    acceptance: "",
    points: 0,
    releaseId: null,
    sprintId: null,
    aiEnabled: false,
    contentVersion: 1,
    createdAt: now(),
    updatedAt: now(),
    ...extra,
  });
  s.items = [
    item("th1", "theme", "让人与 AI 高效协作", null, {
      description: "建立以共同成果为中心的工作方式。",
      goal: "任务交接无需重复解释背景，成果由人确认。",
    }),
    item("ep1", "epic", "建立可信赖的 AI 交付闭环", "th1", {
      description: "让上下文、执行和审核在同一个项目里持续积累。",
    }),
    item("ep2", "epic", "让敏捷规划真正连接交付", "th1"),
    item("f1", "feature", "故事上下文与项目记忆", "ep1"),
    item("f2", "feature", "AI 执行与人工验收", "ep1"),
    item("f3", "feature", "Sprint 全周期管理", "ep2"),
    item("f4", "feature", "版本规划与发布", "ep2"),
  ];
  const defs = [
    ["s1", "定义完整的故事上下文", "f1", "done", 3, "high", "我"],
    ["s2", "通过 MCP 获取故事上下文", "f1", "done", 5, "high", "林溪"],
    ["s3", "提交 AI 交付成果并进入验收", "f2", "review", 5, "high", "我"],
    ["s4", "记录审核意见并支持返工", "f2", "active", 3, "high", "陈默"],
    ["s5", "在看板中推进 Sprint 故事", "f3", "active", 5, "medium", "林溪"],
    ["s6", "保留冲刺启动时的范围基线", "f3", "todo", 3, "medium", "我"],
    ["s7", "查看版本范围与交付进展", "f4", "todo", 3, "medium", "陈默"],
    ["s8", "新对话继续上一次的工作", "f1", "blocked", 5, "high", "我"],
    ["s9", "完成冲刺评审与回顾", "f3", "backlog", 5, "medium", "我"],
    ["s10", "生成版本发布说明", "f4", "backlog", 3, "low", "陈默"],
    ["s11", "支持项目备份与恢复", "f1", "backlog", 3, "medium", "林溪"],
    ["s12", "按故事授权 AI 更新", "f2", "backlog", 2, "high", "我"],
  ];
  s.items.push(
    ...defs.map(([id, title, parentId, status, points, priority, owner], i) =>
      item(id, "story", title, parentId, {
        number: i + 1,
        status,
        points,
        priority,
        owner,
        description: `作为项目负责人，我希望${title}，从而让人与 AI 的协作有明确依据并可追溯。`,
        acceptance:
          "核心流程可以实际完成。\n失败时给出清晰反馈，不丢失已有记录。\n成果经过负责人确认。",
        releaseId: i < 10 ? "r1" : "r2",
        sprintId: i < 8 ? "sp1" : i < 10 ? "sp2" : null,
        dueDate: date(i === 7 ? -1 : 4),
        aiEnabled: ["s3", "s4", "s8"].includes(id),
      }),
    ),
  );
  s.items.push(
    item("t1", "subtask", "实现成果提交接口", "s3", { status: "done" }),
    item("t2", "subtask", "验证重复提交不会产生重复记录", "s3", {
      status: "done",
    }),
    item("t3", "subtask", "完成审核意见表单", "s4", { status: "active" }),
  );
  for (const child of s.items.filter((i) => i.kind === "subtask")) { const parent = s.items.find((i) => i.id === child.parentId); child.startDate = parent.startDate; child.endDate = parent.endDate; }
  s.releases = [
    {
      id: "r1",
      projectId: p.id,
      name: "alpha_0.1",
      goal: "跑通敏捷规划与人、AI 交付的完整闭环。",
      status: "active",
      plannedDate: date(12),
      createdAt: now(),
    },
    {
      id: "r2",
      projectId: p.id,
      name: "alpha_0.2",
      goal: "完善协作体验与上下文管理。",
      status: "planning",
      plannedDate: date(35),
      createdAt: now(),
    },
  ];
  const baseline = s.items
    .filter((x) => x.sprintId === "sp1")
    .map((x) => ({
      id: x.id,
      title: x.title,
      points: x.points,
      status: x.status,
    }));
  s.sprints = [
    {
      id: "sp1",
      projectId: p.id,
      name: "Sprint 01",
      goal: "让第一个故事从 AI 执行走到人工验收。",
      startDate: date(-3),
      endDate: date(7),
      capacity: 32,
      status: "active",
      baseline,
      scopeChanges: [],
      snapshots: [],
      createdAt: now(),
      startedAt: now(),
      review: "",
      retro: { wentWell: "", improve: "", actions: "" },
    },
    {
      id: "sp2",
      projectId: p.id,
      name: "Sprint 02",
      goal: "补齐冲刺复盘、版本发布和数据备份。",
      startDate: date(8),
      endDate: date(21),
      capacity: 30,
      status: "planned",
      baseline: [],
      scopeChanges: [],
      snapshots: [],
      createdAt: now(),
      review: "",
      retro: { wentWell: "", improve: "", actions: "" },
    },
  ];
  s.notes = [
    {
      id: "n1",
      projectId: p.id,
      type: "decision",
      title: "人负责验收，AI 负责执行与交付",
      body: "AI 提交成果后进入待验收。只有人可以确认故事完成；任务完成不自动等于故事完成。",
      createdAt: now(),
      author: "我",
      confirmed: true,
    },
    {
      id: "n2",
      projectId: p.id,
      type: "context",
      title: "项目工作约定",
      body: "先读取最新上下文，再开始执行。遇到不明确的验收标准时报告阻塞。保留每次交付和审核意见。",
      createdAt: now(),
      author: "我",
      confirmed: true,
    },
  ];
  s.runs = [
    {
      id: "run_demo",
      projectId: p.id,
      storyId: "s3",
      storyVersion: 1,
      agent: "示例 Agent",
      status: "review",
      summary: "已实现成果提交与待验收状态流转。",
      artifacts: [{ title: "示例交付说明（待连接真实成果）", url: "" }],
      verification:
        "示例记录：接口返回符合交付结构；重复提交使用 requestId 去重。",
      createdAt: now(),
      submittedAt: now(),
      reviews: [],
      requestId: "demo-delivery",
    },
  ];
  addEvent(
    s,
    p.id,
    "project",
    "示例项目已创建",
    "内置示例数据，可新建空白项目开始使用。",
  );
  snapshot(s, "sp1");
  return migrateIdentifiers(s);
}
export function addEvent(
  s,
  projectId,
  type,
  title,
  detail = "",
  itemId = null,
) {
  s.events.unshift({
    id: uid("event"),
    projectId,
    type,
    title,
    detail,
    itemId,
    at: now(),
  });
}
export function getItem(s, id) {
  const i = s.items.find((x) => x.id === id);
  if (!i) fail("条目不存在", 404);
  return i;
}
export function storyOf(s, item) {
  const project = s.projects.find((p) => p.id === item.projectId);
  if (isWorkItem(item, project)) return item;
  if (isSubtask(item, project)) {
    if (!item.parentId) fail("请先为子任务选择所属工作项，再使用交付与 AI 执行");
    const parent = getItem(s, item.parentId);
    if (isWorkItem(parent, project)) return parent;
  }
  return fail("只有执行层工作项及其子任务可以执行");
}
export function storiesIn(s, sprintId) {
  return s.items.filter((x) => isWorkItem(x, s.projects.find((p) => p.id === x.projectId)) && x.sprintId === sprintId);
}
const projectOf = (s, item) => s.projects.find((p) => p.id === item.projectId);
const work = (s, item) => isWorkItem(item, projectOf(s, item));
const cat = (s, item) => categoryOf(projectOf(s, item), item.status, item.kind);
function transition(s, item, nextCategory) {
  const project = projectOf(s, item), next = statusFor(project, nextCategory, item.kind);
  if (!next) fail("当前工作流没有配置所需协作节点：" + nextCategory);
  if (!allowedTransition(project, item.status, next, item.kind)) fail("当前工作流不允许此状态转换，请在项目设置中检查转换规则");
  item.status = next;
}
function completeAcceptedAiSubtasks(s, parent, run, review) {
  if (!run || !work(s, parent)) return;
  const project = projectOf(s, parent);
  const children = s.items.filter(child => child.projectId === parent.projectId && child.parentId === parent.id && isSubtask(child, project) && cat(s, child) !== 'done');
  // Parent acceptance covers its children, including those still in todo/blocked.
  // Resolve each child's own workflow node; never accept its independent AI runs.
  const updates = children.map(child => {
    const done = statusFor(project, 'done', child.kind);
    if (!done || categoryOf(project, done, child.kind) !== 'done') fail(`子任务「${child.title}」的工作流没有配置完成节点，请先补齐后再验收`);
    return {child, done};
  });
  for (const {child, done} of updates) {
    Object.assign(child, {status: done, updatedAt: review.at, completedAt: review.at});
    addEvent(s, child.projectId, 'item', '父级 AI 交付验收通过，同步完成子任务', `父级工作项 ${parent.id} 的执行 ${run.id} 经人工验收通过。`, child.id);
    Object.assign(s.events[0], {triggerItemId: parent.id, triggerRunId: run.id, triggerReviewId: review.id});
  }
}
function parentDates(item, parent) {
  if (!parent) return;
  if ((item.startDate && parent.startDate && item.startDate < parent.startDate) || (item.endDate && parent.endDate && item.endDate > parent.endDate))
    fail("「" + item.title + "」日期超出父级「" + parent.title + "」的周期，请调整日期或父级");
}
export function snapshot(s, id) {
  const sp = s.sprints.find((x) => x.id === id);
  if (!sp || sp.status !== "active") return;
  const items = storiesIn(s, id);
  const row = {
    at: now(),
    date: new Date().toISOString().slice(0, 10),
    total: items.reduce((a, x) => a + (x.points || 0), 0),
    remaining: items
      .filter((x) => !terminal(x, projectOf(s, x)))
      .reduce((a, x) => a + (x.points || 0), 0),
    done: items.filter((x) => cat(s, x) === "done").length,
    unestimated: items.filter((x) => !x.points).length,
  };
  sp.snapshots.push(row);
}
export function context(s, id) {
  const item = getItem(s, id),
    story = storyOf(s, item);
  let x = story;
  const chain = [];
  while (x) {
    chain.unshift(x);
    x = x.parentId ? s.items.find((y) => y.id === x.parentId) : null;
  }
  return {
    project: s.projects.find((p) => p.id === item.projectId),
    hierarchy: chain,
    story,
    tasks: s.items.filter((t) => t.parentId === story.id && isSubtask(t, projectOf(s, t))),
    targetTask: isSubtask(item, projectOf(s, item)) ? item : null,
    release: s.releases.find((r) => r.id === item.releaseId) || null,
    sprint: s.sprints.find((sp) => sp.id === effectiveSprintId(item,s.items,projectOf(s,item))) || null,
    memory: s.notes.filter((n) => n.projectId === item.projectId && !n.deletedAt)
      .map(({history, ...note}) => note),
    executions: s.runs.filter((r) => runTargetId(r) === item.id),
    rules: [
      "只更新已启用 AI 的工作项或获所属任务授权的子任务。",
      "执行记录、交付、状态和验收只归属目标 itemId；子任务不更新父级或其他子任务。",
      "不修改工作项目标、负责人或验收标准。",
      "提交成果后等待目标工作项的人工验收，不自行标记工作项完成。",
      "文件、Git、环境和发布操作由你的执行工具在用户授权范围内完成。",
    ],
  };
}
export function validate(s) {
  if (!s || s.schemaVersion !== 4) fail("不支持的项目备份格式");
  for (const k of [
    "projects",
    "items",
    "releases",
    "sprints",
    "notes",
    "runs",
    "events",
  ])
    if (!Array.isArray(s[k])) fail(`备份缺少 ${k}`);
  const ids = new Set();
  for (const arr of [
    "projects",
    "items",
    "releases",
    "sprints",
    "notes",
    "runs",
  ])
    for (const x of s[arr]) {
      if (!x || typeof x !== "object" || typeof x.id !== "string" || !x.id || ids.has(x.id)) fail("标识缺失或重复");
      ids.add(x.id);
    }
  try { checkIdentifiers(s); } catch (e) { fail(e.message); }
  const projectIds = new Set(s.projects.map((p) => p.id));
  for (const p of s.projects) {
    required(p.name, "项目名称");
    if (p.name.length > 120) fail("项目名称不能超过 120 字");
    checkWorkConfig(p.workConfig);
    dateRange(p.startDate, p.endDate, `项目「${p.name}」`);
    if (!Array.isArray(p.members) || !p.members.length || p.members.some((m) => typeof m !== "string" || !m.trim())) fail("项目成员格式错误");
    try { checkMemberRoles(p); } catch (e) { fail(e.message); }
  }
  for (const arr of ["items", "releases", "sprints", "notes", "runs"])
    for (const x of s[arr])
      if (!projectIds.has(x.projectId)) fail("存在无效的项目关联");
  for (const i of s.items) {
    required(i.title, "条目标题");
    itemDates(
      i,
      s.projects.find((p) => p.id === i.projectId),
    );
    const project = projectOf(s, i);
    if (!typeFor(project, i.kind)?.enabled || !workflowStatuses(project, i.kind).some((st) => st.id === i.status))
      fail("条目类型或状态不属于绑定的工作流");
    if (i.aiDisabled!==undefined && typeof i.aiDisabled!=="boolean") fail("AI 权限设置无效");
    if (i.aiEnabled && !aiReady(workflowFor(project,i.kind))) fail("启用 AI 的工作类型需要配置执行、验收和完成节点");
    if (
      i.points != null &&
      (!Number.isFinite(i.points) || i.points < 0 || i.points > 1000)
    )
      fail("故事点无效");
    if (i.parentId) {
      const p = s.items.find((x) => x.id === i.parentId);
      if (!p || p.projectId !== i.projectId || !canParent(project, i.kind, p))
        fail("父级类型或项目不匹配");
      if (!i.legacyParentDates) parentDates(i, p);
    }
    if (isSubtask(i, project) && i.sprintId) fail("子任务的 Sprint 由父级工作项决定，不能独立分配");
    for (const [key, arr] of [
      ["sprintId", "sprints"],
      ["releaseId", "releases"],
    ])
      if (
        i[key] &&
        !s[arr].some((x) => x.id === i[key] && x.projectId === i.projectId)
      )
        fail("无效的版本或 Sprint 关联");
  }
  for (const sp of s.sprints) {
    if (
      !["planned", "active", "closed"].includes(sp.status) ||
      !Array.isArray(sp.baseline) ||
      !Array.isArray(sp.snapshots) ||
      !Array.isArray(sp.scopeChanges) ||
      !sp.retro
    )
      fail("冲刺格式无效");
    if (sp.startDate > sp.endDate) fail("冲刺结束日期不能早于开始日期");
  }
  for (const p of s.projects)
    if (
      s.sprints.filter((x) => x.projectId === p.id && x.status === "active")
        .length > 1
    )
      fail("一个项目同时只能有一个进行中的 Sprint");
  for (const r of s.releases)
    if (!["planning", "active", "ready", "released"].includes(r.status))
      fail("版本状态无效");
  for (const r of s.runs) {
    if (
      !s.items.some(x => x.id === runTargetId(r) && x.projectId === r.projectId && isExecutionItem(x, projectOf(s, x))) ||
      !s.items.some(
        (x) =>
          x.id === r.storyId &&
          (work(s, x) || r.deliveryOwnershipVersion >= 1 && x.id === runTargetId(r) && isSubtask(x, projectOf(s,x))) &&
          x.projectId === r.projectId,
      ) ||
      ![
        "active",
        "blocked",
        "review",
        "accepted",
        "changes",
        "cancelled",
      ].includes(r.status) ||
      !Array.isArray(r.reviews)
    )
      fail("执行记录无效");
  }
  return s;
}
export function act(s, a) {
  const { type } = a;
  let p = a.payload || {};
  if (type === 'mcp.item.create' || type === 'mcp.item.update') {
    const parsed = (type === 'mcp.item.create' ? createItemSchema : updateItemSchema).safeParse(p);
    if (!parsed.success) fail(parsed.error.issues.map(i => i.message).join('；'));
    const input = parsed.data;
    const project = s.projects.find(x => x.id === input.projectId);
    if (!project) fail('项目不存在', 404);
    const fingerprint = createHash('sha256').update(JSON.stringify({type, input}, function(key, value) {
      return value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.keys(value).sort().map(k => [k,value[k]])) : value;
    })).digest('hex');
    const prior = project.mcpRequests?.find(r => r.requestId === input.requestId);
    if (prior) {
      if (prior.fingerprint !== fingerprint) fail('requestId 已用于不同操作', 409);
      return structuredClone(prior.result);
    }
    if (input.expectedRevision !== s.revision) fail('项目已有更新，请重新调用 query_project 获取 revision 后重试', 409);
    const {projectId, expectedRevision, requestId, agent, itemId, patch, ...fields} = input;
    if (type === 'mcp.item.update') {
      const item = getItem(s, itemId);
      if (item.projectId !== projectId) fail('工作项不属于指定项目', 404);
    }
    const result = act(s, {type:type === 'mcp.item.create' ? 'item.create' : 'item.update',
      actor:a.actor || agent, payload:type === 'mcp.item.create' ? {...fields,projectId} : {...patch,id:itemId}});
    project.mcpRequests ??= [];
    project.mcpRequests.push({requestId, fingerprint, result:structuredClone(result)});
    return result;
  }
  const activityBefore = captureItemActivity(s), previousEventIds = new Set(s.events.map(e => e.id));
  let out;
  if (type === "project.create") {
    out = emptyProject(p.name, p.description || "");
    out.code = p.code !== undefined ? String(p.code).trim().toUpperCase() : availableProjectCode(s.projects);
    out.goal = required(p.goal, "项目目标");
    dateRange(p.startDate, p.endDate, "项目", true);
    out.startDate = p.startDate;
    out.endDate = p.endDate;
    s.projects.push(out);
    addEvent(s, out.id, "project", "创建项目", out.name);
  } else if (type === "project.workConfig") {
    const pr = s.projects.find((x) => x.id === p.id);
    if (!pr) fail("项目不存在");
    const next = structuredClone(p.config);
    checkWorkConfig(next);
    const before = configFor(pr);
    for (const old of before.types) {
      const replacement = next.types.find((t) => t.id === old.id);
      if (!replacement) fail("已有类型只能停用，不能删除");
      if (s.items.some((i) => i.projectId === pr.id && i.kind === old.id) && (!replacement.enabled || (replacement.level === 0 ? "standard" : replacement.level === -1 ? "subtask" : "planning") !== (old.level === 0 ? "standard" : old.level === -1 ? "subtask" : "planning"))) fail("类型「" + old.name + "」仍在使用，不能停用或跨规划、标准和子任务类别移动");
    }
    for (const old of before.statuses) {
      const replacement = next.statuses.find((t) => t.id === old.id);
      if (!replacement) fail("已有状态只能停用，不能删除");
      if (replacement.category !== old.category && s.items.some((i) => i.projectId === pr.id && i.status === old.id)) fail("使用中的状态不能直接修改类别，请新增状态并迁移");
    }
    for(const group of workflowMigrationGroups(pr,s.items,next)) {
      const id=p.statusMigration?.[group.key] || p.statusMigration?.[group.status];
      if(!id || !group.workflow?.statusIds.includes(id)) fail("请为受影响状态选择有效的工作流迁移目标");
      for(const item of group.items) { item.status=id; item.updatedAt=now(); }
    }
    const flowStructure = (c) => JSON.stringify({statuses:c.statuses,workflows:c.workflows,scheme:c.workflowScheme});
    if(flowStructure(before)!==flowStructure(next)) {
      pr.workflowHistory=[...(pr.workflowHistory||[]),{version:pr.workflowRevision||1,at:now(),statuses:structuredClone(before.statuses),workflows:structuredClone(before.workflows),workflowScheme:structuredClone(before.workflowScheme)}];
      pr.workflowRevision=(pr.workflowRevision||1)+1;
    }
    const structure = (c) => JSON.stringify({ levels: c.levels, types: c.types.map(({id, level, enabled, hidden}) => ({id, level, enabled, hidden: !!hidden})) });
    if (structure(before) !== structure(next)) {
      pr.hierarchyHistory = [...(pr.hierarchyHistory || []), { version: pr.hierarchyRevision || 1, at: now(), levels: structuredClone(before.levels), types: before.types.map(({id, name, level, enabled, hidden}) => ({id, name, level, enabled, hidden: !!hidden})) }];
      pr.hierarchyRevision = (pr.hierarchyRevision || 1) + 1;
    }
    pr.workConfig = next;
    pr.updatedAt = now();
    for (const item of s.items.filter((i) => i.projectId === pr.id && work(s, i))) item.contentVersion = (item.contentVersion || 1) + 1;
    addEvent(s, pr.id, "project", "更新工作项配置");
    out = pr;
  } else if (type === "project.update") {
    const pr = s.projects.find((x) => x.id === p.id);
    if (!pr) fail("项目不存在");
    if (p.code !== undefined && p.code !== pr.code) fail("项目 ID 创建后不可修改");
    const sharedKeys = ["description", "goal", "definitionOfDone", "workingAgreements"];
    const previousContext = sharedKeys.map((key) => pr[key] || "");
    for (const k of [
      "name",
      "description",
      "goal",
      "definitionOfDone",
      "workingAgreements",
      "members",
      "owner",
      "startDate",
      "endDate",
    ])
      if (p[k] !== undefined) {
        if (k !== "members" && (typeof p[k] !== "string" || p[k].length > 20000)) fail("项目设置必须是少于 20000 字的文本");
        pr[k] = k === "members" ? p[k] : p[k].trim();
      }
    pr.name = required(pr.name, "名称");
    if (pr.name.length > 120) fail("项目名称不能超过 120 字");
    if (p.goal !== undefined) pr.goal = required(pr.goal, "项目目标");
    if (p.definitionOfDone !== undefined) pr.definitionOfDone = required(pr.definitionOfDone, "完成定义");
    if (p.members !== undefined || p.owner !== undefined) {
      if (!Array.isArray(pr.members) || !pr.members.length || pr.members.length > 100 || pr.members.some((m) => typeof m !== "string" || !m.trim() || m.trim().length > 80)) fail("成员名册需包含 1 至 100 位成员，姓名为 1 至 80 字");
      pr.members = pr.members.map((m) => m.trim());
      if (new Set(pr.members).size !== pr.members.length) fail("成员姓名不能重复");
      if (!pr.members.includes(pr.owner)) fail("项目负责人必须在成员名册中");
      const assigned = s.items.find((i) => i.projectId === pr.id && i.owner && !pr.members.includes(i.owner));
      if (assigned) fail(`「${assigned.owner}」仍负责「${assigned.title}」，请先重新分配需求再移除成员`);
    }
    if (p.roles !== undefined) pr.roles = structuredClone(p.roles);
    if (p.memberRoles !== undefined) {
      if (!p.memberRoles || typeof p.memberRoles !== "object" || Array.isArray(p.memberRoles)) fail("成员角色格式错误");
      pr.memberRoles = structuredClone(p.memberRoles);
    } else {
      pr.memberRoles = rolesForMembers(pr.members, pr.memberRoles);
    }
    try { checkMemberRoles(pr); } catch (e) { fail(e.message); }
    pr.roles = pr.roles.map((role) => ({ ...role, name: role.name.trim(), description: role.description.trim() }));
    if (p.startDate !== undefined || p.endDate !== undefined)
      dateRange(pr.startDate, pr.endDate, "项目", true);
    if (sharedKeys.some((key, i) => (pr[key] || "") !== previousContext[i])) {
      for (const story of s.items.filter((i) => i.projectId === pr.id && work(s, i))) {
        story.contentVersion = (story.contentVersion || 1) + 1;
        story.updatedAt = now();
      }
    }
    addEvent(s, pr.id, "project", "更新项目设置");
    pr.updatedAt = now();
    out = pr;
  } else if (type === "project.delete") {
    const pr = s.projects.find((x) => x.id === p.id);
    if (!pr) fail("项目不存在", 404);
    if (p.confirmName !== pr.name) fail("请输入完整项目名称以确认删除");
    for (const key of [
      "items",
      "releases",
      "sprints",
      "notes",
      "runs",
      "events",
    ])
      s[key] = s[key].filter((x) => x.projectId !== pr.id);
    s.projects = s.projects.filter((x) => x.id !== pr.id);
    out = { deleted: pr.id, remainingProjectId: s.projects[0]?.id || null };
  } else if (type === "item.create") {
    const project = s.projects.find((x) => x.id === p.projectId);
    if (!project) fail("项目不存在");
    p = {...p, kind: p.kind || configFor(project).types.find(t => t.id === 'story' && t.enabled && !t.hidden)?.id || configFor(project).types.find(t => t.level === 0 && t.enabled && !t.hidden)?.id};
    if (!typeFor(project, p.kind)?.enabled || typeFor(project, p.kind)?.hidden) fail("请选择已启用且展示的工作项类型");
    itemDates({ ...p, endDate: p.endDate || p.dueDate }, project, true);
    out = {
      id: uid(p.kind),
      projectId: p.projectId,
      kind: p.kind,
      title: required(p.title, "标题"),
      parentId: p.parentId || null,
      description: p.description || "",
      acceptance: p.acceptance || "",
      owner: p.owner ?? "",
      priority: p.priority || "medium",
      status: workflowFor(project, p.kind).initialStatus,
      points: Number(p.points) || 0,
      releaseId: p.releaseId || null,
      sprintId: isSubtask(p, project) ? null : p.sprintId || null,
      dueDate: p.dueDate || "",
      startDate: p.startDate || "",
      endDate: p.endDate || p.dueDate || "",
      aiEnabled: false,
      contentVersion: 1,
      createdAt: now(),
      updatedAt: now(),
    };
    if(isSubtask(out,project)&&p.sprintId&&p.sprintId!==effectiveSprintId(out,s.items,project))fail("子任务的 Sprint 必须跟随父级工作项");
    if (out.owner && !project.members.includes(out.owner)) fail("需求负责人必须在项目成员名册中");
    if (out.releaseId && s.releases.some(r => r.id === out.releaseId && (r.archived || r.status === "released"))) fail("不能向已发布或已归档版本添加工作项");
    out.number = allocateItemNumber(project);
    if (p.afterId) {
      const index=s.items.findIndex(item=>item.id===p.afterId&&item.projectId===project.id);
      if(index<0)fail("新建位置已不存在，请刷新后重试");
      s.items.splice(index+1,0,out);
    } else s.items.push(out);
    if (isSubtask(out, project) && out.parentId) { const parent = getItem(s, out.parentId); parent.contentVersion = (parent.contentVersion || 1) + 1; }
    scope(s, out, null, out.sprintId, "新增故事");
    addEvent(
      s,
      out.projectId,
      "item",
      `创建${typeNames(project)[out.kind]}`,
      out.title,
      out.id,
    );
  } else if (type === 'item.roadmap.move') {
    const item=getItem(s,p.id),target=getItem(s,p.targetId),project=projectOf(s,item);
    if(p.projectId!==item.projectId)fail('只能在当前项目内移动');
    if(p.expectedTree!==roadmapTreeSnapshot(s.items,project))fail('工作项顺序、层级或内容已有更新，请刷新后重新拖动',409);
    const plan=roadmapMovePlan(project,s.items,item,target,p.position);
    if(plan.error)fail(plan.error);
    const old=structuredClone(item),oldEffectiveSprint=effectiveSprintId(item,s.items,project);
    const changed=old.parentId!==plan.parentId||old.kind!==plan.kind;
    if(changed){
      const stage=cat(s,item);
      if(old.kind!==plan.kind){
        const next=statusFor(project,stage,plan.kind);
        if(!next||categoryOf(project,next,plan.kind)!==stage)fail('目标类型工作流缺少对应状态，请先配置后再移动');
        item.status=next;
      }
      Object.assign(item,plan);
      item.sprintId=isSubtask(item,project)?null:old.kind==='subtask'?oldEffectiveSprint:old.sprintId;
      if(item.sprintId!==old.sprintId&&s.sprints.some(sp=>sp.id===item.sprintId&&sp.status==='closed'))fail('不能将任务加入已结束的冲刺，请先调整父级冲刺');
      delete item.legacyParentDates;
      parentDates(item,s.items.find(i=>i.id===item.parentId));
      item.contentVersion=(old.contentVersion||1)+1;
      const affected=new Set([item.id]);
      let count=-1;
      while(count!==affected.size){count=affected.size;for(const child of s.items)if(affected.has(child.parentId))affected.add(child.id);}
      for(const id of [old.parentId,item.parentId])if(id)affected.add(id);
      for(const related of s.items)if(related.id!==item.id&&affected.has(related.id)&&work(s,related))related.contentVersion=(related.contentVersion||1)+1;
      scope(s,item,work(s,old)?old.sprintId:null,work(s,item)?item.sprintId:null,'线路图跨级拖动');
      snapshot(s,oldEffectiveSprint);snapshot(s,effectiveSprintId(item,s.items,project));
    }
    const oldOrder=s.items.map(i=>i.id),remaining=s.items.filter(i=>i.id!==item.id);
    let anchor=target;
    if(p.position==='inside')anchor=remaining.filter(i=>i.parentId===target.id).at(-1)||target;
    remaining.splice(remaining.findIndex(i=>i.id===anchor.id)+(p.position==='before'?0:1),0,item);
    if(!changed&&remaining.every((i,index)=>i.id===oldOrder[index]))return item;
    s.items=remaining;item.updatedAt=now();
    addEvent(s,item.projectId,'item','拖动调整线路图层级与顺序',`${p.position==='inside'?'移入':p.position==='before'?'移至之前':'移至之后'}：「${target.title}」`,item.id);
    s.events[0].changes=[{field:'roadmapOrder',label:'线路图位置',before:oldOrder.indexOf(item.id)+1,after:remaining.indexOf(item)+1,beforeText:String(oldOrder.indexOf(item.id)+1),afterText:String(remaining.indexOf(item)+1)}];
    out=item;
  } else if (type === 'item.reorder') {
    const item = getItem(s, p.id), target = getItem(s, p.targetId);
    if (p.projectId !== item.projectId || target.projectId !== item.projectId) fail('只能在当前项目内排序');
    if ((item.parentId || null) !== (target.parentId || null)) fail('只能调整同一父级下的工作项顺序');
    if (!['before', 'after'].includes(p.position)) fail('请选择有效的排序位置');
    const siblings = roadmapSiblings(s.items, item), ids = siblings.map(i => i.id);
    if (!Array.isArray(p.expectedSiblingIds) || p.expectedSiblingIds.length !== ids.length || ids.some((id, index) => id !== p.expectedSiblingIds[index])) fail('工作项顺序或层级已有更新，请刷新后重新排序', 409);
    const ordered = reorderedSiblingIds(siblings, item.id, target.id, p.position);
    if (!ordered) return item;
    const byId = new Map(siblings.map(i => [i.id, i])), scopeIds = new Set(ids);
    let index = 0;
    s.items = s.items.map(i => scopeIds.has(i.id) ? byId.get(ordered[index++]) : i);
    item.updatedAt = now();
    addEvent(s, item.projectId, 'item', '调整线路图顺序', `移至「${target.title}」${p.position === 'before' ? '之前' : '之后'}，父子关系和计划周期保持不变。`, item.id);
    s.events[0].changes = [{field:'roadmapOrder', label:'线路图顺序', before:ids.indexOf(item.id)+1, after:ordered.indexOf(item.id)+1, beforeText:String(ids.indexOf(item.id)+1), afterText:String(ordered.indexOf(item.id)+1)}];
    out = item;
  } else if (type === "item.update" || type === "item.move") {
    const i = getItem(s, p.id),
      oldSprint = i.sprintId;
    if (type === "item.move" && p.projectId !== i.projectId) fail("只能在当前项目内调整父级");
    const old = structuredClone(i);
    const project = projectOf(s, i);
    if(p.aiEnabled!==undefined&&p.aiDisabled===undefined)i.aiDisabled=isSubtask(i,project)?!p.aiEnabled:false;
    const allowed = [
      "kind",
      "title",
      "description",
      "acceptance",
      "owner",
      "priority",
      "status",
      "points",
      "releaseId",
      "sprintId",
      "parentId",
      "dueDate",
      "startDate",
      "endDate",
      "aiEnabled",
      "aiDisabled",
      "goal",
      "boardRank",
      "sprintRank",
    ];
    for (const k of allowed)
      if (p[k] !== undefined)
        i[k] =
          p[k] ||
          (["releaseId", "sprintId", "parentId"].includes(k) ? null : p[k]);
    if(isSubtask(i,project)&&p.sprintId!==undefined){if(p.sprintId!==effectiveSprintId(i,s.items,project))fail("子任务的 Sprint 必须跟随父级工作项");i.sprintId=null;}
    if(p.sprintRank!==undefined&&!Number.isFinite(p.sprintRank))fail("冲刺顺序必须是有效数字");
    if(p.boardRank!==undefined&&!Number.isFinite(p.boardRank))fail("看板顺序必须是有效数字");
    if (i.kind !== old.kind && typeFor(project, i.kind)?.level !== typeFor(project, old.kind)?.level) fail("类型转换只能在同层级之间进行");
    if (p.status !== undefined && i.kind === old.kind && !allowedTransition(project, old.status, i.status, i.kind)) fail("当前工作流不允许此状态转换");
    if (p.parentId !== undefined || p.startDate !== undefined || p.endDate !== undefined || p.dueDate !== undefined) {
      delete i.legacyParentDates;
      parentDates(i, s.items.find((x) => x.id === i.parentId));
      if (p.scheduleMode !== undefined) {
        if (!['move','start','end'].includes(p.scheduleMode) || !p.startDate || !p.endDate || p.parentId !== undefined || p.kind !== undefined) fail("无效的时间轴调整");
        itemDates(i, project, true);
        const elapsed = (a,b) => Date.parse(b) - Date.parse(a);
        if ((p.scheduleMode === 'start' && i.endDate !== old.endDate) || (p.scheduleMode === 'end' && i.startDate !== old.startDate) || (p.scheduleMode === 'move' && elapsed(i.startDate,i.endDate) !== elapsed(old.startDate,old.endDate))) fail("时间轴调整方式与日期不匹配");
        for (const patch of fitChildSchedules(s.items, old, i, p.scheduleMode)) {
          const child = getItem(s, patch.id);
          Object.assign(child, patch, { dueDate: patch.endDate, contentVersion: (child.contentVersion || 1) + 1, updatedAt: now() });
          delete child.legacyParentDates;
          itemDates(child, project, true);
          addEvent(s, child.projectId, 'item', '随父级调整计划周期', `随父级「${i.title}」同步调整`, child.id);
        }
      }
      if (p.startDate !== undefined || p.endDate !== undefined || p.dueDate !== undefined)
        for (const child of s.items.filter((x) => x.parentId === i.id)) parentDates(child, i);
    }
    required(i.title, "标题");
    if (p.owner !== undefined && i.owner && !s.projects.find((pr) => pr.id === i.projectId).members.includes(i.owner)) fail("需求负责人必须在项目成员名册中");
    if (
      p.startDate !== undefined ||
      p.endDate !== undefined ||
      p.dueDate !== undefined
    ) {
      if (p.dueDate !== undefined && p.endDate === undefined)
        i.endDate = p.dueDate;
      itemDates(
        i,
        s.projects.find((project) => project.id === i.projectId),
        true,
      );
      i.dueDate = i.endDate;
    }
    if (
      i.releaseId !== old.releaseId &&
      s.releases.find((r) => r.id === i.releaseId)?.status === "released"
    )
      fail("不能向已发布版本添加故事");
    if (i.releaseId !== old.releaseId && s.releases.find(r => r.id === i.releaseId)?.archived) fail("不能向已归档版本添加工作项");
    if (isExecutionItem(i, project) && workflowFor(project,i.kind).rules?.requireReview && cat(s, i) === "done" && categoryOf(project, old.status, old.kind) !== "done")
      fail("请通过人工验收确认工作项完成");
    if (
      i.sprintId &&
      s.sprints.find((x) => x.id === i.sprintId)?.status === "closed" &&
      oldSprint !== i.sprintId
    )
      fail("不能将故事加入已结束的冲刺");
    if (
      ["title", "description", "acceptance", "startDate", "endDate", "parentId", "kind"].some(
        (k) => i[k] !== old[k],
      )
    )
      i.contentVersion++;
    i.updatedAt = now();
    if (old.parentId !== i.parentId || old.kind !== i.kind) {
      const affected = new Set([i.id]);
      let previous = -1;
      while (previous !== affected.size) { previous = affected.size; for (const child of s.items) if (affected.has(child.parentId)) affected.add(child.id); }
      for (const id of [old.parentId, i.parentId]) if (id) affected.add(id);
      for (const related of s.items.filter((x) => x.id !== i.id && affected.has(x.id) && work(s, x))) related.contentVersion = (related.contentVersion || 1) + 1;
    }
    if (work(s, i)) {
      scope(s, i, oldSprint, i.sprintId, p.reason || "调整冲刺范围");
      snapshot(s, i.sprintId);
      if (oldSprint !== i.sprintId) snapshot(s, oldSprint);
      if (old.points !== i.points && i.sprintId) {
        const sp = s.sprints.find((x) => x.id === i.sprintId);
        if (sp?.status === "active")
          sp.scopeChanges.push({
            at: now(),
            storyId: i.id,
            title: i.title,
            action: "重新估算",
            reason: `${old.points} → ${i.points} SP`,
          });
      }
    }
    addEvent(
      s,
      i.projectId,
      "item",
      `更新${typeNames(project)[i.kind]}`,
      p.reason ? `原因：${p.reason}` : "",
      i.id,
    );
    out = i;
  } else if (type === "item.delete") {
    const i = getItem(s, p.id);
    if (
      s.items.some((x) => x.parentId === i.id) ||
      s.runs.some((r) => r.storyId === i.id || runTargetId(r) === i.id) ||
      s.sprints.some((sp) => sp.baseline.some((x) => x.id === i.id))
    )
      fail("条目已有子项、执行或冲刺基线，请取消该条目以保留历史");
    s.items = s.items.filter((x) => x.id !== i.id);
    scope(s, i, i.sprintId, null, "删除故事");
    snapshot(s, i.sprintId);
    addEvent(s, i.projectId, "item", "删除条目", i.title);
    out = { deleted: i.id };
  } else if (type === "sprint.create") {
    out = {
      id: uid("sprint"),
      projectId: p.projectId,
      name: required(p.name, "Sprint 名称"),
      goal: required(p.goal, "冲刺目标"),
      startDate: required(p.startDate, "开始日期"),
      endDate: required(p.endDate, "结束日期"),
      capacity: Number(p.capacity) || 0,
      status: "planned",
      baseline: [],
      scopeChanges: [],
      snapshots: [],
      review: "",
      retro: { wentWell: "", improve: "", actions: "" },
      createdAt: now(),
    };
    dateRange(out.startDate, out.endDate, "冲刺", true);
    if (!Number.isFinite(Number(p.capacity || 0)) || Number(p.capacity || 0) < 0) fail("计划容量必须是非负数");
    s.sprints.push(out);
    addEvent(s, p.projectId, "sprint", "创建冲刺", out.name);
  } else if (type.startsWith("sprint.")) {
    const sp = s.sprints.find((x) => x.id === p.id);
    if (!sp) fail("Sprint 不存在");
    if (type === "sprint.start") {
      if (sp.status !== "planned") fail("只有规划中的冲刺可以启动");
      if (
        s.sprints.some(
          (x) => x.projectId === sp.projectId && x.status === "active",
        )
      )
        fail("请先结束当前冲刺");
      const items = storiesIn(s, sp.id);
      if (!items.length) fail("请先为冲刺安排故事");
      if (items.some((x) => !x.owner || !x.acceptance?.trim()))
        fail("故事需要负责人和验收标准后才能进入冲刺");
      const plan = { ...sp, ...Object.fromEntries(["name", "goal", "startDate", "endDate", "capacity"].filter(k => p[k] !== undefined).map(k => [k, p[k]])) };
      required(plan.name, "Sprint 名称"); required(plan.goal, "冲刺目标"); dateRange(plan.startDate, plan.endDate, "冲刺", true);
      if (!Number.isFinite(Number(plan.capacity)) || Number(plan.capacity) < 0) fail("计划容量必须是非负数");
      for (const k of ["name", "goal", "startDate", "endDate", "capacity"]) sp[k] = plan[k];
      sp.status = "active";
      sp.startedAt = now();
      sp.baseline = items.map((x) => ({
        id: x.id,
        title: x.title,
        points: x.points,
        status: x.status,
      }));
      for (const i of items) if (cat(s, i) === "backlog") transition(s, i, "todo");
      snapshot(s, sp.id);
      addEvent(s, sp.projectId, "sprint", "启动冲刺", sp.name);
    } else if (type === "sprint.update") {
      if (sp.status === "closed") fail("已结束冲刺的总结不能修改");
      if (p.startDate !== undefined || p.endDate !== undefined) dateRange(p.startDate ?? sp.startDate, p.endDate ?? sp.endDate, "冲刺", true);
      if (p.capacity !== undefined && (!Number.isFinite(Number(p.capacity)) || Number(p.capacity) < 0)) fail("计划容量必须是非负数");
      if (p.name !== undefined) required(p.name, "Sprint 名称");
      if (p.goal !== undefined) required(p.goal, "冲刺目标");
      for (const k of ["review", "retro", "goal", "name", "capacity", "startDate", "endDate"])
        if (p[k] !== undefined) sp[k] = p[k];
      addEvent(s, sp.projectId, "sprint", "更新冲刺记录", sp.name);
    } else if (type === "sprint.close") {
      if (sp.status !== "active") fail("只能结束进行中的冲刺");
      if (p.review !== undefined) sp.review = required(p.review, "评审总结");
      if (p.retro !== undefined) sp.retro = { wentWell: required(p.retro?.wentWell, "做得好的地方"), improve: required(p.retro?.improve, "需要改进的地方"), actions: typeof p.retro?.actions === "string" ? p.retro.actions : "" };
      if (
        !sp.review.trim() ||
        !sp.retro.wentWell.trim() ||
        !sp.retro.improve.trim()
      )
        fail("请先填写评审总结和复盘记录");
      const unfinished = storiesIn(s, sp.id).filter(
        (x) => !terminal(x, projectOf(s, x)),
      );
      const dispositions = { ...p.dispositions };
      if (unfinished.some(i => dispositions[i.id] === "new")) {
        if (!p.nextSprint) fail("请填写后续冲刺计划");
        const next = act(s, { type: "sprint.create", payload: { ...p.nextSprint, projectId: sp.projectId } });
        for (const id of Object.keys(dispositions)) if (dispositions[id] === "new") dispositions[id] = next.id;
      }
      for (const i of unfinished) {
        const dest = dispositions[i.id];
        if (!dest) fail(`请决定未完成故事「${i.title}」的去向`);
        if (
          !["backlog", "cancel"].includes(dest) &&
          !s.sprints.some(
            (x) =>
              x.id === dest &&
              x.projectId === sp.projectId &&
              x.status === "planned",
          )
        )
          fail("结转目标必须是规划中的冲刺");
      }
      snapshot(s, sp.id);
      sp.finalStories = structuredClone(storiesIn(s, sp.id));
      sp.completedAt = now();
      sp.status = "closed";
      sp.carryover = [];
      for (const i of unfinished) {
        const dest = dispositions[i.id];
        sp.carryover.push({
          id: i.id,
          title: i.title,
          to: dest,
          status: i.status,
          points: i.points,
        });
        if (dest === "cancel") transition(s, i, "cancelled");
        i.sprintId = ["backlog", "cancel"].includes(dest) ? null : dest;
      }
      if (p.createImprovement && sp.retro.actions.trim()) {
        const project = s.projects.find((p) => p.id === sp.projectId);
        dateRange(
          project.startDate,
          project.endDate,
          "项目（创建改进故事前）",
          true,
        );
        const num = allocateItemNumber(project);
        s.items.push({
          id: uid("story"),
          projectId: sp.projectId,
          kind: configFor(project).types.find(t => t.id === "story" && t.enabled && !t.hidden)?.id || configFor(project).types.find(t => t.level === 0 && t.enabled && !t.hidden).id,
          number: num,
          title: `${sp.name} · 改进行动`,
          startDate: project.startDate,
          endDate: project.endDate,
          description: sp.retro.actions,
          acceptance: "执行改进行动，并在下次复盘时检查效果。",
          status: workflowFor(project, configFor(project).types.find(t => t.id === "story" && t.enabled && !t.hidden)?.id || configFor(project).types.find(t => t.level === 0 && t.enabled && !t.hidden).id).initialStatus,
          owner: project.owner,
          priority: "medium",
          points: 0,
          parentId: null,
          releaseId: null,
          sprintId: null,
          aiEnabled: false,
          contentVersion: 1,
          createdAt: now(),
          updatedAt: now(),
        });
      }
      addEvent(
        s,
        sp.projectId,
        "sprint",
        "结束冲刺",
        `${sp.name} · ${unfinished.length} 个故事结转或取消`,
      );
    }
    out = sp;
  } else if (type === "release.create") {
    out = {
      id: uid("release"),
      projectId: p.projectId,
      name: required(p.name, "版本名称"),
      goal: p.goal || "",
      startDate: p.startDate || "",
      plannedDate: p.plannedDate || "",
      status: "planning",
      createdAt: now(),
    };
    checkReleasePlan(s, out);
    s.releases.push(out);
    addEvent(s, p.projectId, "release", "创建版本", out.name);
  } else if (type === "release.update") {
    const r = s.releases.find((x) => x.id === p.id);
    if (!r) fail("版本不存在");
    if (r.status === "released") fail("已发布版本不可修改");
    if (r.archived) fail("请先恢复已归档版本再编辑");
    if (p.status === "released") fail("请通过发布确认操作发布版本");
    const plan = {...r, ...Object.fromEntries(["name", "goal", "startDate", "plannedDate", "status"].filter(k=>p[k]!==undefined).map(k=>[k,p[k]]))};
    checkReleasePlan(s, plan);
    Object.assign(r, plan);
    out = r;
    addEvent(s, r.projectId, "release", "更新版本", r.name);
  } else if (type === "release.archive") {
    const r = s.releases.find(x => x.id === p.id);
    if (!r) fail("版本不存在");
    if (typeof p.archived !== "boolean") fail("请明确版本归档状态");
    r.archived = p.archived;
    out = r;
    addEvent(s, r.projectId, "release", p.archived ? "归档版本" : "恢复版本", r.name);
  } else if (type === "release.publish") {
    const r = s.releases.find((x) => x.id === p.id);
    if (!r || r.status === "released") fail("版本不存在或已发布");
    if (r.archived) fail("请先恢复已归档版本再发布");
    const releasedDate = p.releasedDate || now().slice(0,10);
    validDate(releasedDate, "实际发布日期");
    if (r.startDate && releasedDate < r.startDate) fail("实际发布日期不能早于开始日期");
    const items = s.items.filter(
      (x) => x.releaseId === r.id,
    );
    if (!items.length) fail("请先为版本安排故事");
    if (!items.some((x) => cat(s, x) === "done"))
      fail("至少需要一个已验收故事才能发布");
    const unfinished = items.filter(
      (x) => !terminal(x, projectOf(s, x)),
    );
    for (const i of unfinished) {
      const dest = p.dispositions?.[i.id];
      if (
        !dest ||
        (dest !== "backlog" &&
          !s.releases.some(
            (x) =>
              x.id === dest &&
              x.projectId === r.projectId &&
              x.id !== r.id &&
              !x.archived && x.status !== "released",
          ))
      )
        fail(`请安排未完成故事「${i.title}」的去向`);
    }
    r.publishedStories = structuredClone(
      items.filter((x) => cat(s, x) === "done"),
    );
    r.deferredStories = unfinished.map((i) => ({
      id: i.id,
      title: i.title,
      to: p.dispositions[i.id],
    }));
    for (const i of unfinished)
      i.releaseId =
        p.dispositions[i.id] === "backlog" ? null : p.dispositions[i.id];
    r.status = "released";
    r.publishedAt = now();
    r.releasedDate = releasedDate;
    r.notes = required(p.notes, "发布说明");
    addEvent(s, r.projectId, "release", "发布版本", r.name);
    out = r;
  } else if (type === "note.create") {
    if (!s.projects.some(project => project.id === p.projectId)) fail('项目不存在', 404);
    if (!Object.hasOwn(memoryTypes, p.type || 'context')) fail('记忆类型无效');
    out = {
      id: uid("note"),
      projectId: p.projectId,
      type: p.type || "context",
      title: required(p.title, "标题"),
      body: required(p.body, "内容"),
      confirmed: true,
      author: String(a.actor || '我').slice(0,120),
      createdAt: now(),
      contentVersion: 1,
    };
    out.history = [memoryEntry(out, 'create', out.author, out.createdAt)];
    s.notes.unshift(out);
    addEvent(s, p.projectId, "memory", "记录项目记忆", out.title);
  } else if (type === 'note.update' || type === 'note.delete') {
    const note = s.notes.find(n => n.id === p.id && n.projectId === p.projectId);
    if (!note || note.deletedAt) fail('记忆不存在或已删除', 404);
    if (p.expectedVersion !== memoryVersion(note)) fail('记忆已有更新，请重新打开后重试', 409);
    const actor = String(a.actor || '我').slice(0,120), at = now();
    const next = type === 'note.update' ? {
      type: p.type, title: required(p.title, '标题'), body: required(p.body, '内容'),
    } : {};
    if (type === 'note.update' && !Object.hasOwn(memoryTypes, next.type)) fail('记忆类型无效');
    if (type === 'note.update' && ['type','title','body'].every(key => next[key] === note[key])) return note;
    const history = structuredClone(memoryHistory(note));
    Object.assign(note, next, {contentVersion: memoryVersion(note) + 1, updatedAt: at, updatedBy: actor});
    if (type === 'note.delete') Object.assign(note, {deletedAt: at, deletedBy: actor});
    note.history = [...history, memoryEntry(note, type === 'note.delete' ? 'delete' : 'update', actor, at)];
    addEvent(s, note.projectId, 'memory', type === 'note.delete' ? '删除项目记忆' : '编辑项目记忆', note.title);
    out = note;
  } else if (type === "run.progress" || type === "run.submit") {
    const i = getItem(s, p.itemId),
      story = storyOf(s, i);
    if (!aiExecutionEnabled(i,s.items)) fail("该工作项及其所属任务未启用 AI 更新", 403);
    if (p.requestId) {
      const prior = s.runs.find((r) => r.requestId === p.requestId || r.progress?.some(entry => entry.requestId === p.requestId));
      if (prior) {
        if (prior.storyId !== story.id || (prior.itemId || prior.storyId) !== i.id) fail("requestId 已用于其他工作项");
        if ((prior.requestId === p.requestId) !== (type === "run.submit")) fail("requestId 已用于其他操作");
        return prior;
      }
    }
    if (terminal(i, projectOf(s, i)))
      fail("该工作项已结束，不能继续执行");
    if (p.itemVersion !== undefined && p.itemVersion !== i.contentVersion)
      fail("工作项要求已更新，请重新读取上下文", 409);
    if (p.storyVersion !== story.contentVersion)
      fail(
        `故事要求已更新（当前 v${story.contentVersion}），请重新读取上下文`,
        409,
      );
    if (type === "run.progress") {
      let run = p.runId
        ? s.runs.find((x) => x.id === p.runId && x.storyId === story.id)
        : null;
      if (p.runId && !run) fail("执行记录不存在");
      if (run && runTargetId(run) !== i.id) fail("执行记录不属于当前工作项");
      if (run?.itemVersion !== undefined && run.itemVersion !== i.contentVersion) fail("工作项要求已更新，请重新读取上下文并创建新执行", 409);
      if (run && !["active", "blocked"].includes(run.status))
        fail("此执行已提交或结束，请创建新的执行");
      if (!run) {
        run = {
          id: uid("run"),
          projectId: story.projectId,
          storyId: story.id,
          itemId: i.id,
          storyVersion: p.storyVersion,
          itemVersion: i.contentVersion,
          deliveryOwnershipVersion: 1,
          agent: required(p.agent, "Agent 名称"),
          status: "active",
          createdAt: now(),
          reviews: [],
          progress: [],
        };
        s.runs.push(run);
      }
      run.status = p.status === "blocked" ? "blocked" : "active";
      run.progress ??= [];
      run.progress.push({
        at: now(),
        message: required(p.message, "进展说明"),
        ...(p.requestId ? {requestId:p.requestId} : {}),
      });
      transition(s, i, run.status);
      i.updatedAt = now();
      out = run;
      addEvent(
        s,
        story.projectId,
        "ai",
        `${run.agent} 更新进展`,
        p.message,
        i.id,
      );
    } else {
      let run = p.runId
        ? s.runs.find((x) => x.id === p.runId && x.storyId === story.id)
        : null;
      if (p.runId && !run) fail("执行记录不存在");
      if (run && runTargetId(run) !== i.id) fail("执行记录不属于当前工作项");
      if (run?.itemVersion !== undefined && run.itemVersion !== i.contentVersion) fail("工作项要求已更新，请重新读取上下文并创建新执行", 409);
      if (run && !["active", "blocked"].includes(run.status))
        fail("此执行已提交，请使用相同 requestId 重试或创建新执行");
      if (!run) {
        run = {
          id: uid("run"),
          projectId: story.projectId,
          storyId: story.id,
          itemId: i.id,
          storyVersion: p.storyVersion,
          itemVersion: i.contentVersion,
          deliveryOwnershipVersion: 1,
          agent: required(p.agent, "Agent 名称"),
          createdAt: now(),
          reviews: [],
        };
        s.runs.push(run);
      }
      Object.assign(run, {
        summary: required(p.summary, "交付说明"),
        verification: required(p.verification, "验证结果"),
        artifacts: p.artifacts || [],
        status: "review",
        requestId: required(p.requestId, "提交唯一标识"),
        submittedAt: now(),
      });
      transition(s, i, "review");
      i.updatedAt = now();
      out = run;
      addEvent(
        s,
        story.projectId,
        "ai",
        `${run.agent} 提交成果`,
        run.summary,
        i.id,
      );
    }
    snapshot(s, story.sprintId);
  } else if (type === "run.cancel") {
    const r = s.runs.find((x) => x.id === p.id);
    if (!r || !["active", "blocked"].includes(r.status))
      fail("只能取消正在执行的记录");
    r.status = "cancelled";
    const st = getItem(s, runTargetId(r));
    transition(s, st, "todo");
    st.updatedAt = now();
    addEvent(s, r.projectId, "ai", "取消执行", r.agent, st.id);
    out = r;
  } else if (type === "review") {
    const st = getItem(s, p.storyId);
    if (!isExecutionItem(st, projectOf(s, st))) fail("只能验收执行层工作项及子任务");
    if (terminal(st, projectOf(s, st)))
      fail("故事已结束，不能重复验收");
    if (
      !p.runId &&
      s.runs.some((r) => runTargetId(r) === st.id && r.status === "review")
    )
      fail("请审核待验收的具体交付记录");
    const run = p.runId
      ? s.runs.find((x) => x.id === p.runId && runTargetId(x) === st.id)
      : null;
    if (p.runId && (!run || run.status !== "review"))
      fail("交付不存在或已经审核");
    if (cat(s, st) !== "review") fail("请先将故事提交为待验收");
    if (!["accept", "changes"].includes(p.decision)) fail("无效审核决定");
    if (
      p.decision === "accept" &&
      run &&
      (run.storyVersion !== storyOf(s, st).contentVersion || (run.itemVersion !== undefined && run.itemVersion !== st.contentVersion)) &&
      !p.acknowledgeVersion
    )
      fail("交付基于旧版故事，请明确确认版本差异");
    const review = {
      id: uid("review"),
      decision: p.decision,
      comment: required(p.comment, "审核意见"),
      author: "我",
      at: now(),
      storyVersion: st.contentVersion,
    };
    if (run) {
      run.reviews.push(review);
      run.status = p.decision === "accept" ? "accepted" : "changes";
    }
    transition(s, st, p.decision === "accept" ? "done" : "active");
    st.updatedAt = now();
    if (p.decision === "accept") st.completedAt = now();
    if (p.decision === "accept") completeAcceptedAiSubtasks(s, st, run, review);
    addEvent(
      s,
      st.projectId,
      "review",
      p.decision === "accept" ? "人工验收通过" : "要求修改",
      review.comment,
      st.id,
    );
    if(p.decision==='accept'&&run)closeSupersededRuns(s,run);
    snapshot(s, storyOf(s, st).sprintId);
    out = review;
  } else fail("未知操作");
  validate(s);
  for (const item of s.items) {
    const changes = itemActivityChanges(activityBefore, s, item);
    let event = s.events.find(e => !previousEventIds.has(e.id) && e.itemId === item.id && !e.automatic);
    if (!changes.length) {
      if (event && ['item.update','item.move'].includes(type) && item.id === p.id) s.events = s.events.filter(e => e.id !== event.id);
      continue;
    }
    if (!event) {
      addEvent(s, item.projectId, 'item', `更新${typeNames(projectOf(s,item))[item.kind]}`, '', item.id);
      event = s.events[0];
    }
    event.changes = changes;
    if (event.detail) event.note = event.detail;
    event.detail = activityDetail(changes, event.note);
  }
  for(const event of s.events)if(!previousEventIds.has(event.id)&&!event.automatic)event.actor=String((type.startsWith('run.')?p.agent:a.actor)||'我').slice(0,120);
  return out;
}
function scope(s, i, oldId, newId, reason) {
  if (oldId === newId) return;
  for (const [id, action] of [
    [oldId, "移出"],
    [newId, "加入"],
  ]) {
    const sp = s.sprints.find((x) => x.id === id);
    if (sp?.status === "active")
      sp.scopeChanges.push({
        at: now(),
        storyId: i.id,
        title: i.title,
        points: i.points,
        action,
        reason,
      });
  }
  snapshot(s, oldId);
  snapshot(s, newId);
}

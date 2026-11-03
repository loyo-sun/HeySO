import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createStore } from "../server/store.mjs";
import { seed, context, storiesIn } from "../server/model.mjs";
import { migrateState } from "../server/migrate.mjs";
import { configFor, checkWorkConfig, defaultWorkConfig, hierarchyConflicts, planTypeHierarchy } from "../shared/work-config.mjs";

function fresh(t, input) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "heyso-workitems-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "workspace.json");
  if (input) fs.writeFileSync(file, JSON.stringify(input));
  return { store: createStore(file), file, dir };
}
const act = (s, type, payload) => s.dispatch({ type, payload }).result;
const project = (s) => s.read().projects[0];
const config = (s) => structuredClone(project(s).workConfig);
const saveConfig = (s, c, extra = {}) => act(s, "project.workConfig", { id: project(s).id, config: c, ...extra });
function make(s, kind, extra = {}) {
  const p = project(s);
  return act(s, "item.create", { projectId: p.id, kind, title: kind + " test", owner: p.owner, startDate: p.startDate, endDate: p.endDate, acceptance: "结果可验收", ...extra });
}
function addStatus(c, id, category) {
  c.statuses.push({ id, name: id, category: category === "active" ? "in_progress" : category, enabled: true });
}
function replaceStatus(c, from, to) {
  for (const w of c.workflows) {
    w.statusIds = w.statusIds.map(id => id === from ? to : id);
    if(w.initialStatus === from) w.initialStatus = to;
    for(const e of w.transitions) { if(e.from === from)e.from = to; if(e.to === from)e.to = to; }
    for(const key of Object.keys(w.rules?.nodes || {}))if(w.rules.nodes[key] === from)w.rules.nodes[key] = to;
  }
  c.statuses.find(s => s.id === from).enabled = false;
}

test("migration: V1 tasks become subtasks without changing IDs, associations, history or dates; backup is automatic and idempotent", (t) => {
  const legacy = seed(); legacy.schemaVersion = 1; legacy.revision = 41;
  for (const p of legacy.projects) delete p.workConfig;
  for (const i of legacy.items) if (i.kind === "subtask") i.kind = "task";
  legacy.items.find((i) => i.id === "t1").endDate = legacy.projects[0].endDate;
  const { store, file, dir } = fresh(t, legacy), next = store.read();
  assert.equal(next.schemaVersion, 4); assert.equal(next.revision, 42);
  for (const key of ["items", "runs", "sprints", "releases", "notes", "events"]) assert.equal(next[key].length, legacy[key].length);
  assert.deepEqual(next.items.map((i) => i.id), legacy.items.map((i) => i.id));
  assert.deepEqual(next.runs, legacy.runs); assert.deepEqual(next.sprints, legacy.sprints);
  const oldTask = legacy.items.find((i) => i.id === "t1"), task = next.items.find((i) => i.id === "t1");
  assert.equal(task.kind, "subtask"); assert.equal(task.parentId, oldTask.parentId);
  assert.equal(task.endDate, oldTask.endDate); assert.equal(task.legacyParentDates, true);
  const backups = fs.readdirSync(path.join(dir, "backups"));
  assert.equal(backups.length, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, "backups", backups[0]), "utf8")), legacy);
  assert.deepEqual(createStore(file).read(), next);
  assert.equal(fs.readdirSync(path.join(dir, "backups")).length, 1);
  assert.deepEqual(migrateState(next), next);
});

test("types: task and bug are independent executable peers; children require an executable parent", (t) => {
  const { store: s } = fresh(t);
  const task = make(s, "task"), bug = make(s, "bug", { parentId: "ep1" });
  assert.ok(task.number > 12 && bug.number > task.number);
  const child = make(s, "subtask", { parentId: task.id });
  assert.equal(context(s.read(), child.id).story.id, task.id);
  assert.equal(context(s.read(), child.id).tasks[0].id, child.id);
  for (const parentId of [null, "ep1", child.id]) {
    const before = s.read();
    assert.throws(() => make(s, "subtask", { parentId }), /父级/);
    assert.deepEqual(s.read(), before);
  }
});

test("hierarchy: moves validate project, parent type, self/cycles and parent dates atomically", (t) => {
  const { store: s } = fresh(t), task = make(s, "task");
  const before = s.read();
  for (const parentId of [task.id, "s1", "t1"]) {
    assert.throws(() => act(s, "item.move", { id: task.id, projectId: project(s).id, parentId }), /父级/);
    assert.deepEqual(s.read(), before);
  }
  assert.throws(() => act(s, "item.move", { id: task.id, projectId: "other", parentId: null }), /当前项目/);
  assert.throws(() => act(s, "item.move", { id: "ep1", projectId: project(s).id, parentId: "f1" }), /父级/);
  act(s, "item.move", { id: task.id, projectId: project(s).id, parentId: "ep1" });
  assert.equal(s.read().items.find((i) => i.id === task.id).parentId, "ep1");
  const short = make(s, "task", { startDate: "2026-10-29", endDate: "2026-10-30" });
  assert.throws(() => act(s, "item.move", { id: "t1", projectId: project(s).id, parentId: short.id }), /周期/);
});

test("types: custom execution type supports sprint planning, AI submission and human acceptance", (t) => {
  const { store: s } = fresh(t), c = config(s);
  c.types.push({ id: "research", name: "调研", level: 0, enabled: true });
  saveConfig(s, c);
  const item = make(s, "research", { parentId: "ep1", sprintId: "sp2", aiEnabled: true });
  act(s, "item.update", { id: item.id, aiEnabled: true });
  assert.ok(storiesIn(s.read(), "sp2").some((i) => i.id === item.id));
  const current = context(s.read(), item.id).story;
  const run = act(s, "run.submit", { itemId: item.id, storyVersion: current.contentVersion, agent: "test", summary: "交付", verification: "已检查", requestId: "research-delivery" });
  act(s, "review", { storyId: item.id, runId: run.id, decision: "accept", comment: "满足标准" });
  assert.equal(s.read().items.find((i) => i.id === item.id).status, "done");
});

test("configuration: existing types and relationships cannot be stranded or silently deleted", (t) => {
  const { store: s } = fresh(t);
  let c = config(s); c.types.find((t) => t.id === "story").enabled = false;
  assert.throws(() => saveConfig(s, c), /仍在使用/);
  c = config(s); c.types.find((t) => t.id === "feature").level = 2;
  const before = s.read();
  assert.throws(() => saveConfig(s, c), /父级/);
  assert.deepEqual(s.read(), before);
  c = config(s); c.levels = c.levels.filter((l) => l.rank !== 1);
  assert.throws(() => saveConfig(s, c), /必须属于/);
});

test("workflow: custom active and done statuses work throughout AI, review and statistics; direct completion is blocked", (t) => {
  const { store: s } = fresh(t), c = config(s);
  addStatus(c, "building", "active"); addStatus(c, "verified", "done");
  replaceStatus(c, "active", "building");
  replaceStatus(c, "done", "verified");
  saveConfig(s, c, { statusMigration: { active: "building", done: "verified" } });
  assert.equal(s.read().items.find((i) => i.id === "s4").status, "building");
  const task = make(s, "task"); act(s, "item.update", { id: task.id, aiEnabled: true });
  assert.throws(() => act(s, "item.update", { id: task.id, status: "verified" }), /人工验收/);
  const version = context(s.read(), task.id).story.contentVersion;
  act(s, "run.progress", { itemId: task.id, storyVersion: version, agent: "test", message: "执行中" });
  assert.equal(s.read().items.find((i) => i.id === task.id).status, "building");
  const run = act(s, "run.submit", { itemId: task.id, storyVersion: version, agent: "test", summary: "完成", verification: "已检查", requestId: "custom-workflow" });
  act(s, "review", { storyId: task.id, runId: run.id, decision: "accept", comment: "通过" });
  assert.equal(s.read().items.find((i) => i.id === task.id).status, "verified");
});

test("workflow: forbidden transitions block manual and AI writes with rollback", (t) => {
  const { store: s } = fresh(t), c = config(s);
  const w = c.workflows.find(w => w.id === "legacy"); w.transitions = w.transitions.filter(e => e.from !== "backlog" || !["active", "blocked"].includes(e.to));
  saveConfig(s, c);
  const task = make(s, "task"); act(s, "item.update", { id: task.id, aiEnabled: true });
  const before = s.read();
  assert.throws(() => act(s, "item.update", { id: task.id, status: "active" }), /不允许/);
  assert.throws(() => act(s, "run.progress", { itemId: task.id, storyVersion: task.contentVersion, agent: "test", message: "开始" }), /不允许/);
  assert.deepEqual(s.read(), before);
});

test("workflow: disabling in-use statuses requires explicit migration; invalid graphs are rejected", (t) => {
  const { store: s } = fresh(t), c = config(s);
  addStatus(c, "building", "active"); replaceStatus(c, "active", "building");
  const before = s.read();
  assert.throws(() => saveConfig(s, c), /迁移目标/);
  assert.deepEqual(s.read(), before);
  assert.throws(() => saveConfig(s, c, { statusMigration: { active: "missing" } }), /迁移目标/);
  const stranded = config(s); stranded.workflows[0].initialStatus = "missing";
  assert.throws(() => checkWorkConfig(stranded), /初始状态/);
  const duplicate = config(s); duplicate.statuses[0].name = duplicate.statuses[1].name;
  assert.throws(() => checkWorkConfig(duplicate), /不能重复/);
});

test("hierarchy: moving an executable subtree invalidates descendant AI context while retaining delivery records", (t) => {
  const { store: s } = fresh(t);
  const before = context(s.read(), "s3").story.contentVersion, runs = s.read().runs;
  act(s, "item.move", { id: "f2", projectId: project(s).id, parentId: "ep2" });
  assert.equal(context(s.read(), "s3").story.contentVersion, before + 1);
  assert.deepEqual(s.read().runs, runs);
  assert.equal(context(s.read(), "s3").hierarchy[1].id, "ep2");
});

test("type colors persist across restart and invalid colors cannot overwrite configuration", (t) => {
  const { store: s, file } = fresh(t);
  const c = config(s); c.types.find((x) => x.id === "task").color = "#5279C7";
  saveConfig(s, c);
  assert.equal(createStore(file).read().projects[0].workConfig.types.find((x) => x.id === "task").color, "#5279C7");
  const before = s.read();
  c.types[0].color = "red; background:url(x)";
  assert.throws(() => saveConfig(s, c), /颜色/);
  assert.deepEqual(s.read(), before);
});

test("restore accepts a V1 backup and retains the current workspace in a recovery backup", (t) => {
  const { store: s, dir } = fresh(t);
  const before = s.read(), legacy = seed(); legacy.schemaVersion = 1;
  for (const p of legacy.projects) delete p.workConfig;
  for (const i of legacy.items) if (i.kind === "subtask") i.kind = "task";
  const restored = s.restore(legacy, before.revision);
  assert.equal(restored.schemaVersion, 4);
  assert.deepEqual(restored.items.map((x) => x.id), legacy.items.map((x) => x.id));
  const backups = fs.readdirSync(path.join(dir, "backups"));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, "backups", backups[0]), "utf8")), before);
});

test("parking types hides creation options while preserving existing work items and hierarchy", (t) => {
  const { store: s, file } = fresh(t);
  const before = s.read(), c = config(s); c.types.find((x) => x.id === "feature").hidden = true;
  saveConfig(s, c);
  for (const item of before.items) {
    const next = s.read().items.find((x) => x.id === item.id);
    assert.equal(next.kind, item.kind); assert.equal(next.parentId, item.parentId); assert.equal(next.title, item.title);
  }
  assert.throws(() => make(s, "feature"), /展示/);
  assert.equal(createStore(file).read().projects[0].workConfig.types.find((x) => x.id === "feature").hidden, true);
  const restored = config(s); restored.types.find((x) => x.id === "feature").hidden = false; saveConfig(s, restored);
  assert.equal(make(s, "feature").kind, "feature");
  const allHidden = config(s); for (const type of allHidden.types) if (type.level === 0) type.hidden = true;
  assert.throws(() => saveConfig(s, allHidden), /至少展示/);
});


test("hierarchy impact preview lists incompatible existing parents and leaves hidden types conflict-free", () => {
  const s = seed(), p = s.projects[0], c = structuredClone(p.workConfig);
  c.types.find((t) => t.id === "feature").level = 2;
  const conflicts = hierarchyConflicts(p, s.items, c);
  assert.ok(conflicts.length > 0);
  assert.ok(conflicts.every(({ item }) => item.kind === "feature"));
  const hidden = structuredClone(p.workConfig); hidden.types.find((t) => t.id === "feature").hidden = true;
  assert.deepEqual(hierarchyConflicts(p, s.items, hidden), []);
});


test("smart hierarchy archives unused types, preserves actual parent rules and leaves data untouched", () => {
  const state = seed(), p = state.projects[0];
  const c = structuredClone(p.workConfig);
  c.types.find((t) => t.id === "story").name = "用户需求";
  c.types.find((t) => t.id === "story").color = "#CD5966";
  c.types.find((t) => t.id === "story").icon = "rocket";
  c.types.push({id:"initiative",name:"计划",level:3,enabled:true});
  const items = structuredClone(state.items);
  items.push({id:"new_parent",projectId:p.id,kind:"initiative",title:"自定义计划"});
  items.find((i) => i.kind === "story").parentId = "new_parent";
  const original = structuredClone({c, items});
  const next = planTypeHierarchy(c, items);
  assert.equal(next.types.find((t) => t.id === "task").hidden, true);
  assert.equal(next.types.find((t) => t.id === "bug").hidden, true);
  assert.equal(next.types.find((t) => t.id === "initiative").hidden, false);
  const story = next.types.find((t) => t.id === "story");
  assert.equal(story.name, "用户需求"); assert.equal(story.color, "#CD5966"); assert.equal(story.icon, "rocket");
  assert.equal(story.level, 0);
  assert.equal(next.types.find((t) => t.id === "initiative").level, 3);
  assert.deepEqual(hierarchyConflicts(p, items, next), []);
  assert.deepEqual(next.statuses, c.statuses); assert.deepEqual(next.workflows, c.workflows); assert.deepEqual(next.workflowScheme,c.workflowScheme);
  checkWorkConfig(next); assert.deepEqual({c, items}, original);
});

test("default hierarchy restores archived types without resetting custom appearance or existing associations", () => {
  const state = seed(), p = state.projects[0], c = structuredClone(p.workConfig);
  for (const type of c.types) { type.hidden = true; type.enabled = false; }
  c.types.find((t) => t.id === "story").icon = "code";
  const next = planTypeHierarchy(c, state.items, "default");
  assert.ok(next.types.every((t) => t.enabled && !t.hidden));
  assert.equal(next.types.find((t) => t.id === "story").icon, "code");
  assert.deepEqual(hierarchyConflicts(p, state.items, next), []); checkWorkConfig(next);
  const empty = planTypeHierarchy(c, []);
  assert.equal(empty.types.filter((t) => !t.hidden).length, 1);
  assert.equal(empty.types.find((t) => !t.hidden).id, "story"); checkWorkConfig(empty);
});

test("type icons and archive status persist; invalid icons cannot alter saved configuration", (t) => {
  const {store:s, file} = fresh(t), c = config(s);
  c.types.find((t) => t.id === "story").icon = "rocket";
  c.types.find((t) => t.id === "task").hidden = true;
  saveConfig(s, c);
  const reloaded = createStore(file).read().projects[0].workConfig;
  assert.equal(reloaded.types.find((t) => t.id === "story").icon, "rocket");
  assert.equal(reloaded.types.find((t) => t.id === "task").hidden, true);
  const before = s.read(); c.types[0].icon = "unsupported";
  assert.throws(() => saveConfig(s, c), /图标/); assert.deepEqual(s.read(), before);
});

test("new projects use three grouping levels and standard types are peers with inherited icons", (t) => {
  const {store:s} = fresh(t);
  const p = act(s, "project.create", {name:"三级项目",goal:"验证分组",startDate:"2026-10-29",endDate:"2026-12-31"});
  assert.deepEqual(p.workConfig.levels.map((l) => l.rank), [1, 0, -1]);
  assert.deepEqual(p.workConfig.types.filter((x) => x.enabled && !x.hidden).map((x) => x.id), ["epic", "story", "task", "bug", "subtask"]);
  assert.ok(p.workConfig.types.every((x) => !Object.hasOwn(x, "parents")));
  const makeInProject = (kind, extra = {}) => act(s, "item.create", {projectId:p.id,kind,title:kind,owner:p.owner,startDate:p.startDate,endDate:p.endDate,...extra});
  const epic = makeInProject("epic"), story = makeInProject("story",{parentId:epic.id}), task = makeInProject("task",{parentId:epic.id}), bug = makeInProject("bug",{parentId:epic.id});
  for (const parent of [story, task, bug]) assert.equal(makeInProject("subtask",{parentId:parent.id}).parentId,parent.id);
  assert.throws(() => makeInProject("task",{parentId:story.id}),/父级/);
  assert.throws(() => makeInProject("subtask",{parentId:epic.id}),/父级/);
});

test("type-to-level assignment keeps appearance, records configuration history and rejects semantic changes for used types", (t) => {
  const {store:s} = fresh(t), c = config(s);
  c.types.find((x) => x.id === "task").icon = "code";
  c.types.find((x) => x.id === "task").color = "#CD5966";
  c.types.find((x) => x.id === "task").level = 2;
  saveConfig(s,c);
  const p = project(s);
  assert.equal(p.hierarchyRevision,2);
  assert.equal(p.hierarchyHistory[0].types.find((x) => x.id === "task").level,0);
  assert.equal(p.workConfig.types.find((x) => x.id === "task").icon,"code");
  assert.equal(p.workConfig.types.find((x) => x.id === "task").color,"#CD5966");
  const planningTask = make(s,"task");
  assert(Number.isSafeInteger(planningTask.number) && planningTask.number > 0);
  const next = config(s); next.types.find((x) => x.id === "task").level = 0;
  const before = s.read(); assert.throws(() => saveConfig(s,next),/跨规划/); assert.deepEqual(s.read(),before);
  const broken = config(s); broken.levels.push({...broken.levels[0],id:"duplicate"});
  assert.throws(() => saveConfig(s,broken),/不能重复/);
});

test("V2 hierarchy migration removes type parent rules and retains every work item and custom icon", (t) => {
  const old = seed(); old.schemaVersion = 2;
  for(const p of old.projects) {
    delete p.workConfig.levels; delete p.workConfig.hierarchyVersion;
    p.workConfig.types.find((x) => x.id === "story").icon = "rocket";
    p.workConfig.types.find((x) => x.id === "story").color = "#5279C7";
    for(const type of p.workConfig.types) type.parents = p.workConfig.types.filter((x) => x.level > type.level && (type.level !== -1 || x.level === 0)).map((x) => x.id);
  }
  const {store:s,file,dir} = fresh(t,old), next = s.read();
  assert.equal(next.schemaVersion,4); assert.deepEqual(next.items,old.items); assert.deepEqual(next.runs,old.runs);
  assert.equal(next.projects[0].workConfig.types.find((x) => x.id === "story").icon,"rocket");
  assert.equal(next.projects[0].workConfig.types.find((x) => x.id === "story").color,"#5279C7");
  assert.ok(next.projects[0].workConfig.types.every((x) => !Object.hasOwn(x,"parents")));
  assert.deepEqual(createStore(file).read(),next);
  assert.equal(fs.readdirSync(path.join(dir,"backups")).length,1);
});

test('linked roadmap dates keep descendants inside their parent, preserve unaffected dates and persist atomically', (t) => {
  const { store: s, file } = fresh(t), p = project(s);
  const day = n => new Date(Date.parse(p.startDate + 'T00:00:00Z') + n * 86400000).toISOString().slice(0,10);
  const epic = make(s, 'epic', { startDate: day(0), endDate: day(60) });
  const bug = make(s, 'bug', { parentId: epic.id, startDate: day(0), endDate: day(30) });
  const child = make(s, 'subtask', { parentId: bug.id, startDate: day(0), endDate: day(30) });
  const untouched = make(s, 'subtask', { parentId: bug.id, startDate: day(12), endDate: day(14) });
  const before = s.read();
  assert.throws(() => act(s,'item.update',{ id:bug.id,startDate:day(5),endDate:day(30) }), /超出父级/);
  assert.deepEqual(s.read(),before);
  act(s,'item.update',{ id:bug.id,startDate:day(5),endDate:day(30),scheduleMode:'start' });
  assert.equal(s.read().items.find(i=>i.id===child.id).startDate,day(5));
  assert.deepEqual(s.read().items.find(i=>i.id===untouched.id),untouched);
  assert.equal(s.read().items.find(i=>i.id===epic.id).startDate,day(0));
  act(s,'item.update',{ id:bug.id,startDate:day(8),endDate:day(33),scheduleMode:'move' });
  assert.equal(s.read().items.find(i=>i.id===child.id).startDate,day(8));
  assert.equal(s.read().items.find(i=>i.id===untouched.id).startDate,day(15));
  const beforeGrow = s.read().items.filter(i=>i.parentId===bug.id);
  act(s,'item.update',{ id:bug.id,startDate:day(8),endDate:day(40),scheduleMode:'end' });
  assert.deepEqual(s.read().items.filter(i=>i.parentId===bug.id),beforeGrow);
  // Nested planning/execution/subtask ranges all fit, including a one-day parent.
  act(s,'item.update',{ id:epic.id,startDate:day(20),endDate:day(60),scheduleMode:'start' });
  for (const id of [bug.id,child.id,untouched.id]) assert.ok(s.read().items.find(i=>i.id===id).startDate>=day(20));
  act(s,'item.update',{ id:bug.id,startDate:day(20),endDate:day(20),scheduleMode:'end' });
  for (const i of s.read().items.filter(i=>i.parentId===bug.id)) assert.equal(i.endDate,day(20));
  const saved=s.read();
  assert.throws(()=>act(s,'item.update',{id:bug.id,startDate:day(19),endDate:day(20),scheduleMode:'start'}),/超出父级/);
  assert.deepEqual(s.read(),saved);
  assert.throws(()=>act(s,'item.update',{id:bug.id,startDate:day(20),endDate:day(22),scheduleMode:'move'}),/不匹配/);
  assert.deepEqual(s.read(),saved);
  assert.deepEqual(createStore(file).read(),saved);
});

test('activity stores exact before/after values, readable associations, empty text and zero without duplicate no-op logs', (t) => {
  const { store: s, file } = fresh(t), p = project(s);
  const item = make(s,'task',{ description:'第一行\n原描述', acceptance:'原验收', points:0, priority:'low' });
  const epic = make(s,'epic',{ title:'归属史诗' });
  const saved = act(s,'item.update',{ id:item.id,title:'新的标题',description:'修改后的\n完整描述',acceptance:'',priority:'high',points:3,parentId:epic.id,aiEnabled:true,reason:'规划调整' });
  const event = s.read().events.find(e=>e.itemId===item.id);
  const changes = Object.fromEntries(event.changes.map(c=>[c.field,c]));
  assert.equal(changes.title.before,item.title); assert.equal(changes.title.after,'新的标题');
  assert.equal(changes.description.before,'第一行\n原描述'); assert.equal(changes.description.after,'修改后的\n完整描述');
  assert.equal(changes.acceptance.beforeText,'原验收'); assert.equal(changes.acceptance.afterText,'未设置');
  assert.equal(changes.points.beforeText,'0'); assert.equal(changes.points.afterText,'3');
  assert.equal(changes.priority.beforeText,'低'); assert.equal(changes.priority.afterText,'高');
  assert.equal(changes.parentId.beforeText,'根层级 / 未归类');
  assert.equal(changes.parentId.afterText,`${p.code}-${epic.number} · 归属史诗`);
  assert.equal(changes.aiEnabled.beforeText,'关闭'); assert.equal(changes.aiEnabled.afterText,'开启');
  assert.equal(event.note,'原因：规划调整');
  assert.ok(event.detail.includes('优先级：低 → 高'));
  const count=s.read().events.length;
  act(s,'item.update',{id:item.id,title:saved.title,description:saved.description,points:3});
  assert.equal(s.read().events.length,count);
  act(s,'item.update',{id:epic.id,title:'后来改名的史诗'});
  assert.equal(s.read().events.find(e=>e.id===event.id).changes.find(c=>c.field==='parentId').afterText,`${p.code}-${epic.number} · 归属史诗`);
  assert.deepEqual(createStore(file).read().events.find(e=>e.id===event.id),event);
  const before=s.read();
  assert.throws(()=>act(s,'item.update',{id:item.id,title:''}),/标题/);
  assert.deepEqual(s.read(),before);
});

test('linked date changes write each affected item activity with precise dates and retain old events', (t) => {
  const { store:s }=fresh(t), p=project(s);
  const day=n=>new Date(Date.parse(p.startDate+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
  const parent=make(s,'task',{startDate:day(0),endDate:day(30)});
  const child=make(s,'subtask',{parentId:parent.id,startDate:day(0),endDate:day(30)});
  const oldEvents=s.read().events;
  act(s,'item.update',{id:parent.id,startDate:day(3),endDate:day(30),scheduleMode:'start'});
  for(const id of [parent.id,child.id]){
    const event=s.read().events.find(e=>e.itemId===id);
    assert.equal(event.changes.length,1);
    assert.equal(event.changes[0].field,'startDate');
    assert.equal(event.changes[0].before,day(0)); assert.equal(event.changes[0].after,day(3));
  }
  for(const event of oldEvents)assert.deepEqual(s.read().events.find(e=>e.id===event.id),event);
});

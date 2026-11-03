import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "../server/model.mjs";
import { workItemEntries, executionInstruction } from "../src/work-item-actions.mjs";
import { workflowFor, workflowStatuses, allowedTransition, categoryOf, isSubtask } from "../shared/work-config.mjs";

function setup(id = "s6", snapshot = false) {
  const data = seed();
  const item = data.items.find((x) => x.id === id);
  const project = data.projects.find((x) => x.id === item.projectId);
  const calls = [];
  const handlers = Object.fromEntries(["copy","snapshot","open","update","move","create","edit","deliveries","remove"].map((key) => [key,(...args) => calls.push([key,...args])]));
  const build = () => workItemEntries({item,project,data,snapshot,handlers});
  return {data,item,project,calls,build};
}
const find = (entries,label) => entries.find((e) => e.label === label);

test("history snapshots expose read-only operations and keep snapshot titles", () => {
  const c = setup("s6",true);
  const snapshot = {...c.data.items.find((i) => i.id === "s6"),title:"历史标题"};
  let copied;
  const entries = workItemEntries({item:snapshot,snapshot:true,project:c.project,data:c.data,handlers:{copy:(s)=>copied=s}});
  assert.deepEqual(entries.map((e) => e.label),["查看历史快照","查看当前工作项","复制"]);
  find(entries,"复制").children[1].run();
  assert.equal(copied,"历史标题");
  c.data.items = c.data.items.filter((i) => i.id !== snapshot.id);
  assert.equal(find(c.build(),"查看当前工作项").disabled,true);
});

test("status menu follows workflow transitions and requires human acceptance", () => {
  const c = setup();
  for (const status of workflowStatuses(c.project,c.item.kind)) {
    c.item.status = status.id;
    const options = find(c.build(),"修改状态").children;
    assert(options.every((e) => workflowStatuses(c.project,c.item.kind).some((s) => s.name === e.label && s.id !== status.id && allowedTransition(c.project,status.id,s.id,c.item.kind))));
    for (const e of options) {
      const target = workflowStatuses(c.project,c.item.kind).find((s) => s.name === e.label);
      if (workflowFor(c.project,c.item.kind).rules?.requireReview && categoryOf(c.project,target.id,c.item.kind) === "done" && categoryOf(c.project,status.id,c.item.kind) !== "done") assert.equal(e.disabled,true);
    }
  }
});

test("scope selection excludes closed sprints and released versions; clear is explicit", () => {
  const c = setup();
  c.data.sprints[0].status = "closed";
  c.data.releases[0].status = "released";
  const sprint = find(c.build(),"安排到 Sprint");
  const version = find(c.build(),"安排到版本");
  assert(!sprint.children.some((e) => e.label === c.data.sprints[0].name));
  assert(!version.children.some((e) => e.label === c.data.releases[0].name));
  sprint.children[0].run(); version.children[0].run();
  assert.deepEqual(c.calls,[["update",c.item.id,{sprintId:null}],["update",c.item.id,{releaseId:null}]]);
});

test("subtasks cannot clear parents, create children or change sprint/version", () => {
  const c = setup();
  c.item.kind = "subtask"; c.item.parentId = "s1";
  assert(isSubtask(c.item,c.project));
  const entries = c.build();
  for (const label of ["安排到 Sprint","安排到版本","设置故事点","新建子任务"]) assert.equal(find(entries,label),undefined);
  assert.equal(find(entries,"修改父级"),undefined);
});

test("deletion is disabled for children, execution records and sprint baselines", () => {
  for (const relation of ["child","run","baseline"]) {
    const c = setup();
    c.data.items = c.data.items.filter((i) => i.parentId !== c.item.id);
    c.data.runs = [];
    for (const s of c.data.sprints) s.baseline = [];
    assert.equal(!!find(c.build(),"删除工作项…").disabled,false);
    if (relation === "child") c.data.items.push({id:"child",projectId:c.project.id,parentId:c.item.id});
    if (relation === "run") c.data.runs.push({id:"run",storyId:c.item.id});
    if (relation === "baseline") c.data.sprints[0].baseline.push({id:c.item.id});
    assert.equal(find(c.build(),"删除工作项…").disabled,true);
  }
});


test("menus omit hierarchy/type/child creation and always offer scope and owner search", () => {
  const c = setup();
  const entries = c.build();
  for (const label of ["修改父级","转换工作项类型","新建子任务","新建下级工作项"]) assert.equal(find(entries,label),undefined);
  for (const label of ["设置负责人","安排到 Sprint","安排到版本"]) assert.equal(find(entries,label).searchable,true);
  assert(executionInstruction(c.project,c.item).includes(c.item.title));
});

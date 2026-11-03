import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createStore } from "../server/store.mjs";
import { defaultMemberRole } from "../shared/member-roles.mjs";
import { context } from "../server/model.mjs";

function fresh(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "heyso-settings-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "workspace.json");
  return { store: createStore(file), file };
}
const update = (store, payload) => store.dispatch({ type: "project.update", payload: { id: "p_heyso", ...payload } });

test("settings: normalized edits persist; invalid values leave the saved project intact", (t) => {
  const { store, file } = fresh(t);
  update(store, { name: "  合序项目  ", description: "  新背景  " });
  assert.equal(createStore(file).read().projects[0].name, "合序项目");
  assert.equal(store.read().projects[0].description, "新背景");
  for (const payload of [{ name: " " }, { goal: 123 }, { description: {} }, { name: "名".repeat(121) }]) {
    const before = store.read();
    assert.throws(() => update(store, payload));
    assert.deepEqual(store.read(), before);
  }
});

test("settings: member changes protect ownership and existing assignments", (t) => {
  const { store } = fresh(t);
  update(store, { members: ["我", "林溪", "陈默", "  新同事  "], owner: "新同事" });
  assert.equal(store.read().projects[0].members.at(-1), "新同事");
  const before = store.read();
  for (const payload of [
    { members: [] }, { members: ["我", " 我 "] }, { owner: "名册外的人" },
    { members: ["我", "林溪", "新同事"] }, { members: ["我", "林溪", 5] },
  ]) {
    assert.throws(() => update(store, payload));
    assert.deepEqual(store.read(), before);
  }
  update(store, { owner: "我", members: ["我", "林溪", "陈默"] });
  assert.equal(store.read().projects[0].members.length, 3);
  assert.throws(() => store.dispatch({ type: "item.update", payload: { id: "s1", owner: "名册外的人" } }), /成员名册/);
});

test("settings: changed working rules reach AI context and invalidate prior story versions", (t) => {
  const { store } = fresh(t);
  const before = context(store.read(), "s1");
  update(store, { workingAgreements: "先报告计划，阻塞时说明原因。", definitionOfDone: "验收标准满足，且提供验证记录。" });
  const after = context(store.read(), "s1");
  assert.equal(after.project.workingAgreements, "先报告计划，阻塞时说明原因。");
  assert.equal(after.story.contentVersion, before.story.contentVersion + 1);
  update(store, { workingAgreements: after.project.workingAgreements });
  assert.equal(context(store.read(), "s1").story.contentVersion, after.story.contentVersion);
  assert.throws(() => update(store, { definitionOfDone: " " }), /完成定义/);
});

test("settings: member and name edits preserve story versions; context edits remain project scoped", (t) => {
  const { store } = fresh(t);
  const before = store.read();
  update(store, { name: "改名", owner: "林溪" });
  assert.deepEqual(store.read().items.map((i) => i.contentVersion), before.items.map((i) => i.contentVersion));
  const p = store.read().projects[0];
  const other = store.dispatch({ type: "project.create", payload: { name: "其他项目", goal: "保持独立", startDate: p.startDate, endDate: p.endDate } }).result;
  store.dispatch({ type: "project.update", payload: { id: other.id, workingAgreements: "其他项目的约定" } });
  assert.equal(store.read().projects.find((p) => p.id === "p_heyso").workingAgreements, "");
});

test("settings: stale backup confirmation cannot overwrite newer changes", (t) => {
  const { store } = fresh(t);
  const backup = store.read(), checkedRevision = backup.revision;
  update(store, { name: "备份预览后的更改" });
  const latest = store.read();
  assert.throws(() => store.restore(backup, checkedRevision), /已有更新/);
  assert.deepEqual(store.read(), latest);
});

test("settings: member positions persist, remain project scoped and do not change ownership", (t) => {
  const { store, file } = fresh(t);
  const before = store.read();
  const pr = before.projects[0];
  const other = store.dispatch({ type: "project.create", payload: { name: "独立项目", goal: "验证角色隔离", startDate: pr.startDate, endDate: pr.endDate } }).result;
  update(store, { roles: [...pr.roles, { id: "technical_lead", name: "  技术负责人  ", description: "负责技术方案" }], memberRoles: { "我": "technical_lead", "林溪": "role_product", "陈默": "role_test" } });
  const reopened = createStore(file).read();
  assert.equal(reopened.projects[0].memberRoles["我"], "technical_lead");
  assert.equal(reopened.projects[0].owner, before.projects[0].owner);
  assert.deepEqual(reopened.items, before.items);
  assert.equal(reopened.projects.find((p) => p.id === other.id).memberRoles["我"], defaultMemberRole);
  assert.equal(context(reopened, "s1").project.memberRoles["林溪"], "role_product");
  update(store, { members: [...pr.members, "新同事"] });
  assert.equal(store.read().projects[0].memberRoles["新同事"], defaultMemberRole);
  update(store, { members: pr.members });
  assert.equal(Object.hasOwn(store.read().projects[0].memberRoles, "新同事"), false);
});

test("settings: invalid member positions cannot overwrite saved data or be restored", (t) => {
  const { store } = fresh(t);
  const before = store.read();
  const roles = before.projects[0].memberRoles;
  for (const memberRoles of [null, [], "开发", {}, { ...roles, "我": " " }, { ...roles, "我": 7 }, { ...roles, "我": "字".repeat(41) }, { ...roles, "外部成员": "经理" }]) {
    assert.throws(() => update(store, { memberRoles }), /角色/);
    assert.deepEqual(store.read(), before);
    const bad = structuredClone(before);
    bad.projects[0].memberRoles = memberRoles;
    assert.throws(() => store.restore(bad, before.revision), /角色/);
    assert.deepEqual(store.read(), before);
  }
});

test("settings: existing workspaces and old backups gain positions without losing data", (t) => {
  const { store, file } = fresh(t);
  const legacy = store.read();
  delete legacy.projects[0].roles;
  legacy.projects[0].memberRoles = { "我": "技术负责人", "林溪": "产品经理", "陈默": "项目成员" };
  fs.writeFileSync(file, JSON.stringify(legacy));
  const reopened = createStore(file);
  const migrated = reopened.read();
  assert.equal(migrated.projects[0].roles.find((r) => r.id === migrated.projects[0].memberRoles["我"]).name, "技术负责人");
  assert.equal(migrated.projects[0].memberRoles["林溪"], "role_product");
  assert.equal(migrated.projects[0].memberRoles["陈默"], defaultMemberRole);
  assert.deepEqual(migrated.items, legacy.items);
  const backups = fs.readdirSync(path.join(path.dirname(file), "backups"));
  assert.equal(backups.filter((name) => name.startsWith("before-member-roles-")).length, 1);
  assert.equal(createStore(file).read().revision, migrated.revision);
  const restored = reopened.restore(legacy, migrated.revision);
  assert.deepEqual(restored.projects[0].memberRoles, migrated.projects[0].memberRoles);
});


test("settings: roles have stable IDs; rename propagates, assigned deletion and duplicate names are rejected", (t) => {
  const { store, file } = fresh(t);
  const p = store.read().projects[0];
  update(store, { memberRoles: { ...p.memberRoles, "林溪": "role_product" } });
  update(store, { roles: p.roles.map((r) => r.id === "role_product" ? { ...r, name: "产品负责人" } : r) });
  let current = createStore(file).read().projects[0];
  assert.equal(current.memberRoles["林溪"], "role_product");
  assert.equal(current.roles.find((r) => r.id === current.memberRoles["林溪"]).name, "产品负责人");
  for (const roles of [current.roles.filter((r) => r.id !== "role_product"), current.roles.filter((r) => r.id !== defaultMemberRole), [...current.roles, { id: "duplicate", name: " 产品负责人 ", description: "" }], [...current.roles, { id: "role_product", name: "其他角色", description: "" }]]) {
    const before = store.read();
    assert.throws(() => update(store, { roles }), /角色/);
    assert.deepEqual(store.read(), before);
  }
  update(store, { memberRoles: { ...current.memberRoles, "林溪": defaultMemberRole } });
  update(store, { roles: current.roles.filter((r) => r.id !== "role_product") });
  current = createStore(file).read().projects[0];
  assert.equal(current.roles.some((r) => r.id === "role_product"), false);
  const backup = store.read();
  assert.deepEqual(store.restore(backup, backup.revision).projects[0].roles, current.roles);
});

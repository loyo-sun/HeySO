import { defaultWorkConfig } from "../shared/work-config.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { seed, validate, context } from "../server/model.mjs";
import { createStore } from "../server/store.mjs";
function fresh(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "heyso-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return createStore(path.join(dir, "data.json"));
}
const doAction = (s, type, payload) => s.dispatch({ type, payload }).result;
test("hierarchy: subtasks require standard work item parents; failed writes are atomic", (t) => {
  const s = fresh(t),
    rev = s.read().revision;
  const { startDate, endDate } = s.read().projects[0];
  assert.throws(
    () =>
      doAction(s, "item.create", {
        projectId: "p_heyso",
        kind: "subtask",
        title: "bad",
        startDate,
        endDate,
        parentId: "f1",
      }),
    /父级/,
  );
  assert.equal(s.read().revision, rev);
  const st = doAction(s, "item.create", {
    projectId: "p_heyso",
    kind: "story",
    title: "new",
    startDate,
    endDate,
    parentId: "f1",
  });
  const task = doAction(s, "item.create", {
    projectId: "p_heyso",
    kind: "subtask",
    title: "work",
    startDate,
    endDate,
    parentId: st.id,
  });
  assert.equal(task.parentId, st.id);
  assert.equal(context(s.read(), task.id).hierarchy.length, 4);
});
test("AI: permission, stale context, delivery idempotency and human acceptance", (t) => {
  const s = fresh(t);
  const p = {
    itemId: "s6",
    storyVersion: 1,
    agent: "test",
    summary: "complete",
    verification: "verified",
    requestId: "delivery-1",
  };
  assert.throws(() => doAction(s, "run.submit", p), /未启用/);
  doAction(s, "item.update", { id: "s6", aiEnabled: true });
  const run = doAction(s, "run.submit", p);
  assert.equal(s.read().items.find((x) => x.id === "s6").status, "review");
  assert.equal(doAction(s, "run.submit", p).id, run.id);
  assert.throws(
    () => doAction(s, "item.update", { id: "s6", status: "done" }),
    /人工验收/,
  );
  doAction(s, "item.update", { id: "s6", acceptance: "changed" });
  assert.throws(
    () =>
      doAction(s, "review", {
        storyId: "s6",
        runId: run.id,
        decision: "accept",
        comment: "ok",
      }),
    /旧版/,
  );
  doAction(s, "review", {
    storyId: "s6",
    runId: run.id,
    decision: "changes",
    comment: "please revise",
  });
  assert.throws(
    () => doAction(s, "run.submit", { ...p, requestId: "delivery-2" }),
    /已更新/,
  );
  const run2 = doAction(s, "run.submit", {
    ...p,
    storyVersion: 2,
    requestId: "delivery-2",
  });
  doAction(s, "review", {
    storyId: "s6",
    runId: run2.id,
    decision: "accept",
    comment: "verified",
  });
  assert.equal(s.read().items.find((x) => x.id === "s6").status, "done");
  assert.equal(
    doAction(s, "run.submit", {
      ...p,
      storyVersion: 2,
      requestId: "delivery-2",
    }).id,
    run2.id,
  );
  assert.equal(s.read().runs.filter((r) => r.storyId === "s6").length, 2);
});
test("sprint close requires review, preserves snapshot, carries unfinished work, starts next sprint", (t) => {
  const s = fresh(t);
  assert.throws(() => doAction(s, "sprint.close", { id: "sp1" }), /评审/);
  doAction(s, "sprint.update", {
    id: "sp1",
    review: "目标部分达成",
    retro: {
      wentWell: "交付清楚",
      improve: "减少阻塞",
      actions: "明确环境文档",
    },
  });
  assert.throws(() => doAction(s, "sprint.close", { id: "sp1" }), /去向/);
  const before = s.read().items.filter((x) => x.sprintId === "sp1");
  const destinations = Object.fromEntries(
    before
      .filter((x) => !["done", "cancelled"].includes(x.status))
      .map((x) => [x.id, "sp2"]),
  );
  doAction(s, "sprint.close", {
    id: "sp1",
    dispositions: destinations,
    createImprovement: true,
  });
  const sp = s.read().sprints.find((x) => x.id === "sp1");
  assert.equal(sp.finalStories.length, before.length);
  assert.equal(sp.baseline.length, 8);
  assert.equal(sp.carryover.length, 6);
  assert.equal(s.read().items.find((x) => x.id === "s3").sprintId, "sp2");
  assert.ok(s.read().items.some((x) => x.title === "Sprint 01 · 改进行动"));
  doAction(s, "sprint.start", { id: "sp2" });
  assert.equal(s.read().sprints.find((x) => x.id === "sp2").baseline.length, 8);
});
test("release records accepted scope and defers remaining stories", (t) => {
  const s = fresh(t);
  assert.throws(
    () => doAction(s, "release.publish", { id: "r1", notes: "release" }),
    /去向/,
  );
  const unfinished = s
    .read()
    .items.filter(
      (x) => x.releaseId === "r1" && !["done", "cancelled"].includes(x.status),
    );
  doAction(s, "release.publish", {
    id: "r1",
    notes: "发布已完成故事",
    dispositions: Object.fromEntries(unfinished.map((x) => [x.id, "r2"])),
  });
  const r = s.read().releases.find((x) => x.id === "r1");
  assert.equal(r.publishedStories.length, 2);
  assert.equal(r.deferredStories.length, 8);
  assert.equal(r.status, "released");
  assert.throws(
    () => doAction(s, "item.update", { id: "s10", releaseId: "r1" }),
    /已发布/,
  );
});
test("optimistic revision and persistence across restart", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "heyso-restart-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "store.json");
  const s = createStore(file);
  doAction(s, "note.create", {
    projectId: "p_heyso",
    title: "remember",
    body: "keep it",
  });
  assert.throws(
    () =>
      s.dispatch(
        { type: "project.update", payload: { id: "p_heyso", name: "stale" } },
        0,
      ),
    /已有更新/,
  );
  const reopened = createStore(file);
  assert.equal(reopened.read().notes[0].title, "remember");
  assert.throws(
    () => reopened.restore({ ...seed(), schemaVersion: 99 }, 1),
    /格式/,
  );
  assert.equal(reopened.read().notes[0].title, "remember");
});
test("seed and exported state validate", () =>
  assert.doesNotThrow(() => validate(seed())));

const projectPlan = {
  goal: "完成测试交付",
  startDate: "2026-10-01",
  endDate: "2026-10-31",
};
test("project deletion cascades only within the confirmed project and rejects stale writes", (t) => {
  const s = fresh(t);
  const other = doAction(s, "project.create", {
    name: "保留项目",
    ...projectPlan,
  });
  doAction(s, "item.create", {
    projectId: other.id,
    kind: "story",
    title: "保留故事",
    ...projectPlan,
  });
  const before = s.read();
  assert.throws(
    () =>
      doAction(s, "project.delete", { id: "p_heyso", confirmName: "错误名称" }),
    /完整项目名称/,
  );
  assert.throws(
    () =>
      s.dispatch(
        {
          type: "project.delete",
          payload: { id: "p_heyso", confirmName: before.projects[0].name },
        },
        before.revision - 1,
      ),
    /已有更新/,
  );
  assert.deepEqual(s.read(), before);
  const result = doAction(s, "project.delete", {
    id: "p_heyso",
    confirmName: before.projects[0].name,
  });
  assert.equal(result.remainingProjectId, other.id);
  for (const key of [
    "items",
    "sprints",
    "releases",
    "notes",
    "runs",
    "events",
  ]) {
    assert.deepEqual(
      s.read()[key],
      before[key].filter((x) => x.projectId === other.id),
    );
  }
  assert.deepEqual(s.read().projects, before.projects.filter((p) => p.id === other.id));
  assert.throws(() => context(s.read(), "s3"), /不存在/);
  assert.throws(
    () =>
      doAction(s, "project.delete", {
        id: "p_heyso",
        confirmName: before.projects[0].name,
      }),
    /不存在/,
  );
  assert.doesNotThrow(() => validate(s.read()));
});
test("deleting the last project persists an empty workspace that can create a new project", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "heyso-delete-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "store.json");
  const s = createStore(file);
  const result = doAction(s, "project.delete", {
    id: "p_heyso",
    confirmName: s.read().projects[0].name,
  });
  assert.equal(result.remainingProjectId, null);
  const reopened = createStore(file);
  for (const key of [
    "projects",
    "items",
    "sprints",
    "releases",
    "notes",
    "runs",
    "events",
  ])
    assert.equal(reopened.read()[key].length, 0);
  const p = doAction(reopened, "project.create", {
    name: "重新开始",
    ...projectPlan,
  });
  assert.equal(reopened.read().projects[0].id, p.id);
});
test("every requirement level accepts empty dates and validates supplied project dates", (t) => {
  const s = fresh(t);
  const p = doAction(s, "project.create", { name: "日期测试", ...projectPlan });
  const legacy = defaultWorkConfig(true); for(const type of legacy.types) type.hidden=false;
  doAction(s, "project.workConfig", { id: p.id, config: legacy });
  let parentId = null;
  for (const kind of ["theme", "epic", "feature", "story", "subtask"]) {
    const payload = {
      projectId: p.id,
      kind,
      parentId,
      title: kind,
      startDate: "2026-10-10",
      endDate: "2026-10-20",
    };
    const before = s.read();
    for (const dates of [
      { startDate: "2026-09-30" },
      { endDate: "2026-11-01" },
      { startDate: "2026-10-21" },
      { endDate: "2026-02-30" },
    ])
      assert.throws(
        () => doAction(s, "item.create", { ...payload, ...dates }),
        /日期|周期/,
      );
    assert.deepEqual(s.read(), before);
    const undated = doAction(s, "item.create", {...payload,startDate:"",endDate:""});
    assert.equal(undated.startDate, "");
    const item = doAction(s, "item.create", payload);
    assert.throws(
      () =>
        doAction(s, "item.update", { id: item.id, startDate: "2026-09-30" }),
      /超出.*周期/,
    );
    assert.throws(
      () => doAction(s, "item.update", { id: item.id, dueDate: "2026-11-01" }),
      /超出.*周期/,
    );
    parentId = item.id;
  }
  const before = s.read();
  assert.throws(
    () =>
      doAction(s, "project.update", {
        id: p.id,
        startDate: "2026-10-11",
        endDate: "2026-10-31",
      }),
    /超出.*周期/,
  );
  assert.deepEqual(s.read(), before);
  // The bounds are inclusive; a one-day plan is valid.
  doAction(s, "item.update", {
    id: parentId,
    startDate: "2026-10-10",
    endDate: "2026-10-10",
  });
  doAction(s, "item.update", {
    id: parentId,
    startDate: "2026-10-10",
    endDate: "2026-10-20",
  });
  const invalid = s.read();
  invalid.items.find((x) => x.id === parentId).endDate = "2026-11-02";
  assert.throws(() => s.restore(invalid, s.read().revision), /超出.*周期/);
});
test("legacy undated records remain readable, but new schedules require a project plan", (t) => {
  const s = fresh(t),
    legacy = s.read();
  delete legacy.projects[0].startDate;
  delete legacy.projects[0].endDate;
  for (const item of legacy.items) {
    delete item.startDate;
    delete item.endDate;
  }
  s.restore(legacy, s.read().revision);
  assert.doesNotThrow(() => validate(s.read()));
  assert.throws(
    () =>
      doAction(s, "item.create", {
        projectId: "p_heyso",
        kind: "story",
        title: "待规划",
        ...projectPlan,
      }),
    /请先/,
  );
  assert.throws(
    () =>
      doAction(s, "project.create", {
        name: "空目标",
        startDate: projectPlan.startDate,
        endDate: projectPlan.endDate,
      }),
    /项目目标/,
  );
  assert.throws(
    () => doAction(s, "project.create", { name: "空日期", goal: "目标" }),
    /日期/,
  );
});

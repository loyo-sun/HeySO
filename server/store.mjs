import fs from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { act, seed, validate, fail, addEvent } from "./model.mjs";
import { migrateState } from "./migrate.mjs";
export function createStore(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let state;
  if (fs.existsSync(file)) {
    const original = JSON.parse(fs.readFileSync(file, "utf8"));
    state = validate(migrateState(original));
    if (original.schemaVersion !== state.schemaVersion || JSON.stringify(original) !== JSON.stringify(state)) {
      backup(original, original.numberingVersion !== state.numberingVersion ? "before-numbering-v1" : original.schemaVersion !== state.schemaVersion ? "before-workflows-v4" : "before-member-roles");
      state.revision = (original.revision || 0) + 1;
      save(state);
    }
  } else {
    state = seed();
    save(state);
  }
  function save(s) {
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(s, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }
  function backup(s, prefix) {
    const directory = path.join(path.dirname(file), "backups");
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}.json`), JSON.stringify(s, null, 2), { mode: 0o600, flag: "wx" });
  }
  return {
    read: () => structuredClone(state),
    importProject(workspace, expected) {
      if (expected !== state.revision) fail("数据已有更新，请刷新后重试",409);
      const next=structuredClone(state);
      for(const key of ['projects','items','sprints','releases','notes','runs','events']) next[key].push(...structuredClone(workspace[key]));
      validate(next);backup(state,'before-project-import');next.revision++;save(next);state=next;
      return {projectId:workspace.projects[0].id};
    },
    dispatch(action, expected) {
      if (expected !== undefined && expected !== state.revision)
        fail("数据已有更新，请刷新后重试", 409);
      const next = structuredClone(state);
      const result = act(next, action);
      next.revision = (state.revision || 0) + 1;
      save(next);
      state = next;
      return { state: structuredClone(next), result };
    },
    restore(input, expected) {
      if (expected !== state.revision) fail("数据已有更新，请刷新后重试", 409);
      const next = validate(migrateState(input));
      next.revision = state.revision + 1;
      for (const p of next.projects)
        addEvent(next, p.id, "project", "从备份恢复项目");
      backup(state, "before-restore");
      save(next);
      state = next;
      return structuredClone(state);
    },
  };
}

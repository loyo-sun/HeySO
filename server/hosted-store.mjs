import { act, seed, validate, fail, addEvent } from './model.mjs';
import { migrateState } from './migrate.mjs';

// All operations run inside a platform storage transaction, never process memory alone.
export function hostedStore(document, checkpoint) {
  document.state = validate(migrateState(document.state || seed()));
  const backup = (state) => {
    document.backups = [...(document.backups || []), { at: new Date().toISOString(), state: structuredClone(state) }].slice(-3);
    checkpoint();
  };
  const check = (expected) => { if (expected !== undefined && expected !== document.state.revision) fail('数据已有更新，请刷新后重试', 409); };
  return {
    read: () => structuredClone(document.state),
    dispatch(action, expected) {
      check(expected);
      const next = structuredClone(document.state);
      const result = act(next, action);
      next.revision = document.state.revision + 1;
      document.state = next; checkpoint();
      return { state: structuredClone(next), result };
    },
    importProject(workspace, expected) {
      check(expected);
      const next = structuredClone(document.state);
      for (const key of ['projects', 'items', 'sprints', 'releases', 'notes', 'runs', 'events']) next[key].push(...structuredClone(workspace[key]));
      validate(next); backup(document.state); next.revision++;
      document.state = next; checkpoint();
      return { projectId: workspace.projects[0].id };
    },
    restore(input, expected) {
      check(expected);
      const next = validate(migrateState(input));
      next.revision = document.state.revision + 1;
      for (const p of next.projects) addEvent(next, p.id, 'project', '从备份恢复项目');
      backup(document.state); document.state = next; checkpoint();
      return structuredClone(next);
    },
    backup,
  };
}

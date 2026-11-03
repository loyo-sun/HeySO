import { randomUUID } from 'node:crypto';
import { validate } from './model.mjs';
import { migrateState } from './migrate.mjs';
export const collections = ['items','sprints','releases','notes','runs','events'];
export function projectFile(state, projectId, id = randomUUID()) {
  const project = state.projects.find(p => p.id === projectId);
  if (!project) throw Object.assign(Error('项目不存在'), {status:404});
  const clean = structuredClone(project);
  delete clean.cloud;
  const workspace = {schemaVersion:state.schemaVersion,numberingVersion:state.numberingVersion,revision:state.revision,projects:[clean]};
  for (const key of collections) workspace[key] = structuredClone(state[key].filter(x => x.projectId === projectId));
  return readProjectFile({format:'heyso',fileVersion:1,id,name:project.name,workspace});
}
export function readProjectFile(input) {
  if (!input || input.format !== 'heyso' || input.fileVersion !== 1 || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(input.id || '') || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120)
    throw Object.assign(Error('无效的 .heyso 项目文件'), {status:400});
  const workspace = validate(migrateState(input.workspace));
  if (!Number.isSafeInteger(workspace.revision) || workspace.revision < 0) throw Object.assign(Error("无效的项目修订号"),{status:400});
  if (workspace.projects.length !== 1 || collections.some(key => workspace[key].some(x => x.projectId !== workspace.projects[0].id)))
    throw Object.assign(Error('.heyso 文件只能包含一个完整项目'), {status:400});
  workspace.projects.forEach(p=>delete p.cloud);
  return {format:'heyso',fileVersion:1,id:input.id,name:input.name.trim(),workspace};
}

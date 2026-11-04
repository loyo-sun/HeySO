import { migrateIdentifiers } from "../shared/identifiers.mjs";
import { rolesForMembers, defaultRoles } from "../shared/member-roles.mjs";
import { upgradeWorkflowConfig } from "../shared/workflows.mjs";
import { defaultWorkConfig, legacyHierarchyConfig, isSubtask, statusFor, terminal, runTargetId } from "../shared/work-config.mjs";

// V1 Task meant a child of Story. V2 Task is a peer; retain every existing ID.
export function migrateState(input) {
  const state = structuredClone(input);
  if (state?.schemaVersion === 4) return addMemberRoles(state);
  if (!state || ![1, 2, 3].includes(state.schemaVersion)) return state;
  if (!Array.isArray(state.projects) || !Array.isArray(state.items)) return state;
  if (state.schemaVersion === 1) {
  for (const project of state.projects) {
    if (!project || typeof project !== "object") continue;
    project.workConfig = defaultWorkConfig(true);
  }
  for (const item of state.items) {
    if (!item || typeof item !== "object") continue;
    if (item.kind === "task") item.kind = "subtask";
    const parent = state.items.find((p) => p?.id === item.parentId);
    if (parent && ((item.startDate && parent.startDate && item.startDate < parent.startDate) || (item.endDate && parent.endDate && item.endDate > parent.endDate))) item.legacyParentDates = true;
  }
  state.schemaVersion = 2;
  }
  if(state.schemaVersion === 2) {
  for (const project of state.projects) {
    project.workConfig = legacyHierarchyConfig(project.workConfig);
    project.hierarchyRevision = 1;
  }
  state.schemaVersion = 3;
  }
  for(const project of state.projects) {
    project.workConfig = upgradeWorkflowConfig(project.workConfig, state.items.some((i) => i.projectId === project.id));
    project.workflowRevision = 1;
  }
  state.schemaVersion = 4;
  return addMemberRoles(state);
}

function addMemberRoles(state) {
  for (const project of state.projects || []) {
    if (!project || !Array.isArray(project.members)) continue;
    if (project.roles === undefined) {
      project.roles = defaultRoles();
      const existing = project.memberRoles;
      project.memberRoles = Object.fromEntries(project.members.map((name) => {
        const label = existing && Object.hasOwn(existing, name) ? existing[name] : "项目成员";
        if (typeof label !== "string" || !label.trim() || label.trim().length > 40) throw Error("成员角色需为 1 至 40 字的文本");
        let role = project.roles.find((r) => r.name === label.trim());
        if (!role) { role = { id: `role_legacy_${project.roles.length}`, name: label.trim(), description: "" }; project.roles.push(role); }
        return [name, role.id];
      }));
    } else if (project.memberRoles === undefined) {
      project.memberRoles = rolesForMembers(project.members);
    }
  }
  return migrateDeliveryOwnership(migrateIdentifiers(state));
}

// itemId is the delivery owner; storyId retains the original parent context/version.
// Preserve IDs and reviews, and never replace a later manual status change.
export function migrateDeliveryOwnership(state) {
  const latest = new Map();
  for (const run of state.runs || []) {
    if (run.deliveryOwnershipVersion === 1) continue;
    const item = state.items?.find(i => i.id === runTargetId(run));
    const project = state.projects?.find(p => p.id === run.projectId);
    if (!item || !project || item.projectId !== project.id || !isSubtask(item, project) || item.id === run.storyId) continue;
    run.deliveryOwnershipVersion = 1;
    const at = run.reviews?.at(-1)?.at || run.submittedAt || run.progress?.at(-1)?.at || run.createdAt;
    const previous = latest.get(item.id);
    if (!previous || at > previous.at) latest.set(item.id, {item,project,run,at});
    const times = new Set([run.submittedAt, ...(run.progress || []).map(p => p.at), ...(run.reviews || []).map(r => r.at)].filter(Boolean));
    for (const event of state.events || []) {
      if (event.projectId === project.id && event.itemId === run.storyId && ['ai','review'].includes(event.type) && times.has(event.at)) {
        event.originalItemId = event.itemId;
        event.itemId = item.id;
        event.runId = run.id;
      }
    }
  }
  for (const {item,project,run,at} of latest.values()) {
    if (item.updatedAt && at && item.updatedAt > at) continue;
    const stage = {accepted:'done',changes:'active',cancelled:'todo'}[run.status] || run.status;
    const next = statusFor(project, stage, item.kind);
    if (!next) continue;
    const previous = item.status;
    item.status = next;
    if (at) item.updatedAt = at;
    if (stage === 'done') item.completedAt = at;
    else delete item.completedAt;
    if (previous !== next) {
      const names = Object.fromEntries(project.workConfig.statuses.map(s => [s.id,s.name]));
      state.events.unshift({id:'event_delivery_migration_' + run.id,projectId:project.id,itemId:item.id,runId:run.id,type:'item',title:'恢复子任务交付状态',at,detail:'保留原交付与人工验收记录，按原结果恢复子任务状态。',changes:[{field:'status',label:'状态',before:previous,after:next,beforeText:names[previous] || previous,afterText:names[next] || next}]});
    }
    const parent = state.items.find(i => i.id === run.storyId);
    if (parent && !terminal(parent, project)) delete parent.completedAt;
  }
  return state;
}

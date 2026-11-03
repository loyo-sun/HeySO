import { migrateIdentifiers } from "../shared/identifiers.mjs";
import { rolesForMembers, defaultRoles } from "../shared/member-roles.mjs";
import { upgradeWorkflowConfig } from "../shared/workflows.mjs";
import { defaultWorkConfig, legacyHierarchyConfig } from "../shared/work-config.mjs";

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
  return migrateIdentifiers(state);
}

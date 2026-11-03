export const defaultMemberRole = "role_member";
export function defaultRoles() {
  return [
    ["role_member", "项目成员"], ["role_manager", "项目经理"],
    ["role_product", "产品经理"], ["role_design", "设计师"],
    ["role_development", "开发工程师"], ["role_test", "测试工程师"], ["role_operations", "运营"],
  ].map(([id, name]) => ({ id, name, description: "" }));
}
export function memberRole(project, name) {
  return Object.hasOwn(project.memberRoles || {}, name) ? project.memberRoles[name] : defaultMemberRole;
}
export function rolesForMembers(members, roles = {}) {
  return Object.fromEntries(members.map((name) => [name, Object.hasOwn(roles, name) ? roles[name] : defaultMemberRole]));
}
export function checkMemberRoles(project) {
  if (!Array.isArray(project.roles) || !project.roles.length || project.roles.length > 50) throw Error("角色列表需包含 1 至 50 个角色");
  const ids = new Set(), names = new Set();
  for (const role of project.roles) {
    if (!role || typeof role.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(role.id) || ids.has(role.id)) throw Error("角色标识缺失或重复");
    if (typeof role.name !== "string" || !role.name.trim() || role.name.trim().length > 40 || names.has(role.name.trim())) throw Error("角色名称需为 1 至 40 字，且不能重复");
    if (typeof role.description !== "string" || role.description.length > 500) throw Error("角色说明需为 500 字以内的文本");
    ids.add(role.id); names.add(role.name.trim());
  }
  if (!ids.has(defaultMemberRole)) throw Error("默认成员角色不能删除");
  const roles = project.memberRoles;
  if (!roles || typeof roles !== "object" || Array.isArray(roles)) throw Error("成员角色格式错误");
  if (Object.keys(roles).length !== project.members.length || Object.keys(roles).some((name) => !project.members.includes(name))) throw Error("成员角色须与成员名册对应");
  for (const name of project.members) {
    if (!Object.hasOwn(roles, name) || typeof roles[name] !== "string" || !ids.has(roles[name])) throw Error("成员须选择已有角色；删除角色前请先重新分配成员");
  }
}

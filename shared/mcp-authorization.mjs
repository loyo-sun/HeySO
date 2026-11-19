// Authorization is server-owned. Never derive scopes or project access from chat text.
const deny = (status, code, message) => { throw Object.assign(new Error(message), {status, code}); };
export function assertMcpGrant(identity, grant, fileId, scope) {
  if (!grant || grant.revoked || grant.user_id !== identity.userId || grant.app !== 'heyso' || grant.id !== identity.grantId)
    deny(403, 'PLUGIN_AUTHORIZATION_REQUIRED', '插件授权已失效，请重新连接并授权 HeySO');
  if (!identity.scopes?.includes(scope) || !grant.scopes?.includes(scope))
    deny(403, 'PLUGIN_SCOPE_REQUIRED', `插件缺少 ${scope} 授权，请重新连接并明确授予相应权限`);
  if (grant.connection_ids !== null || (fileId && grant.document_ids !== null && !grant.document_ids?.includes(fileId)))
    deny(403, 'FILE_ACCESS_DENIED', '文件不可访问，请检查连接的文件授权范围，或重新选择有权访问的项目');
  return grant;
}
export function assertProjectWrite(identity, file) {
  // LoyoCloud currently supports owner-only HeySO writes. Project member labels
  // are responsibilities, not an ACL. Do not infer write rights from membership.
  if (!file || file.user_id !== identity.userId || file.app !== 'heyso' || file.deleted_at)
    deny(403, 'PROJECT_WRITE_FORBIDDEN', '当前用户无项目写入权限，请使用有写入权限的账号');
}
export function assertProjectTarget(state, projectId) {
  if (projectId && !state.projects.some(p => p.id === projectId))
    deny(404, 'FILE_ACCESS_DENIED', '项目不可访问，请重新读取当前文件的项目列表');
}

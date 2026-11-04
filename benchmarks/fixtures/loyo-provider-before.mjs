// Baseline from b047a10; frozen only for save-chain comparison.
import { createHash, randomUUID } from 'node:crypto';
import { act, validate } from '../../server/model.mjs';
import { projectFile, readProjectFile, collections } from '../../server/project-file.mjs';
import { migrateState } from '../../server/migrate.mjs';
import { authenticated, sessionCookie } from '../../server/hosted-auth.mjs';
import { toolDefinitions } from '../../server/mcp-tools.mjs';

const fail = (message, status = 400) => { throw Object.assign(Error(message), { status }); };
const json = (value, status = 200, headers = {}) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
export function loyoApi(config, fetcher = fetch) {
  return async (route, body) => {
    let response;
    try { response = await fetcher(config.base + route, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: config.origin, Authorization: 'Bearer ' + config.token, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual', signal: AbortSignal.timeout(20000) }); }
    catch { fail('无法连接 LoyoCloud，请稍后重试', 503); }
    const result = await response.json();
    if (!response.ok) fail(result.error_description || result.error || 'LoyoCloud 操作失败', response.status);
    return result;
  };
}
const empty = () => migrateState({ schemaVersion: 4, revision: 0, projects: [], ...Object.fromEntries(collections.map(k => [k, []])) });
export async function handleLoyo(request, config, env, input, fetcher = fetch) {
  const path = new URL(request.url).pathname, api = loyoApi(config, fetcher);
  const load = async () => {
    const list = await api('/api/v1/heyso/files');
    const files = [];
    // Bounded concurrency avoids flooding the cloud service for larger accounts.
    for (let i = 0; i < list.files.length; i += 5) files.push(...await Promise.all(list.files.slice(i, i + 5).map(f => api('/api/v1/heyso/files/' + encodeURIComponent(f.id)))));
    const state = empty();
    for (const file of files) {
      const content = readProjectFile(file.content), p = content.workspace.projects[0];
      if (state.projects.some(x => x.id === p.id)) fail('云端项目存在重复业务标识，请在 LoyoCloud 中整理副本后重试', 409);
      state.projects.push({ ...p, cloud: { fileId: content.id, headId: file.headId, base: config.base, account: config.user.username, available: true, error: '' } });
      for (const key of collections) state[key].push(...content.workspace[key]);
    }
    state.revision = parseInt(createHash('sha256').update(JSON.stringify(files.map(f => [f.content.id, f.headId]).sort((a,b) => a[0].localeCompare(b[0])))).digest('hex').slice(0, 13), 16);
    return { state: validate(state), files };
  };
  if (path === '/api/session') {
    if (request.method === 'GET') return json({ hosted: true, authenticated: authenticated(request, env), provider: 'loyocloud', version: 'alpha_0.1' });
    if (request.method === 'DELETE') return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(request, env, true) });
    // Possession of the encrypted provider cookie is required before this route.
    if (request.method === 'POST') {
      const { safeEqual } = await import('./hosted-auth.mjs');
      if (!safeEqual(input.password, env.HEYSO_PASSWORD)) return json({ error: '访问密码不正确' }, 401);
      await api('/api/v1/editor/session');
      return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(request, env) });
    }
  }
  if (!authenticated(request, env)) return json({ error: '请先输入访问密码' }, 401);
  if (!['GET', 'POST'].includes(request.method)) fail('不支持此请求方法', 405);
  if (request.method === 'POST' && request.headers.get('x-heyso-client') !== 'local-ui') fail('需要客户端标识', 403);
  if (path === '/api/cloud/status') return json({ connected: true, base: config.base, user: config.user, primary: true, mcpUrl: config.base + '/mcp/heyso' });
  if (path === '/api/connection') return json({ url: config.base + '/mcp/heyso', oauth: true, hosted: true, provider: 'loyocloud', version: 'alpha_0.1', tools: toolDefinitions.map(([name, description]) => ({ name, description })) });
  const { state, files } = await load();
  if (path === '/api/state') return json(state);
  if (path === '/api/cloud/files') return json({ files: files.map(f => ({ id: f.content.id, name: f.content.name })) });
  if (path === '/api/cloud/open') return json({ projectId: files.find(f => f.content.id === input.fileId)?.content.workspace.projects[0].id, state });
  if (path === '/api/export') { state.projects.forEach(p => delete p.cloud); return json(state, 200, { 'Content-Disposition': 'attachment; filename="HeySO-backup.json"' }); }
  const exported = path.match(/^\/api\/projects\/([^/]+)\/export$/);
  if (exported) {
    const p = state.projects.find(p => p.id === decodeURIComponent(exported[1])); if (!p) fail('项目不存在', 404);
    return json(projectFile(state, p.id, p.cloud.fileId), 200, { 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(p.name + '.heyso')}` });
  }
  if (path.startsWith('/api/restore')) fail('LoyoCloud 模式请通过 .heyso 文件导入单个项目，或在云空间恢复文件历史版本');
  if (path === '/api/action' || path === '/api/projects/import') {
    if (input.revision !== state.revision) fail('数据已有更新，请刷新后重试', 409);
    let result, projectId;
    if (path === '/api/projects/import' || input.action?.type === 'project.create') {
      let content;
      if (path === '/api/projects/import') content = readProjectFile(input.content);
      else { const next = empty(); result = act(next, input.action); content = projectFile(next, result.id); }
      const imported = content.workspace.projects[0];
      if (state.projects.some(p => p.id === imported.id || p.name === imported.name || p.code === imported.code)) fail('项目名称、编号或标识与云端已有项目冲突', 409);
      const candidate = structuredClone(state);
      candidate.projects.push(imported);
      for (const key of collections) candidate[key].push(...content.workspace[key]);
      validate(candidate);
      await api('/api/v1/heyso/files', { content }); projectId = imported.id; result ||= imported;
    } else {
      if (input.action?.type === 'project.delete') fail('请在 LoyoCloud 云空间中将项目文件移至回收站');
      const p = input.action?.payload || {}, id = p.id || p.itemId || p.storyId || p.runId;
      const record = [...state.projects, ...collections.flatMap(k => state[k])].find(x => x.id === id);
      projectId = p.projectId || record?.projectId || (state.projects.some(x => x.id === id) ? id : input.projectId);
      const project = state.projects.find(x => x.id === projectId); if (!project) fail('项目不存在', 404);
      const out = await api('/api/v1/heyso/files/' + project.cloud.fileId + '/action', { action: input.action, headId: project.cloud.headId, requestId: input.requestId || randomUUID() }); result = out.result;
    }
    return json({ state: (await load()).state, result, projectId });
  }
  fail('接口不存在', 404);
}

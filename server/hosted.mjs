import { cloudWorkspace } from './cloud.mjs';
import { hostedStore } from './hosted-store.mjs';
import { validate } from './model.mjs';
import { migrateState } from './migrate.mjs';
import { createMcpServer, toolDefinitions } from './mcp-tools.mjs';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { authenticated, configured, safeEqual, sessionCookie } from './hosted-auth.mjs';

const fail = (message, status = 400) => { throw Object.assign(Error(message), { status }); };
const json = (value, status = 200, headers = {}) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
const limit = 4 * 1024 * 1024;
async function body(request) {
  if (Number(request.headers.get('content-length')) > limit) fail('上传内容不能超过 4 MB', 413);
  const reader = request.body?.getReader();
  if (!reader) return {};
  const parts = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); fail('上传内容不能超过 4 MB', 413); }
    parts.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { fail('请求必须是有效 JSON'); }
}

// Web-standard Request/Response API shared by all three hosting platforms.
export async function handleHosted(request, env, storage) {
  try {
    const url = new URL(request.url), path = url.pathname;
    if (path === '/api/health' && request.method === 'GET') return json({ status: configured(env) ? 'ok' : 'setup_required', version: 'alpha_0.1', tools: toolDefinitions.length, hosted: true });
    if (!configured(env)) return json({ error: '请配置至少 16 位的 HEYSO_PASSWORD，以及独立的至少 32 位 HEYSO_MCP_TOKEN' }, 503);
    const origin = env.HEYSO_PUBLIC_URL ? new URL(env.HEYSO_PUBLIC_URL).origin : url.origin;
    if (request.headers.get('origin') && request.headers.get('origin') !== origin) fail('来源未授权', 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { Allow: 'GET, POST, DELETE, OPTIONS' } });
    if (path === '/api/session' && request.method === 'GET') return json({ hosted: true, authenticated: authenticated(request, env), version: 'alpha_0.1' });
    if (path === '/api/session' && request.method === 'DELETE') return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(request, env, true) });
    if (path === '/api/session' && request.method === 'POST') {
      const input = await body(request);
      return await storage.run(async (doc, save) => {
        const now = Date.now();
        const attempts = doc.loginAttempts?.until > now ? doc.loginAttempts : { count: 0, until: now + 10 * 60 * 1000 };
        if (attempts.count >= 10) return json({ error: '尝试次数过多，请 10 分钟后再试' }, 429, { 'Retry-After': '600' });
        if (!safeEqual(input.password, env.HEYSO_PASSWORD)) { doc.loginAttempts = { ...attempts, count: attempts.count + 1 }; await save(doc); return json({ error: '访问密码不正确' }, 401); }
        delete doc.loginAttempts; await save(doc);
        return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(request, env) });
      });
    }
    if (path === '/mcp') {
      if (!safeEqual(request.headers.get('authorization'), `Bearer ${env.HEYSO_MCP_TOKEN}`)) return json({ error: 'MCP 密钥无效' }, 401, { 'WWW-Authenticate': 'Bearer' });
      if (request.method !== 'POST') return json({ error: '此 MCP 入口使用无会话 HTTP POST' }, 405, { Allow: 'POST' });
    } else {
      if (!authenticated(request, env)) return json({ error: '请先输入访问密码' }, 401);
      if (!['GET', 'POST'].includes(request.method)) return json({ error: '不支持此请求方法' }, 405);
      if (request.method === 'POST' && request.headers.get('x-heyso-client') !== 'local-ui') fail('需要客户端标识', 403);
    }
    const input = request.method === 'POST' ? await body(request) : {};
    return await storage.run(async (doc, save) => {
      let pending = Promise.resolve();
      const checkpoint = () => { const snapshot = structuredClone(doc); pending = pending.then(() => save(snapshot)); pending.catch(() => {}); };
      const flush = () => pending;
      const store = hostedStore(doc, checkpoint);
      const persistence = {
        read: () => doc.cloud,
        write: value => { doc.cloud = structuredClone(value); checkpoint(); },
        backup: store.backup,
        flush,
      };
      const workspace = cloudWorkspace({ store, persistence, base: env.HEYSO_CLOUD_URL || 'https://cloud.loyo.work' });
      let response;
      try {
        if (path === '/mcp') {
          const server = createMcpServer(workspace);
          const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
          await server.connect(transport);
          try { response = await transport.handleRequest(request, { parsedBody: input }); } finally { await server.close(); }
        } else if (path === '/api/state' && request.method === 'GET') response = json(await workspace.read());
        else if (path === '/api/connection' && request.method === 'GET') response = json({ url: origin + '/mcp', token: env.HEYSO_MCP_TOKEN, tools: toolDefinitions.map(([name, description]) => ({ name, description })), version: 'alpha_0.1', hosted: true });
        else if (path === '/api/action' && request.method === 'POST') response = json(await workspace.dispatch(input.action, input.revision, input.projectId));
        else if (path === '/api/export' && request.method === 'GET') {
          const state = await workspace.read(); state.projects.forEach(p => delete p.cloud);
          response = json(state, 200, { 'Content-Disposition': 'attachment; filename="HeySO-backup.json"' });
        } else if (path === '/api/restore/preview' && request.method === 'POST') {
          const incoming = validate(migrateState(input.state)), current = await workspace.read();
          const keys = ['projects', 'items', 'sprints', 'releases', 'notes', 'runs', 'events'];
          response = json({ revision: current.revision, counts: Object.fromEntries(keys.map(k => [k, { current: current[k].length, backup: incoming[k].length }])), projects: incoming.projects.map(p => ({ id: p.id, name: p.name })) });
        } else if (path === '/api/restore' && request.method === 'POST') {
          if (workspace.hasCloudProjects()) fail('当前存在在线项目，请使用独立工作空间恢复备份', 409);
          if ((await workspace.read()).revision !== input.revision) fail('数据已有更新，请重试', 409);
          store.restore(input.state, store.read().revision); response = json({ state: await workspace.read() });
        } else {
          // Reuse LoyoCloud routes without depending on an HTTP server or disk.
          const routes = [];
          workspace.install({ get: (pattern, fn) => routes.push({ method: 'GET', pattern, fn }), post: (pattern, fn) => routes.push({ method: 'POST', pattern, fn }) });
          const route = routes.find(r => r.method === request.method && new RegExp('^' + r.pattern.replace(/:[a-z]+/gi, '([^/]+)') + '$').test(path));
          if (!route) fail('接口不存在', 404);
          const values = path.match(new RegExp('^' + route.pattern.replace(/:[a-z]+/gi, '([^/]+)') + '$')).slice(1);
          const names = [...route.pattern.matchAll(/:([a-z]+)/gi)].map(m => m[1]);
          const req = { body: input, params: Object.fromEntries(names.map((name, i) => [name, decodeURIComponent(values[i])])), get: name => name.toLowerCase() === 'host' ? new URL(origin).host : name.toLowerCase() === 'origin' ? origin : request.headers.get(name) };
          const headers = {};
          const res = { json: value => { response = json(value, 200, headers); return res; }, attachment: name => { headers['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(name)}`; return res; } };
          await route.fn(req, res);
        }
      } finally { await flush(); }
      if (!response) fail('服务未返回响应', 500);
      const headers = new Headers(response.headers); headers.set('Cache-Control', 'no-store'); headers.set('X-Content-Type-Options', 'nosniff');
      return new Response(response.body, { status: response.status, headers });
    });
  } catch (error) {
    if (!error.status) console.error('HeySO hosted request failed:', error.name);
    return json({ error: error.status ? error.message : '服务暂时不可用，请稍后重试' }, error.status || 500);
  }
}

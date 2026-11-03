import test from 'node:test';
import assert from 'node:assert/strict';
import { handleHosted } from '../server/hosted.mjs';
import { redisStorage } from '../server/redis-storage.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import netlifyHandler, { config as netlifyConfig } from '../netlify/functions/heyso.mjs';
import { GET as vercelGet, POST as vercelPost } from '../api/heyso.mjs';

const env = { HEYSO_PASSWORD: 'test-password-long-enough', HEYSO_MCP_TOKEN: 'independent-test-mcp-secret-32-chars-long' };
const origin = 'https://heyso.example';
function memoryStorage() {
  let value = {}, tail = Promise.resolve();
  return {
    read: () => structuredClone(value),
    run(fn) {
      const result = tail.then(() => fn(structuredClone(value), async next => { value = structuredClone(next); }));
      tail = result.catch(() => {}); return result;
    },
  };
}
function request(path, { method = 'GET', cookie, body, headers = {} } = {}) {
  return new Request(origin + path, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json', 'X-HeySO-Client': 'local-ui' } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
async function login(storage, extra = {}) {
  const r = await handleHosted(request('/api/session', { method: 'POST', body: { password: env.HEYSO_PASSWORD } }), { ...env, ...extra }, storage);
  assert.equal(r.status, 200); assert.match(r.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  assert.match(r.headers.get('set-cookie'), /Secure/);
  return r.headers.get('set-cookie').split(';')[0];
}
test('hosted API fails closed, distinguishes browser sessions and MCP, and rejects cross-origin writes', async () => {
  const storage = memoryStorage();
  assert.equal((await handleHosted(request('/api/state'), {}, storage)).status, 503);
  for (const path of ['/api/state', '/api/export', '/api/connection', '/api/cloud/status']) assert.equal((await handleHosted(request(path), env, storage)).status, 401);
  const cookie = await login(storage);
  const cross = await handleHosted(request('/api/action', { method: 'POST', cookie, body: {}, headers: { Origin: 'https://evil.example' } }), env, storage);
  assert.equal(cross.status, 403);
  assert.equal((await handleHosted(request('/api/state', { cookie }), { ...env, HEYSO_PASSWORD: 'rotated-password-long-enough' }, storage)).status, 401);
  assert.equal((await handleHosted(request('/mcp', { cookie, method: 'POST', body: {} }), env, storage)).status, 401);
  assert.equal((await handleHosted(request('/api/connection', { headers: { Authorization: 'Bearer ' + env.HEYSO_MCP_TOKEN } }), env, storage)).status, 401);
  assert.equal((await handleHosted(request('/api/action', { cookie, method: 'POST' }), env, storage)).status, 403);
  assert.equal(storage.read().state, undefined, 'unauthorized requests must not seed project data');
});
test('data survives cold handlers, stale revisions cannot overwrite data, exports/imports/restore work', async () => {
  const storage = memoryStorage(), cookie = await login(storage);
  const call = (path, body) => handleHosted(request(path, { cookie, ...(body ? { method: 'POST', body } : {}) }), env, storage);
  const state = await (await call('/api/state')).json();
  assert.equal((await (await call('/api/state')).json()).revision, state.revision, 'cold requests preserve revision');
  const project = state.projects[0];
  const action = { type: 'item.create', payload: { projectId: project.id, kind: 'story', title: 'Hosted persistence check', startDate: project.startDate, endDate: project.endDate, acceptance: 'Visible after a new request.' } };
  const results = await Promise.all([call('/api/action', { action, revision: state.revision }), call('/api/action', { action, revision: state.revision })]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const latest = await (await call('/api/state')).json();
  assert.equal(latest.items.filter(i => i.title === action.payload.title).length, 1);
  const exported = await call('/api/export'); assert.match(exported.headers.get('content-disposition'), /attachment/);
  assert.ok(!(await exported.text()).includes(env.HEYSO_MCP_TOKEN));
  const preview = await (await call('/api/restore/preview', { state })).json();
  assert.equal((await call('/api/restore', { state, revision: preview.revision - 1 })).status, 409);
  assert.equal((await call('/api/restore', { state, revision: preview.revision })).status, 200);
  const restored = await (await call('/api/state')).json();
  assert.ok(!restored.items.some(i => i.title === action.payload.title));
  assert.equal(storage.read().backups.length, 1);
  const connection = await (await call('/api/connection')).json();
  assert.equal(connection.url, origin + '/mcp');
  assert.equal(connection.token, env.HEYSO_MCP_TOKEN);
  const file = await (await call('/api/projects/' + project.id + '/export')).json();
  assert.equal(file.format, 'heyso');
  const badImport = await call('/api/projects/import', { content: file, revision: restored.revision });
  assert.equal(badImport.status, 400, 'same identifiers must not duplicate existing records');
});
test('hosted MCP works with the official SDK over stateless web-standard transport', async () => {
  const storage = memoryStorage();
  const client = new Client({ name: 'hosted-test', version: '1' });
  const transport = new StreamableHTTPClientTransport(new URL(origin + '/mcp'), {
    requestInit: { headers: { Authorization: 'Bearer ' + env.HEYSO_MCP_TOKEN } },
    fetch: (input, init) => handleHosted(new Request(input, init), env, storage),
  });
  await client.connect(transport);
  try {
    const tools = await client.listTools(); assert.equal(tools.tools.length, 5);
    const result = await client.callTool({ name: 'list_projects', arguments: {} });
    assert.ok(JSON.parse(result.content[0].text).length > 0);
    const denied = await client.callTool({ name: 'submit_result', arguments: { itemId: 'missing', storyVersion: 1, agent: 'test', summary: 'test', verification: 'test', requestId: 'test' } });
    assert.equal(denied.isError, true);
  } finally { await client.close(); }
});
test('hosted LoyoCloud login flow survives a cold request without exposing credentials', async () => {
  const storage = memoryStorage(), cookie = await login(storage);
  const r = await handleHosted(request('/api/cloud/connect', { cookie, method: 'POST', body: {} }), env, storage);
  assert.equal(r.status, 200);
  const flow = await r.json(), saved = storage.read();
  assert.equal(saved.cloud.pendingFlow.state, flow.state);
  assert.equal(saved.cloud.pendingFlow.origin, origin);
  assert.equal(new URL(flow.url).searchParams.get('origin'), origin);
  const session = await handleHosted(request('/api/cloud/status', { cookie }), env, storage);
  assert.ok(!(await session.text()).includes(saved.cloud.pendingFlow.verifier));
  const wrong = await handleHosted(request('/api/cloud/exchange', { cookie, method: 'POST', body: { state: 'wrong', code: 'wrong' } }), env, storage);
  assert.equal(wrong.status, 400);
});
test('failed login attempts are persistently rate limited', async () => {
  const storage = memoryStorage();
  for (let i = 0; i < 10; i++) assert.equal((await handleHosted(request('/api/session', { method: 'POST', body: { password: 'wrong' } }), env, storage)).status, 401);
  assert.equal((await handleHosted(request('/api/session', { method: 'POST', body: { password: env.HEYSO_PASSWORD } }), env, storage)).status, 429);
});
test('Redis uses a fenced durable write and releases leases after failures', async () => {
  const entries = new Map(); let invalidate = false;
  const redis = redisStorage({ UPSTASH_REDIS_REST_URL: 'https://redis.example', UPSTASH_REDIS_REST_TOKEN: 'secret' }, async (url, init) => {
    const [cmd, ...args] = JSON.parse(init.body); let result;
    if (cmd === 'SET') { result = entries.has(args[0]) ? null : 'OK'; if (result) entries.set(args[0], args[1]); }
    if (cmd === 'GET') result = entries.get(args[0]) || null;
    if (cmd === 'EVAL' && args[1] === '2') {
      const [, , lock, key, token, value] = args;
      if (value === undefined) return Response.json({ result: entries.get(key) || null });
      if (invalidate) entries.set(lock, 'another-holder');
      result = entries.get(lock) === token ? 1 : 0;
      if (result) entries.set(key, value);
    }
    if (cmd === 'EVAL' && args[1] === '1') { const [, , lock, token] = args; result = entries.get(lock) === token ? 1 : 0; if (result) entries.delete(lock); }
    return Response.json({ result });
  });
  await redis.run(async (doc, save) => { doc.name = 'saved'; await save(doc); });
  await redis.run(async doc => assert.equal(doc.name, 'saved'));
  await assert.rejects(() => redis.run(async () => { throw Error('rollback'); }), /rollback/);
  assert.equal(entries.has('heyso:workspace:v1:lock'), false);
  invalidate = true;
  await assert.rejects(() => redis.run(async (doc, save) => { doc.name = 'stale'; await save(doc); }), /租约/);
  assert.equal(JSON.parse(entries.get('heyso:workspace:v1')).name, 'saved');
});

test('Netlify and Vercel entry points handle rewritten routes and durable sessions', async () => {
  const previousEnv = { ...process.env }, previousFetch = globalThis.fetch;
  const data = new Map();
  Object.assign(process.env, env, { UPSTASH_REDIS_REST_URL: 'https://redis.example', UPSTASH_REDIS_REST_TOKEN: 'test-only' });
  globalThis.fetch = async (_url, init) => {
    const [cmd, ...args] = JSON.parse(init.body); let result;
    if (cmd === 'SET') { result = data.has(args[0]) ? null : 'OK'; if (result) data.set(args[0], args[1]); }
    else if (cmd === 'GET') result = data.get(args[0]) || null;
    else if (cmd === 'EVAL' && args[1] === '2') {
      const [, , lock, key, token, value] = args;
      if (value === undefined) return Response.json({ result: data.get(key) || null });
      result = data.get(lock) === token ? 1 : 0;
      if (result) data.set(key, value);
    } else if (cmd === 'EVAL') {
      const [, , lock, token] = args; result = data.get(lock) === token ? 1 : 0; if (result) data.delete(lock);
    }
    return Response.json({ result });
  };
  try {
    assert.ok(netlifyConfig.path.includes('/mcp'));
    const loggedIn = await netlifyHandler(request('/api/session', { method: 'POST', body: { password: env.HEYSO_PASSWORD } }));
    const cookie = loggedIn.headers.get('set-cookie').split(';')[0];
    const netlifyState = await (await netlifyHandler(request('/api/state', { cookie }))).json();
    const vercelState = await (await vercelGet(request('/api/heyso?__heyso_route=/api/state', { cookie }))).json();
    assert.equal(vercelState.revision, netlifyState.revision);
    assert.deepEqual(vercelState.projects, netlifyState.projects);
    const mcp = await vercelPost(request('/api/heyso?__heyso_route=/mcp', { method: 'POST', body: { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'adapter-test', version: '1' } } }, headers: { Authorization: 'Bearer ' + env.HEYSO_MCP_TOKEN, Accept: 'application/json, text/event-stream' } }));
    assert.equal(mcp.status, 200); assert.equal((await mcp.json()).result.serverInfo.name, 'HeySO');
  } finally {
    globalThis.fetch = previousFetch;
    for (const key of Object.keys(process.env)) if (!(key in previousEnv)) delete process.env[key];
    Object.assign(process.env, previousEnv);
  }
});

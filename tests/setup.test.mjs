import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { handleDeployment } from '../server/deployment.mjs';
import { act, validate } from '../server/model.mjs';
import { readProjectFile } from '../server/project-file.mjs';
import { seal, unseal } from '../server/sealed-config.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import worker from '../cloudflare/worker.mjs';

const env = { HEYSO_SETUP_KEY: 'test-only-owner-bootstrap-secret-32-characters' };
const origin = 'https://heyso.example', password = 'test-only-workspace-password';
function memory() {
  let doc = {}, tail = Promise.resolve();
  return { read: () => structuredClone(doc), run(fn) { const next = tail.then(() => fn(structuredClone(doc), async value => { doc = structuredClone(value); })); tail = next.catch(() => {}); return next; } };
}
function services() {
  const redis = new Map(), files = new Map(); let remoteDocument = {}, remoteLease = null, headCounter = 0, challenge;
  let expired = false;
  return {
    redis, files, setChallenge: value => { challenge = value; }, expire: () => { expired = true; },
    fetcher: async (url, init = {}) => {
      const parsed = new URL(url), data = init.body ? JSON.parse(init.body) : null;
      if (parsed.hostname === 'redis.example') {
        const [cmd, ...args] = data; let result;
        if (cmd === 'SET') { result = redis.has(args[0]) ? null : 'OK'; if (result) redis.set(args[0], args[1]); }
        else if (cmd === 'EVAL' && args[1] === '2') {
          const [, , lock, key, lease, value] = args;
          assert.equal(redis.get(lock), lease);
          if (value === undefined) result = redis.get(key) || null;
          else { redis.set(key, value); result = 1; }
        } else if (cmd === 'EVAL') { const [, , lock, lease] = args; result = redis.get(lock) === lease ? 1 : 0; if (result) redis.delete(lock); }
        else throw Error('Unexpected Redis command');
        return Response.json({ result });
      }
      if (parsed.hostname === 'storage.example') {
        assert.equal(init.headers.Authorization, 'Bearer test-cloudflare-storage-secret-32-chars');
        if (data.operation === 'begin') { assert.equal(remoteLease, null); remoteLease = data.lease; return Response.json({ document: remoteDocument }); }
        assert.equal(data.lease, remoteLease);
        if (data.operation === 'save') remoteDocument = structuredClone(data.document);
        if (data.operation === 'release') remoteLease = null;
        return Response.json({ ok: true });
      }
      assert.equal(parsed.hostname, 'cloud.example');
      assert.equal(init.headers.Origin, origin);
      if (parsed.pathname === '/api/v1/editor/exchange') {
        assert.equal(data.code, 'test-one-time-code');
        assert.equal(createHash('sha256').update(data.code_verifier).digest('base64url'), challenge);
        return Response.json({ app: 'heyso', token: 'test-loyo-editor-token', user: { id: 'user1', username: '测试账号' } });
      }
      assert.equal(init.headers.Authorization, 'Bearer test-loyo-editor-token');
      if (expired) return Response.json({ error: 'SESSION_EXPIRED' }, { status: 401 });
      if (parsed.pathname === '/api/v1/editor/session') return Response.json({ app: 'heyso', user: { id: 'user1', username: '测试账号' } });
      if (parsed.pathname === '/api/v1/heyso/files') {
        if (init.method === 'POST') {
          const content = readProjectFile(data.content); assert.ok(!files.has(content.id));
          const file = { content, headId: 'head-' + headCounter++ }; files.set(content.id, file); return Response.json(file);
        }
        return Response.json({ files: [...files.values()].map(f => ({ id: f.content.id, name: f.content.name, head_id:f.headId })) });
      }
      const file = files.get(parsed.pathname.split('/')[5]); assert.ok(file);
      if (parsed.pathname.endsWith('/action')) {
        assert.equal(data.headId, file.headId);
        assert.ok(data.requestId);
        const next = structuredClone(file.content.workspace), result = act(next, data.action); next.revision++;
        file.content = readProjectFile({ ...file.content, name: next.projects[0].name, workspace: next }); file.headId = 'head-' + headCounter++;
        return Response.json({ ...file, result });
      }
      return Response.json(file);
    },
  };
}
function client(options, environment = env) {
  const jar = new Map();
  async function call(path, data, extra = {}) {
    const request = new Request(origin + path, { method: data === undefined ? 'GET' : 'POST', headers: { Cookie: [...jar].map(([k,v]) => k + '=' + v).join('; '), ...(data === undefined ? {} : { 'Content-Type': 'application/json', 'X-HeySO-Client': 'local-ui' }), ...extra }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
    const response = await handleDeployment(request, environment, options);
    for (const cookie of response.headers.getSetCookie()) {
      const part = cookie.split(';')[0], index = part.indexOf('=');
      if (cookie.includes('Max-Age=0')) jar.delete(part.slice(0,index)); else jar.set(part.slice(0,index), part.slice(index+1));
    }
    return response;
  }
  return { call, jar };
}
async function choose(c, provider, platform, mock) {
  assert.equal((await c.call('/api/setup/unlock', { setupKey: env.HEYSO_SETUP_KEY })).status, 200);
  let selected;
  if (provider === 'upstash') selected = { provider, url: 'https://redis.example', token: 'test-redis-read-write-token' };
  else if (provider === 'cloudflare') selected = platform === 'cloudflare' ? { provider, native: true } : { provider, url: 'https://storage.example', token: 'test-cloudflare-storage-secret-32-chars' };
  else {
    const connected = await (await c.call('/api/setup/cloud/connect', { base: 'https://cloud.example' })).json();
    mock.setChallenge(new URL(connected.url).searchParams.get('code_challenge'));
    assert.equal((await c.call('/api/setup/cloud/exchange', { state: 'forged', code: 'wrong' })).status, 401);
    const exchanged = await c.call('/api/setup/cloud/exchange', { state: connected.state, code: 'test-one-time-code' });
    assert.equal(exchanged.status, 200); assert.ok(!(await exchanged.text()).includes('test-loyo-editor-token'));
    selected = { provider };
  }
  assert.equal((await c.call('/api/setup/complete', { ...selected, password })).status, 400, 'a connection test must precede completion');
  const tested = await c.call('/api/setup/test', selected); assert.equal(tested.status, 200, await tested.clone().text());
  assert.equal((await c.call('/api/setup/complete', { ...selected, password })).status, 200);
  return selected;
}

for (const platform of ['netlify', 'vercel', 'cloudflare']) for (const provider of ['loyocloud', 'upstash', 'cloudflare']) {
  test(`${platform} frontend with ${provider}: first-run wizard, persistence and authorization`, async () => {
    const mock = services(), native = memory();
    const options = { platform, fetcher: mock.fetcher, ...(platform === 'cloudflare' ? { nativeStorage: native } : {}) };
    const c = client(options);
    const initial = await (await c.call('/api/session')).json(); assert.equal(initial.setupRequired, true);
    assert.equal((await c.call('/api/state')).status, 401);
    assert.equal((await c.call('/api/setup/unlock', { setupKey: 'wrong' })).status, 401);
    assert.equal((await c.call('/api/setup/unlock', { setupKey: env.HEYSO_SETUP_KEY }, { Origin: 'https://evil.example' })).status, 403);
    await choose(c, provider, platform, mock);
    const session = await (await c.call('/api/session')).json(); assert.equal(session.authenticated, true); assert.equal(session.provider, provider);
    const health = await (await c.call('/api/health')).json(); assert.equal(health.status, 'ok'); assert.equal(health.tools, 7);
    const cookie = [...c.jar.values()].join(';');
    for (const secret of [password, 'test-loyo-editor-token', 'test-redis-read-write-token']) assert.ok(!cookie.includes(secret));
    const before = await (await c.call('/api/state')).json();
    const created = await c.call('/api/action', { revision: before.revision, requestId: randomUUID(), action: { type: 'project.create', payload: { name: '配置向导测试', code: 'WIZ', goal: '验证配置后的保存', startDate: '2026-11-03', endDate: '2026-12-31' } } });
    assert.equal(created.status, 200, await created.clone().text());
    const latest = await (await c.call('/api/state')).json(); assert.ok(latest.projects.some(p => p.name === '配置向导测试'));
    assert.equal((await (await c.call('/api/state')).json()).revision, latest.revision);
    if (provider === 'loyocloud') {
      assert.equal(mock.redis.size, 0, 'LoyoCloud must never need Redis');
      assert.equal(native.read().state, undefined, 'LoyoCloud must never need native storage');
      const connection = await (await c.call('/api/connection')).json(); assert.equal(connection.oauth, true); assert.equal(connection.token, undefined);
      const project = latest.projects[0];
      const changed = await c.call('/api/action', { revision: latest.revision, action: { type: 'project.update', payload: { id: project.id, goal: '更改后保留' } } });
      assert.equal(changed.status, 200);const after=(await changed.json()).state;assert.equal(after.projects[0].goal, '更改后保留');
      const cloud=after.projects[0].cloud;
      const fast=await c.call('/api/action',{revision:after.revision,projectId:project.id,fileId:cloud.fileId,headId:cloud.headId,heads:[{fileId:cloud.fileId,headId:cloud.headId}],requestId:randomUUID(),action:{type:'item.create',payload:{projectId:project.id,kind:'task',title:'增量保存验证',startDate:project.startDate,endDate:project.endDate}}});
      assert.equal(fast.status,200);const patch=await fast.json();assert.equal(patch.delta,true);assert.equal(patch.state.items[0].title,'增量保存验证');
      const polled=await c.call('/api/state',{heads:patch.state.projects.map(p=>({fileId:p.cloud.fileId,headId:p.cloud.headId}))});assert.equal(polled.status,200);const delta=await polled.json();assert.equal(delta.delta,true);assert.equal(delta.state.projects.length,0);
      mock.expire(); assert.equal((await c.call('/api/state')).status, 401); assert.equal(c.jar.has('heyso_config'), false);
    } else {
      const connection = await (await c.call('/api/connection')).json(); assert.match(connection.token, /^hs1\./);
      const rpc = new Client({ name: 'wizard-mcp', version: '1' });
      await rpc.connect(new StreamableHTTPClientTransport(new URL(origin + '/mcp'), { requestInit: { headers: { Authorization: 'Bearer ' + connection.token } }, fetch: (url, init) => handleDeployment(new Request(url, init), env, options) }));
      try { assert.equal((await rpc.listTools()).tools.length, 7); } finally { await rpc.close(); }
      const noCookie = new Request(origin + '/api/connection', { headers: { Authorization: 'Bearer ' + connection.token } });
      assert.equal((await handleDeployment(noCookie, env, options)).status, 401, 'an MCP token is not a browser login');
    }
  });
}
test('setup completion rejects changed credentials, cookie tampering, missing owner key and unsafe URLs', async () => {
  const mock = services(), c = client({ platform: 'netlify', fetcher: mock.fetcher });
  assert.equal((await c.call('/api/setup/test', { provider: 'upstash' })).status, 401);
  await c.call('/api/setup/unlock', { setupKey: env.HEYSO_SETUP_KEY });
  for (const url of ['http://redis.example', 'https://127.0.0.1', 'https://localhost', 'https://redis.example/path', 'https://user:pass@redis.example']) assert.equal((await c.call('/api/setup/test', { provider: 'upstash', url, token: 'secret' })).status, 400);
  const selected = { provider: 'upstash', url: 'https://redis.example', token: 'test' };
  await c.call('/api/setup/test', selected);
  assert.equal((await c.call('/api/setup/complete', { ...selected, token: 'changed', password })).status, 400);
  await c.call('/api/setup/complete', { ...selected, password });
  c.jar.set('heyso_config', c.jar.get('heyso_config').slice(0,-10) + 'broken');
  assert.equal((await (await c.call('/api/session')).json()).setupRequired, true);
  const missing = client({ platform: 'vercel' }, {});
  assert.equal((await (await missing.call('/api/setup')).json()).ownerConfigured, false);
  assert.equal((await missing.call('/api/setup/unlock', { setupKey: 'anything' })).status, 503);
  const sealed = seal({ value: 'private', expires: Date.now() + 10000 }, env.HEYSO_SETUP_KEY, 'config');
  assert.equal(unseal(sealed, env.HEYSO_SETUP_KEY, 'mcp'), null);
  assert.equal(unseal(sealed, 'another-key', 'config'), null);
});

test('legacy AI credentials never authorize the Cloudflare raw storage gateway', async () => {
  const token = 'legacy-ai-token-32-characters-long';
  const response = await worker.fetch(new Request('https://storage.example/storage/v1', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: '{}' }), { HEYSO_MCP_TOKEN: token });
  assert.equal(response.status, 401);
});

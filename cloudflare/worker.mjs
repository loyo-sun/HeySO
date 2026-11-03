import { handleHosted } from '../server/hosted.mjs';
import { handleDeployment } from '../server/deployment.mjs';
import { cloudflareStorage } from '../server/cloudflare-storage.mjs';
import { safeEqual } from '../server/hosted-auth.mjs';

const storageToken = env => env.HEYSO_STORAGE_TOKEN || env.HEYSO_SETUP_KEY || '';

export class HeysoWorkspace {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env; this.tail = Promise.resolve();
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS workspace_chunks (part INTEGER PRIMARY KEY, value TEXT NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS workspace_lease (id INTEGER PRIMARY KEY, owner TEXT NOT NULL, expires INTEGER NOT NULL)');
  }
  fetch(request) {
    const storage = {
      run: callback => callback(this.document, async value => {
        const text = JSON.stringify(value);
        // Chunking also supports backups larger than a single SQLite bound value.
        this.ctx.storage.transactionSync(() => {
          this.ctx.storage.sql.exec('DELETE FROM workspace_chunks');
          for (let offset = 0, part = 0; offset < text.length; offset += 16000, part++) this.ctx.storage.sql.exec('INSERT INTO workspace_chunks (part, value) VALUES (?, ?)', part, text.slice(offset, offset + 16000));
        });
        this.document = structuredClone(value);
      }),
    };
    // Serialize across every awaited network request, not only SQLite calls.
    const run = this.tail.then(async () => {
      const text = [...this.ctx.storage.sql.exec('SELECT value FROM workspace_chunks ORDER BY part')].map(row => row.value).join('');
      this.document = text ? JSON.parse(text) : {};
      if (new URL(request.url).pathname === '/storage/v1') {
        try {
          const input = await request.json();
          if (!/^[0-9a-f-]{36}$/i.test(input.lease || '')) throw Object.assign(Error('无效的存储租约'), { status: 400 });
          const lease = [...this.ctx.storage.sql.exec('SELECT owner, expires FROM workspace_lease WHERE id = 1')][0];
          if (input.operation === 'begin') {
            if (lease && lease.expires > Date.now() && lease.owner !== input.lease) throw Object.assign(Error('另一个请求正在保存，请稍后重试'), { status: 409 });
            this.ctx.storage.sql.exec('INSERT INTO workspace_lease (id, owner, expires) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner, expires=excluded.expires', input.lease, Date.now() + 180000);
            return Response.json({ document: this.document });
          }
          if (input.operation === 'release') {
            if (lease?.owner === input.lease) this.ctx.storage.sql.exec('DELETE FROM workspace_lease WHERE id = 1');
            return Response.json({ ok: true });
          }
          if (input.operation !== 'save' || !input.document || typeof input.document !== 'object' || Array.isArray(input.document)) throw Object.assign(Error('无效的存储操作'), { status: 400 });
          if (lease?.owner !== input.lease || lease.expires <= Date.now()) throw Object.assign(Error('保存租约已过期，请刷新后重试'), { status: 409 });
          await storage.run((_, save) => save(input.document));
          return Response.json({ ok: true });
        } catch (error) { return Response.json({ error: error.status ? error.message : 'Cloudflare 存储操作失败' }, { status: error.status || 500 }); }
      }
      return handleHosted(request, this.env, storage);
    });
    this.tail = run.catch(() => {});
    return run;
  }
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/storage/v1') {
      const token = storageToken(env);
      if (token.length < 32 || !safeEqual(request.headers.get('authorization'), 'Bearer ' + token)) return Response.json({ error: '存储连接密钥无效' }, { status: 401 });
      if (request.method !== 'POST') return Response.json({ error: '仅支持 POST' }, { status: 405 });
      const headers = new Headers(request.headers); headers.delete('cookie');
      const response = await env.HEYSO_WORKSPACE.get(env.HEYSO_WORKSPACE.idFromName('workspace-v1')).fetch(new Request(request, { headers }));
      const out = new Headers(response.headers); out.set('Cache-Control', 'no-store');
      return new Response(response.body, { status: response.status, headers: out });
    }
    if (path === '/mcp' || path.startsWith('/api/')) {
      const id = env.HEYSO_WORKSPACE.idFromName('workspace-v1');
      const stub = env.HEYSO_WORKSPACE.get(id);
      const nativeStorage = cloudflareStorage({ url: 'https://storage.internal', token: storageToken(env), fetcher: (url, init) => stub.fetch(new Request(url, init)) });
      return handleDeployment(request, env, { platform: 'cloudflare', nativeStorage });
    }
    return env.ASSETS.fetch(request);
  },
};

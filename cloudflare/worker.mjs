import { handleHosted } from '../server/hosted.mjs';

export class HeysoWorkspace {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env; this.tail = Promise.resolve();
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS workspace_chunks (part INTEGER PRIMARY KEY, value TEXT NOT NULL)');
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
      return handleHosted(request, this.env, storage);
    });
    this.tail = run.catch(() => {});
    return run;
  }
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/mcp' || path.startsWith('/api/')) {
      const id = env.HEYSO_WORKSPACE.idFromName('workspace-v1');
      return env.HEYSO_WORKSPACE.get(id).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

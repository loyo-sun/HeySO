import { randomUUID } from 'node:crypto';

export function cloudflareStorage({ url, token, fetcher = fetch }) {
  const rpc = async input => {
    const response = await fetcher(url + '/storage/v1', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(input), redirect: 'manual', signal: AbortSignal.timeout(20000) });
    const result = await response.json();
    if (!response.ok) throw Object.assign(Error(result.error || 'Cloudflare 存储暂时不可用'), { status: response.status });
    return result;
  };
  return {
    async run(callback) {
      const id = randomUUID();
      const { document } = await rpc({ operation: 'begin', lease: id });
      try { return await callback(document, value => rpc({ operation: 'save', lease: id, document: value })); }
      finally { await rpc({ operation: 'release', lease: id }).catch(() => {}); }
    },
  };
}

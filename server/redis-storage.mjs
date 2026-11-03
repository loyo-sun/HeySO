import { randomUUID } from 'node:crypto';

const failure = (message, status = 503) => Object.assign(Error(message), { status });
// Fenced writes prevent a paused function from overwriting a newer lease holder.
export function redisStorage(env, fetcher = fetch) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (!url || !token) throw failure('请配置 Upstash Redis 的 REST 地址与读写密钥');
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/') throw failure('Redis REST 地址必须是 HTTPS 根地址');
  const key = env.HEYSO_STORAGE_KEY || 'heyso:workspace:v1';
  async function command(args) {
    const res = await fetcher(parsed.origin, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args), signal: AbortSignal.timeout(15000), redirect: 'manual' });
    if (!res.ok) throw failure('持久化存储暂时不可用，请稍后重试');
    const data = await res.json();
    if (data.error) throw failure('持久化存储操作失败，请检查 Redis 配置和容量');
    return data.result;
  }
  return {
    async run(callback) {
      const lease = randomUUID(), lock = key + ':lock';
      if (await command(['SET', lock, lease, 'NX', 'PX', '180000']) !== 'OK') throw failure('另一个请求正在保存，请稍后重试', 409);
      let wrote = false;
      try {
        // Lua reads from the primary too, avoiding stale replica reads after a write.
        const raw = await command(['EVAL', "if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('GET',KEYS[2]) else return redis.error_reply('lease expired') end", '2', lock, key, lease]);
        const document = raw ? JSON.parse(raw) : {};
        const save = async (value) => {
          const result = await command(['EVAL', "if redis.call('GET',KEYS[1]) == ARGV[1] then redis.call('SET',KEYS[2],ARGV[2]);return 1 else return 0 end", '2', lock, key, lease, JSON.stringify(value)]);
          if (result !== 1) throw failure('保存租约已过期，请刷新后重试', 409);
          wrote = true;
        };
        const result = await callback(document, save);
        if (!raw && !wrote) await save(document);
        return result;
      } finally {
        // Never replace a successful durable write with an unlock error.
        await command(['EVAL', "if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end", '1', lock, lease]).catch(() => {});
      }
    },
  };
}

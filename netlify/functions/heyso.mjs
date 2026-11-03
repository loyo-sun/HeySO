import { handleHosted } from '../../server/hosted.mjs';
import { redisStorage } from '../../server/redis-storage.mjs';
export default async function handler(request) {
  // Construct lazily so missing settings produce a readable setup error.
  const storage = { run: callback => redisStorage(process.env).run(callback) };
  return handleHosted(request, process.env, storage);
}
export const config = { path: ['/api/*', '/mcp'] };

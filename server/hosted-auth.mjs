import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
const cookieName = 'heyso_session';
const lifetime = 7 * 24 * 60 * 60;
export const safeEqual = (a, b) => {
  const digest = value => createHash('sha256').update(String(value)).digest();
  return timingSafeEqual(digest(a), digest(b));
};
const sign = (value, env) => createHmac('sha256', env.HEYSO_PASSWORD).update('heyso-session-v1:' + value).digest('base64url');
export function configured(env) {
  return typeof env.HEYSO_PASSWORD === 'string' && env.HEYSO_PASSWORD.length >= 16 && typeof env.HEYSO_MCP_TOKEN === 'string' && env.HEYSO_MCP_TOKEN.length >= 32 && env.HEYSO_PASSWORD !== env.HEYSO_MCP_TOKEN;
}
export function authenticated(request, env) {
  const value = request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  if (!value) return false;
  const [expires, signature] = value.split('.');
  return Number(expires) > Date.now() / 1000 && Number(expires) <= Date.now() / 1000 + lifetime + 60 && safeEqual(signature, sign(expires, env));
}
export function sessionCookie(request, env, clear = false) {
  const expires = String(Math.floor(Date.now() / 1000) + lifetime);
  return `${cookieName}=${clear ? '' : expires + '.' + sign(expires, env)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : lifetime}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}

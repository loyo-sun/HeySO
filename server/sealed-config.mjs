import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const setupSecret = env => env.HEYSO_SETUP_KEY || env.HEYSO_PASSWORD || '';
export const cookieValue = (request, name) => request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))?.slice(name.length + 1);
export function seal(value, secret, purpose) {
  const iv = randomBytes(12), key = createHash('sha256').update(secret).digest();
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('heyso:' + purpose));
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
}
export function unseal(text, secret, purpose) {
  try {
    if (!text || text.length > 8000) return null;
    const bytes = Buffer.from(text, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', createHash('sha256').update(secret).digest(), bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from('heyso:' + purpose)); decipher.setAuthTag(bytes.subarray(12, 28));
    const value = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
    if (value.expires && value.expires < Date.now()) return null;
    return value;
  } catch { return null; }
}
export function configCookie(request, name, value, age = 30 * 86400) {
  if (value.length > 3800) throw Object.assign(Error('连接配置过长，请使用部署环境变量配置地址与密钥'), { status: 400 });
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
export function serviceUrl(value, label = '服务') {
  let url;
  try { url = new URL(value); } catch { throw Object.assign(Error(`${label}地址无效`), { status: 400 }); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || url.port || /^(localhost|.*\.localhost|\[.*\]|\d+[.\d]*)$/i.test(url.hostname)) throw Object.assign(Error(`${label}地址须为 HTTPS 域名根地址`), { status: 400 });
  return url.origin;
}

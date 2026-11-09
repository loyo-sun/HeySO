// Self-hosted HeySO sites are approved by the signed-in user on /connect/heyso.
// Codes and sessions remain bound to that exact origin and the HeySO application.
export function selfHostedHeysoOrigin(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    if (url.origin !== value || url.username || url.password || url.search || url.hash) return false;
    return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  } catch { return false; }
}
export const allowsEditorOrigin = (origins, app, origin) => origins.has(origin) || (app === 'heyso' && selfHostedHeysoOrigin(origin));
export function selfHostedEditorRoute(path, method, bearer) {
  if (/^\/api\/v1\/editor\/(exchange|session|logout)$/.test(path)) return true;
  if (/^\/api\/v1\/heyso\/(?:state|updates|capabilities)$/.test(path)) return true;
  if (/^\/api\/v1\/heyso\/files(?:\/[^/]+(?:\/(?:action|view-preferences))?)?$/.test(path)) return true;
  return /^\/api\/v1\/space(?:\/|$)/.test(path) && (method === 'OPTIONS' || bearer);
}

import { handleDeployment } from '../server/deployment.mjs';
const handler = request => {
  const url = new URL(request.url);
  // Preserve the public route even when the platform exposes the rewritten URL.
  const route = url.searchParams.get('__heyso_route');
  if (route && (route.startsWith('/api/') || route === '/mcp')) {
    url.pathname = route; url.searchParams.delete('__heyso_route');
    request = new Request(url, request);
  }
  return handleDeployment(request, process.env, { platform: 'vercel' });
};
export { handler as GET, handler as POST, handler as DELETE, handler as OPTIONS };

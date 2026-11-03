import { handleDeployment } from '../../server/deployment.mjs';
export default request => handleDeployment(request, process.env, { platform: 'netlify' });
export const config = { path: ['/api/*', '/mcp'] };

import test from 'node:test';
import assert from 'node:assert/strict';
import { readWorkspaceRoute, workspaceRouteUrl } from '../src/workspace-route.mjs';

const options = { views: ['overview', 'board', 'backlog', 'settings'], sections: ['general', 'integrations'], fallbackProject: 'saved-project' };
test('shared links take precedence over the recipient’s last selected project and round-trip detail tabs', () => {
  const route = { page: 'projects', projectId: 'shared-project', view: 'backlog', settingsSection: 'general', selected: 'item-42', tab: 'history' };
  const url = workspaceRouteUrl('https://heyso.example/', route);
  assert.deepEqual(readWorkspaceRoute(url, options), route);
  assert.equal(url.searchParams.get('project'), 'shared-project');
  assert.equal(readWorkspaceRoute('https://heyso.example/?view=board', options).view, 'board');
});
test('dashboard links clear project details while keeping unrelated URL parameters', () => {
  const route = { ...readWorkspaceRoute('https://heyso.example/?view=board&item=1', options), page: 'dashboard' };
  const url = workspaceRouteUrl('https://heyso.example/?project=p&view=board&item=1&detail=runs&source=cloud', route);
  assert.equal(url.search, '?source=cloud&tab=dashboard');
  assert.equal(readWorkspaceRoute(url, options).selected, null);
});
test('settings and cloud file links restore the right section and invalid pages fall back safely', () => {
  const route = readWorkspaceRoute('https://heyso.example/?tab=projects&project=p&view=settings&section=integrations', options);
  assert.equal(route.settingsSection, 'integrations');
  assert.equal(workspaceRouteUrl('https://heyso.example/', route).searchParams.get('section'), 'integrations');
  const cloud = readWorkspaceRoute('https://heyso.example/?cloudFile=file', options);
  assert.equal(cloud.page, 'projects');
  assert.equal(cloud.view, 'settings');
  assert.equal(cloud.settingsSection, 'integrations');
  const invalid = readWorkspaceRoute('https://heyso.example/?tab=projects&view=invalid&section=missing&detail=missing', options);
  assert.equal(invalid.view, 'overview');
  assert.equal(invalid.settingsSection, 'general');
  assert.equal(invalid.tab, 'detail');
});

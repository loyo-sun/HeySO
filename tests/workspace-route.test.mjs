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

test('legacy hierarchy links open the flat list and retain the selected work item', () => {
  const current = { ...options, views: ['overview', 'backlog', 'board', 'list', 'settings'] };
  const route = readWorkspaceRoute('https://heyso.example/?view=hierarchy&project=p&item=i&detail=children', current);
  assert.equal(route.view, 'list');
  assert.equal(route.selected, 'i');
  assert.equal(route.tab, 'children');
  const url = workspaceRouteUrl('https://heyso.example/', route);
  assert.equal(url.searchParams.get('view'), 'list');
  assert.deepEqual(readWorkspaceRoute(url, current), route);
});

test('flat navigation opens roadmap by default and preserves legacy sprint links', () => {
  const current = {...options, views:['roadmap','backlog','board','list','releases','ai','settings'], sections:[...options.sections,'memory']};
  assert.equal(readWorkspaceRoute('https://heyso.example/?tab=projects',current).view,'roadmap');
  for (const legacy of ['work','sprints']) {
    const route=readWorkspaceRoute('https://heyso.example/?view='+legacy+'&project=p&item=i',current);
    assert.equal(route.view,'backlog');assert.equal(route.selected,'i');assert.equal(route.projectId,'p');
  }
});
test('legacy memory links open settings memory and round-trip without losing project context', () => {
  const current = {...options,views:['roadmap','backlog','settings'],sections:['general','integrations','memory']};
  const route=readWorkspaceRoute('https://heyso.example/?project=p&view=memory',current);
  assert.equal(route.view,'settings');assert.equal(route.settingsSection,'memory');
  const url=workspaceRouteUrl('https://heyso.example/',route);
  assert.equal(url.searchParams.get('section'),'memory');assert.deepEqual(readWorkspaceRoute(url,current),route);
  assert.equal(readWorkspaceRoute('https://heyso.example/?view=memory&cloudFile=f',current).settingsSection,'integrations');
});
test('version detail URLs keep the version and item selection, and leave no stale version parameter on other pages', () => {
 const current={...options,views:[...options.views,'releases']};
 const route=readWorkspaceRoute('https://heyso.example/?view=releases&project=p&release=r&item=i',current);
 assert.equal(route.releaseId,'r');assert.equal(route.selected,'i');
 const url=workspaceRouteUrl('https://heyso.example/',route);assert.deepEqual(readWorkspaceRoute(url,current),route);
 assert.equal(workspaceRouteUrl(url,{...route,view:'board'}).searchParams.has('release'),false);
});

test('report URLs retain report filters and remove them when navigating elsewhere',()=>{
 const route={...readWorkspaceRoute('https://heyso.example/?tab=projects&project=p&view=reports',{views:['reports','roadmap'],sections:[],fallbackProject:'p'})};
 assert.equal(workspaceRouteUrl('https://heyso.example/?report=cycle&r_owner=甲',route).searchParams.get('report'),'cycle');
 const next=workspaceRouteUrl('https://heyso.example/?report=cycle&r_owner=甲',{...route,view:'roadmap'});
 assert.equal(next.searchParams.has('report'),false);assert.equal(next.searchParams.has('r_owner'),false);
});

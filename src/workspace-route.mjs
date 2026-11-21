export function readWorkspaceRoute(url, { views, sections, fallbackProject = '' }) {
  const params = new URL(url).searchParams;
  const cloud = params.has('cloudFile');
  const page = params.get('tab') === 'dashboard' ? 'dashboard' : 'projects';
  const requested = params.get('view');
  const legacyMemory = requested === 'memory';
  const requestedSection=cloud?'integrations':legacyMemory?'memory':params.get('section');
  const aliases = {hierarchy:'list',work:'backlog',sprints:'backlog'};
  const normalized = views.includes(aliases[requested]) ? aliases[requested] : requested;
  const fallbackView = views.includes('roadmap') ? 'roadmap' : 'overview';
  return {
    page,
    projectId: params.get('project') || fallbackProject,
    ...(requested === 'releases' && params.get('release') ? {releaseId:params.get('release')} : {}),
    view: cloud || legacyMemory ? 'settings' : views.includes(normalized) ? normalized : fallbackView,
    settingsSection: sections.includes(requestedSection) ? requestedSection : sections.includes('general') ? 'general' : sections[0] || 'general',
    selected: params.get('item') || null,
    tab: ['detail', 'children', 'runs', 'history'].includes(params.get('detail')) ? params.get('detail') : 'detail',
  };
}

export function workspaceRouteUrl(currentUrl, route) {
  const url = new URL(currentUrl);
  for (const key of ['tab', 'project', 'view', 'section', 'item', 'detail', 'release']) url.searchParams.delete(key);
  url.searchParams.set('tab', route.page);
  if (route.page === 'projects') {
    if (route.projectId) url.searchParams.set('project', route.projectId);
    url.searchParams.set('view', route.view);
    if (route.view === 'releases' && route.releaseId) url.searchParams.set('release',route.releaseId);
    if (route.view === 'settings') url.searchParams.set('section', route.settingsSection);
    if (route.selected) {
      url.searchParams.set('item', route.selected);
      if (route.tab !== 'detail') url.searchParams.set('detail', route.tab);
    }
  }
  if (route.page === 'dashboard' && route.selected) {
    if (route.projectId) url.searchParams.set('project', route.projectId);
    url.searchParams.set('item', route.selected);
    if (route.tab !== 'detail') url.searchParams.set('detail', route.tab);
  }
  if(route.view!=='reports')for(const key of [...url.searchParams.keys()])if(key==='report'||key.startsWith('r_'))url.searchParams.delete(key);
  return url;
}

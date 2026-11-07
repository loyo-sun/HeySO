export const softwareVersion = 'beta1.0';
export const repositoryUrl = 'https://github.com/loyo-sun/HeySO';
export function publishedSoftwareVersion(project, releases = []) {
  return releases.filter(r => r.projectId === project.id && r.status === 'released')
    .sort((a,b) => String(b.releasedAt || b.releasedDate || '').localeCompare(String(a.releasedAt || a.releasedDate || '')))[0]?.name || '尚无已发布版本';
}

export const contractVersion = '1.0.0';
const definitions = {
  'header.brand': ['replace','hide'],
  'header.navigation': ['append','replace','hide'],
  'header.project-entry': ['append','replace','hide'],
  'project.selector-actions': ['append','replace','hide'],
  'project.title-actions': ['append','replace','hide'],
  'header.right': ['append','replace','hide'],
};
export const slotDefinitions=Object.freeze(Object.fromEntries(Object.entries(definitions).map(([id,modes])=>[id,Object.freeze(modes)])));
export const builtinSettingsIds = Object.freeze(['general','members','roles','types','states','workflow','integrations','memory','data','about']);
const validId = id => typeof id === 'string' && /^[a-z][a-z0-9._-]*$/.test(id);
export const ordered = entries => [...entries].sort((a,b)=>(a.order??0)-(b.order??0)||(a.id<b.id?-1:a.id>b.id?1:0));
export function createShellExtensions(input = {}) {
  if (input.contractVersion && input.contractVersion !== contractVersion) throw Error('Unsupported shell contract version');
  const seen = new Set();
  const check = entry => {
    if (!validId(entry.id) || seen.has(entry.id)) throw Error('Invalid or duplicate extension id: '+entry.id);
    seen.add(entry.id);
    if (entry.order !== undefined && !Number.isFinite(entry.order)) throw Error('Invalid order: '+entry.id);
    if (entry.when !== undefined && typeof entry.when !== 'function') throw Error('when must be a function');
    if (entry.mode !== 'hide' && [entry.render,entry.component,entry.node].filter(x=>x!==undefined).length !== 1) throw Error('Supply exactly one render, component or node: '+entry.id);
    if (entry.render !== undefined && typeof entry.render !== 'function') throw Error('render must be a function');
  };
  const controls = new Set();
  const slots = ordered((input.slots || []).map(raw => {
    const e = {...raw,mode:raw.mode || 'append'};check(e);
    if (!slotDefinitions[e.slot]?.includes(e.mode)) throw Error('Unsupported slot or mode: '+e.slot);
    if (e.mode !== 'append') {if(controls.has(e.slot))throw Error('Multiple replace/hide controls for '+e.slot);controls.add(e.slot);}
    return Object.freeze(e);
  }));
  const settingsPages = ordered((input.settingsPages || []).map(raw => {
    const e={...raw,mode:raw.mode||'append'};check(e);
    if (!['append','replace','hide'].includes(e.mode)) throw Error('Invalid settings mode');
    const builtin=builtinSettingsIds.includes(e.id);
    if ((e.mode==='append'&&builtin)||(e.mode!=='append'&&!builtin)) throw Error('Settings replacement/hide must target a built-in id: '+e.id);
    if (e.mode!=='hide'&&(typeof e.label!=='string'||!e.label.trim()))throw Error('Settings label required');
    // Settings visibility is fixed at startup so route validation and navigation cannot disagree.
    if(e.when)throw Error('Settings pages do not accept when; register visible pages at startup');
    return Object.freeze(e);
  }));
  if(builtinSettingsIds.every(id=>settingsPages.some(p=>p.id===id&&p.mode==='hide')))throw Error('At least one settings page must remain visible');
  const allowedTheme=['accent','background','text','border','muted'];
  for(const [key,value] of Object.entries(input.theme||{}))if(!allowedTheme.includes(key)||typeof value!=='string'||!/^#[0-9a-f]{6}$/i.test(value))throw Error('Theme accepts six-digit hex colors only: '+key);
  return Object.freeze({contractVersion,slots:Object.freeze(slots),settingsPages:Object.freeze(settingsPages),theme:Object.freeze({...input.theme}),readOnly:input.readOnly===true});
}
export function resolveSlot(registry,slot,context) {
  if(!slotDefinitions[slot])throw Error('Unknown slot: '+slot);
  const entries=registry.slots.filter(e=>e.slot===slot&&(!e.when||e.when(context)));
  if(entries.some(e=>e.mode==='hide'))return {hidden:true,replace:null,append:[]};
  return {hidden:false,replace:entries.find(e=>e.mode==='replace')||null,append:entries.filter(e=>e.mode==='append')};
}
export function resolveSettingsPages(registry,builtins) {
  const pages=builtins.map(([id,label,icon],i)=>({id,label,icon,order:i*100}));
  for(const e of registry.settingsPages){const index=pages.findIndex(p=>p.id===e.id);if(e.mode==='hide')pages.splice(index,1);else if(e.mode==='replace')pages[index]={...e,order:e.order??pages[index].order};else pages.push({...e,order:e.order??1000});}
  return ordered(pages);
}
export function projectSummary(project) {
  return project ? Object.freeze({id:project.id,name:project.name,code:project.code,goal:project.goal||'',longTerm:!!project.longTerm}) : null;
}

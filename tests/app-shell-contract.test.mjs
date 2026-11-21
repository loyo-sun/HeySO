import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createShellExtensions,resolveSlot,resolveSettingsPages,projectSummary,slotDefinitions,contractVersion} from '../src/extensions/contract.mjs';
import {readWorkspaceRoute,workspaceRouteUrl} from '../src/workspace-route.mjs';
const builtins=[['general','常规'],['about','关于']];
test('shell defaults contain no injected menus and preserve built-in settings',()=>{
 const registry=createShellExtensions();assert.equal(registry.contractVersion,'1.0.0');
 assert.deepEqual(resolveSlot(registry,'header.navigation',{}),{hidden:false,replace:null,append:[]});
 assert.deepEqual(resolveSettingsPages(registry,builtins).map(p=>p.id),['general','about']);
});
test('slots apply visibility, explicit replacement/hide and deterministic order without mutation',()=>{
 const input={slots:[{id:'z',slot:'header.right',node:'Z',order:2},{id:'a',slot:'header.right',node:'A',order:2},{id:'base',slot:'header.right',mode:'replace',node:'R'},{id:'missing',slot:'header.right',node:'M',when:ctx=>!!ctx.project}]};
 const r=createShellExtensions(input),resolved=resolveSlot(r,'header.right',{project:null});
 assert.equal(resolved.replace.node,'R');assert.deepEqual(resolved.append.map(e=>e.id),['a','z']);
 assert.equal(input.slots[0].mode,undefined);assert.equal(Object.isFrozen(r),true);
 const hidden=createShellExtensions({slots:[{id:'off',slot:'header.right',mode:'hide'},{id:'still',slot:'header.right',node:'ignored'}]});
 assert.equal(resolveSlot(hidden,'header.right',{}).hidden,true);
});
test('registration rejects duplicate ids, incompatible modes, ambiguous renderers, unsafe theme and major mismatch',()=>{
 for(const input of [
  {contractVersion:'2.0.0'},
  {slots:[{id:'a',slot:'no-such-slot',node:'x'}]},
  {slots:[{id:'a',slot:'header.brand',node:'x'}]},
  {slots:[{id:'a',slot:'header.right',node:'x'},{id:'a',slot:'header.right',node:'y'}]},
  {slots:[{id:'a',slot:'header.right',mode:'hide'},{id:'b',slot:'header.right',mode:'replace',node:'y'}]},
  {slots:[{id:'a',slot:'header.right',node:'x',render:()=>null}]},
  {slots:[{id:'a',slot:'header.right',node:'x',order:NaN}]},
  {theme:{accent:'url(https://example.invalid/script)'}},
  {settingsPages:[{id:'general',label:'duplicate',node:'x'}]},
  {settingsPages:[{id:'custom',mode:'replace',label:'invalid',node:'x'}]},
 ])assert.throws(()=>createShellExtensions(input));
});
test('settings additions, replacements and hidden pages have stable ordering and registered routes',()=>{
 const r=createShellExtensions({settingsPages:[{id:'host-a',label:'Host',node:'x',order:50},{id:'general',label:'Replaced',mode:'replace',node:'y'},{id:'about',mode:'hide'}]});
 const pages=resolveSettingsPages(r,builtins);assert.deepEqual(pages.map(p=>p.id),['general','host-a']);assert.equal(pages[0].label,'Replaced');
 const options={views:['roadmap','settings'],sections:pages.map(p=>p.id),fallbackProject:'p'};
 const route=readWorkspaceRoute('https://example.test/?view=settings&section=host-a',options);
 assert.equal(route.settingsSection,'host-a');assert.deepEqual(readWorkspaceRoute(workspaceRouteUrl('https://example.test/',route),options),route);
 assert.equal(readWorkspaceRoute('https://example.test/',options).page,'projects');
 assert.equal(readWorkspaceRoute('https://example.test/?tab=dashboard',options).page,'dashboard');
 const noGeneral=createShellExtensions({settingsPages:[{id:'general',mode:'hide'}]});
 assert.equal(readWorkspaceRoute('https://example.test/?view=settings&section=general',{...options,sections:resolveSettingsPages(noGeneral,builtins).map(p=>p.id)}).settingsSection,'about');
});
test('project context is a frozen allowlist with no cloud credentials, storage or tenant fields',()=>{
 const p=projectSummary({id:'p',name:'Project',code:'P',goal:'goal',cloud:{token:'secret'},token:'secret',tenantId:'private',workConfig:{}});
 assert.deepEqual(Object.keys(p),['id','name','code','goal','longTerm']);assert.equal(Object.isFrozen(p),true);assert.equal(projectSummary(null),null);
});
test('machine readable contract matches runtime slot ids, modes and version',()=>{
 const c=JSON.parse(readFileSync(new URL('../docs/extensions/contract.json',import.meta.url)));
 assert.equal(c.contractVersion,contractVersion);
 for(const [id,modes] of Object.entries(slotDefinitions))assert.deepEqual(c.slots.find(s=>s.id===id).modes,modes);
 assert.equal(c.publicImportPath,'src/extensions/index.jsx');
});

test('hidden settings respect legacy memory and cloud routes without exposing a hidden page',()=>{
 const options={views:['roadmap','settings'],sections:['general','about'],fallbackProject:'p'};
 for(const url of ['https://example.test/?cloudFile=f','https://example.test/?view=memory']){const route=readWorkspaceRoute(url,options);assert.equal(route.view,'settings');assert.equal(route.settingsSection,'general');}
});

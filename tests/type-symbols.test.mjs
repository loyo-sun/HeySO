import test from 'node:test';import assert from 'node:assert/strict';
import {typeIcons,typeIcon,builtinTypes,defaultWorkConfig,checkWorkConfig} from '../shared/work-config.mjs';
import {seed} from '../server/model.mjs';import {migrateState} from '../server/migrate.mjs';
test('new projects omit retired system types while keeping all sixteen icon choices',()=>{
 assert.equal(Object.keys(typeIcons).length,16);assert.ok(!builtinTypes.some(t=>['theme','feature'].includes(t.id)));
 assert.ok(!defaultWorkConfig().types.some(t=>['theme','feature'].includes(t.id)));checkWorkConfig(defaultWorkConfig());
 assert.equal(typeIcon({icon:'rocket'}),'release');assert.equal(typeIcon({icon:'branch'}),'subtask');
});
test('retiring system types keeps historical items, parents and custom icon choices intact',()=>{
 const old=seed();for(const t of old.projects[0].workConfig.types)if(['theme','feature'].includes(t.id)){delete t.retiredBuiltin;t.hidden=false;t.icon='rocket';}
 const next=migrateState(old);assert.deepEqual(next.items,old.items);
 for(const t of next.projects[0].workConfig.types.filter(t=>['theme','feature'].includes(t.id))){assert.equal(t.hidden,true);assert.equal(t.retiredBuiltin,true);assert.equal(t.icon,'rocket');}
 assert.deepEqual(migrateState(next),next);
});

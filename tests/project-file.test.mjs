import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {seed,act,validate} from '../server/model.mjs';
import {projectFile,readProjectFile,collections} from '../server/project-file.mjs';
test('.heyso roundtrip preserves a complete project and excludes other projects and connection metadata',()=>{
 const state=validate(seed()),p=state.projects[0];p.cloud={token:'never-export'};
 act(state,{type:'project.create',payload:{name:'其他项目',code:'OTHER',goal:'另一个目标',startDate:p.startDate,endDate:p.endDate}});
 const file=projectFile(state,p.id);assert.equal(file.format,'heyso');assert.equal(file.workspace.projects.length,1);assert.equal(file.workspace.projects[0].cloud,undefined);
 assert.equal(file.workspace.projects[0].nextItemNumber,p.nextItemNumber);
 for(const key of collections)assert.deepEqual(file.workspace[key],state[key].filter(x=>x.projectId===p.id));
 assert.deepEqual(readProjectFile(JSON.parse(JSON.stringify(file))),file);
 const invalid=structuredClone(file);invalid.workspace.projects.push(state.projects[1]);assert.throws(()=>readProjectFile(invalid));
 const foreign=structuredClone(file);foreign.workspace.events.push({projectId:state.projects[1].id});assert.throws(()=>readProjectFile(foreign));
 assert.throws(()=>readProjectFile({...file,fileVersion:99}));
});
test('cloud domain bundle stays byte-for-byte identical to HeySO rules',()=>{
 for(const file of ['server/model.mjs','server/item-activity.mjs','server/migrate.mjs','server/project-file.mjs','server/mcp.mjs','server/mcp-tools.mjs','server/mcp-item-schema.mjs','shared/work-config.mjs','shared/workflows.mjs','shared/identifiers.mjs','shared/member-roles.mjs','shared/schedule.mjs','shared/run-closure.mjs','shared/memory.mjs','shared/roadmap-order.mjs']){
   const bundled=new URL('../../LoyoCloud/vendor/heyso/'+file,import.meta.url);
   if(fs.existsSync(bundled))assert.equal(fs.readFileSync(bundled,'utf8'),fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),file);
 }
});

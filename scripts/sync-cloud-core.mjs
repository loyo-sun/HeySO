// LoyoCloud deploys independently: package an identical, verifiable copy of the domain rules.
import {mkdirSync,copyFileSync} from 'node:fs';
const target = new URL('../../LoyoCloud/vendor/heyso/',import.meta.url);
for (const dir of ['server','shared']) mkdirSync(new URL(dir+'/',target),{recursive:true});
for (const file of ['server/model.mjs','server/item-activity.mjs','server/migrate.mjs','server/project-file.mjs','server/mcp.mjs','server/mcp-tools.mjs','server/mcp-item-schema.mjs','shared/work-config.mjs','shared/workflows.mjs','shared/identifiers.mjs','shared/member-roles.mjs','shared/schedule.mjs','shared/run-closure.mjs','shared/memory.mjs'])
  copyFileSync(new URL('../'+file,import.meta.url),new URL(file,target));

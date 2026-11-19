import test from 'node:test';
import assert from 'node:assert/strict';
import {assertMcpGrant,assertProjectWrite,assertProjectTarget} from '../shared/mcp-authorization.mjs';
const identity = {userId:'owner',grantId:'grant',scopes:['heyso:read','heyso:write']};
const grant = {id:'grant',user_id:'owner',app:'heyso',revoked:false,scopes:identity.scopes,document_ids:['file'],connection_ids:null};
const rejects = (fn,code) => assert.throws(fn,e=>e.code===code && e.status>=400);
test('actual generic 403 branches: reading a project does not confer write scope',()=>{
  const token={...identity,scopes:['heyso:read']},readGrant={...grant,scopes:['heyso:read']};
  assertMcpGrant(token,readGrant,'file','heyso:read');
  rejects(()=>assertMcpGrant(token,readGrant,'file','heyso:write'),'PLUGIN_SCOPE_REQUIRED');
  rejects(()=>assertMcpGrant(identity,readGrant,'file','heyso:write'),'PLUGIN_SCOPE_REQUIRED');
  rejects(()=>assertMcpGrant(token,grant,'file','heyso:write'),'PLUGIN_SCOPE_REQUIRED');
});
test('file allowlist, revoked grants, other tenant, connection restrictions stay enforced',()=>{
  assertMcpGrant(identity,grant,'file','heyso:write');
  for(const bad of [null,{...grant,revoked:true},{...grant,user_id:'other'},{...grant,app:'other'},{...grant,id:'other'}])
    rejects(()=>assertMcpGrant(identity,bad,'file','heyso:write'),'PLUGIN_AUTHORIZATION_REQUIRED');
  for(const bad of [{...grant,document_ids:[]},{...grant,connection_ids:['connection']}])
    rejects(()=>assertMcpGrant(identity,bad,'file','heyso:write'),'FILE_ACCESS_DENIED');
  assertMcpGrant(identity,{...grant,document_ids:null},'file','heyso:write');
});
test('plugin authorization cannot confer project ownership or select another project',()=>{
  assertProjectWrite(identity,{user_id:'owner',app:'heyso'});
  for(const file of [null,{user_id:'other',app:'heyso'},{user_id:'owner',app:'other'},{user_id:'owner',app:'heyso',deleted_at:'now'}])
    rejects(()=>assertProjectWrite(identity,file),'PROJECT_WRITE_FORBIDDEN');
  assertProjectTarget({projects:[{id:'project'}]},'project');
  rejects(()=>assertProjectTarget({projects:[{id:'project'}]},'other'),'FILE_ACCESS_DENIED');
});

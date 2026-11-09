import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {handleDeployment} from '../server/deployment.mjs';
import {sessionCookie} from '../server/hosted-auth.mjs';
import {seal} from '../server/sealed-config.mjs';
import {readProjectFile} from '../server/project-file.mjs';
import {WorkspaceSync} from '../src/workspace-sync.mjs';

test('deployed LoyoCloud gateway creates ongoing projects without dates, preserves mode on reload and still requires fixed dates',async()=>{
 const origin='https://heyso.test',base='https://cloud.test',env={HEYSO_SETUP_KEY:'setup-key-for-gateway-regression-0001'};
 const config={provider:'loyocloud',base,origin,token:'test-token',user:{id:'owner'},password:'gateway-test-password',mcpKey:'gateway-test-mcp-key',expires:Date.now()+60000};
 const cookie='heyso_config='+seal(config,env.HEYSO_SETUP_KEY,'config')+'; '+sessionCookie(new Request(origin),{HEYSO_PASSWORD:config.password}).split(';')[0];
 const files=new Map();let writes=0;
 const upstream=async(url,init)=>{
  const path=new URL(url).pathname;
  if(path==='/api/v1/heyso/files' && init.method==='GET')return Response.json({files:[...files.values()].map(f=>({id:f.content.id,headId:f.headId}))});
  if(path==='/api/v1/heyso/files' && init.method==='POST'){
   const content=readProjectFile(JSON.parse(init.body).content);assert.equal(content.workspace.projects[0].longTerm,true);
   const result={content,headId:randomUUID()};files.set(content.id,result);writes++;return Response.json(result);
  }
  const file=files.get(path.split('/').at(-1));assert.ok(file,'unexpected upstream route '+path);return Response.json(file);
 };
 const messages=[],client=new WorkspaceSync({cloud:true,onMessage:m=>messages.push(m),fetcher:(path,init={})=>handleDeployment(new Request(origin+path,{...init,headers:{...init.headers,Cookie:cookie,Origin:origin}}),env,{fetcher:upstream})});
 await client.refresh();assert.ok(client.state);
 const result=await client.action('project.create',{name:'长期云项目',code:'LT',goal:'持续推进',longTerm:true,startDate:'',endDate:''});
 assert.ok(result,messages.join('\n'));assert.equal(writes,1);
 const p=client.state.projects[0];assert.equal(p.longTerm,true);assert.equal(p.startDate,'');assert.equal(p.endDate,'');assert.ok(p.cloud.fileId);
 await client.refresh();assert.equal(client.state.projects[0].longTerm,true);
 const rejected=await client.action('project.create',{name:'有限云项目',code:'FX',goal:'有限周期',longTerm:false,startDate:'',endDate:''},p.id);
 assert.equal(rejected,null);assert.equal(writes,1);assert.match(messages.at(-1),/同时填写开始日期和结束日期/);
 await client.refreshing;
});

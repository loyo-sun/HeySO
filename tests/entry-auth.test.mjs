import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {handleDeployment} from '../server/deployment.mjs';
import {seal} from '../server/sealed-config.mjs';
const origin='https://heyso.example';
const env={HEYSO_SETUP_KEY:'entry-test-owner-secret-at-least-32-characters',HEYSO_CLOUD_URL:'https://cloud.example'};
function memory(){let doc={};return {read:()=>doc,run:async fn=>fn(doc,async value=>{doc=structuredClone(value);})};}
function client(options={},environment=env){
 const jar=new Map();return {jar,async call(path,data,headers={}){
  const response=await handleDeployment(new Request(origin+path,{method:data===undefined?'GET':'POST',headers:{Cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),'Content-Type':'application/json','X-HeySO-Client':'local-ui',...headers},...(data===undefined?{}:{body:JSON.stringify(data)})}),environment,options);
  for(const line of response.headers.getSetCookie()){const [name,...parts]=line.split(';')[0].split('=');if(line.includes('Max-Age=0'))jar.delete(name);else jar.set(name,parts.join('='));}return response;
 }};
}
function cloud(){let challenge,expired=false,revoked=false;return {
 expire:()=>{expired=true;},isRevoked:()=>revoked,setChallenge:value=>{challenge=value;},async fetcher(url,init){
  assert.equal(init.headers.Origin,origin);const path=new URL(url).pathname;
  if(path.endsWith('/exchange')){assert.equal(createHash('sha256').update(JSON.parse(init.body).code_verifier).digest('base64url'),challenge);return Response.json({token:'private-cloud-token',app:'heyso',user:{id:'user-1',username:'account'},expires_in:3600});}
  assert.equal(init.headers.Authorization,'Bearer private-cloud-token');
  if(expired||revoked)return Response.json({error:'SESSION_EXPIRED'},{status:401});
  if(path.endsWith('/logout')){revoked=true;return Response.json({ok:true});}
  if(path.endsWith('/session'))return Response.json({app:'heyso',user:{id:'user-1',username:'account'}});
  if(path.endsWith('/files'))return Response.json({files:[]});throw Error('unexpected path '+path);
 }};}
async function login(c,mock){const flow=await(await c.call('/api/auth/cloud/connect',{})).json();mock.setChallenge(new URL(flow.url).searchParams.get('code_challenge'));const response=await c.call('/api/auth/cloud/exchange',{code:'one-time-code',state:flow.state});assert.equal(response.status,200,await response.clone().text());return flow;}
test('fresh browser opens account login, then cloud authorization enters projects without setup key or workspace password',async()=>{
 const mock=cloud(),c=client({fetcher:mock.fetcher});let identity=await(await c.call('/api/session')).json();assert.equal(identity.setupRequired,false);assert.equal(identity.cloudAvailable,true);assert.equal(identity.authenticated,false);
 await login(c,mock);assert.equal(c.jar.has('heyso_setup'),false);assert.equal(c.jar.has('heyso_session'),false);
 identity=await(await c.call('/api/session')).json();assert.equal(identity.authenticated,true);assert.equal(identity.user.id,'user-1');assert.ok(identity.storageScope);assert.equal((await c.call('/api/state')).status,200);
 mock.expire();assert.equal((await c.call('/api/state')).status,401);identity=await(await c.call('/api/session')).json();assert.equal(identity.setupRequired,false);assert.equal(identity.authenticated,false);
});
test('login rejects wrong state, cross origin and missing client identifier; visitors cannot choose an authorization server',async()=>{
 const mock=cloud(),c=client({fetcher:mock.fetcher});const flow=await(await c.call('/api/auth/cloud/connect',{base:'https://attacker.example'})).json();assert.equal(flow.base,env.HEYSO_CLOUD_URL);
 assert.equal((await c.call('/api/auth/cloud/exchange',{state:'forged',code:'stolen'})).status,401);
 assert.equal((await c.call('/api/auth/cloud/connect',{}, {Origin:'https://attacker.example'})).status,403);
 assert.equal((await c.call('/api/auth/cloud/connect',{}, {'X-HeySO-Client':''})).status,403);
 assert.equal((await c.call('/api/setup/test',{provider:'upstash'})).status,401);
});
test('logout revokes cloud authorization and captured credentials cannot restore the account',async()=>{
 const mock=cloud(),c=client({fetcher:mock.fetcher});await login(c,mock);const captured=c.jar.get('heyso_config');
 const response=await handleDeployment(new Request(origin+'/api/session',{method:'DELETE',headers:{Cookie:[...c.jar].map(([k,v])=>k+'='+v).join('; ')}}),env,{fetcher:mock.fetcher});assert.equal(response.status,200);assert.equal(mock.isRevoked(),true);
 c.jar.set('heyso_config',captured);assert.equal((await(await c.call('/api/session')).json()).authenticated,false);
});
test('independent configuration is shared across browsers and credentials are absent from metadata',async()=>{
 const storage=memory(),password='shared-workspace-password-16-plus',config={provider:'cloudflare',native:true,password,mcpKey:'independent-mcp-key-at-least-32-characters'};
 storage.read().deploymentConfig=seal(config,env.HEYSO_SETUP_KEY,'deployment');const options={configurationStorage:storage,nativeStorage:memory()};
 for(const c of [client(options),client(options)]){const initial=await(await c.call('/api/session')).json();assert.equal(initial.workspaceAvailable,true);assert.equal(initial.authenticated,false);assert.equal(initial.setupRequired,false);
 assert.equal((await c.call('/api/session',{password:'wrong'})).status,401);assert.equal((await c.call('/api/session',{password})).status,200);assert.equal((await(await c.call('/api/session')).json()).authenticated,true);
 const metadata=await(await c.call('/api/setup')).text();assert.ok(!metadata.includes(password));assert.ok(!metadata.includes(config.mcpKey));}
});
test('cloud and independent modes stay separate; another account scope is rejected',async()=>{
 const mock=cloud(),storage=memory();storage.read().deploymentConfig=seal({provider:'cloudflare',native:true,password:'independent-passphrase-16',mcpKey:'independent-mcp-token-32-characters'},env.HEYSO_SETUP_KEY,'deployment');
 const c=client({fetcher:mock.fetcher,configurationStorage:storage,nativeStorage:memory()});await login(c,mock);assert.equal((await c.call('/api/live/state',{storageScope:'other-account',heads:[]})).status,409);
 await c.call('/api/auth/mode',{mode:'workspace'});let state=await(await c.call('/api/session')).json();assert.equal(state.authenticated,false);assert.equal(state.provider,'cloudflare');
 await c.call('/api/auth/mode',{mode:'loyocloud'});state=await(await c.call('/api/session')).json();assert.equal(state.authenticated,true);assert.equal(state.user.id,'user-1');
});
test('independent storage outage does not block cloud login and deployment restrictions are enforced',async()=>{
 const mock=cloud(),broken={run:async()=>{throw Error('storage offline');}},c=client({fetcher:mock.fetcher,configurationStorage:broken});await login(c,mock);assert.equal((await(await c.call('/api/session')).json()).authenticated,true);
 const restricted=client({}, {...env,HEYSO_AUTH_MODES:'workspace'});assert.equal((await restricted.call('/api/auth/cloud/connect',{})).status,403);assert.equal((await restricted.call('/api/auth/mode',{mode:'loyocloud'})).status,403);
});
test('redirect login uses the paired cloud endpoint while retaining state, PKCE and server-selected origin',async()=>{
 const mock=cloud(),c=client({fetcher:mock.fetcher},{...env,HEYSO_CLOUD_REDIRECT_LOGIN:'true'});
 const flow=await(await c.call('/api/auth/cloud/connect',{})).json();assert.equal(flow.redirect,true);const url=new URL(flow.url);assert.equal(url.pathname,'/connect/heyso/redirect');assert.equal(url.searchParams.get('origin'),origin);assert.ok(url.searchParams.get('code_challenge'));
});

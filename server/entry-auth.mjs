import {createHash, randomBytes} from 'node:crypto';
import {configCookie, cookieValue, seal, unseal, setupSecret, serviceUrl} from './sealed-config.mjs';
import {cloudflareStorage} from './cloudflare-storage.mjs';
import {redisStorage} from './redis-storage.mjs';
import {loyoApi} from './loyo-provider.mjs';

const json=(value,status=200,cookies=[])=>{
  const headers=new Headers({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  for(const cookie of cookies)headers.append('Set-Cookie',cookie);
  return Response.json(value,{status,headers});
};
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
export const entryCookie=(request,env,mode)=>configCookie(request,'heyso_entry',seal({mode},setupSecret(env),'entry'));
export const entryMode=(request,env)=>unseal(cookieValue(request,'heyso_entry'),setupSecret(env),'entry')?.mode;
export const cloudEnabled=env=>env.HEYSO_AUTH_MODES!=='workspace';
export const workspaceEnabled=env=>env.HEYSO_AUTH_MODES!=='loyocloud';
function configurationStorage(env,options){
  if(options.configurationStorage)return options.configurationStorage;
  if(options.nativeStorage)return options.nativeStorage;
  if((env.UPSTASH_REDIS_REST_URL||env.KV_REST_API_URL)&&(env.UPSTASH_REDIS_REST_TOKEN||env.KV_REST_API_TOKEN))return redisStorage({...env,HEYSO_STORAGE_KEY:(env.HEYSO_STORAGE_KEY||'heyso:workspace:v1')+':deployment'},options.fetcher);
  if(env.HEYSO_CLOUDFLARE_URL&&env.HEYSO_CLOUDFLARE_TOKEN)return cloudflareStorage({url:serviceUrl(env.HEYSO_CLOUDFLARE_URL,'Cloudflare 存储'),token:env.HEYSO_CLOUDFLARE_TOKEN,fetcher:options.fetcher});
}
export async function readWorkspaceConfig(env,options){
  let value=env.HEYSO_DEPLOYMENT_CONFIG;
  const storage=configurationStorage(env,options);
  if(!value&&storage)value=await storage.run(async doc=>doc.deploymentConfig);
  const config=unseal(value,setupSecret(env),'deployment');
  if(value&&!config)fail('独立工作空间配置无法解密，请联系管理员检查部署密钥',503);
  if(config&&!['upstash','cloudflare'].includes(config.provider))fail('独立工作空间配置无效',503);
  return config;
}
export async function saveWorkspaceConfig(config,env,options){
  const value={...config};delete value.expires;
  const encrypted=seal(value,setupSecret(env),'deployment');
  const storage=configurationStorage(env,options);
  if(!storage||env.HEYSO_DEPLOYMENT_CONFIG)return {saved:false,deploymentConfig:encrypted};
  await storage.run(async(doc,save)=>{doc.deploymentConfig=encrypted;await save(doc);});
  return {saved:true};
}
export function loginInfo(env,workspace,config){
  return {loginRequired:true,setupRequired:false,cloudAvailable:cloudEnabled(env),workspaceAvailable:workspaceEnabled(env)&&!!workspace,provider:config?.provider||null,redirectLogin:env.HEYSO_CLOUD_REDIRECT_LOGIN==='true',loyoBase:env.HEYSO_CLOUD_URL||'https://cloud.loyo.work'};
}
export async function handleEntryAuth(request,env,options,readBody){
  const path=new URL(request.url).pathname,secret=setupSecret(env);
  if(!path.startsWith('/api/auth/'))return null;
  if(request.method!=='POST')return json({error:'仅支持 POST'},405);
  if(secret.length<(env.HEYSO_SETUP_KEY?32:16))fail('应用登录尚未准备完成，请联系管理员设置部署密钥',503);
  if(request.headers.get('x-heyso-client')!=='local-ui')fail('需要客户端标识',403);
  const input=await readBody(request);
  if(path==='/api/auth/mode'){
    if(!['loyocloud','workspace'].includes(input.mode))fail('无效的进入方式');
    if(input.mode==='loyocloud'&&!cloudEnabled(env)||input.mode==='workspace'&&!workspaceEnabled(env))fail('此部署未启用该进入方式',403);
    return json({ok:true},200,[entryCookie(request,env,input.mode)]);
  }
  if(!cloudEnabled(env))fail('此部署未启用 LoyoCloud 登录',403);
  if(path==='/api/auth/cloud/connect'){
    // The login server is chosen by the deployer, never by an unauthenticated visitor.
    const base=serviceUrl(env.HEYSO_CLOUD_URL||'https://cloud.loyo.work','LoyoCloud');
    const origin=env.HEYSO_PUBLIC_URL?new URL(env.HEYSO_PUBLIC_URL).origin:new URL(request.url).origin;
    const state=randomBytes(24).toString('base64url'),verifier=randomBytes(32).toString('base64url');
    const redirect=env.HEYSO_CLOUD_REDIRECT_LOGIN==='true';
    const connect=new URL(redirect?'/connect/heyso/redirect':'/connect/heyso',base);
    connect.search=new URLSearchParams({origin,state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),session_days:'30'}).toString();
    const flow=seal({base,origin,state,verifier,expires:Date.now()+300000},secret,'login');
    return json({base,state,url:connect.href,redirect},200,[configCookie(request,'heyso_login',flow,300)]);
  }
  if(path==='/api/auth/cloud/exchange'){
    const flow=unseal(cookieValue(request,'heyso_login'),secret,'login');
    if(!flow?.verifier||flow.state!==input.state)fail('登录确认已失效，请重新登录',401);
    const response=await(options.fetcher||fetch)(flow.base+'/api/v1/editor/exchange',{method:'POST',headers:{Origin:flow.origin,'Content-Type':'application/json'},body:JSON.stringify({code:input.code,code_verifier:flow.verifier}),redirect:'manual',signal:AbortSignal.timeout(20000)});
    const identity=await response.json();
    if(!response.ok||identity.app!=='heyso'||!identity.token||!identity.user?.id)fail('LoyoCloud 登录授权失败，请重试',401);
    const expires=identity.expires_at||Date.now()+Math.min(identity.expires_in||30*86400,30*86400)*1000;
    if(!Number.isFinite(expires)||expires<=Date.now())fail('LoyoCloud 登录已过期',401);
    const config={provider:'loyocloud',authMode:'account',base:flow.base,origin:flow.origin,token:identity.token,user:identity.user,expires};
    // Verify the issued identity before exposing a workspace or account scope.
    const verified=await loyoApi(config,options.fetcher)('/api/v1/editor/session');
    if(verified.app!=='heyso'||verified.user?.id!==config.user.id)fail('LoyoCloud 授权与当前账号不一致',401);
    return json({ok:true,user:config.user},200,[configCookie(request,'heyso_config',seal(config,secret,'config'),Math.floor((expires-Date.now())/1000)),entryCookie(request,env,'loyocloud'),configCookie(request,'heyso_login','',0)]);
  }
  return json({error:'登录接口不存在'},404);
}

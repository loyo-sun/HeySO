import { createHash, randomBytes } from 'node:crypto';
import {entryMode, entryCookie, cloudEnabled, workspaceEnabled, loginInfo, handleEntryAuth, readWorkspaceConfig, saveWorkspaceConfig} from './entry-auth.mjs';
import { handleHosted, readBody } from './hosted.mjs';
import { toolDefinitions } from './mcp-tools.mjs';
import { redisStorage } from './redis-storage.mjs';
import { cloudflareStorage } from './cloudflare-storage.mjs';
import { handleLoyo, loyoApi } from './loyo-provider.mjs';
import { authenticated, configured, safeEqual, sessionCookie } from './hosted-auth.mjs';
import { setupSecret, seal, unseal, configCookie, cookieValue, serviceUrl } from './sealed-config.mjs';

const json = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const fail = (message, status = 400) => { throw Object.assign(Error(message), { status }); };
const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const resultCookies = (response, cookies) => { const headers = new Headers(response.headers); for (const c of cookies) headers.append('Set-Cookie', c); return new Response(response.body, { status: response.status, headers }); };
const names = { config: 'heyso_config', unlock: 'heyso_setup', cloud: 'heyso_setup_cloud', tested: 'heyso_setup_tested' };
const decodedCookie = (request, env, name) => unseal(cookieValue(request, names[name]), setupSecret(env), name);
const effectiveEnv = (env, config) => ({ ...env, HEYSO_PASSWORD: config.password, HEYSO_MCP_TOKEN: config.mcpKey, ...(config.provider === 'upstash' ? { UPSTASH_REDIS_REST_URL: config.url, UPSTASH_REDIS_REST_TOKEN: config.token, HEYSO_STORAGE_KEY: config.key } : {}) });
export function providerStorage(config, env, options = {}) {
  if (config.provider === 'upstash') return redisStorage(effectiveEnv(env, config), options.fetcher);
  if (config.provider === 'cloudflare') {
    if (config.native && options.nativeStorage) return options.nativeStorage;
    if (config.native) fail('此部署未绑定 Cloudflare 存储，请填写独立存储服务地址');
    return cloudflareStorage({ url: config.url, token: config.token, fetcher: options.fetcher });
  }
  fail('请选择支持的云端存储');
}
function providerConfig(input, request, env, options) {
  if (input.provider === 'upstash') {
    const url = input.useEnvironment ? env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL : input.url;
    const token = input.useEnvironment ? env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN : input.token;
    if (typeof token !== 'string' || !token.trim()) fail('请填写 Upstash REST 读写密钥');
    const key = input.key || env.HEYSO_STORAGE_KEY || 'heyso:workspace:v1';
    if (!/^[a-zA-Z0-9:_-]{1,120}$/.test(key)) fail('存储标识仅支持字母、数字、冒号、下划线和短横线，最多 120 字符');
    return { provider: 'upstash', url: serviceUrl(url, 'Upstash'), token: token.trim(), key };
  }
  if (input.provider === 'cloudflare') {
    if (input.native && options.nativeStorage) return { provider: 'cloudflare', native: true };
    const url = input.useEnvironment ? env.HEYSO_CLOUDFLARE_URL : input.url;
    const token = input.useEnvironment ? env.HEYSO_CLOUDFLARE_TOKEN : input.token;
    if (typeof token !== 'string' || token.length < 32) fail('请填写 Cloudflare 存储服务的连接密钥（至少 32 位）');
    return { provider: 'cloudflare', url: serviceUrl(url, 'Cloudflare 存储'), token };
  }
  if (input.provider === 'loyocloud') {
    const cloud = decodedCookie(request, env, 'cloud');
    if (!cloud?.token || !cloud.user) fail('请先登录 LoyoCloud 并授权 HeySO', 401);
    return { provider: 'loyocloud', ...cloud };
  }
  fail('请选择 LoyoCloud、Upstash 或 Cloudflare');
}
async function testProvider(config, env, options) {
  if (config.provider === 'loyocloud') {
    const api = loyoApi(config, options.fetcher), identity = await api('/api/v1/editor/session');
    if (identity.app !== 'heyso' || identity.user?.id !== config.user.id) fail('LoyoCloud 授权与当前账号不一致', 401);
    const list = await api('/api/v1/heyso/files');
    return { projects: list.files.length, account: config.user.username };
  }
  return providerStorage(config, env, options).run(async (document, save) => {
    document.hostingSetup = { checkedAt: new Date().toISOString() }; await save(document);
    return { projects: document.state?.projects?.length || 0 };
  });
}

export async function handleDeployment(request, env, options = {}) {
  try {
    const url = new URL(request.url), path = url.pathname, secret = setupSecret(env);
    const origin = env.HEYSO_PUBLIC_URL ? new URL(env.HEYSO_PUBLIC_URL).origin : url.origin;
    if (request.headers.get('origin') && request.headers.get('origin') !== origin) fail('来源未授权', 403);
    const ownerConfigured = secret.length >= (env.HEYSO_SETUP_KEY ? 32 : 16);
    const authResponse=await handleEntryAuth(request,env,options,readBody);
    if(authResponse)return authResponse;
    const browserConfig = ownerConfigured ? decodedCookie(request, env, 'config') : null;
    // Cloud login remains usable during an independent storage outage.
    const mode=entryMode(request,env);
    const wantsCloud=cloudEnabled(env)&&mode!=='workspace'&&browserConfig?.provider==='loyocloud';
    let workspaceConfig=null, workspaceError=null;
    try{if(workspaceEnabled(env)&&(!wantsCloud||path.startsWith('/api/setup')))workspaceConfig=await readWorkspaceConfig(env,options);}catch(error){workspaceError=error;}
    const independent=workspaceConfig||(browserConfig?.provider!=='loyocloud'?browserConfig:null);
    let config=wantsCloud?{...browserConfig,authMode:'account'}:mode==='loyocloud'?null:independent;
    if(config?.provider==='loyocloud'&&!cloudEnabled(env))config=null;
    if(config?.provider!=='loyocloud'&&!workspaceEnabled(env))config=null;
    const mcp = request.headers.get('authorization')?.match(/^Bearer hs1\.(.+)$/);
    if (mcp && path === '/mcp') config = unseal(mcp[1], secret, 'mcp');
    const unlocked = ownerConfigured && !!decodedCookie(request, env, 'unlock');
    const legacy = workspaceEnabled(env) && configured(env) && (options.nativeStorage || env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL);
    const info=()=>loginInfo(env,independent||legacy,config);
    if (path === '/api/setup' && request.method === 'GET') return json({ hosted: true, setupRequired: !config && !legacy, ownerConfigured, unlocked, platform: options.platform || 'hosted', nativeCloudflare: !!options.nativeStorage, provider: config?.provider || null, redisKey: env.HEYSO_STORAGE_KEY || 'heyso:workspace:v1', loyoBase: env.HEYSO_CLOUD_URL || 'https://cloud.loyo.work', persistentConfiguration:!!workspaceConfig, workspaceError:workspaceError?'独立工作空间连接暂时不可用':null, hasEnvironmentRedis: !!((env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL) && (env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN)), hasEnvironmentCloudflare: !!(env.HEYSO_CLOUDFLARE_URL && env.HEYSO_CLOUDFLARE_TOKEN) });
    if (path.startsWith('/api/setup/') && request.method === 'POST') {
      if (!ownerConfigured) fail('请先在部署平台设置至少 32 位的 HEYSO_SETUP_KEY，再重新部署', 503);
      const input = await readBody(request);
      if (path === '/api/setup/unlock') {
        if (!safeEqual(input.setupKey, secret)) fail('初始化密钥不正确', 401);
        return resultCookies(json({ ok: true }), [configCookie(request, names.unlock, seal({ expires: Date.now() + 15 * 60000 }, secret, 'unlock'), 900)]);
      }
      if (path === '/api/setup/reset') {
        if (!unlocked) fail('请先登录或验证初始化密钥', 401);
        return resultCookies(json({ ok: true }), [configCookie(request, names.config, '', 0), sessionCookie(request, env, true)]);
      }
      if (!unlocked) fail('请先验证部署时设置的初始化密钥', 401);
      if (path === '/api/setup/cloud/connect') {
        const base = serviceUrl(input.base || env.HEYSO_CLOUD_URL || 'https://cloud.loyo.work', 'LoyoCloud');
        const state = randomBytes(24).toString('base64url'), verifier = randomBytes(32).toString('base64url');
        const connect = new URL('/connect/heyso', base);
        connect.search = new URLSearchParams({ origin, state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), session_days: '30' }).toString();
        return resultCookies(json({ base, state, url: connect.href }), [configCookie(request, names.cloud, seal({ base, origin, state, verifier, expires: Date.now() + 300000 }, secret, 'cloud'), 300)]);
      }
      if (path === '/api/setup/cloud/exchange') {
        const flow = decodedCookie(request, env, 'cloud');
        if (!flow?.verifier || !safeEqual(flow.state, input.state)) fail('登录确认已失效，请重新登录', 401);
        const response = await (options.fetcher || fetch)(flow.base + '/api/v1/editor/exchange', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: input.code, code_verifier: flow.verifier }), redirect: 'manual', signal: AbortSignal.timeout(20000) });
        const identity = await response.json();
        if (!response.ok || identity.app !== 'heyso' || !identity.token || !identity.user?.id) fail('LoyoCloud 登录授权失败，请重新登录', 401);
        const value = { base: flow.base, origin, token: identity.token, user: { id: identity.user.id, username: identity.user.username }, expires: Date.now() + 30 * 86400000 };
        return resultCookies(json({ connected: true, user: value.user }), [configCookie(request, names.cloud, seal(value, secret, 'cloud'))]);
      }
      const selected = providerConfig(input, request, env, options);
      if (path === '/api/setup/test') {
        const info = await testProvider(selected, env, options);
        const receipt = seal({ fingerprint: fingerprint(selected), expires: Date.now() + 10 * 60000 }, secret, 'tested');
        return resultCookies(json({ ok: true, provider: selected.provider, ...info }), [configCookie(request, names.tested, receipt, 600)]);
      }
      if (path === '/api/setup/complete') {
        const receipt = decodedCookie(request, env, 'tested');
        if (!receipt || receipt.fingerprint !== fingerprint(selected)) fail('连接设置有变化，请先重新检查连接');
        if (typeof input.password !== 'string' || input.password.length < 16) fail('工作空间访问密码至少需要 16 位');
        const value = { ...selected, password: input.password, mcpKey: randomBytes(32).toString('base64url'), expires: Date.now() + 30 * 86400000 };
        const effective = effectiveEnv(env, value);
        if(selected.provider!=='loyocloud'){
          const persisted=await saveWorkspaceConfig(value,env,options);
          if(!persisted.saved)return json({ok:false,requiresEnvironment:true,deploymentConfig:persisted.deploymentConfig,message:'请将加密配置保存为部署环境变量 HEYSO_DEPLOYMENT_CONFIG，重新部署后即可供所有成员使用。'});
        }
        return resultCookies(json({ ok: true, provider: selected.provider }), [entryCookie(request,env,selected.provider==='loyocloud'?'loyocloud':'workspace'),configCookie(request, names.config, seal(value, secret, 'config')), sessionCookie(request, effective), ...['unlock','cloud','tested'].map(name => configCookie(request, names[name], '', 0))]);
      }
      fail('配置接口不存在', 404);
    }
    if (path === '/api/health') return json({ status: config || legacy ? 'ok' : 'setup_required', version: 'alpha_0.1', tools: toolDefinitions.length, hosted: true, provider: config?.provider || null });
    if (!config && legacy && mode!=='loyocloud') {
      const response=await handleHosted(request, env, options.nativeStorage || { run: callback => redisStorage(env, options.fetcher).run(callback) });
      if(path==='/api/session'&&request.method==='GET')return json({...await response.json(),...info(),provider:options.nativeStorage?'cloudflare':'upstash'});
      return response;
    }
    if (!config) return json({hosted:true,authenticated:false,...info(),ownerConfigured,workspaceError:workspaceError?'独立工作空间连接暂时不可用':null,platform:options.platform||'hosted'},path==='/api/session'?200:401);
    const effective = effectiveEnv(env, config);
    const storageScope=config.provider==='loyocloud'?fingerprint(['heyso-sync-v1',config.base,config.user.id]):undefined;
    if (path === '/api/session' && request.method === 'GET') {
      if(config.provider==='loyocloud'){
        try{
          const identity=await loyoApi(config,options.fetcher)('/api/v1/editor/session');
          if(identity.app!=='heyso'||identity.user?.id!==config.user.id)fail('云账号身份不一致',401);
        }catch(error){
          if(error.status!==401)throw error;
          return resultCookies(json({hosted:true,authenticated:false,...info(),provider:'loyocloud'}),[configCookie(request,names.config,'',0)]);
        }
        return json({hosted:true,...info(),authenticated:true,loginRequired:false,provider:'loyocloud',user:config.user,storageScope});
      }
      return json({ hosted:true,...info(),authenticated:authenticated(request,effective),provider:config.provider,version:'alpha_0.1' });
    }
    if(path==='/api/session'&&request.method==='DELETE'&&config.provider==='loyocloud'){
      try{await loyoApi(config,options.fetcher)('/api/v1/editor/logout',{});}catch(error){if(error.status!==401)throw error;}
      return resultCookies(json({ok:true}),[configCookie(request,names.config,'',0),sessionCookie(request,effective,true)]);
    }
    if (config.provider === 'loyocloud') {
      if(path==='/api/session'&&request.method==='POST')return json({error:'请使用 LoyoCloud 账号登录'},405);
      if (path === '/mcp') return json({ error: 'LoyoCloud 模式请使用云端 OAuth MCP 地址：' + config.base + '/mcp/heyso' }, 400);
      const input = request.method === 'POST' ? await readBody(request) : {};
      if(input.storageScope && input.storageScope!==storageScope) return json({error:'账号或云端空间已切换，请返回原账号同步',scopeMismatch:true},409);
      let response;
      try { response = await handleLoyo(request, config, effective, input, options.fetcher); }
      catch (error) {
        if (error.status !== 401) throw error;
        return resultCookies(json({ error: 'LoyoCloud 登录已过期，请重新连接', setupRequired:false,loginRequired:true }, 401), [configCookie(request, names.config, '', 0)]);
      }
      if (response.status === 401 && path !== '/api/session') return resultCookies(json({ error: 'LoyoCloud 登录已过期，请重新登录', setupRequired:false,loginRequired:true }, 401), [configCookie(request, names.config, '', 0)]);
      return response;
    }
    if (mcp && path === '/mcp') { const headers = new Headers(request.headers); headers.set('Authorization', 'Bearer ' + effective.HEYSO_MCP_TOKEN); request = new Request(request, { headers }); }
    const response = await handleHosted(request, effective, providerStorage(config, env, options));
    if (path === '/api/connection' && response.ok) {
      const info = await response.json();
      return json({ ...info, provider: config.provider, token: 'hs1.' + seal({ ...config, expires: Date.now() + 30 * 86400000 }, secret, 'mcp') });
    }
    return response;
  } catch (error) {
    if (!error.status) console.error('HeySO configuration error:', error.name);
    return json({ error: error.status ? error.message : '连接服务暂时不可用，请检查设置后重试' }, error.status || 500);
  }
}

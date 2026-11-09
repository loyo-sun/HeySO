import { createHash, randomUUID } from 'node:crypto';
import { act, validate } from './model.mjs';
import { projectFile, readProjectFile, collections } from './project-file.mjs';
import { migrateState } from './migrate.mjs';
import { authenticated, sessionCookie } from './hosted-auth.mjs';
import { toolDefinitions } from './mcp-tools.mjs';

const fail = (message, status = 400) => { throw Object.assign(Error(message), { status }); };
const json = (value, status = 200, headers = {}) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
export function loyoApi(config, fetcher = fetch, onTiming = () => {}) {
  return async (route, body) => {
    let response;const started=performance.now();
    try { response = await fetcher(config.base + route, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: config.origin, Authorization: 'Bearer ' + config.token, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual', signal: AbortSignal.timeout(20000) }); }
    catch { fail('无法连接 LoyoCloud，请稍后重试', 503); }
    const result = await response.json();
    onTiming({ms:performance.now()-started,serverTiming:response.headers.get('Server-Timing')||'',transactionQueries:response.headers.get('X-HeySO-Transaction-Queries')});
    if (!response.ok) fail(result.error_description || result.error || 'LoyoCloud 操作失败', response.status);
    return result;
  };
}
const empty = () => migrateState({ schemaVersion: 4, revision: 0, projects: [], ...Object.fromEntries(collections.map(k => [k, []])) });
const revisionOf = heads => parseInt(createHash('sha256').update(JSON.stringify(heads.map(h=>[h.fileId,h.headId]).sort((a,b)=>a[0].localeCompare(b[0])))).digest('hex').slice(0,13),16);
function fileState(files, config) {
  const state=empty();
  for(const file of files) {
    const content=readProjectFile(file.content), p=content.workspace.projects[0];
    if(state.projects.some(x=>x.id===p.id))fail('云端项目存在重复业务标识，请整理副本后重试',409);
    state.projects.push({...p,cloud:{fileId:content.id,headId:file.headId,dataRevision:content.workspace.revision,base:config.base,account:config.user.username,available:true,error:''}});
    for(const key of collections)state[key].push(...content.workspace[key]);
  }
  return validate(state);
}
export async function handleLoyo(request, config, env, input, fetcher = fetch) {
  const started=performance.now(),upstream=[];
  const path = new URL(request.url).pathname, api = loyoApi(config, fetcher,t=>upstream.push(t));
  const timingHeaders=()=>({'Server-Timing':[
    `gateway;dur=${(performance.now()-started).toFixed(2)}`,
    `upstream;dur=${upstream.reduce((sum,t)=>sum+t.ms,0).toFixed(2)}`,
    ...upstream.flatMap(t=>t.serverTiming.split(',').map(v=>v.trim()).filter(v=>/^[a-z_]+;dur=[\d.]+$/.test(v)).map(v=>'cloud_'+v)),
  ].join(', '),...(upstream.some(t=>/^\d+$/.test(t.transactionQueries||''))?{'X-HeySO-Transaction-Queries':String(upstream.reduce((sum,t)=>sum+(/^\d+$/.test(t.transactionQueries||'')?Number(t.transactionQueries):0),0))}:{})});
  const load = async () => {
    const list = await api('/api/v1/heyso/files');
    const files = [];
    // Bounded concurrency avoids flooding the cloud service for larger accounts.
    for (let i = 0; i < list.files.length; i += 5) files.push(...await Promise.all(list.files.slice(i, i + 5).map(f => api('/api/v1/heyso/files/' + encodeURIComponent(f.id)))));
    const state = empty();
    for (const file of files) {
      const content = readProjectFile(file.content), p = content.workspace.projects[0];
      if (state.projects.some(x => x.id === p.id)) fail('云端项目存在重复业务标识，请在 LoyoCloud 中整理副本后重试', 409);
      state.projects.push({ ...p, cloud: { fileId: content.id, headId: file.headId, dataRevision:content.workspace.revision, base: config.base, account: config.user.username, available: true, error: '' } });
      for (const key of collections) state[key].push(...content.workspace[key]);
    }
    state.revision = parseInt(createHash('sha256').update(JSON.stringify(files.map(f => [f.content.id, f.headId]).sort((a,b) => a[0].localeCompare(b[0])))).digest('hex').slice(0, 13), 16);
    return { state: validate(state), files };
  };
  if (path === '/api/session') {
    if (request.method === 'GET') return json({ hosted: true, authenticated: authenticated(request, env), provider: 'loyocloud', version: 'alpha_0.1' });
    if (request.method === 'DELETE') return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(request, env, true) });
    // Possession of the encrypted provider cookie is required before this route.
    if (request.method === 'POST') {
      const { safeEqual } = await import('./hosted-auth.mjs');
      if (!safeEqual(input.password, env.HEYSO_PASSWORD)) return json({ error: '访问密码不正确' }, 401);
      await api('/api/v1/editor/session');
      return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(request, env) });
    }
  }
  if (!authenticated(request, env)) return json({ error: '请先输入访问密码' }, 401);
  if (!['GET', 'POST'].includes(request.method)) fail('不支持此请求方法', 405);
  if (request.method === 'POST' && request.headers.get('x-heyso-client') !== 'local-ui') fail('需要客户端标识', 403);
  if (path === '/api/cloud/status') return json({ connected: true, base: config.base, user: config.user, primary: true, mcpUrl: config.base + '/mcp/heyso' });
  if (path === '/api/connection') return json({ url: config.base + '/mcp/heyso', oauth: true, hosted: true, provider: 'loyocloud', version: 'alpha_0.1', tools: toolDefinitions.map(([name, description]) => ({ name, description })) });
  const preferenceRoute=path.match(/^\/api\/view-preferences\/([^/]+)$/);
  if(preferenceRoute){
    const fileId=decodeURIComponent(preferenceRoute[1]);
    if(!/^[0-9a-f-]{36}$/i.test(fileId))fail('无效云文件标识');
    return json(await api('/api/v1/heyso/files/'+encodeURIComponent(fileId)+'/view-preferences',request.method==='POST'?input:undefined));
  }
  // New operations are applied to the latest server state; no client head matching.
  if(path==='/api/live/updates')return json(await api('/api/v1/heyso/updates',{heads:input.heads||[]}));
  if(path==='/api/live/action') {
    if(!input.fileId||!/^[0-9a-f-]{36}$/i.test(input.fileId)||!input.requestId||!input.action)fail('需要有效项目与操作');
    if(['project.create','project.delete'].includes(input.action.type))fail('请通过项目管理入口操作');
    const out=await api('/api/v1/heyso/files/'+encodeURIComponent(input.fileId)+'/action',{action:input.action,headId:input.headId,requestId:input.requestId,consistency:'live-v1',baseFields:input.baseFields,responseFormat:'changes-v1'});
    const heads=(input.heads||[]).filter(h=>h.fileId!==input.fileId);heads.push({fileId:input.fileId,headId:out.headId});
    if(out.changes){const project={...out.project,cloud:{fileId:out.fileId,headId:out.headId,dataRevision:out.dataRevision,base:config.base,account:config.user.username,available:true,error:''}};return json({patch:true,project,changes:out.changes,revision:revisionOf(heads),result:out.result},200,timingHeaders());}
    const state=fileState([out],config);
    return json({delta:true,state,revision:revisionOf(heads),result:out.result,projectId:state.projects[0].id},200,timingHeaders());
  }
  if(path==='/api/live/state') {
    const out=await api('/api/v1/heyso/state',{heads:input.heads||[]});
    const state=fileState(out.files,config),revision=revisionOf(out.manifest);
    return json(input.heads?{delta:true,state,revision,manifest:out.manifest}:{...state,revision});
  }
  // Version checks read metadata only. Fetch complete content only for changed files.
  if(path==='/api/state' && request.method==='POST' && Array.isArray(input.heads)) {
    const list=await api('/api/v1/heyso/files'), heads=list.files.map(f=>({fileId:f.id,headId:f.head_id||f.headId}));
    const known=new Map(input.heads.map(h=>[h.fileId,h.headId]));
    const changed=heads.filter(h=>!h.headId||known.get(h.fileId)!==h.headId), files=[];
    for(let i=0;i<changed.length;i+=5)files.push(...await Promise.all(changed.slice(i,i+5).map(h=>api('/api/v1/heyso/files/'+encodeURIComponent(h.fileId)))));
    for(const f of files)heads.find(h=>h.fileId===f.content.id).headId=f.headId;
    return json({delta:true,manifest:heads,state:fileState(files,config),revision:revisionOf(heads)});
  }
  // Per-file optimistic concurrency is enforced by Cloud. Its confirmed response
  // already contains the complete updated project; no workspace reload is needed.
  const changesIdentifiers=input.action?.type==='project.update'&&['name','code'].some(key=>input.action.payload?.[key]!==undefined);
  if(path==='/api/action' && input.fileId && input.headId && input.action?.type!=='project.create'&&!changesIdentifiers) {
    if(input.action?.type==='project.delete')fail('请在 LoyoCloud 云空间中将项目文件移至回收站');
    if(!/^[0-9a-f-]{36}$/i.test(input.fileId)||!input.requestId)fail('需要项目文件标识及唯一请求标识');
    const out=await api('/api/v1/heyso/files/'+encodeURIComponent(input.fileId)+'/action',{action:input.action,headId:input.headId,requestId:input.requestId,responseFormat:'content-v1'});
    const state=fileState([out],config), projectId=state.projects[0].id;
    const heads=(input.heads||[]).filter(h=>h.fileId!==input.fileId);heads.push({fileId:input.fileId,headId:out.headId});
    return json({delta:true,state,revision:revisionOf(heads),result:out.result,projectId},200,timingHeaders());
  }
  const { state, files } = await load();
  if (path === '/api/state') return json(state);
  if (path === '/api/cloud/files') return json({ files: files.map(f => ({ id: f.content.id, name: f.content.name })) });
  if (path === '/api/cloud/open') return json({ projectId: files.find(f => f.content.id === input.fileId)?.content.workspace.projects[0].id, state });
  if (path === '/api/export') { state.projects.forEach(p => delete p.cloud); return json(state, 200, { 'Content-Disposition': 'attachment; filename="HeySO-backup.json"' }); }
  const exported = path.match(/^\/api\/projects\/([^/]+)\/export$/);
  if (exported) {
    const p = state.projects.find(p => p.id === decodeURIComponent(exported[1])); if (!p) fail('项目不存在', 404);
    return json(projectFile(state, p.id, p.cloud.fileId), 200, { 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(p.name + '.heyso')}` });
  }
  if (path.startsWith('/api/restore')) fail('LoyoCloud 模式请通过 .heyso 文件导入单个项目，或在云空间恢复文件历史版本');
  if (path === '/api/action' || path === '/api/projects/import') {
    if (input.revision !== state.revision) fail('数据已有更新，请刷新后重试', 409);
    let result, projectId;
    if (path === '/api/projects/import' || input.action?.type === 'project.create') {
      let content;
      if (path === '/api/projects/import') content = readProjectFile(input.content);
      else { const next = empty(); result = act(next, input.action); content = projectFile(next, result.id); }
      const imported = content.workspace.projects[0];
      if (state.projects.some(p => p.id === imported.id || p.name === imported.name || p.code === imported.code)) fail('项目名称、编号或标识与云端已有项目冲突', 409);
      const candidate = structuredClone(state);
      candidate.projects.push(imported);
      for (const key of collections) candidate[key].push(...content.workspace[key]);
      validate(candidate);
      await api('/api/v1/heyso/files', { content,responseFormat:'content-v1' }); projectId = imported.id; result ||= imported;
    } else {
      if (input.action?.type === 'project.delete') fail('请在 LoyoCloud 云空间中将项目文件移至回收站');
      const p = input.action?.payload || {}, id = p.id || p.itemId || p.storyId || p.runId;
      const record = [...state.projects, ...collections.flatMap(k => state[k])].find(x => x.id === id);
      projectId = p.projectId || record?.projectId || (state.projects.some(x => x.id === id) ? id : input.projectId);
      const project = state.projects.find(x => x.id === projectId); if (!project) fail('项目不存在', 404);
      if(changesIdentifiers){const candidate=structuredClone(state);act(candidate,input.action);validate(candidate);}
      const out = await api('/api/v1/heyso/files/' + project.cloud.fileId + '/action', { action: input.action, headId: project.cloud.headId, requestId: input.requestId || randomUUID(),responseFormat:'content-v1' }); result = out.result;
    }
    return json({ state: (await load()).state, result, projectId },200,timingHeaders());
  }
  fail('接口不存在', 404);
}

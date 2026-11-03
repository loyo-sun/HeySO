import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,createHash,randomUUID} from 'node:crypto';
import {projectFile,readProjectFile,collections} from './project-file.mjs';
const failure=(message,status=400)=>Object.assign(Error(message),{status});
const canonical = value => JSON.stringify(value, function(key,item){
  if(item && typeof item==='object' && !Array.isArray(item)) return Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]]));
  return item;
});
export function cloudWorkspace({store,dataDir,base=process.env.HEYSO_CLOUD_URL||'https://cloud.loyo.work'}) {
  const url=new URL(base);
  if(url.origin!==base||url.username||url.password||!(url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname))))throw Error('HEYSO_CLOUD_URL 必须是 HTTPS 地址或本机开发地址');
  const file=path.join(dataDir,'cloud.json');
  let saved=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{bindings:{}};
  if(saved.base&&saved.base!==base)saved={bindings:{}};
  let pending=null,sequence=Math.max(store.read().revision,Date.now()*1000),current=null,tail=Promise.resolve();
  const persist=()=>{fs.writeFileSync(file+'.tmp',JSON.stringify({...saved,base}),{mode:0o600});fs.renameSync(file+'.tmp',file);};
  const serial=fn=>{const next=tail.then(fn);tail=next.catch(()=>{});return next;};
  async function api(route,body,credential=saved) {
    if(!credential.token)throw failure('请先登录 LoyoCloud',401);
    let response;
    try{response=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{Origin:credential.origin,Authorization:'Bearer '+credential.token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000),redirect:'error'});}catch{throw failure('无法连接 LoyoCloud，请检查网络后重试；项目未覆盖',503);}
    const result=await response.json();
    if(!response.ok)throw failure(result.error_description||result.error||'云操作失败',response.status);
    return result;
  }
  function compose(){
    const local=store.read(),state=structuredClone(local);
    for(const binding of Object.values(saved.bindings)){
      state.projects=state.projects.filter(p=>p.id!==binding.projectId);
      for(const key of collections)state[key]=state[key].filter(x=>x.projectId!==binding.projectId);
      if(!binding.content)continue;
      state.projects.push({...binding.content.workspace.projects[0],cloud:{fileId:binding.id,headId:binding.headId,account:binding.username,available:!!saved.token&&saved.user?.id===binding.userId&&!binding.error,error:binding.error||(!saved.token||saved.user?.id!==binding.userId?'请登录此项目所属的 LoyoCloud 账号后继续编辑':''),base}});
      for(const key of collections)state[key].push(...binding.content.workspace[key]);
    }
    const compare=canonical({...state,revision:0});
    if(compare!==current){sequence++;current=compare;}
    state.revision=sequence;return state;
  }
  async function refresh(){
    const before=canonical(saved.bindings);
    if(saved.token)await Promise.all(Object.values(saved.bindings).filter(b=>b.userId===saved.user?.id).map(async binding=>{
      try{
        let rejected='';
        if(binding.pending){
          try{await api('/api/v1/heyso/files/'+binding.id+'/action',binding.pending);delete binding.pending;}
          catch(e){if(e.status>=500)throw e;delete binding.pending;rejected=e.message;}
        }
        const result=await api('/api/v1/heyso/files/'+binding.id);binding.content=readProjectFile(result.content);binding.headId=result.headId;binding.error=rejected;
      }catch(e){binding.error=e.message;}
    }));
    if(before!==canonical(saved.bindings))persist();
    return compose();
  }
  function bind(result){
    const content=readProjectFile(result.content),projectId=content.workspace.projects[0].id;
    if(Object.values(saved.bindings).some(b=>b.projectId===projectId&&b.id!==content.id))throw failure('已有相同项目标识的在线文件，请在独立工作空间中打开此副本');
    const local=store.read();
    // Reject record collisions with other local/cloud projects, before replacing any visible project.
    const other=compose();
    const ids=new Set([content.workspace.projects[0],...collections.filter(k=>k!=='events').flatMap(k=>content.workspace[k])].map(x=>x.id));
    const records=[...other.projects,...collections.filter(k=>k!=='events').flatMap(k=>other[k])];
    if(records.some(x=>(x.projectId||x.id)!==projectId&&ids.has(x.id)))throw failure('项目记录标识与现有项目冲突，请使用独立工作空间');
    fs.mkdirSync(path.join(dataDir,'backups'),{recursive:true});
    fs.writeFileSync(path.join(dataDir,'backups','before-cloud-'+Date.now()+'-'+randomUUID()+'.json'),JSON.stringify(local),{mode:0o600,flag:'wx'});
    saved.bindings[content.id]={id:content.id,projectId,content,headId:result.headId,userId:saved.user.id,username:saved.user.username,error:''};persist();
    return projectId;
  }
  async function dispatch(action,expected,projectId){return serial(async()=>{
    const visible=compose();if(expected!==undefined&&expected!==visible.revision)throw failure('数据已有更新，请刷新后重试',409);
    const p=action.payload||{};
    const recordId=p.itemId||p.storyId||p.runId||p.id;
    const record=[...visible.projects,...collections.flatMap(key=>visible[key])].find(x=>x.id===recordId);
    const targetId=p.projectId||(record&&(record.projectId||record.id))||projectId;
    if(saved.conversions?.[targetId])throw failure("项目转换待确认，请先重试转为在线项目",409);
    const binding=Object.values(saved.bindings).find(b=>b.projectId===targetId);
    if(binding&&action.type!=='project.create'){
      if(saved.user?.id!==binding.userId)throw failure('请登录此在线项目所属的 LoyoCloud 账号',403);
      if(action.type==='project.delete')throw failure('请在 LoyoCloud 云空间中删除在线项目文件');
      if(binding.pending)throw failure('上一笔云操作尚待确认，请刷新后重试',409);
      binding.pending={action,headId:binding.headId,requestId:randomUUID()};persist();
      let result;
      try{result=await api('/api/v1/heyso/files/'+binding.id+'/action',binding.pending);delete binding.pending;}
      catch(e){if(e.status<500){delete binding.pending;persist();}throw e;}
      binding.content=readProjectFile(result.content);binding.headId=result.headId;binding.error='';persist();
      return {state:compose(),result:result.result};
    }
    const result=store.dispatch(action,store.read().revision);return {state:compose(),result:result.result};
  });}
  const status=()=>({base,user:saved.user||null,connected:!!saved.token,expiresAt:saved.expires_at||null,mcpUrl:base+'/mcp/heyso'});
  return {
    read:()=>serial(refresh),dispatch,
    install(app){
      app.get('/api/cloud/status',async(req,res)=>{
        if(saved.token){try{const session=await api('/api/v1/editor/session');if(session.app!=='heyso')throw failure('登录应用不匹配',403);saved.user=session.user;}catch(e){return res.json({...status(),connected:false,error:e.message});}}
        res.json(status());
      });
      app.post('/api/cloud/connect',(req,res)=>{
        const origin=req.get('origin')||'http://'+req.get('host');
        const verifier=randomBytes(32).toString('base64url'),state=randomBytes(32).toString('base64url');
        pending={verifier,state,origin,expires:Date.now()+300000};
        const connect=new URL('/connect/heyso',base);connect.search=new URLSearchParams({origin,state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),session_days:'30'}).toString();
        res.json({url:connect.href,state,base});
      });
      app.post('/api/cloud/exchange',async(req,res)=>{
        if(!pending||pending.expires<Date.now()||req.body.state!==pending.state)throw failure('云登录请求已失效，请重新连接');
        const flow=pending;pending=null;
        const response=await fetch(base+'/api/v1/editor/exchange',{method:'POST',headers:{Origin:flow.origin,'Content-Type':'application/json'},body:JSON.stringify({code:req.body.code,code_verifier:flow.verifier}),signal:AbortSignal.timeout(20000),redirect:'error'});
        const session=await response.json();if(!response.ok)throw failure(session.error_description||'登录失败',response.status);
        if(session.app!=='heyso')throw failure('云登录应用不匹配',403);
        saved={...saved,...session,origin:flow.origin};persist();res.json(status());
      });
      app.post('/api/cloud/logout',async(req,res)=>{if(saved.token)await api('/api/v1/editor/logout',{});delete saved.token;persist();res.json(status());});
      app.get('/api/cloud/files',async(req,res)=>res.json(await api('/api/v1/heyso/files')));
      app.post('/api/cloud/convert',async(req,res)=>serial(async()=>{
        const state=compose();if(req.body.revision!==state.revision)throw failure('项目已有更新，请刷新后再转换',409);
        const existing=Object.values(saved.bindings).find(b=>b.projectId===req.body.projectId);
        if(existing)return res.json({state,projectId:existing.projectId});
        // Persist a stable file ID and exact payload before the request, so timeout retries cannot duplicate files.
        saved.conversions??={};
        if(!saved.token||!saved.user)throw failure('请先登录 LoyoCloud',401);
        let conversion=saved.conversions[req.body.projectId];
        const content=projectFile(state,req.body.projectId,conversion?.content.id);
        if(!conversion){conversion={content,userId:saved.user?.id};saved.conversions[req.body.projectId]=conversion;persist();}
        if(conversion.userId!==saved.user?.id)throw failure('请使用发起转换的账号重试',403);
        const result=await api('/api/v1/heyso/files',{content:conversion.content});
        const projectId=bind(result);delete saved.conversions[projectId];persist();res.json({projectId,state:compose()});
      }));
      app.post('/api/cloud/open',async(req,res)=>serial(async()=>{const result=await api('/api/v1/heyso/files/'+encodeURIComponent(req.body.fileId));const projectId=bind(result);res.json({projectId,state:compose()});}));
      app.get('/api/projects/:id/export',async(req,res)=>{const state=await refresh();const binding=Object.values(saved.bindings).find(b=>b.projectId===req.params.id);const content=projectFile(state,req.params.id,binding?.id);res.attachment(content.name+'.heyso').json(content);});
      app.post('/api/projects/import',async(req,res)=>{const content=readProjectFile(req.body.content);const result=store.importProject(content.workspace,req.body.revision===compose().revision?store.read().revision:-1);res.json({projectId:result.projectId,state:compose()});});
    },
    hasCloudProjects:()=>Object.keys(saved.bindings).length>0,
    bindings:()=>Object.values(saved.bindings),
  };
}

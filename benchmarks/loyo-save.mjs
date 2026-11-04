// Uses an isolated test account; creates test files and moves them to trash.
// Run: HEYSO_BENCH_CREDENTIALS=/protected/test-account.json node benchmarks/loyo-save.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {seed,emptyProject,act} from '../server/model.mjs';
import {projectFile} from '../server/project-file.mjs';

const base=process.env.HEYSO_BENCH_BASE||'https://cloud.loyo.work',origin=process.env.HEYSO_BENCH_ORIGIN||'http://127.0.0.1:4179';
const credentials=JSON.parse(await fs.readFile(process.env.HEYSO_BENCH_CREDENTIALS,'utf8'));
const jar=new Map();
let token,csrf,loggedIn=false;
const checks=[];
async function request(route,{form,body,editor=false,expected=200}={}) {
  const write=form!==undefined||body!==undefined;
  const response=await fetch(base+route,{method:write?'POST':'GET',redirect:'manual',signal:AbortSignal.timeout(30000),headers:{...(editor?{Origin:origin,Authorization:'Bearer '+token}:{Cookie:[...jar].map(([k,v])=>k+'='+v).join(';'),...(write?{Origin:base}:{})}),...(write?{'Content-Type':form?'application/x-www-form-urlencoded':'application/json'}:{})},body:form?new URLSearchParams(form).toString():body!==undefined?JSON.stringify(body):undefined});
  if(!editor)for(const cookie of response.headers.getSetCookie()){const first=cookie.split(';')[0],at=first.indexOf('=');jar.set(first.slice(0,at),first.slice(at+1));}
  const text=await response.text();
  assert.equal(response.status,expected,route+' returned HTTP '+response.status);
  let data;try{data=JSON.parse(text);}catch{}
  return {text,data,status:response.status};
}

import {handleLoyo as baseline} from './fixtures/loyo-provider-before.mjs';
import {handleLoyo as optimized} from '../server/loyo-provider.mjs';
import {sessionCookie} from '../server/hosted-auth.mjs';
import {mergeWorkspace,headsOf} from '../src/workspace-sync.mjs';

const createdFiles=[],samples=[],regressions=[];
const env={HEYSO_PASSWORD:'isolated-benchmark-gateway-password'};
let allowed=new Set(),metrics;
async function measuredFetch(url,init){
  const started=performance.now();let res;for(let attempt=0;attempt<3;attempt++){try{res=await fetch(url,{...init,signal:AbortSignal.timeout(25000)});break;}catch(e){console.log(JSON.stringify({networkRetry:attempt+1,route:new URL(url).pathname.endsWith('/action')?'write':'read'}));if(attempt===2)throw e;}}const text=await res.text(),ms=performance.now()-started;
  const route=new URL(url).pathname;
  if(metrics){metrics.requests++;metrics.bytes+=Buffer.byteLength(text)+Buffer.byteLength(init.body||'');metrics[route.endsWith('/action')?'writeMs':'readMs']+=ms;}
  let data=JSON.parse(text);
  if(route==='/api/v1/heyso/files'&&init.method==='GET')data.files=data.files.filter(f=>allowed.has(f.id));
  return new Response(JSON.stringify(data),{status:res.status,headers:{'Content-Type':'application/json'}});
}
async function gateway(handler,path,input){
  const req=new Request(origin+path,{method:input?'POST':'GET',headers:{Cookie:sessionCookie(new Request(origin),env).split(';')[0],'X-HeySO-Client':'local-ui'}});
  return (await handler(req,{base,origin,token,user:{username:'benchmark'}},env,input||{},measuredFetch)).json();
}
try {
  const health=(await request('/healthz')).data;
  assert.ok(health.version);checks.push('正式域名版本及健康检查');
  const login=await request('/login');
  const pre=login.text.match(/name="csrf" value="([^"]+)"/)?.[1];assert.ok(pre);
  await request('/login',{form:{csrf:pre,username:credentials.username,password:credentials.password,next:'/console'},expected:303});loggedIn=true;
  const consolePage=await request('/console');csrf=consolePage.text.match(/data-csrf="([^"]+)"/)?.[1];assert.ok(csrf);
  const verifier=randomBytes(32).toString('base64url'),stateKey=randomBytes(32).toString('base64url');
  const consent=await request('/connect/heyso',{form:{csrf,origin,state:stateKey,code_challenge:createHash('sha256').update(verifier).digest('base64url'),session_days:'1'}});
  const payload=JSON.parse(consent.text.match(/postMessage\((\{[^\n]+?\}),/)?.[1]);assert.equal(payload.state,stateKey);
  const exchange=await fetch(base+'/api/v1/editor/exchange',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({code:payload.code,code_verifier:verifier}),signal:AbortSignal.timeout(30000)});
  assert.equal(exchange.status,200);token=(await exchange.json()).token;assert.ok(token);

  for(const count of [1,5,10]){
    allowed=new Set();
    for(let n=0;n<count;n++){
      const workspace=seed(),p=emptyProject('保存性能验证 '+count+'-'+n+' '+randomUUID().slice(0,6));
      Object.assign(p,{code:'B'+count+'X'+n,startDate:'2026-11-04',endDate:'2026-12-31'});
      workspace.projects=[p];for(const key of ['items','sprints','releases','notes','runs','events'])workspace[key]=[];
      for(let i=0;i<30;i++)act(workspace,{type:'item.create',payload:{projectId:p.id,kind:'task',title:'基准工作项 '+i,startDate:p.startDate,endDate:p.endDate,description:'固定的测试描述。'.repeat(40)}});
      const content=projectFile(workspace,p.id);await request('/api/v1/heyso/files',{editor:true,body:{content}});allowed.add(content.id);createdFiles.push(content.id);
    }
    let state=await gateway(baseline,'/api/state'),p=state.projects[0],target=state.items[0].id;
    for(const operation of ['create','update']){
      for(let sample=0;sample<30;sample++)for(const variant of (sample%2?['optimized','baseline']:['baseline','optimized'])){
        p=state.projects.find(x=>x.id===p.id);
        const payload=operation==='create'?{projectId:p.id,kind:'task',title:'新增性能样本 '+sample+' '+variant,startDate:p.startDate,endDate:p.endDate,description:'固定新增内容。'.repeat(40)}:{id:target,title:'修改性能样本 '+sample+' '+variant,description:'固定修改内容。'.repeat(40),owner:'我',status:sample%2?'active':'todo',startDate:'2026-11-04',endDate:sample%2?'2026-12-30':'2026-12-31'};
        const input={revision:state.revision,requestId:randomUUID(),projectId:p.id,action:{type:'item.'+operation,payload},...(variant==='optimized'?{fileId:p.cloud.fileId,headId:p.cloud.headId,heads:headsOf(state)}:{})};
        metrics={requests:0,bytes:0,readMs:0,writeMs:0};const start=performance.now();
        const result=await gateway(variant==='baseline'?baseline:optimized,'/api/action',input);const durationMs=performance.now()-start;
        if(sample%10===9&&variant==='optimized')console.log(JSON.stringify({progress:{projects:count,operation,sample:sample+1}}));
        samples.push({projects:count,operation,variant,sample,durationMs,...metrics});await fs.writeFile(new URL('../docs/verification/hs1-4-checkpoint.json',import.meta.url),JSON.stringify(samples));metrics=null;state=mergeWorkspace(state,result);
        assert.equal(state.items.find(i=>i.id===(operation==='create'?result.result.id:target)).title,payload.title);
      }
      console.log(JSON.stringify({progress:{projects:count,operation,samples:60}}));
    }
    const reread=await gateway(optimized,'/api/state');assert.equal(reread.items.length,state.items.length);assert.deepEqual(reread.items.find(i=>i.id===target),state.items.find(i=>i.id===target));
    p=state.projects.find(x=>x.id===p.id);
    const input={revision:state.revision,requestId:randomUUID(),projectId:p.id,fileId:p.cloud.fileId,headId:p.cloud.headId,heads:headsOf(state),action:{type:'item.create',payload:{projectId:p.id,kind:'task',title:'重试去重',startDate:p.startDate,endDate:p.endDate}}};
    const first=await gateway(optimized,'/api/action',input),retry=await gateway(optimized,'/api/action',input);assert.equal(first.result.id,retry.result.id);assert.equal(retry.state.items.filter(i=>i.title==='重试去重').length,1);
    await assert.rejects(()=>gateway(optimized,'/api/action',{...input,requestId:randomUUID()}),e=>e.status===409);
    regressions.push({projects:count,persistence:true,idempotency:true,twoClientConflict:true});
    for(const id of allowed)await request('/api/v1/space/files/'+id+'/delete',{editor:true,body:{}});
    allowed=new Set();
  }
  const percentile=(a,p)=>{const sorted=a.toSorted((x,y)=>x-y);return p===.5&&sorted.length%2===0?(sorted[sorted.length/2-1]+sorted[sorted.length/2])/2:sorted[Math.ceil(sorted.length*p)-1];};
  const summary=[];
  for(const projects of [1,5,10])for(const operation of ['create','update'])for(const variant of ['baseline','optimized']){
    const group=samples.filter(x=>x.projects===projects&&x.operation===operation&&x.variant===variant);
    summary.push({projects,operation,variant,n:group.length,medianMs:percentile(group.map(x=>x.durationMs),.5),p95Ms:percentile(group.map(x=>x.durationMs),.95),requests:percentile(group.map(x=>x.requests),.5),medianBytes:percentile(group.map(x=>x.bytes),.5),medianReadMs:percentile(group.map(x=>x.readMs),.5),medianWriteMs:percentile(group.map(x=>x.writeMs),.5)});
  }
  await fs.writeFile(new URL('../docs/verification/hs1-4-cloud-production-benchmark.json',import.meta.url),JSON.stringify({date:new Date().toISOString(),backend:'0.0.13-bate.2',network:'same machine and cloud.loyo.work; alternating variants; isolated test files',samples,summary,regressions},null,2));
  console.log(JSON.stringify({summary,regressions}));
} finally {
  for(const id of createdFiles)try{await request('/api/v1/space/files/'+id+'/delete',{editor:true,body:{}});}catch{}
  if(token)await request('/api/v1/editor/logout',{editor:true,body:{}});
  if(loggedIn&&csrf)await request('/logout',{form:{csrf},expected:303});
}

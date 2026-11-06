import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {handleLoyo} from '../server/loyo-provider.mjs';
import {sessionCookie} from '../server/hosted-auth.mjs';
import {cloudWorkspace} from '../server/cloud.mjs';
import {createStore} from '../server/store.mjs';
test('primary provider forwards personal views without reading or writing shared workspace',async()=>{
 const id=randomUUID(),env={HEYSO_PASSWORD:'view-test-password'},request=new Request('https://heyso.example/api/view-preferences/'+id),cookie=sessionCookie(request,env).split(';')[0],body={view:'board',patch:{query:'hello'},requestId:randomUUID()},calls=[];
 const config={base:'https://cloud.example',origin:'https://heyso.example',token:'private-token',user:{id:'owner'}};
 const fetcher=async(url,init)=>{calls.push({url,init});return Response.json({fileId:id,userId:'owner',views:{}});};
 for(const method of ['GET','POST']){const r=await handleLoyo(new Request(request.url,{method,headers:{Cookie:cookie,'X-HeySO-Client':'local-ui'}}),config,env,method==='POST'?body:{},fetcher);assert.equal(r.status,200);}
 assert.equal(calls.length,2);assert.ok(calls.every(c=>c.url==='https://cloud.example/api/v1/heyso/files/'+id+'/view-preferences'));assert.deepEqual(JSON.parse(calls[1].init.body),body);
 assert.equal((await handleLoyo(request,config,env,{},fetcher)).status,401);assert.equal(calls.length,2);
});
test('local cloud proxy enforces the binding account and never dispatches shared data',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'heyso-views-proxy-')),id=randomUUID(),saved={base:'https://cloud.example',token:'private-token',origin:'http://127.0.0.1:4179',user:{id:'owner'},bindings:{[id]:{id,userId:'owner'}}},previousFetch=globalThis.fetch;
 fs.writeFileSync(path.join(dir,'cloud.json'),JSON.stringify(saved));const calls=[];
 globalThis.fetch=async(url,init)=>{calls.push({url,init});return Response.json({fileId:id,userId:'owner',views:{}});};
 try{const handlers={},app={get(route,fn){handlers['GET '+route]=fn;},post(route,fn){handlers['POST '+route]=fn;}};
 cloudWorkspace({store:createStore(path.join(dir,'workspace.json')),dataDir:dir,base:saved.base}).install(app);
 const req={params:{fileId:id},body:{view:'board',patch:{owner:'我'},requestId:randomUUID()}},res={json(data){assert.equal(data.fileId,id);}};
 await handlers['GET /api/view-preferences/:fileId'](req,res);await handlers['POST /api/view-preferences/:fileId'](req,res);assert.equal(calls.length,2);assert.ok(calls.every(c=>c.url.endsWith('/view-preferences')));
 await assert.rejects(()=>handlers['GET /api/view-preferences/:fileId']({params:{fileId:randomUUID()}},res),/所属/);assert.equal(calls.length,2);
 }finally{globalThis.fetch=previousFetch;fs.rmSync(dir,{recursive:true,force:true});}
});

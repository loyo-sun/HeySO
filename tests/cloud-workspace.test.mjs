import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createStore} from '../server/store.mjs';
import {cloudWorkspace} from '../server/cloud.mjs';
import {projectFile,readProjectFile} from '../server/project-file.mjs';
import {act} from '../server/model.mjs';
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,sorted(value[k])])):value;
test('online workspace keeps a stable revision across JSONB key ordering and recovers uncertain writes without duplicates',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'heyso-cloud-unit-')),store=createStore(path.join(dir,'workspace.json')),raw=store.read(),p=raw.projects[0],id=randomUUID();
 let content=projectFile(raw,p.id,id),headId=randomUUID(),loseResponse=false,writes=0;
 const requests=new Map(),fetch=globalThis.fetch;
 fs.writeFileSync(path.join(dir,'cloud.json'),JSON.stringify({base:'https://cloud.test',token:'private-token',origin:'http://127.0.0.1:4179',user:{id:'user',username:'test'},bindings:{[id]:{id,projectId:p.id,content,headId,userId:'user',username:'test',error:''}}}));
 globalThis.fetch=async(url,options)=>{
   if(options.method==='POST'){
     const body=JSON.parse(options.body);
     let result=requests.get(body.requestId);
     if(!result){assert.equal(body.headId,headId);const state=structuredClone(content.workspace);const value=act(state,body.action);state.revision++;content=readProjectFile({...content,name:state.projects[0].name,workspace:state});headId=randomUUID();writes++;result={content,state:content.workspace,headId,result:value};requests.set(body.requestId,result);}
     if(loseResponse){loseResponse=false;throw Error('connection lost after commit');}
     return Response.json(sorted(result));
   }
   return Response.json(sorted({content,state:content.workspace,headId}));
 };
 try{
   let workspace=cloudWorkspace({store,dataDir:dir,base:'https://cloud.test'}),state=await workspace.read();const revision=state.revision;
   assert.equal((await workspace.read()).revision,revision,'mere key ordering must not create a new version');
   const renamed=await workspace.dispatch({type:'project.update',payload:{id:p.id,name:'云端新名称'}},revision);
   assert.equal(renamed.state.projects[0].name,'云端新名称');assert.equal((await workspace.read()).projects[0].name,'云端新名称');
   assert.equal(store.read().projects[0].name,p.name,'local pre-conversion snapshot is preserved');
   state=await workspace.read();loseResponse=true;
   await assert.rejects(()=>workspace.dispatch({type:'note.create',payload:{projectId:p.id,title:'唯一记录',body:'保留一次',type:'decision',author:'我'}},state.revision),/无法连接/);
   const before=writes;state=await workspace.read();assert.equal(writes,before);assert.equal(state.notes.filter(n=>n.title==='唯一记录').length,1);
   assert.equal(Object.values(JSON.parse(fs.readFileSync(path.join(dir,'cloud.json'),'utf8')).bindings)[0].pending,undefined);
   workspace=cloudWorkspace({store,dataDir:dir,base:'https://cloud.test'});assert.equal((await workspace.read()).projects[0].name,'云端新名称');
   assert.equal(projectFile(await workspace.read(),p.id,id).workspace.projects[0].cloud,undefined);
 }finally{globalThis.fetch=fetch;fs.rmSync(dir,{recursive:true,force:true});}
});

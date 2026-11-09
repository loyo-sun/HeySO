import test from 'node:test';import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';import {IncomingMessage,ServerResponse} from 'node:http';
import {randomUUID} from 'node:crypto';import {PGlite} from '@electric-sql/pglite';
import {createCloud} from '../src/server.mjs';import {putSecret} from '../src/security.mjs';
// Drive the full HTTP middleware and real routes using in-memory sockets.
// No listening TCP socket is opened, so Host/Origin/CORS/auth are still exercised.
async function inject(app,{path,body={},origin,token,method='POST'}){
 const socket=new PassThrough();socket.remoteAddress='127.0.0.1';
 const req=new IncomingMessage(socket);req.method=method;req.url=path;req.headers={host:'cloud.test',origin,...(token?{authorization:'Bearer '+token}:{}),'content-type':'application/json'};
 const raw=JSON.stringify(body);req.headers['content-length']=String(Buffer.byteLength(raw));
 const res=new ServerResponse(req);res.assignSocket(socket);let data='';socket.on('data',d=>data+=d);
 const done=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(JSON.stringify({path,status:res.statusCode,headers:res.headersSent,finished:res.writableFinished,ended:req.readableEnded,body:req.body!==undefined,data}))),1500);res.on('finish',()=>{clearTimeout(timer);resolve();});res.on('error',reject);});
 app.handle(req,res);req.complete=true;req.push(raw);req.push(null);await done;socket.destroy();
 return {status:res.statusCode,body:JSON.parse(data.split('\r\n\r\n').slice(1).join('\r\n\r\n'))};
}
test('full application admits live routes only with the origin-bound HeySO session, preserving BaizeFig isolation',async()=>{
 const db=new PGlite(),cloud=await createCloud({db,base:'https://cloud.test',origins:['https://legacy.example']});
 const user=randomUUID(),origin='https://hexu.netlify.app';
 try{
  await db.query("INSERT INTO users(id,username,password_hash,workspace_id) VALUES($1,$2,'unused',$3)",[user,user,randomUUID()]);
  const token=await putSecret(db,'editor',user,{app:'heyso',origin},60000),baize=await putSecret(db,'editor',user,{app:'baizefig',origin},60000);
  const state=await inject(cloud.app,{path:'/api/v1/heyso/state',origin,token});assert.equal(state.status,200,JSON.stringify(state.body));assert.deepEqual(state.body.files,[]);
  const updates=await inject(cloud.app,{path:'/api/v1/heyso/updates',body:{heads:[{fileId:'old',headId:'old'}]},origin,token});assert.equal(updates.status,200);assert.equal(updates.body.changed,true);
  const caps=await inject(cloud.app,{path:'/api/v1/heyso/capabilities',method:'GET',origin,token});assert.equal(caps.status,200);assert.equal(caps.body.protocol,'live-v1');
  assert.equal((await inject(cloud.app,{path:'/api/v1/heyso/state',origin:'https://other.example',token})).status,401);
  assert.equal((await inject(cloud.app,{path:'/api/v1/heyso/state',origin,token:baize})).status,401);
  assert.equal((await inject(cloud.app,{path:'/api/v1/heyso/state',origin})).status,401);
  assert.equal((await inject(cloud.app,{path:'/api/v1/heyso/state/admin',origin,token})).status,403);
  assert.equal((await inject(cloud.app,{path:'/lygl',origin,token})).status,403);
 }finally{await cloud.close();await db.close();}
});

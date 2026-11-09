import {saveLiveProject,ProjectUpdates,checkTextChanges,captureRecords,changedRecords} from './heyso-live.mjs';
import {installHeysoViewPreferences} from './heyso-view-preferences.mjs';
import {displayName} from './identity.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {z} from 'zod';
import {act} from '../vendor/heyso/server/model.mjs';
import {readProjectFile} from '../vendor/heyso/server/project-file.mjs';
import {toolDefinitions} from '../vendor/heyso/server/mcp.mjs';
import {transaction,audit,quota} from './db.mjs';
import {getSecret,fail} from './security.mjs';
import {hydrateVersion} from './shared-snapshots.mjs';
import {autosaveWindow,saveHeysoVersion} from './heyso-versions.mjs';
import {saveTiming} from './save-timing.mjs';
import {assertFileUnlocked} from './edit-locks.mjs';
import {applications} from './app-registry.mjs';
import {allowsEditorOrigin} from './editor-origins.mjs';
const fingerprint = value => createHash('sha256').update(JSON.stringify(value,function(key,item){
  return item && typeof item==='object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]])) : item;
})).digest('hex');
const serial = (db,run,measure) => !db.connect && db.transaction ? db.transaction(run) : transaction(db,run,measure);
export function installHeyso(app,{db,base,auth,login,csrf,origins,live}) {
  const windowMs=autosaveWindow(), updates=new ProjectUpdates();
  const validateHeads=heads=>{if(!Array.isArray(heads)||heads.length>10000||heads.some(h=>!h||typeof h.fileId!=='string'||typeof h.headId!=='string'))throw fail(400,'INVALID_MANIFEST','需要有效的项目清单');return heads;};
  const reply=(req,out)=>{
    const {version,...value}=out;
    if(req.body?.responseFormat==='changes-v1'&&value.changes)return {changes:value.changes,project:value.state.projects[0],fileId:value.content.id,headId:value.headId,dataRevision:value.state.revision,result:value.result};
    if(['content-v1','changes-v1'].includes(req.body?.responseFormat))return {content:value.content,headId:value.headId,result:value.result,...(value.replayed?{replayed:true}:{})};
    return value;
  };
  const editor = async(req,res,next) => {
    const s = await getSecret(db,req.headers.authorization?.replace(/^Bearer /,''),'editor');
    if (!s || s.data.app !== 'heyso' || !allowsEditorOrigin(origins, 'heyso', req.headers.origin) || s.data.origin !== req.headers.origin)
      throw fail(401,'SESSION_EXPIRED','HeySO 云登录已失效，请重新登录');
    req.editorSession=s;req.user={id:s.user_id};next();
  };
  installHeysoViewPreferences(app,{db,editor});
  async function load(c,user,id) {
    // One statement reads a coherent head and version while another client saves.
    const row=(await c.query("SELECT to_jsonb(d) AS file,to_jsonb(v) AS version FROM cloud_documents d JOIN cloud_document_versions v ON v.id=d.head_id AND v.document_id=d.id WHERE d.id::text=$1 AND d.user_id=$2 AND d.app='heyso' AND d.deleted_at IS NULL",[id,user])).rows[0];
    if (!row) throw fail(404,'NOT_FOUND','HeySO 项目文件不存在');
    const {file}=row,version=await hydrateVersion(c,row.version,user);
    const content=readProjectFile(version?.content);
    content.name=file.name;content.workspace.projects[0].name=file.name;
    return {file,content,headId:file.head_id,state:content.workspace,version:row.version};
  }
  async function mutate(user,id,body,authorize=async()=>{},timing=saveTiming()) {
    return serial(db,async raw=>{
      const c=timing.track(raw);
      // Serialize quota accounting, idempotency, cloud-space operations and project writes.
      const actor=await timing.measure('account_lock',async()=>(await c.query('SELECT id,username,name,storage_limit_bytes FROM users WHERE id=$1 FOR UPDATE',[user])).rows[0]);
      const loaded=await timing.measure('load',()=>load(c,user,id));
      await authorize(c);
      if(typeof body.requestId!=='string'||!body.requestId||body.requestId.length>200)throw fail(400,'REQUEST_ID','缺少唯一请求标识');
      const hash=fingerprint({id,action:body.action,headId:body.headId});
      const prior=(await c.query('SELECT * FROM heyso_requests WHERE user_id=$1 AND request_id=$2',[user,body.requestId])).rows[0];
      if(prior){if(prior.fingerprint!==hash)throw fail(409,'IDEMPOTENCY_CONFLICT','请求标识已用于不同操作');return {...loaded,result:prior.result,replayed:true};}
      if(body.consistency!=='live-v1'&&body.headId!==loaded.headId)throw fail(409,'VERSION_CONFLICT','云端项目已更新，请刷新后重试');
      if(!body.action||['project.create','project.delete'].includes(body.action.type))throw fail(400,'INVALID_ACTION','请通过云空间管理项目文件');
      await assertFileUnlocked(c,user,id);
      if(body.consistency==='live-v1'){
        if(body.action.type==='item.update'&&body.headId!==loaded.headId&&['description','acceptance'].some(key=>body.action.payload?.[key]!==undefined&&!Object.hasOwn(body.baseFields||{},key)))throw fail(409,'FIELD_CONFLICT','旧文本草稿缺少编辑基准，请核对后重新提交');
        checkTextChanges(loaded.state,body.action,body.baseFields);
      }
      const before=body.responseFormat==='changes-v1'&&body.headId===loaded.headId?captureRecords(loaded.state):null;
      let result;
      const content=await timing.measure('business',async()=>{
        result=act(loaded.state,{...body.action,actor:displayName(actor)});
        loaded.state.revision++;
        // readProjectFile below performs the final full validation after revision
        // and activity changes; do not validate the same state twice here.
        return readProjectFile({...loaded.content,name:loaded.state.projects[0].name,workspace:loaded.state});
      });
      const head=await (body.consistency==='live-v1'||loaded.file.heyso_live?saveLiveProject:saveHeysoVersion)(c,{user,content,previous:loaded.version,limit:actor.storage_limit_bytes,source:'HeySO',windowMs,measure:timing.measure});
      await c.query('INSERT INTO heyso_requests(user_id,request_id,fingerprint,result,document_id) VALUES($1,$2,$3,$4,$5)',[user,body.requestId,hash,JSON.stringify(result??null),id]);
      await audit(c,user,'heyso_project_updated',{document_id:id,action:body.action.type});
      return {content,state:content.workspace,headId:head,result,...(before?{changes:changedRecords(before,content.workspace)}:{})};
    },timing.measure);
  }
  app.get('/api/v1/heyso/capabilities',editor,async(req,res)=>res.json({protocol:'live-v1',notifications:'long-poll',history:false}));
  app.post('/api/v1/heyso/state',editor,async(req,res)=>{
    const known=new Map(validateHeads(req.body.heads||[]).map(h=>[h.fileId,h.headId]));
    const rows=(await db.query("SELECT id,head_id FROM cloud_documents WHERE user_id=$1 AND app='heyso' AND deleted_at IS NULL ORDER BY id",[req.user.id])).rows;
    const files=[];
    for(const row of rows)if(known.get(row.id)!==row.head_id)files.push(reply({body:{responseFormat:'content-v1'}},await load(db,req.user.id,row.id)));
    // Use the head actually read for changed files, even if a write committed after metadata was listed.
    const readHeads=new Map(files.map(f=>[f.content.id,f.headId]));
    res.json({protocol:'live-v1',manifest:rows.map(r=>({fileId:r.id,headId:readHeads.get(r.id)||r.head_id})),files});
  });
  app.post('/api/v1/heyso/updates',editor,async(req,res)=>{
    const manifest=async()=>(await db.query("SELECT id AS \"fileId\",head_id AS \"headId\" FROM cloud_documents WHERE user_id=$1 AND app='heyso' AND deleted_at IS NULL ORDER BY id",[req.user.id])).rows;
    const canonical=rows=>JSON.stringify(rows.map(r=>[r.fileId,r.headId]).sort((a,b)=>a[0].localeCompare(b[0])));
    validateHeads(req.body.heads);
    const controller=new AbortController();res.on('close',()=>controller.abort());
    const waiting=updates.wait(req.user.id,{signal:controller.signal});
    try {
      let heads=await manifest();
      if(canonical(heads)===canonical(req.body.heads)){await waiting;heads=await manifest();}
      const session=await getSecret(db,req.headers.authorization?.slice(7),'editor');
      if(!session||session.user_id!==req.user.id)throw fail(401,'SESSION_EXPIRED','云登录已失效');
      if(!res.destroyed)res.json({changed:canonical(heads)!==canonical(req.body.heads),manifest:heads});
    } finally {controller.abort();}
  });
  app.get('/api/v1/heyso/files',editor,async(req,res)=>res.json({files:(await db.query("SELECT id,name,app,head_id,updated_at FROM cloud_documents WHERE user_id=$1 AND app='heyso' AND deleted_at IS NULL ORDER BY updated_at DESC",[req.user.id])).rows}));
  app.get('/api/v1/heyso/files/:id',editor,async(req,res)=>res.json(reply(req,await load(db,req.user.id,req.params.id))));
  app.post('/api/v1/heyso/files',editor,async(req,res)=>{
    const content=readProjectFile(req.body.content);
    const out=await serial(db,async c=>{
      const account=(await c.query('SELECT id,storage_limit_bytes FROM users WHERE id=$1 FOR UPDATE',[req.user.id])).rows[0];
      const existing=(await c.query('SELECT id,user_id,app,deleted_at FROM cloud_documents WHERE id=$1',[content.id])).rows[0];
      if(existing){
        if(existing.user_id!==req.user.id||existing.app!=='heyso'||existing.deleted_at)throw fail(409,'FILE_EXISTS','文件标识已存在');
        const saved=await load(c,req.user.id,content.id);
        // A retried conversion must not overwrite subsequent edits or adopt unrelated content.
        const first=(await c.query('SELECT fingerprint FROM heyso_imports WHERE user_id=$1 AND document_id=$2',[req.user.id,content.id])).rows[0];
        if(!first||first.fingerprint!==fingerprint(content))throw fail(409,'FILE_EXISTS','此文件已存在，请重新打开云端项目');
        return saved;
      }
      if(req.body.folderId && !(await c.query('SELECT id FROM cloud_folders WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL',[req.body.folderId,req.user.id])).rows.length)throw fail(404,'NOT_FOUND','文件夹不存在');
      await c.query("INSERT INTO cloud_documents(id,user_id,name,app,folder_id) VALUES($1,$2,$3,'heyso',$4)",[content.id,req.user.id,content.name,req.body.folderId||null]);
      const headId=await saveHeysoVersion(c,{user:req.user.id,content,limit:account.storage_limit_bytes,source:'HeySO 本地项目转在线',windowMs});
      await c.query('INSERT INTO heyso_imports(user_id,document_id,fingerprint) VALUES($1,$2,$3)',[req.user.id,content.id,fingerprint(content)]);
      await audit(c,req.user.id,'heyso_project_imported',{document_id:content.id});
      return {content,state:content.workspace,headId};
    });updates.notify(req.user.id);res.json(reply(req,out));
  });
  app.post('/api/v1/heyso/files/:id/action',editor,async(req,res)=>{
    const timing=saveTiming();
    try {
      const out=await mutate(req.user.id,req.params.id,req.body,async c=>{
        const s=await getSecret(c,req.headers.authorization?.slice(7),'editor');
        if(!s)throw fail(401,'SESSION_EXPIRED','云登录已失效');
      },timing);
      updates.notify(req.user.id);
      res.set('Server-Timing',timing.header());res.set('X-HeySO-Transaction-Queries',String(timing.queries()));res.json(reply(req,out));
    } catch(e) {res.set('Server-Timing',timing.header());throw e;}
  });
  app.post('/api/v1/apps/:app/disconnect',login,csrf,async(req,res)=>{
    if(!applications[req.params.app])throw fail(404,'NOT_FOUND','应用不存在');
    const sessions=(await db.query("SELECT hash FROM secrets WHERE user_id=$1 AND kind='editor' AND data->>'app'=$2",[req.user.id,req.params.app])).rows;
    await serial(db,async c=>{for(const s of sessions){await c.query('DELETE FROM document_edit_locks WHERE session_hash=$1',[s.hash]);await c.query('DELETE FROM secrets WHERE hash=$1',[s.hash]);}await audit(c,req.user.id,'app_signed_out',{app:req.params.app});});
    sessions.forEach(s=>live.closeSession(s.hash));res.json({ok:true});
  });
  app.all('/mcp/heyso',async(req,res)=>{
    const identity=await auth.authenticate(req.headers.authorization,'heyso');
    if(!identity){res.set('WWW-Authenticate',`Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp/heyso"`);return res.status(401).json({error:'invalid_token'});}
    if(req.method!=='POST')return res.status(405).set('Allow','POST').json({error:'POST required'});
    if(!req.is('application/json'))return res.status(415).json({error:'application/json required'});
    const server=new McpServer({name:'LoyoCloud HeySO',version:'0.1.0'});
    async function permitted(c,fileId,scope){
      const g=(await c.query("SELECT * FROM grants WHERE id=$1 AND user_id=$2 AND app='heyso' AND revoked=false",[identity.grantId,identity.userId])).rows[0];
      if(!g||!identity.scopes.includes(scope)||!g.scopes.includes(scope)||(fileId&&g.document_ids!==null&&!g.document_ids.includes(fileId))||g.connection_ids!==null)throw fail(403,'FORBIDDEN','HeySO 操作或文件未获授权');
      return g;
    }
    for(const [name,description,schema,read,action] of toolDefinitions){
      const shape=name==='list_projects'?schema.shape:{...schema.shape,fileId:z.string().uuid()};
      if(name==='update_progress')shape.requestId=z.string().min(1).max(200);
      server.registerTool(name,{description,inputSchema:shape,annotations:{readOnlyHint:!!read,destructiveHint:false}},async args=>{
        const callId=randomUUID(),start=Date.now();let inserted=false;
        try{
          const scope=read?'heyso:read':name==='update_progress'?'heyso:progress':name==='submit_result'?'heyso:submit':'heyso:write';
          const g=await permitted(db,args.fileId,scope);
          await quota(db,'mcp:'+identity.userId,120);await quota(db,'mcp-day:'+identity.userId,5000,86400000);
          await db.query("INSERT INTO calls(id,user_id,grant_id,app,tool,document_id,status) VALUES($1,$2,$3,'heyso',$4,$5,'running')",[callId,identity.userId,identity.grantId,name,args.fileId||null]);inserted=true;
          let value;
          if(name==='list_projects'){
            const rows=(await db.query("SELECT id FROM cloud_documents WHERE user_id=$1 AND app='heyso' AND deleted_at IS NULL",[identity.userId])).rows;
            value=[];for(const row of rows){if(g.document_ids!==null&&!g.document_ids.includes(row.id))continue;const loaded=await load(db,identity.userId,row.id);value.push({...loaded.state.projects[0],fileId:row.id});}
          }else{
            const loaded=await load(db,identity.userId,args.fileId);
            if(read)value=read(loaded.state,args);
            else{
              const {fileId,...payload}=args;
              // Retry fingerprints depend on the caller's context, not the current cloud head.
              const requestId=fingerprint([identity.grantId,payload.requestId]);
              payload.requestId=requestId;
              const prior=(await db.query('SELECT head_id FROM heyso_mcp_heads WHERE user_id=$1 AND request_id=$2',[identity.userId,requestId])).rows[0];
              let headId=prior?.head_id||loaded.headId;
              await db.query('INSERT INTO heyso_mcp_heads(user_id,request_id,head_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[identity.userId,requestId,headId]);
              headId=(await db.query('SELECT head_id FROM heyso_mcp_heads WHERE user_id=$1 AND request_id=$2',[identity.userId,requestId])).rows[0].head_id;
              value=(await mutate(identity.userId,fileId,{action:{type:action,payload},headId,requestId,consistency:'live-v1'},c=>permitted(c,fileId,scope))).result;updates.notify(identity.userId);
            }
          }
          await db.query("UPDATE calls SET status='succeeded',duration_ms=$2,finished_at=now() WHERE id=$1",[callId,Date.now()-start]);
          return {content:[{type:'text',text:JSON.stringify(value)}]};
        }catch(e){if(inserted)await db.query("UPDATE calls SET status='failed',error_code=$2,duration_ms=$3,finished_at=now() WHERE id=$1",[callId,e.code||'HEYSO_ERROR',Date.now()-start]);return {isError:true,content:[{type:'text',text:JSON.stringify({error:e.message,status:e.status||500,requestId:callId})}]};}
      });
    }
    const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
    res.on('close',()=>void server.close());await server.connect(transport);await transport.handleRequest(req,res,req.body);
  });
}

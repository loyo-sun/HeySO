import {roadmapSiblings,roadmapTreeSnapshot} from '../shared/roadmap-order.mjs';
import {DurableWorkspaceSync} from './durable-workspace-sync.mjs';
import {mergeWorkspace,headsOf} from './workspace-sync.mjs';
import {SyncStorage} from './sync-storage.mjs';
const roadmapAction=type=>['item.reorder','item.roadmap.move'].includes(type);
function moveContext(state,payload){
 const source=state?.items.find(i=>i.id===payload.id),target=state?.items.find(i=>i.id===payload.targetId);
 if(!source||!target)throw Object.assign(Error('移动的工作项或目标已不存在'),{status:409});
 return JSON.stringify([source.id,source.parentId||null,source.kind||'',target.id,target.parentId||null,target.kind||'']);
}
export function mergeLive(current,response){
 if(response.patch){
  if(!current)throw Error('请先读取项目');
  const project=response.project,existing=current.projects.find(p=>p.id===project.id);
  if(!existing||existing.cloud?.fileId!==project.cloud?.fileId)throw Error('项目数据已变化，请重新读取');
  if((existing.cloud?.dataRevision||0)>(project.cloud?.dataRevision||0))return current;
  const next={...current,revision:response.revision,projects:current.projects.map(p=>p.id===project.id?project:p)};
  for(const key of ['items','sprints','releases','notes','runs','events']){
   const change=response.changes[key];if(!change||!change.upsert.length&&!change.remove.length&&!change.order)continue;
   const removed=new Set(change.remove),updated=new Map(change.upsert.map(r=>[r.id,r]));
   const records=current[key].filter(r=>!removed.has(r.id)).map(r=>{const value=updated.get(r.id)||r;updated.delete(r.id);return value;});
   const merged=[...records,...updated.values()];
   if(change.order){const byId=new Map(merged.map(r=>[r.id,r])),scope=new Set(change.order);next[key]=[...merged.filter(r=>!scope.has(r.id)&&r.projectId!==project.id),...change.order.map(id=>byId.get(id)).filter(Boolean)];}
   else next[key]=merged;
  }return next;
 }
 const state=response.state||response;
 if(current&&state.projects){
  const stale=state.projects.filter(p=>(current.projects.find(x=>x.id===p.id)?.cloud?.dataRevision||0)>(p.cloud?.dataRevision||0));
  if(stale.length){
   const ids=new Set(stale.map(p=>p.id)),kept={...state};
   kept.projects=state.projects.map(p=>ids.has(p.id)?current.projects.find(x=>x.id===p.id):p);
   for(const key of ['items','sprints','releases','notes','runs','events'])kept[key]=[...(state[key]||[]).filter(r=>!ids.has(r.projectId)),...current[key].filter(r=>ids.has(r.projectId))];
   response=response.state?{...response,state:kept}:kept;
  }
 }return mergeWorkspace(current,response);
}
const rejected=phase=>['conflict','rejected'].includes(phase);

// Cache/outbox and failed drafts are independent. A definitive rejection never
// blocks later valid operations. Uncertain requests retain their original ID/body.
export class LiveWorkspaceSync extends DurableWorkspaceSync {
 constructor(options){
  let restored=[];const storage=options.storage||new SyncStorage(options.scope);
  const boundary={read:async()=>{const saved=await storage.read();if(!saved)return saved;restored=[...(saved.failed||[]),...(saved.queue||[]).filter(e=>rejected(e.phase))];return {...saved,queue:(saved.queue||[]).filter(e=>!rejected(e.phase))};},write:value=>storage.write(value)};
  super({...options,storage:boundary,refreshIntervalMs:0});this.failed=[];this.needsFullRefresh=true;
  this.ready=this.ready.then(()=>{this.failed=restored;if(!this.readOnly&&!this.storageFailed)this.report(this.queue[0]?.phase||'synced');});
 }
 hasBlockingPending(){return super.hasPending();}
 hasPending(){return super.hasPending()||!!this.failed?.length;}
 report(phase,error=''){
  super.report(phase,error);this.status.failedCount=this.failed?.length||0;this.onStatus({...this.status});
 }
 async persist(state=this.confirmed,queue=this.queue){
  try{await this.storage.write({state,queue,failed:this.failed||[],checkedAt:0});this.persistenceError=false;}
  catch(e){this.persistenceError=true;throw e;}
 }
 buildBody(entry){
  const body=super.buildBody(entry);return {...body,requestId:entry.requestId||body.requestId,consistency:'live-v1',...(entry.baseFields?{baseFields:entry.baseFields}:{})};
 }
 captureBaseFields(type,payload){
  const record=this.state?.items.find(i=>i.id===payload.id);
  return Object.fromEntries(['description','acceptance'].filter(k=>type==='item.update'&&payload[k]!==undefined).map(k=>[k,record?.[k]??'']));
 }
 async action(type,payload,projectId,quiet=false){
  await this.ready;
  if(this.readOnly||this.storageFailed||this.disposed){this.onMessage(this.status.error||'无法保存，请重新打开工作空间');return null;}
  const records=[...(this.confirmed?.projects||[]),...['items','sprints','releases','notes','runs','events'].flatMap(k=>this.confirmed?.[k]||[])];
  const id=payload.id||payload.itemId||payload.storyId||payload.runId,record=records.find(r=>r.id===id);
  const target=payload.projectId||record?.projectId||(this.confirmed?.projects.some(p=>p.id===id)?id:projectId);
  if(type==='project.create'||!this.confirmed?.projects.find(p=>p.id===target)?.cloud?.fileId)return super.action(type,payload,projectId,quiet);
  const entry={id:crypto.randomUUID(),type,payload:structuredClone(payload),projectId:target,phase:'pending',body:null,baseFields:this.captureBaseFields(type,payload),...(roadmapAction(type)?{moveContext:moveContext(this.state,payload)}:{})};
  const immediate=['item.update','item.move'].includes(type)||roadmapAction(type);let completion;
  if(!immediate)completion=new Promise(resolve=>this.waiters.set(entry.id,resolve));
  this.localWrites=(this.localWrites||0)+1;this.epoch++;this.queue=[...this.queue,entry];this.publish();this.report('saving-local');
  try{await this.transact(async()=>{const queue=this.queue.map(e=>e.phase==='local-error'?{...e,phase:'pending'}:e);await this.persist(this.confirmed,queue);this.queue=queue;});}
  catch(e){entry.phase='local-error';this.persistenceError=true;this.report('storage-error','本地保存失败，请勿关闭页面');this.waiters.delete(entry.id);return null;}
  finally{this.localWrites--;}
  this.report(this.queue[0]?.phase||'synced');this.pump();
  return immediate?{...this.state.items.find(i=>i.id===payload.id),...(roadmapAction(type)?{pendingSync:true}:{})}:completion;
 }
 async prepareRoadmap(entry){
  if(entry.body||!roadmapAction(entry.type))return;
  const cloud=this.confirmed.projects.find(p=>p.id===entry.projectId)?.cloud;
  // Normal moves use the confirmed snapshot without a network read.
  // Legacy caches and definite conflicts reconcile in the background.
  const readFresh=this.needsFullRefresh||!!entry.rebaseAttempts;
  const response=readFresh?await this.request('/api/live/state',{storageScope:this.scope,heads:headsOf(this.confirmed).filter(h=>h.fileId!==cloud?.fileId)}):null;
  await this.transact(async()=>{
   const next=response?mergeLive(this.confirmed,response):this.confirmed,context=moveContext(next,entry.payload);
   if(entry.moveContext&&entry.moveContext!==context)throw Object.assign(Error('移动对象的层级已被修改，本次移动未执行；请核对目标位置'),{status:409});
   const source=next.items.find(i=>i.id===entry.payload.id),project=next.projects.find(p=>p.id===entry.projectId);
   entry.moveContext=context;
   entry.payload={...entry.payload,...(entry.type==='item.reorder'?{expectedSiblingIds:roadmapSiblings(next.items,source).map(i=>i.id)}:{expectedTree:roadmapTreeSnapshot(next.items,project)})};
   await this.persist(next);this.confirmed=next;if(readFresh)this.needsFullRefresh=false;this.epoch++;this.publish();
  });
 }
 // Called synchronously by the base action after its local transaction commits.
 pump(){
  if(this.localWrites||this.processing||this.disposed||this.retryTimer||!this.queue.length||this.readOnly||this.storageFailed)return;
  const entry=this.queue[0];if(['expired','local-error'].includes(entry.phase))return;
  this.processing=(async()=>{
   try{
    await this.prepareRoadmap(entry);
    await this.transact(async()=>{if(!entry.body)entry.body=this.buildBody(entry);await this.persist();});
    this.report('syncing');
    const result=await this.request('/api/live/action',entry.body);
    await this.transact(async()=>{
     const next=mergeLive(this.confirmed,result),queue=this.queue.filter(e=>e.id!==entry.id);
     await this.persist(next,queue);this.confirmed=next;this.queue=queue;this.epoch++;this.publish();this.retryAttempt=0;this.onOnline(true);
     this.waiters.get(entry.id)?.(result.result);this.waiters.delete(entry.id);this.report(queue.length?'pending':'synced');
    });
   }catch(e){
    if(roadmapAction(entry.type)&&e.status===409&&/工作项顺序.*已有更新/.test(e.message)&&(entry.rebaseAttempts||0)<1){
     await this.transact(async()=>{entry.rebaseAttempts=(entry.rebaseAttempts||0)+1;entry.requestId=crypto.randomUUID();entry.body=null;entry.phase='pending';await this.persist();});
     this.report('pending');return;
    }
    const definite=e.status>=400&&e.status<500&&![401,408,429].includes(e.status);
    if(definite){
     await this.transact(async()=>{
      const failed={...entry,phase:e.status===409?'conflict':'rejected',error:e.message};
      const previous=this.failed;this.failed=[...previous,failed];
      try{await this.persist(this.confirmed,this.queue.filter(x=>x.id!==entry.id));}
      catch(err){this.failed=previous;throw err;}
      this.queue=this.queue.filter(x=>x.id!==entry.id);this.epoch++;this.publish();
     });
     this.onMessage((roadmapAction(entry.type)?'移动未保存：'+(e.message||'目标位置已变化').replace(/请刷新后重新排序|请刷新后重新拖动/g,'请重新选择目标位置'):e.message||'保存被拒绝')+'；草稿已保留在项目设置中');
     this.refreshQueued=true;this.needsFullRefresh=true;
     this.report(this.queue.length?'pending':'synced');
    }else{
     entry.phase=e.status===401?'expired':'retrying';entry.error=e.message;
     await this.transact(()=>this.persist()).catch(()=>{this.persistenceError=true;});
     this.report(this.persistenceError?'storage-error':entry.phase,e.message);
     if(entry.phase==='retrying'&&!this.disposed){this.retryTimer=this.setTimer(()=>{this.retryTimer=null;this.pump();},Math.min(30000,1000*2**this.retryAttempt++));}
    }
    this.waiters.get(entry.id)?.(null);this.waiters.delete(entry.id);
   }
  })().catch(e=>{this.persistenceError=true;this.report('storage-error',e.message||'本地保存失败，请勿关闭页面');}).finally(()=>{
   this.processing=null;if(this.queue.length&&this.status.phase==='pending')this.pump();
   else if(this.refreshQueued){this.refreshQueued=false;this.refresh();}
  });
 }
 async refresh(){
  await this.ready;if(this.disposed)return;
  this.pump();if(this.refreshing)return this.refreshing;
  const epoch=this.epoch,full=this.needsFullRefresh;
  this.refreshing=(async()=>{
   try{
    const result=await this.request('/api/live/state',{storageScope:this.scope,...(this.confirmed&&!full?{heads:headsOf(this.confirmed)}:{})});
    await this.transact(async()=>{
     if(this.disposed||this.epoch!==epoch)return;
     const sameManifest=JSON.stringify((result.manifest||[]).map(h=>[h.fileId,h.headId]).sort())===JSON.stringify(headsOf(this.confirmed).map(h=>[h.fileId,h.headId]).sort());
     if(this.confirmed&&result.delta&&!result.state.projects.length&&sameManifest){this.onOnline(true);return;}
     const next=mergeLive(this.confirmed,result);
     if(!this.readOnly&&!this.storageFailed)await this.persist(next);
     this.confirmed=next;if(full)this.needsFullRefresh=false;this.publish();this.onOnline(true);
    });
   }catch(e){this.onOnline(false);if(!this.confirmed)this.onMessage(e.message||'无法读取云端项目');}
   finally{this.refreshing=null;}
  })();return this.refreshing;
 }
 async inspectFailed(id){
  const entry=this.failed.find(e=>e.id===id);if(!entry)return null;
  const remote=await this.request('/api/live/state',{storageScope:this.scope});
  this.reviewed={state:remote.state||remote,id};return {...this.reviewed,entry};
 }
 async resolveFailed(id,keepLocal){
  await this.transact(async()=>{
   const entry=this.failed.find(e=>e.id===id);if(!entry||this.reviewed?.id!==id)throw Error('请先重新读取云端内容');
   const failed=this.failed.filter(e=>e.id!==id),queue=keepLocal?[...this.queue,{...entry,id:crypto.randomUUID(),body:null,phase:'pending',error:'',baseFields:Object.fromEntries(['description','acceptance'].filter(k=>entry.payload[k]!==undefined).map(k=>[k,this.reviewed.state.items.find(i=>i.id===entry.payload.id)?.[k]??'']))}]:this.queue;
   const old=this.failed;this.failed=failed;
   try{await this.persist(this.reviewed.state,queue);}catch(e){this.failed=old;throw e;}
   this.confirmed=this.reviewed.state;this.queue=queue;this.reviewed=null;this.epoch++;this.publish();this.report(queue.length?'pending':'synced');
  });this.pump();
 }
}

export function watchLiveUpdates(sync,{document:doc=globalThis.document,window:win=globalThis.window,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 let stopped=false,timer,started=false;
 const tick=async()=>{
  if(stopped)return;
  let failed=false;
  try{
   if(!doc.hidden){if(!started){await sync.refresh();started=true;}const out=await sync.request('/api/live/updates',{storageScope:sync.scope,heads:headsOf(sync.confirmed)});if(!stopped&&out.changed)await sync.refresh();}
  }catch{failed=true;sync.onOnline(false);}
  if(!stopped)timer=setTimer(tick,failed||doc.hidden?3000:250);
 };
 const wake=()=>{if(!doc.hidden)sync.refresh();};
 doc.addEventListener('visibilitychange',wake);win.addEventListener('online',wake);win.addEventListener('focus',wake);tick();
 return()=>{stopped=true;clearTimer(timer);doc.removeEventListener('visibilitychange',wake);win.removeEventListener('online',wake);win.removeEventListener('focus',wake);};
}

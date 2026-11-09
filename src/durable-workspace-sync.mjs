import {WorkspaceSync,mergeWorkspace,headsOf} from './workspace-sync.mjs';
import {SyncStorage} from './sync-storage.mjs';

const collections=['items','sprints','releases','notes','runs','events'];
const editable=['kind','title','description','acceptance','owner','priority','status','points','releaseId','sprintId','parentId','dueDate','startDate','endDate','aiEnabled','aiDisabled','goal','boardRank','sprintRank'];
export function projectPending(state,queue) {
  if(!state) return state;
  const patches=new Map();
  for(const entry of queue){
    if(!['item.update','item.move'].includes(entry.type))continue;
    const original=patches.get(entry.payload.id)||state.items.find(i=>i.id===entry.payload.id);
    if(!original)continue;
    const item={...original};
    for(const field of editable)if(entry.payload[field]!==undefined)item[field]=entry.payload[field];
    patches.set(item.id,item);
  }
  const next=patches.size?{...state,items:state.items.map(item=>patches.get(item.id)||item)}:state;
  return next;
}
export function guardPending(sync,event) {
  if(!sync.hasPending?.()) return;
  event.preventDefault(); event.returnValue='';
}

// Persistent writes are enabled only for the LoyoCloud gateway, whose file-action
// endpoint deduplicates requestId before checking the original headId.
export class DurableWorkspaceSync extends WorkspaceSync {
  constructor({scope,storage=new SyncStorage(scope),onStatus=()=>{},locks=globalThis.navigator?.locks,setTimer=setTimeout,clearTimer=clearTimeout,now=Date.now,refreshIntervalMs=30000,...options}) {
    super({...options,cloud:true});
    const expired=this.onExpired;this.onExpired=()=>{if(!this.hasPending())expired();};
    Object.assign(this,{scope,storage,onStatus,setTimer,clearTimer,now,refreshIntervalMs});
    this.queue=[];this.waiters=new Map();this.writing=Promise.resolve();this.confirmed=null;this.disposed=false;this.retryAttempt=0;
    this.status={phase:'loading',count:0};
    this.ready=(async()=>{
      if(locks) {
        const acquired=await new Promise((resolve,reject)=>{
          locks.request('heyso-sync:'+scope,{ifAvailable:true},async lock=>{
            if(!lock){resolve(false);return;}
            await new Promise(release=>{this.releaseLock=release;resolve(true);});
          }).catch(reject);
        });
        if(!acquired) {this.readOnly=true;this.onBusy(true);this.report('locked','另一个页面正在同步此工作空间，请在该页面编辑');return;}
      }
      try {
        const saved=await storage.read();
        if(saved){this.confirmed=saved.state;this.lastChecked=saved.checkedAt||0;this.queue=(saved.queue||[]).map(e=>e.phase==='local-error'?{...e,phase:'pending'}:e);this.publish();}
        this.report(this.queue[0]?.phase||'synced',this.queue[0]?.error||'');
      } catch(e) {this.storageFailed=true;this.report('storage-error','无法读取本地数据，请检查浏览器存储设置后重新打开');}
    })();
  }
  hasPending(){return this.queue.length>0||this.localWrites>0||!!this.persistenceError;}
  report(phase,error='') {this.status={phase,error,count:this.queue.length,localSaved:!this.localWrites&&!this.persistenceError&&!this.storageFailed};this.onStatus(this.status);}
  publish(){this.state=projectPending(this.confirmed,this.queue);if(this.state)this.onData(this.state);this.pending=this.queue.length;}
  // Serialize all local queue mutations, including cloud acknowledgements.
  transact(fn) {const task=this.writing.then(fn);this.writing=task.catch(()=>{});return task;}
  async persist(state=this.confirmed,queue=this.queue) {
    try{await this.storage.write({state,queue,checkedAt:this.lastChecked||0});this.persistenceError=false;}
    catch(e){this.persistenceError=true;throw e;}
  }
  receive(state) {
    if(this.hasPending()) throw Error('还有修改未同步，请同步完成后再切换云端数据');
    this.confirmed=state;this.epoch++;this.publish();
    this.transact(()=>this.persist()).catch(()=>{this.persistenceError=true;this.report('storage-error','本地保存失败，请勿关闭页面');});
  }
  async refresh({force=false}={}) {
    await this.ready;if(this.disposed)return;
    if(this.queue.length) {if(this.status.phase==='retrying')this.retry();else this.pump();return;}
    if(this.refreshing)return this.refreshing;
    if(!force&&this.confirmed&&this.lastChecked&&this.now()-this.lastChecked<this.refreshIntervalMs)return;
    const epoch=this.epoch;
    this.refreshing=(async()=>{
      try {
        const result=await this.request('/api/state',{storageScope:this.scope,...(this.confirmed?{heads:headsOf(this.confirmed)}:{})});
        await this.transact(async()=>{
          if(this.disposed||this.epoch!==epoch||this.queue.length)return;
          const checkedAt=this.now();
          const unchanged=this.confirmed&&result.delta&&result.revision===this.confirmed.revision&&
            !result.state.projects.length&&(!result.manifest||JSON.stringify([...result.manifest].sort((a,b)=>a.fileId.localeCompare(b.fileId)))===JSON.stringify(headsOf(this.confirmed).sort((a,b)=>a.fileId.localeCompare(b.fileId))));
          if(unchanged){this.lastChecked=checkedAt;this.onOnline(true);return;}
          const next=mergeWorkspace(this.confirmed,result);
          this.lastChecked=checkedAt;
          if(!this.readOnly&&!this.storageFailed)await this.persist(next,[]);
          this.confirmed=next;this.publish();this.onOnline(true);
        });
      } catch(e){this.onOnline(false);if(this.confirmed)this.report(this.persistenceError?'storage-error':this.status.phase,e.message);}
      finally{this.refreshing=null;}
    })();return this.refreshing;
  }
  async action(type,payload,projectId,quiet=false) {
    await this.ready;
    if(this.readOnly||this.storageFailed||this.disposed){this.onMessage(this.status.error||'无法保存，请重新打开工作空间');return null;}
    // Project creation/import have a different gateway contract; do not persist
    // replayable writes without upstream idempotency guarantees.
    const records=[...(this.confirmed?.projects||[]),...collections.flatMap(k=>this.confirmed?.[k]||[])];
    const id=payload.id||payload.itemId||payload.storyId||payload.runId,record=records.find(x=>x.id===id);
    const target=payload.projectId||record?.projectId||(this.confirmed?.projects.some(p=>p.id===id)?id:projectId);
    if(type==='project.create'||!this.confirmed?.projects.find(p=>p.id===target)?.cloud?.fileId) {
      if(this.hasBlockingPending?.()??this.hasPending()){this.onMessage('请先完成当前修改的云端同步');return null;}
      const result=await super.action(type,payload,projectId,quiet);this.confirmed=this.state;return result;
    }
    const entry={id:crypto.randomUUID(),type,payload:structuredClone(payload),projectId:target,phase:'pending',body:null,...(this.captureBaseFields?{baseFields:this.captureBaseFields(type,payload)}:{})};
    this.localWrites=(this.localWrites||0)+1;this.epoch++;this.report('saving-local');
    const immediate=['item.update','item.move'].includes(type);
    let completion;
    if(!immediate) completion=new Promise(resolve=>this.waiters.set(entry.id,resolve));
    try {
      await this.transact(async()=>{
        const queue=[...this.queue.map(e=>e.phase==='local-error'?{...e,phase:'pending'}:e),entry];await this.persist(this.confirmed,queue);this.queue=queue;this.publish();
      });
    } catch(e) {
      // Keep the failed draft in memory as well, but never label it locally saved.
      entry.phase='local-error';this.queue.push(entry);this.persistenceError=true;this.publish();
      this.report('storage-error','本地保存失败，请勿关闭页面，请重试');this.waiters.delete(entry.id);return null;
    }
    finally {
      this.localWrites--;
      if(!this.persistenceError)this.report(this.queue[0]?.phase||'synced',this.queue[0]?.error||'');
    }
    this.pump();
    return immediate?this.state.items.find(i=>i.id===payload.id):completion;
  }
  buildBody(entry) {
    const cloud=this.confirmed.projects.find(p=>p.id===entry.projectId)?.cloud;
    if(!cloud?.fileId||!cloud.headId)throw Object.assign(Error('项目已不可用，请核对云端项目'),{status:409});
    return {action:{type:entry.type,payload:entry.payload},requestId:entry.id,revision:this.confirmed.revision,projectId:entry.projectId,fileId:cloud.fileId,headId:cloud.headId,heads:headsOf(this.confirmed),storageScope:this.scope};
  }
  pump() {
    if(this.processing||this.disposed||this.retryTimer||!this.queue.length||this.readOnly||this.storageFailed)return;
    const entry=this.queue[0];if(['conflict','rejected','expired','local-error'].includes(entry.phase))return;
    this.processing=(async()=>{
      try {
        // Freeze and persist the complete request BEFORE sending. Lost responses
        // and reloads replay exactly the same request against the same head.
        await this.transact(async()=>{
          if(!entry.body)entry.body=this.buildBody(entry);await this.persist();
        });
        this.report('syncing');
        const result=await this.request('/api/action',entry.body);
        await this.transact(async()=>{
          const next=mergeWorkspace(this.confirmed,result),queue=this.queue.filter(e=>e.id!==entry.id);
          try{await this.persist(next,queue);}catch(e){this.persistenceError=true;throw e;}
          this.confirmed=next;this.queue=queue;this.epoch++;this.publish();this.onOnline(true);this.retryAttempt=0;
          this.waiters.get(entry.id)?.(result.result);this.waiters.delete(entry.id);
          this.report(queue.length?'pending':'synced');
        });
      }catch(e){
        const phase=e.status===409?'conflict':e.status===401?'expired':e.status&&e.status<500&&e.status!==429?'rejected':'retrying';
        entry.phase=phase;entry.error=e.message||'网络连接中断';
        await this.transact(()=>this.persist()).catch(()=>{this.persistenceError=true;});
        this.report(this.persistenceError?'storage-error':phase,entry.error);
        this.waiters.get(entry.id)?.(null);this.waiters.delete(entry.id);
        if(phase==='retrying'&&!this.disposed){
          const delay=Math.min(30000,1000*2**this.retryAttempt++);
          this.retryTimer=this.setTimer(()=>{this.retryTimer=null;this.pump();},delay);
        }
      } finally {this.processing=null;}
      if(this.queue.length&&this.status.phase==='pending')this.pump();
    })();
  }
  async retry() {
    await this.ready;
    if(this.disposed||this.readOnly||this.processing)return;
    const entry=this.queue[0];if(!entry)return;
    if(['conflict','rejected'].includes(entry.phase))return;
    if(this.persistenceError||entry.phase==='local-error'){
      try{await this.transact(async()=>{await this.persist();entry.phase='pending';await this.persist();});}
      catch(e){this.persistenceError=true;this.report('storage-error','本地保存失败，请勿关闭页面');return;}
    }
    if(entry.phase==='expired') {
      const session=await this.request('/api/session');
      if(!session.authenticated||session.storageScope!==this.scope){this.report('expired','请重新登录同一账号与空间');return;}
    }
    if(this.retryTimer)this.clearTimer(this.retryTimer);this.retryTimer=null;
    entry.phase='pending';this.report('pending');this.pump();
  }
  async inspect() {
    const remote=await this.request('/api/state',{storageScope:this.scope});
    this.reviewed={state:remote.state||remote,id:this.queue[0]?.id};return this.reviewed;
  }
  async resolveFirst(keepLocal) {
    const entry=this.queue[0],reviewed=this.reviewed;
    if(!entry||!reviewed||entry.id!==reviewed.id||!['conflict','rejected'].includes(entry.phase))return false;
    // Only a definitive 4xx rejection can be discarded/rebased. An uncertain
    // network result must retain its exact requestId and body for deduplication.
    await this.transact(async()=>{
      const queue=keepLocal?[{...entry,id:crypto.randomUUID(),body:null,phase:'pending',error:''},...this.queue.slice(1)]:this.queue.slice(1);
      await this.persist(reviewed.state,queue);this.confirmed=reviewed.state;this.queue=queue;this.reviewed=null;this.epoch++;this.publish();this.report(queue.length?'pending':'synced');
    });
    this.pump();return true;
  }
  dispose(){this.disposed=true;if(this.retryTimer)this.clearTimer(this.retryTimer);this.retryTimer=null;const release=this.releaseLock;Promise.allSettled([this.writing,this.processing]).then(()=>release?.());}
}

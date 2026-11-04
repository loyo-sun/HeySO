import {checkIdentifiers} from '../shared/identifiers.mjs';
const collections=['items','sprints','releases','notes','runs','events'];
export const headsOf=state=>(state?.projects||[]).filter(p=>p.cloud?.fileId).map(p=>({fileId:p.cloud.fileId,headId:p.cloud.headId}));
export function mergeWorkspace(current,response) {
  if(!response.delta)return response.state||response;
  if(!current)throw Error('请先读取工作空间');
  const updated=response.state.projects, ids=new Set(updated.map(p=>p.id));
  for(const p of updated){const existing=current.projects.find(x=>x.id===p.id);if(existing&&existing.cloud?.fileId!==p.cloud?.fileId)throw Error('云端项目存在重复业务标识，请整理副本后重试');}
  const files=response.manifest&&new Set(response.manifest.map(h=>h.fileId));
  const keep=current.projects.filter(p=>!ids.has(p.id)&&(!files||files.has(p.cloud?.fileId)));
  const kept=new Set(keep.map(p=>p.id));
  const next={...current,revision:response.revision,projects:[...keep,...updated]};
  if(new Set(next.projects.map(p=>p.id)).size!==next.projects.length)throw Error('项目标识冲突，请刷新');
  for(const key of collections)next[key]=[...current[key].filter(x=>kept.has(x.projectId)),...response.state[key]];
  checkIdentifiers(next);
  const seen=new Set();for(const record of [...next.projects,...collections.flatMap(k=>next[k])]){if(seen.has(record.id))throw Error('云端项目存在重复标识，请整理副本后重试');seen.add(record.id);}
  return next;
}

export function watchWorkspaceUpdates(sync,{document:doc=globalThis.document,window:win=globalThis.window,intervalMs=2000,setTimer=setInterval,clearTimer=clearInterval}={}) {
  const check=()=>{if(!doc.hidden)sync.refresh();};
  sync.refresh();const timer=setTimer(check,intervalMs);
  doc.addEventListener('visibilitychange',check);win.addEventListener('focus',check);win.addEventListener('online',check);
  return ()=>{clearTimer(timer);doc.removeEventListener('visibilitychange',check);win.removeEventListener('focus',check);win.removeEventListener('online',check);};
}

// A single write queue selects the latest confirmed head at dispatch time.
// Refreshes started before a write (including its retry) cannot replace its result.
export class WorkspaceSync {
  constructor({fetcher=(...args)=>fetch(...args),cloud=false,onData=()=>{},onBusy=()=>{},onMessage=()=>{},onOnline=()=>{},onExpired=()=>{}}={}) {
    Object.assign(this,{fetcher,cloud,onData,onBusy,onMessage,onOnline,onExpired});
    this.state=null;this.epoch=0;this.pending=0;this.tail=Promise.resolve();this.refreshing=null;
  }
  receive(state){this.epoch++;this.state=state;this.onData(state);}
  async request(path,body) {
    const response=await this.fetcher(path,{...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-HeySO-Client':'local-ui'},body:JSON.stringify(body)}),signal:AbortSignal.timeout(25000)});
    if(response.status===401)this.onExpired();
    const result=await response.json();
    if(!response.ok)throw Object.assign(Error(result.error||'保存失败，请重试'),{status:response.status});
    return result;
  }
  refresh() {
    if(this.pending){this.refreshQueued=true;return Promise.resolve();}
    if(this.refreshing)return this.refreshing;
    const epoch=this.epoch;
    this.refreshing=(async()=>{
      try {
        const result=await this.request('/api/state',this.cloud&&this.state?{heads:headsOf(this.state)}:undefined);
        if(this.epoch===epoch&&!this.pending){this.state=mergeWorkspace(this.state,result);this.onData(this.state);this.onOnline(true);}
      }catch(e){this.onOnline(false);}
      finally{this.refreshing=null;}
    })();
    return this.refreshing;
  }
  action(type,payload,projectId,quiet=false) {
    const requestId=crypto.randomUUID();this.pending++;this.epoch++;this.onBusy(true);this.onMessage('正在保存…');
    const run=async()=>{
      try {
        const records=[...this.state.projects,...collections.flatMap(k=>this.state[k])];
        const id=payload.id||payload.itemId||payload.storyId||payload.runId, record=records.find(x=>x.id===id);
        const target=payload.projectId||record?.projectId||(this.state.projects.some(p=>p.id===id)?id:projectId);
        const cloud=this.cloud&&this.state.projects.find(p=>p.id===target)?.cloud;
        const body={action:{type,payload},requestId,revision:this.state.revision,projectId:target,...(cloud?{fileId:cloud.fileId,headId:cloud.headId,heads:headsOf(this.state)}:{})};
        let result;
        for(let attempt=0;attempt<2;attempt++){
          try{result=await this.request('/api/action',body);break;}
          catch(e){if(attempt||e.status&&e.status<500)throw e;this.onMessage('连接中断，正在重试保存…');}
        }
        this.state=mergeWorkspace(this.state,result);this.onData(this.state);this.onOnline(true);
        if(!quiet)this.onMessage('已保存');else this.onMessage('');
        return result.result;
      }catch(e){this.refreshQueued=true;this.onMessage(e.status===409?'内容已有更新，保存未完成。请刷新后核对并重试。':e.status===401?'登录已过期，保存未完成。请重新登录。':e.message||'保存失败，请重试');return null;}
      finally{this.pending--;this.epoch++;if(!this.pending){this.onBusy(false);if(this.refreshQueued){this.refreshQueued=false;this.refresh();}}}
    };
    const result=this.tail.then(run);this.tail=result.catch(()=>{});return result;
  }
}

import {normalizeViewPatch} from '../shared/view-preferences.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const storageKey=(projectKey,view)=>'heyso:view-preferences:v1:'+encodeURIComponent(projectKey)+':'+view;
export class ViewPreferencesStore {
 constructor({storage,fetcher,delay=400,uuid}={}){
  this.storage=storage;this.fetcher=fetcher||((...args)=>fetch(...args));this.delay=delay;this.uuid=uuid||(()=>globalThis.crypto.randomUUID());
  this.records=new Map();this.responses=new Map();this.loads=new Map();this.loadedAt=new Map();this.statusVersion=0;this.statusListeners=new Set();
 }
 getStorage(){try{return this.storage===undefined?globalThis.localStorage:this.storage;}catch{return null;}}
 record(project,view,defaults={}){
  const p=typeof project==='string'?{id:project}:project||{id:''},cloud=p.cloud?.fileId?p.cloud:null;
  const projectKey=cloud?`${cloud.base||''}|${cloud.fileId}`:'local|'+p.id,key=storageKey(projectKey,view);
  let record=this.records.get(key);
  if(!record){
   let saved;try{saved=JSON.parse(this.getStorage()?.getItem(key)||'null');}catch{}
   const dirty=normalizeViewPatch(view,saved?.dirty),stored=normalizeViewPatch(view,saved?.values);
   record={key,projectKey,project:p,cloud,view,defaults:{},values:stored,dirty,revision:Number(saved?.revision)||0,listeners:new Set(),timer:null,sending:null,error:'',inflight:null};
   if(saved?.inflight?.requestId&&typeof saved.inflight.requestId==='string')record.inflight={requestId:saved.inflight.requestId,patch:normalizeViewPatch(view,saved.inflight.patch)};
   // Preserve existing personal column choices during the first upgrade.
   if(!saved&&view==='list')try{const legacy=JSON.parse(this.getStorage()?.getItem('heyso-backlog-columns:'+p.id)||'null');if(legacy){record.legacy=normalizeViewPatch(view,legacy);record.values={...record.legacy};}}catch{}
   const remote=this.responses.get(projectKey)?.views?.[view];if(remote&&Number(remote.revision)>=record.revision){record.values={...normalizeViewPatch(view,remote.values),...dirty};record.revision=Number(remote.revision);}
   this.records.set(key,record);
  }
  record.project=p;record.cloud=cloud;
  const normalized=normalizeViewPatch(view,defaults),added={};
  for(const [key,value] of Object.entries(normalized))if(!(key in record.defaults)){record.defaults[key]=value;if(!(key in record.values))added[key]=value;}
  if(Object.keys(added).length)record.values={...added,...record.values};
  return record;
 }
 subscribe(record,listener){record.listeners.add(listener);return()=>record.listeners.delete(listener);}
 subscribeStatus(listener){this.statusListeners.add(listener);return()=>this.statusListeners.delete(listener);}
 notify(record){for(const fn of record.listeners)fn();this.statusVersion++;for(const fn of this.statusListeners)fn();}
 persist(record){try{this.getStorage()?.setItem(record.key,JSON.stringify({version:1,values:record.values,dirty:record.dirty,revision:record.revision,...(record.inflight?{inflight:record.inflight}:{})}));}catch{/* Cloud persistence is still attempted when browser storage is unavailable. */}}
 update(record,update){
  const patch=normalizeViewPatch(record.view,typeof update==='function'?update(record.values):update),changed={};
  for(const [key,value] of Object.entries(patch))if(!same(record.values[key],value))changed[key]=value;
  if(!Object.keys(changed).length)return;
  record.values={...record.values,...changed};record.dirty={...record.dirty,...changed};this.persist(record);this.notify(record);
  if(record.cloud)this.schedule(record);
 }
 schedule(record){clearTimeout(record.timer);record.timer=setTimeout(()=>{record.timer=null;this.flush(record);},this.delay);}
 async request(record,body){
  const response=await this.fetcher('/api/view-preferences/'+encodeURIComponent(record.cloud.fileId),{method:body?'POST':'GET',signal:AbortSignal.timeout(15000),credentials:'same-origin',headers:{'Content-Type':'application/json',...(body?{'X-HeySO-Client':'local-ui'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  let data;try{data=await response.json();}catch{throw Error('个人视图同步服务暂不可用');}
  if(!response.ok)throw Object.assign(Error(data.error||'个人视图尚未同步'),{status:response.status});
  if(data.fileId!==record.cloud.fileId||typeof data.userId!=='string'||!data.views||typeof data.views!=='object')throw Error('个人视图同步响应无效');
  return data;
 }
 apply(record,entry){
  const revision=Number(entry?.revision)||0;
  if(revision<record.revision)return;
  const remote=normalizeViewPatch(record.view,entry?.values);
  record.revision=revision;record.values={...record.defaults,...remote,...record.dirty};record.error='';this.persist(record);this.notify(record);
 }
 async connect(record,force=false){
  if(!record.cloud)return;
  if(this.loads.has(record.projectKey))return this.loads.get(record.projectKey);
  if(!force&&Date.now()-(this.loadedAt.get(record.projectKey)||0)<1000){if(Object.keys(record.dirty).length||record.inflight)this.schedule(record);return;}
  const load=(async()=>{try{
   const response=await this.request(record);
   this.loadedAt.set(record.projectKey,Date.now());this.responses.set(record.projectKey,response);
   for(const r of this.records.values())if(r.projectKey===record.projectKey){
    if(!response.views[r.view]&&r.legacy){r.dirty={...r.legacy,...r.dirty};delete r.legacy;}
    this.apply(r,response.views[r.view]);
    if(Object.keys(r.dirty).length||r.inflight)this.schedule(r);
   }
  }catch(error){for(const r of this.records.values())if(r.projectKey===record.projectKey){r.error=error.message;this.notify(r);}}finally{this.loads.delete(record.projectKey);}})();
  this.loads.set(record.projectKey,load);return load;
 }
 async flush(record){
  if(!record.cloud||record.sending)return record.sending;
  if(!record.inflight&&!Object.keys(record.dirty).length)return;
  if(!record.inflight)record.inflight={requestId:this.uuid(),patch:structuredClone(record.dirty)};
  this.persist(record);
  const request=record.inflight;
  const sending=(async()=>{try{
   const response=await this.request(record,{view:record.view,patch:request.patch,requestId:request.requestId});
   for(const [key,value] of Object.entries(request.patch))if(same(record.dirty[key],value))delete record.dirty[key];
   record.inflight=null;const prior=this.responses.get(record.projectKey);this.responses.set(record.projectKey,{...response,views:{...prior?.views,...response.views}});this.apply(record,response.views[record.view]);
  }catch(error){record.error=error.message;this.persist(record);this.notify(record);}finally{record.sending=null;if(!record.error&&Object.keys(record.dirty).length)this.schedule(record);}})();
  record.sending=sending;return sending;
 }
 projectError(projectKey){return [...this.records.values()].find(r=>r.projectKey===projectKey&&r.error)?.error||'';}
 async retryProject(projectKey){for(const r of this.records.values())if(r.projectKey===projectKey){await this.connect(r,true);await this.flush(r);}}
 dispose(){for(const r of this.records.values())clearTimeout(r.timer);}
}

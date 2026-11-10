// One atomic record contains the confirmed snapshot and its ordered outbox.
export class SyncStorage {
  constructor(scope, indexedDB = globalThis.indexedDB) { this.scope=scope; this.indexedDB=indexedDB; }
  async open() {
    if(!this.indexedDB) throw Error('浏览器不支持本地保存');
    if(!this.db) this.db=new Promise((resolve,reject)=>{
      const request=this.indexedDB.open('heyso-sync-v1',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('workspaces');
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
      request.onblocked=()=>reject(Error('本地数据库被其他页面占用'));
    });
    return this.db;
  }
  async read() {
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('workspaces','readonly'),request=tx.objectStore('workspaces').get(this.scope);
      tx.oncomplete=()=>resolve(request.result);
      tx.onabort=()=>reject(tx.error||Error('本地读取失败'));
      tx.onerror=()=>reject(tx.error);
    });
  }
  async write(value) {
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('workspaces','readwrite');
      tx.objectStore('workspaces').put(value,this.scope);
      tx.oncomplete=()=>resolve();
      tx.onabort=()=>reject(tx.error||Error('本地写入失败'));
      tx.onerror=()=>reject(tx.error);
    });
  }
  async keys() {
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('workspaces','readonly'),request=tx.objectStore('workspaces').getAllKeys();
      tx.oncomplete=()=>resolve(request.result);
      tx.onabort=()=>reject(tx.error||Error('本地读取失败'));
      tx.onerror=()=>reject(tx.error);
    });
  }
  // Transfer an abandoned outbox atomically: a crash cannot leave half a move.
  async adopt(scope) {
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('workspaces','readwrite'),store=tx.objectStore('workspaces');
      const target=store.get(this.scope),source=store.get(scope);
      source.onsuccess=()=>{
        const from=source.result,to=target.result;
        if(!from)return;
        const unique=entries=>[...new Map(entries.map(entry=>[entry.id,entry])).values()];
        store.put({...from,...to,state:to?.state||from.state,checkedAt:0,
          queue:unique([...(to?.queue||[]),...(from.queue||[])]),
          failed:unique([...(to?.failed||[]),...(from.failed||[])])},this.scope);
        store.delete(scope);
      };
      tx.oncomplete=()=>resolve();
      tx.onabort=()=>reject(tx.error||Error('本地草稿恢复失败'));
      tx.onerror=()=>reject(tx.error);
    });
  }
}

// Each live page owns an independent durable outbox. A lease protects only that
// outbox from recovery, never the workspace or another page's ability to edit.
export class TabSyncStorage {
  constructor(scope,{locks=globalThis.navigator?.locks,indexedDB=globalThis.indexedDB,id=crypto.randomUUID(),storage}={}) {
    this.workspaceScope=scope;this.scope=scope+':tab:'+id;this.locks=locks;
    this.storage=storage||new SyncStorage(this.scope,indexedDB);
    this.ready=this.initialize();
  }
  async initialize() {
    if(!this.locks)throw Error('浏览器不支持安全的多页面草稿恢复，请更新浏览器');
    await new Promise((resolve,reject)=>{
      this.lease=this.locks.request('heyso-sync:'+this.scope,async()=>{
        if(this.disposed){resolve();return;}
        await new Promise(release=>{this.release=release;resolve();});
      });
      this.lease.catch(reject);
    });
    if(this.disposed)return;
    for(const scope of await this.storage.keys()) {
      if(scope===this.scope||typeof scope!=='string'||
        (scope!==this.workspaceScope&&!scope.startsWith(this.workspaceScope+':tab:')))continue;
      // The legacy workspace lease also prevents importing an old page's queue
      // while that page is still sending it. Closed pages release leases in Chrome.
      await this.locks.request('heyso-sync:'+scope,{ifAvailable:true},async lock=>{
        if(lock&&!this.disposed)await this.storage.adopt(scope);
      });
    }
  }
  async read(){await this.ready;return this.storage.read();}
  async write(value){await this.ready;return this.storage.write(value);}
  dispose(){this.disposed=true;this.release?.();}
}


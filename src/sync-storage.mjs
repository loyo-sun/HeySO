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
}

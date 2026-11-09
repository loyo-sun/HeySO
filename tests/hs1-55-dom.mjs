import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {seed,act,validate} from '../server/model.mjs';
import {migrateState} from '../server/migrate.mjs';
if(!process.env.HEYSO_JSDOM_MODULE)throw Error('Set HEYSO_JSDOM_MODULE to the jsdom ESM entry before running the optional DOM test');
const {JSDOM,VirtualConsole}=await import(process.env.HEYSO_JSDOM_MODULE);
const root=fileURLToPath(new URL('..',import.meta.url));
// Exercise production components and queue together; only browser storage and
// network boundaries are replaced. IndexedDB itself still needs browser QA.
const built=await build({entryPoints:[root+'/src/main.jsx'],jsx:'automatic',bundle:true,write:false,format:'iife',loader:{'.css':'empty','.svg':'dataurl'},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'test-storage-boundary',setup(b){b.onLoad({filter:/sync-storage\.mjs$/},()=>({contents:'export class SyncStorage {async read(){return structuredClone(window.testStorage)} async write(v){window.testStorage=structuredClone(v)}}',loader:'js'}));}}]});
let server=migrateState(seed());for(const p of server.projects)p.cloud={fileId:'test-file',headId:'test-head',base:'https://test.invalid',account:'test'};
const editable=server.items.find(i=>i.kind==='story'&&i.status!=='done');assert.ok(editable);
let mode='slow',pending=[],writes=0;
const vc=new VirtualConsole();vc.on('error',(...args)=>console.error(...args));vc.on('jsdomError',e=>{if(!e.message.includes('CSS'))console.error(e.message)});
const storage={value:null};
async function page(){
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost:4195/?tab=projects&project='+editable.projectId+'&view=roadmap&item='+editable.id,pretendToBeVisual:true,runScripts:'dangerously',virtualConsole:vc});
 const w=dom.window;w.testStorage=storage.value;w.structuredClone=structuredClone;w.MessageChannel=MessageChannel;w.AbortSignal=AbortSignal;w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};w.scrollTo=()=>{};w.Element.prototype.scrollIntoView=()=>{};w.CSS={escape:v=>v};
 w.fetch=async(path,init={})=>{
  if(path==='/api/session')return Response.json({hosted:true,authenticated:true,provider:'loyocloud',storageScope:'test-scope'});
  if(path==='/api/live/updates')return new Promise(()=>{});
  if(path==='/api/state'||path==='/api/live/state')return Response.json(server);
  if(path.startsWith('/api/view-preferences'))return Response.json({views:{}});
  if(path==='/api/action'||path==='/api/live/action'){
   if(mode==='slow')return new Promise(resolve=>pending.push({resolve,input:JSON.parse(init.body)}));
   if(mode==='fail')return Response.json({error:'测试云端错误'},{status:503});
   const next=structuredClone(server),result=act(next,JSON.parse(init.body).action);validate(next);next.revision++;server=next;writes++;return Response.json({state:server,result});
  }
  return Response.json({});
 };
 w.eval(built.outputFiles[0].text);return dom;
}
const wait=()=>new Promise(r=>setTimeout(r,140));
let dom=await page(),w=dom.window;await wait();await wait();await wait();
let input=w.document.querySelector('[aria-label="工作项标题"]');if(!input)console.error(w.document.body.textContent.slice(0,2500));assert.ok(input,'work item drawer opens');input.focus();Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype,'value').set.call(input,'HS55 本地待同步');input.dispatchEvent(new w.Event('input',{bubbles:true}));await wait();input.blur();await wait();
assert.equal(w.document.querySelector('.cloud-sync-notice'),null);assert.equal(w.testStorage.queue.length,1);assert.equal(input.disabled,false);
console.log('PASS immediate local save and editable UI during a slow cloud request');
pending.shift().resolve(Response.json({error:'测试云端错误'},{status:503}));await wait();
assert.equal(w.document.querySelector('.cloud-sync-notice'),null);
const unload=new w.Event('beforeunload',{cancelable:true});w.dispatchEvent(unload);assert.equal(unload.defaultPrevented,true);
const close=w.document.querySelector('.drawer-scrim');assert.ok(close);close.click();await wait();
assert.ok(!w.document.body.textContent.includes('修改尚未同步到云端'));
assert.equal(w.document.querySelector('.drawer-scrim'),null);
assert.ok(w.testStorage.queue.length);storage.value=structuredClone(w.testStorage);dom.window.close();
console.log('PASS editing has no sync banner, drawer closes without warning, and page exit is guarded');
mode='ok';pending=[];dom=await page();w=dom.window;await wait();await wait();await wait();await wait();assert.equal(w.document.querySelector('[aria-label="工作项标题"]').value,'HS55 本地待同步');assert.equal(w.document.querySelector('.cloud-sync-notice'),null);const syncedExit=new w.Event('beforeunload',{cancelable:true});w.dispatchEvent(syncedExit);assert.equal(syncedExit.defaultPrevented,false);assert.equal(w.testStorage.queue.length,0);assert.equal(writes,1);
console.log('PASS reload restores pending draft and finishes cloud synchronization');dom.window.close();process.exit(0);

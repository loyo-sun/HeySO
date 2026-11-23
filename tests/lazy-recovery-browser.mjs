// Production browser regression; only the failing chunk response is injected.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {build} from 'esbuild';
const {chromium}=await import(process.env.HEYSO_PLAYWRIGHT_MODULE);
const base=process.env.HEYSO_TEST_URL||'http://127.0.0.1:4194';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Use an isolated local server');
const captures=process.env.HEYSO_SCREENSHOT_DIR||'/tmp/heyso-lazy-recovery';
await mkdir(captures,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.HEYSO_CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
 const missing=await fetch(base+'/assets/no-such-release.js');assert.equal(missing.status,404);assert.ok(!(await missing.text()).includes('id="root"'));
 const link=await fetch(base+'/?project=p_heyso&view=list');assert.equal(link.status,200);assert.match(link.headers.get('cache-control'),/no-cache|no-store/);
 for(const failure of ['html','offline']) {
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.setDefaultTimeout(12000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));let intercepted=0;
  await page.route('**/assets/MarkdownView-*.js',route=>{intercepted++;return failure==='html'?route.fulfill({contentType:'text/html',body:'<!doctype html><p>Old deployment SPA fallback</p>'}):route.abort('internetdisconnected');});
  const url=base+'/?tab=projects&project=p_heyso&view=ai&item=s3&detail=runs';
  await page.goto(url);const alert=page.getByRole('alert',{name:'内容预览加载失败'}).first();await alert.waitFor();assert.ok(intercepted);
  await page.getByLabel('切换项目',{exact:true}).waitFor();
  assert.ok((await page.locator('body').innerText()).includes('已实现成果提交与待验收状态流转。'),'plain text remains readable');
  assert.equal(page.url(),url);assert.equal(errors.length,0,'error is contained instead of crashing the root');
  // A failed preview must not remove drafts in a sibling editor.
  const title=page.getByLabel('工作项标题',{exact:true});await title.fill('网络故障期间保留的草稿');
  assert.equal(await title.inputValue(),'网络故障期间保留的草稿');
  await page.screenshot({path:captures+'/'+failure+'-desktop.png'});
  // Retrying a permanently failed ESM URL may remain cached by the browser.
  // It still must not reload the page or bypass the explicit refresh warning.
  await alert.getByRole('button',{name:'重试加载'}).click();await alert.waitFor();assert.equal(page.url(),url);
  let warned=false;page.once('dialog',async d=>{warned=true;assert.match(d.message(),/尚未保存/);await d.dismiss();});
  await alert.getByRole('button',{name:'刷新页面'}).click();assert.equal(warned,true);assert.equal(page.url(),url);
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:captures+'/'+failure+'-mobile.png'});
  assert.ok(await alert.isVisible());
  await page.unroute('**/assets/MarkdownView-*.js');
  page.once('dialog',d=>d.accept());await alert.getByRole('button',{name:'刷新页面'}).click();
  await page.locator('.markdown-content').first().waitFor();assert.equal(page.url(),url);
  assert.equal(await page.getByRole('alert',{name:'内容预览加载失败'}).count(),0);
  await context.close();console.log('PASS '+failure+': local fallback, readable content, sibling draft, retry, refresh confirmation, mobile and reload recovery');
 }
 for(const [chunk,query,label] of [['Roadmap','view=roadmap','路线图'],['Reports','view=reports','报告'],['InlineTextEditor','view=list&item=s1','文本编辑器']]) {
  const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(12000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/assets/'+chunk+'-*.js',r=>r.fulfill({status:404,contentType:'text/plain',body:'Asset not found'}));
  await page.goto(base+'/?tab=projects&project=p_heyso&'+query);
  await page.getByRole('alert',{name:label+'加载失败'}).first().waitFor();await page.getByLabel('切换项目',{exact:true}).waitFor();
  assert.equal(errors.length,0);await context.close();console.log('PASS '+chunk+' missing chunk stays local');
 }
 // A fresh React.lazy instance retries transient loader rejection successfully.
 // Exercise the real boundary with a deterministic loader, not a cached ESM URL.
 const fixture=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{recoverableLazy}from'./src/recoverableLazy.jsx';let attempts=0;const View=recoverableLazy(()=>++attempts===1?Promise.reject(Error('offline')):Promise.resolve({default:()=> <p>恢复成功</p>}), '测试');createRoot(document.getElementById('root')).render(<><input aria-label="外围草稿"/><React.Suspense fallback="loading"><View/></React.Suspense></>);`,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"production"'}});
 const page=await browser.newPage();await page.route('**/recovery-fixture',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div><script>'+fixture.outputFiles[0].text+'</script>'}));
 await page.goto(base+'/recovery-fixture');await page.getByRole('alert').waitFor();await page.getByLabel('外围草稿').fill('不丢失');
 await page.getByRole('button',{name:'重试加载'}).focus();await page.keyboard.press('Enter');await page.getByText('恢复成功',{exact:true}).waitFor();assert.equal(await page.getByLabel('外围草稿').inputValue(),'不丢失');
 console.log('PASS successful transient retry via keyboard preserves sibling state; missing assets 404 and deep links 200');
} finally {await browser.close();}

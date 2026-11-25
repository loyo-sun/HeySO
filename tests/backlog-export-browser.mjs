import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {seed} from '../server/model.mjs';
import {migrateState} from '../server/migrate.mjs';
const base=process.env.HEYSO_TEST_URL||'http://127.0.0.1:4200';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Use an isolated local server');
const {chromium}=await import(process.env.HEYSO_PLAYWRIGHT_MODULE);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(12000);
const data=migrateState(seed()),project=data.projects[0],template=data.items.find(i=>i.kind==='story');
project.code='HS1';data.items=Array.from({length:105},(_,i)=>({...template,id:'export-'+(i+1),number:i+1,title:(i>=60?'目标工作 ':'其他工作 ')+String(i+1).padStart(3,'0'),owner:i>=60?'陈默':'我',points:i+1,parentId:null,sprintId:null,releaseId:null,status:'todo'}));
const captures=process.env.HEYSO_SCREENSHOT_DIR||'/tmp/heyso-export-check';await fs.mkdir(captures,{recursive:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/state',r=>r.fulfill({json:data}));
const download=async()=>{
 const event=page.waitForEvent('download');await page.getByRole('button',{name:'导出清单',exact:true}).click();const file=await event;assert.equal(file.suggestedFilename(),'HS1-清单.csv');return fs.readFile(await file.path(),'utf8');
};
try{
 await page.goto(base+'/?project='+project.id+'&view=roadmap');await page.getByLabel('产品路线图',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'导出',exact:true}).count(),0);
 await page.goto(base+'/?project='+project.id+'&view=list');const rows=page.locator('.story-row[data-work-item-id]');await rows.first().waitFor();assert.equal(await rows.count(),30);
 const all=await download();assert.equal(all.split('\r\n').length,106,'export includes all 105 matching rows without loading more');
 await page.getByLabel('配置列',{exact:true}).click();const picker=page.getByRole('group',{name:'待办池列配置',exact:true});
 await picker.getByRole('checkbox',{name:'状态',exact:true}).uncheck();await picker.getByRole('checkbox',{name:'优先级',exact:true}).uncheck();await picker.getByRole('checkbox',{name:'类型',exact:true}).check();
 await picker.getByRole('button',{name:'移动类型列',exact:true}).focus();await page.keyboard.press('ArrowUp');await page.getByLabel('配置列',{exact:true}).click();
 assert.equal(await page.locator('th[data-column="workItem"]').getAttribute('aria-sort'),'ascending');await page.getByRole('button',{name:'按工作项排序',exact:true}).click();
 await page.getByLabel('搜索清单工作项').fill('目标工作');await page.getByRole('button',{name:'负责人筛选',exact:true}).click();const filter=page.getByRole('dialog',{name:'负责人筛选',exact:true});await filter.getByRole('checkbox',{name:'陈默',exact:true}).check();await filter.getByRole('button',{name:'应用筛选',exact:true}).click();
 assert.equal(await rows.count(),30);assert.equal(await rows.first().getAttribute('data-work-item-id'),'export-105');
 const csv=await download(),lines=csv.replace(/^\ufeff/,'').split('\r\n');assert.equal(lines.length,46);assert.equal(lines[0],'"工作项","负责人","类型","故事点"');assert.match(lines[1],/^"HS1-105 目标工作 105","陈默",/);assert.match(lines.at(-1),/^"HS1-61 目标工作 061","陈默",/);assert.ok(!csv.includes('其他工作'));
 assert.deepEqual(await page.locator('th[data-column]').evaluateAll(es=>es.map(e=>e.dataset.column)),['workItem','owner','kind','points']);
 await page.waitForTimeout(250);await page.screenshot({path:captures+'/desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:captures+'/mobile.png'});const searchBox=await page.locator('.backlog-search').boundingBox(),actionsBox=await page.locator('.backlog-list-actions').boundingBox();assert.ok(searchBox.width>=120);assert.ok(actionsBox.y>=searchBox.y+searchBox.height);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await download(),csv,'mobile exports the same full result');
 await page.getByLabel('搜索清单工作项').fill('无匹配结果');assert.equal(await page.getByRole('button',{name:'导出清单',exact:true}).isDisabled(),true);
 assert.deepEqual(errors,[]);console.log('PASS roadmap export removed; real CSV downloads include 105/45 full filtered rows, visible/reordered columns and current sort; mobile and empty state');
}finally{await browser.close();}

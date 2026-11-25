// Production UI regression for the public shell and shared search control.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {seed} from '../server/model.mjs';
import {migrateState} from '../server/migrate.mjs';
const base=process.env.HEYSO_TEST_URL||'http://127.0.0.1:4196';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Use an isolated local server');
const {chromium}=await import(process.env.HEYSO_PLAYWRIGHT_MODULE);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const dir=process.env.HEYSO_SCREENSHOT_DIR||'/tmp/heyso-header-search';await fs.mkdir(dir,{recursive:true});
const data=migrateState(seed());data.projects.push({...structuredClone(data.projects[0]),id:'second',name:'第二个项目',code:'TWO'});
const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(12000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/state',r=>r.fulfill({json:data}));
const shot=async name=>{await page.waitForTimeout(350);await page.screenshot({path:dir+'/'+name+'.png'});};
const style=async label=>{
 const input=page.getByLabel(label,{exact:true});await input.waitFor();
 return input.evaluate(el=>{const parent=el.closest('.heyso-search-field'),s=getComputedStyle(parent),i=getComputedStyle(el);return {height:Math.round(parent.getBoundingClientRect().height),border:s.border,borderRadius:s.borderRadius,background:s.backgroundColor,font:i.fontSize,padding:i.padding,inputBorder:i.borderWidth,icons:parent.querySelectorAll(':scope>svg').length};});
};
try{
 await page.goto(base+'/?project=p_heyso&view=list');const list=await style('搜索清单工作项');assert.equal(list.height,34);assert.equal(list.icons,1);assert.equal(list.inputBorder,'0px');
 const header=page.locator('[data-heyso-component="ShellHeader"]');
 assert.equal(await header.getByRole('button',{name:'复制当前页面链接'}).count(),0);assert.equal(await header.getByRole('button',{name:'搜索工作项',exact:true}).count(),0);
 assert.equal(await header.locator('[data-heyso-component="ProjectSelector"]').count(),1);assert.equal(await header.locator('.project-switcher svg,.project-switcher small').count(),0);assert.equal(await header.locator('.project-switcher .select-value').innerText(),'HeySO 产品研发');assert.equal(await page.locator('.sidebar [data-heyso-component="ProjectSelector"]').count(),0);
 await page.getByLabel('切换项目',{exact:true}).click();assert.equal(await page.locator('.ant-select-dropdown:visible .select-option-label small').count(),0);await page.getByLabel('搜索项目',{exact:true}).fill('第二');await page.locator('.ant-select-dropdown:visible').getByText('第二个项目',{exact:true}).click();
 await page.waitForURL(/project=second/);await page.goBack();await page.waitForURL(/project=p_heyso/);
 await page.getByLabel('搜索清单工作项').fill('没有这样的工作项');await page.locator('.backlog-empty').waitFor();
 const clear=page.getByRole('button',{name:'清除清单搜索'});const [fieldBox,clearBox]=await Promise.all([page.locator('.backlog-search').boundingBox(),clear.boundingBox()]);assert.ok(clearBox.x>=fieldBox.x&&clearBox.x+clearBox.width<=fieldBox.x+fieldBox.width);
 await clear.focus();await page.keyboard.press('Enter');assert.equal(await page.getByLabel('搜索清单工作项').inputValue(),'');assert.equal(await page.getByLabel('搜索清单工作项').evaluate(el=>el===document.activeElement),true);
 await page.getByRole('button',{name:'负责人筛选',exact:true}).click();const filter=page.getByRole('dialog',{name:'负责人筛选',exact:true});await filter.getByRole('checkbox',{name:'陈默',exact:true}).check();await filter.getByRole('button',{name:'应用筛选'}).click();
 await page.getByLabel('搜索清单工作项').fill('HS');await page.getByRole('button',{name:'清空筛选',exact:true}).click();assert.equal(await page.getByLabel('搜索清单工作项').inputValue(),'HS');assert.equal(await page.getByRole('button',{name:'清空筛选',exact:true}).count(),0);
 await shot('list-desktop');
 // Search geometry and typography are shared, not independently imitated.
 for(const [view,label] of [['backlog','搜索冲刺工作项'],['releases','搜索版本'],['reports','搜索报告'],['settings&section=states','搜索工作流']]){
  await page.goto(base+'/?project=p_heyso&view='+view);assert.deepEqual(await style(label),list);await shot(view.startsWith('backlog')?'sprint-desktop':view.split('&')[0]+'-desktop');
 }
 await page.goto(base+'/?tab=dashboard');assert.deepEqual(await style('搜索所有项目待办'),list);
 await page.getByRole('button',{name:'帮助中心',exact:true}).click();assert.deepEqual(await style('搜索帮助文档'),list);await page.getByRole('button',{name:'返回工作台',exact:true}).click();
 await page.goto(base+'/?project=p_heyso&view=settings&section=general');await page.locator('[name="name"]').fill('未保存的设置');
 await page.getByLabel('切换项目',{exact:true}).click();await page.locator('.ant-select-dropdown:visible').getByText('第二个项目',{exact:true}).click();await page.getByRole('heading',{name:'设置尚未保存',exact:true}).waitFor();await page.getByRole('button',{name:'继续编辑',exact:true}).click();assert.equal(await page.locator('[name="name"]').inputValue(),'未保存的设置');
 await page.goto(base+'/examples/host-shell/');await page.getByRole('button',{name:'进入研发'}).waitFor();
 const brand=await page.locator('[data-heyso-slot="header.brand"]').boundingBox(),selector=await page.locator('[data-heyso-component="ProjectSelector"]').boundingBox(),menu=await page.locator('[data-heyso-slot="header.navigation"]').boundingBox();assert.ok(selector.x>=brand.x+brand.width);assert.ok(menu.x>=selector.x+selector.width);
 await page.getByRole('button',{name:'项目工具',exact:true}).waitFor();await shot('host-desktop');
 await page.setViewportSize({width:390,height:844});await shot('host-mobile');
 assert.ok(await page.getByLabel('切换项目',{exact:true}).isVisible());
 const actionBox=await page.getByRole('button',{name:'项目工具',exact:true}).boundingBox(),headerBox=await header.boundingBox();assert.ok(actionBox.y>=headerBox.y&&actionBox.y+actionBox.height<=headerBox.y+headerBox.height,'selector actions stay inside the mobile header');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'host shell must fit mobile viewport');
 await page.goto(base+'/?project=p_heyso&view=list');await page.getByLabel('搜索清单工作项').fill('HS');await shot('list-mobile');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.getByRole('button',{name:'清除清单搜索'}).click();await page.getByLabel('切换项目',{exact:true}).click();assert.equal(await page.locator('.ant-select-dropdown:visible .select-option-label small').count(),0);await page.getByLabel('搜索项目',{exact:true}).fill('第二');await page.locator('.ant-select-dropdown:visible').getByText('第二个项目',{exact:true}).click();await page.waitForURL(/project=second/);
 assert.deepEqual(errors,[]);console.log('PASS header removal/order, project switching/history/dirty guard, shared search styles, filtering/clear isolation, keyboard, host slots and mobile');
 await fs.writeFile(dir+'/computed-search.json',JSON.stringify(list,null,2));
}finally{await browser.close();}

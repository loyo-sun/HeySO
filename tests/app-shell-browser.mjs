// Run against the production build and an isolated local server.
// HEYSO_PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs HEYSO_TEST_URL=http://127.0.0.1:4192 node tests/app-shell-browser.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {seed} from '../server/model.mjs';
import {migrateState} from '../server/migrate.mjs';
const {chromium}=await import(process.env.HEYSO_PLAYWRIGHT_MODULE);
const browser=await chromium.launch({executablePath:process.env.HEYSO_CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const base=process.env.HEYSO_TEST_URL||'http://127.0.0.1:4192';
const captures=process.env.HEYSO_SCREENSHOT_DIR||'/tmp/heyso-shell-captures';await fs.mkdir(captures,{recursive:true});
const data=migrateState(seed());data.projects.push({...structuredClone(data.projects[0]),id:'p_second',name:'第二示例项目',code:'TWO'});
const errors=[];const page=await browser.newPage({viewport:{width:1440,height:1000}});
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/state',route=>route.fulfill({json:data}));
const waitParam=(key,value)=>page.waitForFunction(([k,v])=>new URL(location.href).searchParams.get(k)===v,[key,value]);
const shot=async name=>{await page.waitForTimeout(250);await page.screenshot({path:captures+'/'+name+'.png',fullPage:!name.includes('popup')});};
try {
 await page.goto(base+'/');await page.getByLabel('切换项目',{exact:true}).waitFor();
 assert.equal(new URL(page.url()).searchParams.get('tab'),'projects');
 assert.equal(await page.locator('header').first().getByRole('button',{name:'仪表盘',exact:true}).count(),0);
 assert.equal(await page.locator('header').first().getByRole('button',{name:'项目',exact:true}).count(),0);
 assert.equal(await page.locator('[data-heyso-slot="header.navigation"]').evaluate(el=>el.getBoundingClientRect().width),0);
 await shot('standalone-desktop');
 await page.getByLabel('切换项目',{exact:true}).click();await page.locator('.ant-select-dropdown:visible').getByText('第二示例项目',{exact:true}).click();await waitParam('project','p_second');
 await page.goBack();await waitParam('project','p_heyso');await page.goForward();await waitParam('project','p_second');
 // Explicit old links and direct item links remain supported.
 await page.goto(base+'/?tab=dashboard');await page.locator('.dashboard-content').waitFor();
 await page.getByRole('button',{name:'进入项目',exact:true}).click();await page.getByLabel('切换项目',{exact:true}).waitFor();
 await page.goto(base+'/?project=p_heyso&view=list&item=s1');await page.getByLabel('工作项标题',{exact:true}).waitFor();
 assert.ok(await page.getByLabel('工作项标题',{exact:true}).inputValue());await page.keyboard.press('Escape');await page.locator('.drawer').waitFor({state:'hidden'});
 await page.goBack();await page.locator('.drawer').waitFor();await page.goForward();await page.locator('.drawer').waitFor({state:'hidden'});
 // Built-in unsaved settings cannot be bypassed by any public-shell navigation action.
 await page.goto(base+'/?project=p_heyso&view=settings&section=general');
 await page.locator('[name="name"]').fill('不能丢失的项目名称');await page.getByRole('button',{name:'HeySO 项目首页',exact:true}).click();
 await page.getByRole('heading',{name:'设置尚未保存',exact:true}).waitFor();
 await page.getByRole('button',{name:'继续编辑',exact:true}).click();assert.equal(await page.locator('[name="name"]').inputValue(),'不能丢失的项目名称');
 await page.getByRole('button',{name:'HeySO 项目首页',exact:true}).click();await page.getByRole('button',{name:'放弃并离开',exact:true}).click();await waitParam('view','roadmap');
 console.log('PASS standalone, no hardcoded top menus, project switching, deep links, browser back/forward and built-in dirty guard');

 await page.goto(base+'/examples/host-shell/');await page.getByRole('button',{name:'进入研发',exact:true}).waitFor();
 assert.deepEqual(await page.locator('.heyso-shell-menu button').allTextContents(),['协作台','项目空间']);
 assert.equal(await page.getByRole('button',{name:'项目空间',exact:true}).getAttribute('aria-current'),'page');
 assert.equal(await page.locator('.demo-brand img').evaluate(el=>el.complete&&el.naturalWidth>0),true);
 // Host-wide button styling stays outside, while core and Ant tokens use the registered theme.
 assert.equal(await page.locator('#host-outside button').evaluate(el=>getComputedStyle(el).color),'rgb(102, 47, 145)');
 assert.notEqual(await page.getByRole('button',{name:'新建工作项',exact:true}).evaluate(el=>getComputedStyle(el).color),'rgb(102, 47, 145)');
 await shot('host-desktop');
 await page.getByRole('button',{name:'项目工具',exact:true}).click();await page.getByRole('textbox',{name:'演示备注',exact:true}).fill('保留这个草稿');
 await page.getByRole('button',{name:'进入研发',exact:true}).click();await page.getByRole('heading',{name:'设置尚未保存',exact:true}).waitFor();
 await page.getByRole('button',{name:'继续编辑',exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'演示备注',exact:true}).inputValue(),'保留这个草稿');
 await page.getByRole('button',{name:'返回演示协作台',exact:true}).click();await page.getByRole('heading',{name:'设置尚未保存',exact:true}).waitFor();await page.getByRole('button',{name:'继续编辑',exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'演示备注',exact:true}).inputValue(),'保留这个草稿');
 // A second settings page, the host brand, and browser history all share the guard.
 await page.getByRole('menuitem',{name:'宿主说明',exact:true}).click();await page.getByRole('heading',{name:'设置尚未保存',exact:true}).waitFor();await page.getByRole('button',{name:'放弃并离开',exact:true}).click();await waitParam('section','about');
 assert.ok((await page.locator('[data-heyso-component="HostSettingsPage"]').innerText()).includes('这是替换后的公开示例页'));
 await page.goBack();await waitParam('section','demo-notes');await page.getByRole('textbox',{name:'演示备注',exact:true}).fill('历史导航草稿');
 await page.goBack();await page.getByRole('heading',{name:'设置尚未保存',exact:true}).waitFor();await page.getByRole('button',{name:'继续编辑',exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'演示备注',exact:true}).inputValue(),'历史导航草稿');
 await page.getByRole('button',{name:'示例工作台首页',exact:true}).click();await page.getByRole('button',{name:'放弃并离开',exact:true}).click();await waitParam('view','roadmap');
 await page.getByRole('button',{name:'项目工具',exact:true}).click();await page.getByRole('textbox',{name:'演示备注',exact:true}).fill('宿主回调草稿');await page.getByRole('button',{name:'返回演示协作台',exact:true}).click();await page.getByRole('button',{name:'放弃并离开',exact:true}).click();await waitParam('tab','dashboard');await page.getByRole('button',{name:'示例工作台首页',exact:true}).click();await waitParam('view','roadmap');
 await page.getByRole('button',{name:'项目设置',exact:true}).click();await page.getByRole('button',{name:'项目说明',exact:true}).waitFor();
 await shot('project-title-actions');
 await page.getByRole('button',{name:'演示账号',exact:true}).click();await page.getByRole('dialog',{name:'虚构账号面板',exact:true}).waitFor();
 await page.getByLabel('演示偏好',{exact:true}).click();await page.locator('.ant-select-dropdown:visible').getByText('跟随系统',{exact:true}).click();
 assert.equal(await page.locator('.ant-select-dropdown').last().evaluate(el=>!!el.closest('[data-heyso-component="OverlayRoot"]')),true);
 await page.getByLabel('演示偏好',{exact:true}).click();await shot('nested-popup');await page.keyboard.press('Escape');await page.getByRole('dialog',{name:'虚构账号面板',exact:true}).getByRole('button',{name:'取消',exact:true}).click();await page.getByRole('dialog',{name:'虚构账号面板',exact:true}).waitFor({state:'hidden'});
 await page.getByRole('button',{name:'协作台',exact:true}).focus();await page.keyboard.press('ArrowRight');assert.equal(await page.getByRole('button',{name:'项目空间',exact:true}).evaluate(el=>el===document.activeElement),true);
 console.log('PASS host brand/menu/entry/selector/title/right slots, settings replacement, shared guard, theme and nested popup');

 await page.goto(base+'/examples/host-shell/?demoReadOnly=1&view=settings&section=demo-notes');await page.getByRole('textbox',{name:'演示备注',exact:true}).waitFor();assert.equal(await page.getByRole('textbox',{name:'演示备注',exact:true}).getAttribute('readonly'),'');
 assert.equal(await page.getByRole('button',{name:'清除演示草稿',exact:true}).isDisabled(),true);
 await page.setViewportSize({width:390,height:844});await shot('host-mobile');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.getByRole('button',{name:'演示账号',exact:true}).click();await page.getByRole('dialog',{name:'虚构账号面板',exact:true}).waitFor();await shot('host-mobile-popup');await page.keyboard.press('Escape');
 await page.goto(base+'/?project=p_heyso&view=list');await page.locator('.backlog-table-scroll').waitFor();await shot('standalone-mobile');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 // A workspace with no projects still offers creation with the host shell present.
 await page.route('**/api/state',route=>route.fulfill({json:{...data,projects:[],items:[],sprints:[],releases:[],notes:[],runs:[]}}));
 await page.goto(base+'/');await page.getByRole('button',{name:'创建项目',exact:true}).waitFor();await page.getByRole('button',{name:'创建项目',exact:true}).click();await page.locator('[name="name"]').waitFor();
 assert.deepEqual(errors,[]);console.log('PASS read-only UI hints, keyboard, 390px layout, mobile popup and empty workspace create path; no runtime errors');
} finally {await browser.close();}

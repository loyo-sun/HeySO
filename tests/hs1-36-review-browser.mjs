// Requires an isolated local server and HEYSO_PLAYWRIGHT_MODULE, as in hs1-36-browser.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {chromium}=await import(process.env.HEYSO_PLAYWRIGHT_MODULE);
const browser=await chromium.launch({executablePath:process.env.HEYSO_CHROMIUM || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:740}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const base=process.env.HEYSO_TEST_URL || 'http://127.0.0.1:4188';
const captures=process.env.HEYSO_SCREENSHOT_DIR;
if(captures)await fs.mkdir(captures,{recursive:true});
const capture=async name=>{if(captures){await page.waitForTimeout(250);await page.screenshot({path:captures+'/'+name+'.png',fullPage:true});}};
try {
  const data=await (await page.request.get(base+'/api/state')).json();
  const active=data.sprints.filter(s=>s.status==='active');
  await page.goto(base+'/?tab=dashboard');
  await page.locator('.dashboard-todo').first().waitFor();
  await page.waitForTimeout(250); // Let the initial page-entry scroll and animation finish before simulating user scrolling.
  assert.deepEqual(await page.locator('.dashboard-sprint strong').allTextContents(),active.map(s=>s.name));
  await page.evaluate(()=>scrollTo(0,300));
  const before=await page.evaluate(()=>scrollY);
  assert.ok(before>100);
  const projectFilter=page.getByLabel('筛选项目',{exact:true});
  await projectFilter.click();await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>scrollY),before,'opening project filter preserves scroll');
  const search=page.getByRole('textbox',{name:'搜索选项',exact:true});
  await search.fill(data.projects[0].name);
  assert.equal(await page.evaluate(()=>scrollY),before,'typing in search preserves scroll');
  await page.getByRole('option',{name:data.projects[0].name,exact:true}).click();
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>scrollY),before,'selecting project preserves scroll');
  await projectFilter.click();await page.getByRole('option',{name:'全部项目',exact:true}).click();
  assert.equal(await page.evaluate(()=>scrollY),before,'clearing filter preserves scroll');
  console.log('PASS only active sprints; project filter open, search, selection and reset preserve scroll');

  await page.goto(base+'/?tab=projects&project='+data.projects[0].id+'&view=settings&section=types');
  const row=page.locator('[data-type-row="task"]');await row.waitFor();
  const countHeader=page.getByRole('columnheader',{name:'关联工作项',exact:true});
  assert.ok((await countHeader.boundingBox()).width>=90,'count header has enough width');
  await capture('work-types-desktop');
  await row.dblclick();
  const dialog=page.locator('.type-edit-dialog');await dialog.waitFor();
  await page.getByRole('button',{name:'使用设计图标',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'使用设计图标',exact:true}).getAttribute('aria-pressed'),'true');
  const color=page.locator('.work-type-palette button').first();await color.click();
  assert.equal(await color.getAttribute('aria-pressed'),'true');
  await page.getByRole('textbox',{name:'工作类型名称',exact:true}).fill('设计评审');
  assert.ok((await page.locator('.work-type-preview').innerText()).includes('设计评审'));
  await capture('work-type-editor-desktop');
  await page.getByRole('button',{name:'取消',exact:true}).click();
  assert.ok(!(await row.innerText()).includes('设计评审'));
  // Keyboard entry remains available when double click is not practical.
  await row.focus();await page.keyboard.press('Enter');await dialog.waitFor();
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  console.log('PASS type list widths, double click, icon/color selection, live preview, cancellation and keyboard entry');

  await page.setViewportSize({width:390,height:844});
  await capture('work-types-mobile');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no page overflow on mobile');
  await page.getByRole('button',{name:'新建工作类型',exact:true}).click();await dialog.waitFor();
  await page.getByRole('textbox',{name:'工作类型名称',exact:true}).fill('移动端类型');
  await capture('work-type-editor-mobile');
  const box=await dialog.boundingBox();assert.ok(box.x>=0 && box.x+box.width<=390,'editor fits mobile width');
  const confirm=page.getByRole('button',{name:'确定',exact:true});
  const buttonBox=await confirm.boundingBox();assert.ok(buttonBox.y>=0&&buttonBox.y+buttonBox.height<=844,'footer stays in viewport');
  await confirm.click();await dialog.waitFor({state:'hidden'});
  await page.locator('tr').filter({hasText:'移动端类型'}).waitFor();
  assert.equal(await page.locator('.settings-save .primary').isEnabled(),true);
  // Local draft only: refresh discards it and does not touch the fixture's project data.
  await page.reload();await row.waitFor();
  assert.equal(await page.locator('tr').filter({hasText:'移动端类型'}).count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS mobile list and editor fit, reachable footer, draft creation and no runtime errors');
} finally {await browser.close();}

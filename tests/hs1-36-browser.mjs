// Run against an isolated local server: HEYSO_PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs node tests/hs1-36-browser.mjs
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.HEYSO_PLAYWRIGHT_MODULE);
const browser=await chromium.launch({executablePath:process.env.HEYSO_CHROMIUM || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const base=process.env.HEYSO_TEST_URL || 'http://127.0.0.1:4187';
const typeName='浏览器验证类型-'+Date.now();
try {
  await page.goto(base+'/?tab=dashboard');
  await page.locator('.dashboard-todo').first().waitFor();
  assert.ok(await page.getByLabel('冲刺完成情况',{exact:true}).isVisible());
  await page.locator('.dashboard-todo').first().click();
  await page.locator('.drawer').waitFor();
  assert.equal(new URL(page.url()).searchParams.get('tab'),'dashboard');
  assert.ok(await page.locator('.dashboard-content').isVisible());
  assert.ok(new URL(page.url()).searchParams.get('item'));
  await page.reload();await page.locator('.drawer').waitFor();
  assert.equal(new URL(page.url()).searchParams.get('tab'),'dashboard');
  await page.keyboard.press('Escape');
  await page.locator('.drawer').waitFor({state:'hidden'});
  console.log('PASS dashboard sprint status and in-page detail');

  await page.goto(base+'/?tab=projects&project=p_heyso&view=roadmap');
  const versions=page.getByRole('checkbox',{name:'显示版本',exact:true});
  await versions.waitFor();
  if(!await versions.isChecked()) await versions.check();
  assert.ok(await page.locator('.roadmap-release-row').count()>0);
  await versions.uncheck();assert.equal(await page.locator('.roadmap-release-row').count(),0);
  assert.equal(await page.locator('.roadmap-ruler-release').count(),0);
  await page.reload();await versions.waitFor();assert.equal(await versions.isChecked(),false);
  await versions.check();console.log('PASS roadmap versions and persistent visibility');

  await page.goto(base+'/?tab=projects&project=p_heyso&view=releases');
  const row=page.locator('tr[aria-label^="版本："]').first();
  await row.click();await page.locator('.version-detail-heading').waitFor();
  assert.ok(await page.locator('.version-detail-tabs').isVisible());
  await page.getByRole('button',{name:'所有版本',exact:true}).click();
  await row.dblclick({delay:150});await page.getByRole('heading',{name:'编辑版本',exact:true}).waitFor();
  await page.waitForTimeout(700);assert.equal(await page.locator('.version-detail-heading').count(),0);
  await page.getByRole('button',{name:'取消',exact:true}).click();
  assert.equal(await page.locator('.version-meter').first().evaluate(el=>Math.round(el.getBoundingClientRect().width)),180);
  const widths=await page.locator('.version-meter').first().locator('span').evaluateAll(els=>els.map(e=>parseFloat(e.style.width)));
  assert.ok(Math.abs(widths.reduce((a,b)=>a+b,0)-100)<0.01);console.log('PASS release original details, slower double click and fixed proportional meter');

  await page.goto(base+'/?tab=projects&project=p_heyso&view=settings&section=types');
  const typeRow=page.locator('[data-type-row="task"]');await typeRow.waitFor();
  assert.equal(await typeRow.locator('input').count(),0);
  await typeRow.dblclick();await page.getByRole('heading',{name:'编辑工作类型',exact:true}).waitFor();
  await page.getByRole('textbox',{name:'工作类型名称',exact:true}).fill('任务修改草稿');
  await page.getByRole('button',{name:'取消',exact:true}).click();assert.ok(!(await typeRow.innerText()).includes('任务修改草稿'));
  await page.getByRole('button',{name:'新建工作类型',exact:true}).click();
  await page.getByRole('textbox',{name:'工作类型名称',exact:true}).fill(typeName);
  for(const label of ['工作类型图标','工作类型颜色','工作类型可用性']) assert.ok(await page.getByLabel(label,{exact:true}).isVisible());
  await page.getByRole('button',{name:'确定',exact:true}).click();
  await page.locator('tr').filter({hasText:typeName}).waitFor();
  await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/action')&&r.status()===200), page.getByRole('button',{name:'保存工作项配置',exact:true}).click()]);
  await page.reload();await page.locator('tr').filter({hasText:typeName}).waitFor();
  assert.equal(await page.locator('.type-edit-dialog').count(),0);
  console.log('PASS type list, double click, cancellation, complete creation and persisted settings');
  assert.deepEqual(errors,[]);console.log('PASS no browser runtime errors');
} finally {await browser.close();}

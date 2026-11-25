import assert from 'node:assert/strict';
import {seed} from '../server/model.mjs';
import {migrateState} from '../server/migrate.mjs';
const {chromium}=await import(process.env.HEYSO_PLAYWRIGHT_MODULE);
const base=process.env.HEYSO_TEST_URL||'http://127.0.0.1:4299';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Use an isolated local server');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(12000);
 await page.route('**/api/state',r=>r.fulfill({json:migrateState(seed())}));
 await page.goto(base+'/?project=p_heyso&view=list');
 await page.getByRole('button',{name:'负责人筛选',exact:true}).click();
 const filter=page.getByRole('dialog',{name:'负责人筛选',exact:true});await filter.waitFor();
 await page.waitForTimeout(350);
 const box=await filter.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390,'scrolled column filter must fit the phone viewport');
 await filter.getByRole('checkbox',{name:'陈默',exact:true}).check();await filter.getByRole('button',{name:'应用筛选',exact:true}).click();
 assert.ok(await page.getByRole('button',{name:'清空筛选',exact:true}).isVisible());
 console.log('PASS phone column filter stays in viewport after horizontal table scroll and accepts pointer input');
}finally{await browser.close();}

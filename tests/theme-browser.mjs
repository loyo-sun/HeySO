import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {brandPalette as palette} from '../src/theme-tokens.mjs';
import {seed} from '../server/model.mjs';
import {migrateState} from '../server/migrate.mjs';
const {chromium}=await import(process.env.HEYSO_PLAYWRIGHT_MODULE);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']}),page=await browser.newPage({viewport:{width:1440,height:900}}),out=process.env.HEYSO_SCREENSHOT_DIR||'/tmp/heyso-readable-theme',rows=[];await fs.mkdir(out,{recursive:true});
const rgb=hex=>'rgb('+hex.slice(1).match(/../g).map(v=>parseInt(v,16)).join(', ')+')';
const lum=c=>{const v=c.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2];};
async function capture(button,state){await page.waitForTimeout(450);const s=await button.evaluate(el=>{const s=getComputedStyle(el);return {foreground:s.color,background:s.backgroundColor,border:s.borderTopColor,outline:s.outlineColor,outlineStyle:s.outlineStyle,cursor:s.cursor};});const a=lum(s.foreground),b=lum(s.background);rows.push({state,...s,contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)});return s;}
try{
 await page.route('**/api/state',route=>route.fulfill({json:migrateState(seed())}));await page.goto(process.env.HEYSO_TEST_URL||'http://127.0.0.1:4192');const button=page.getByRole('button',{name:'新建工作项',exact:true});await button.waitFor();
 for(const [state,color]of [['normal',palette.accent],['hover',palette.hover],['active',palette.active]]){if(state==='hover')await button.hover();if(state==='active')await page.mouse.down();const s=await capture(button,state);assert.equal(s.foreground,'rgb(255, 255, 255)');assert.equal(s.background,rgb(color));assert.equal(s.border,rgb(color));assert.ok(rows.at(-1).contrast>=4.5);}
 await page.mouse.move(0,0);await page.mouse.up();await button.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');const focus=await capture(button,'focus');assert.notEqual(focus.outlineStyle,'none');assert.equal(focus.outline,rgb(palette.accent));
 await page.screenshot({path:out+'/project-primary.png'});const nav=page.locator('.nav-item.active:visible').first();await nav.waitFor();const s=await capture(nav,'navigation');assert.equal(s.foreground,rgb(palette.accentText));assert.equal(s.background,rgb(palette.soft));assert.ok(rows.at(-1).contrast>=4.5);
 await button.evaluate(el=>el.disabled=true);assert.equal((await capture(button,'disabled')).cursor,'not-allowed');await button.evaluate(el=>el.disabled=false);
 console.log('PASS: default primary normal/hover/active/focus/disabled and selected navigation keep white labels, matching borders and readable contrast.');
}finally{await fs.writeFile(out+'/computed-style.json',JSON.stringify(rows,null,2));await browser.close();}

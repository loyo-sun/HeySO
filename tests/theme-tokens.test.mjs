import test from 'node:test';
import assert from 'node:assert/strict';
import {brandPalette as p,shellThemeVariables} from '../src/theme-tokens.mjs';
const luminance=hex=>{const c=hex.slice(1).match(/../g).map(h=>parseInt(h,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
test('default primary white labels, selection text and focus boundaries have sufficient contrast',()=>{for(const bg of [p.accent,p.hover,p.active])assert.ok(contrast(p.onAccent,bg)>=4.5);assert.ok(contrast(p.accentText,p.soft)>=4.5);assert.ok(contrast(p.accent,'#ffffff')>=3);});
test('shell variables use the default palette and preserve explicit host colors',()=>{const defaults=shellThemeVariables();assert.equal(defaults['--heyso-accent'],p.accent);assert.equal(defaults['--heyso-accent-hover'],p.hover);assert.equal(defaults['--heyso-accent-text'],p.accentText);assert.equal(shellThemeVariables({accent:p.accent})['--heyso-accent-pressed'],p.active);const host=shellThemeVariables({accent:'#175cd3',background:'#eee',text:'#111'});assert.equal(host['--heyso-accent'],'#175cd3');assert.equal(host['--heyso-background'],'#eee');assert.equal(host['--heyso-text'],'#111');assert.match(host['--heyso-accent-hover'],/#175cd3/);});

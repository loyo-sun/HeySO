import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {safeMarkdownUrl,insertMarkdown,formatMarkdown,MAX_MARKDOWN_LENGTH} from '../src/markdown-policy.mjs';
import {createStore} from '../server/store.mjs';
import {projectFile,readProjectFile} from '../server/project-file.mjs';

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
test('Markdown renders the requested headings, bold, lists and embedded raster images',()=>{
 const text=`# 一级\n\n## 二级\n\n### 三级\n\n**加粗**\n\n- 甲\n- 乙\n\n1. 一\n2. 二\n\n![说明](${png})`;
 const html=renderToStaticMarkup(React.createElement(ReactMarkdown,{skipHtml:true,urlTransform:safeMarkdownUrl},text));
 for(const part of ['<h1>一级</h1>','<h2>二级</h2>','<h3>三级</h3>','<strong>加粗</strong>','<ul>','<ol>','alt="说明"',png])assert.ok(html.includes(part),part);
});
test('URLs reject executable schemes and SVG data while allowing bounded embedded raster images',()=>{
 for(const url of ['javascript:alert(1)','JaVaScRiPt:alert(1)','data:text/html;base64,abcd','data:image/svg+xml;base64,abcd','java\nscript:alert(1)','//untrusted.example/img','\\untrusted.example'])assert.equal(safeMarkdownUrl(url,'src'),'');
 assert.equal(safeMarkdownUrl(png,'src'),png);
 assert.equal(safeMarkdownUrl(png,'href'),'');
 assert.equal(safeMarkdownUrl('https://example.com/p.png','src'),'https://example.com/p.png');
 assert.equal(safeMarkdownUrl('data:image/png;base64,'+'a'.repeat(400000),'src'),'');
 const html=renderToStaticMarkup(React.createElement(ReactMarkdown,{skipHtml:true,urlTransform:safeMarkdownUrl},'<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[恶意](javascript:alert%281%29)'));
 assert.ok(!/<script|<img|onerror|href="javascript:/i.test(html));
});
test('toolbar formatting respects line boundaries, selection and ordered list numbering',()=>{
 assert.equal(formatMarkdown('前段\n标题',4,4,'## ').text,'前段\n## 标题');
 assert.equal(formatMarkdown('文字',0,2,'**文字**').text,'**文字**');
 assert.equal(formatMarkdown('甲\n乙',0,3,'1. ').text,'1. 甲\n2. 乙');
 assert.equal(formatMarkdown('\n文字',0,0,'# ').text,'# \n文字');
 assert.equal(formatMarkdown('## 标题',3,3,'### ').text,'### 标题');
 assert.equal(insertMarkdown('甲乙',1,1,'图').text,'甲图乙');
 assert.throws(()=>insertMarkdown('a'.repeat(MAX_MARKDOWN_LENGTH),1,1,'b'),/内容过长/);
});
test('Markdown and pasted image content survives save, restart and project export/import',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'heyso-markdown-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'state.json'),store=createStore(file),text=`## 描述\n\n**内容**\n\n![截图](${png})`;
 store.dispatch({type:'item.update',payload:{id:'t1',description:text,acceptance:'- 图片可见\n1. 验收通过'}});
 const state=createStore(file).read();
 assert.equal(state.items.find(i=>i.id==='t1').description,text);
 const copy=readProjectFile(projectFile(state,'p_heyso'));
 assert.equal(copy.workspace.items.find(i=>i.id==='t1').description,text);
 assert.ok(state.events.some(e=>e.itemId==='t1'&&e.changes?.some(c=>c.field==='description'&&c.label==='描述')));
});

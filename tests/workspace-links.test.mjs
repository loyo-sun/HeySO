import test from 'node:test';
import assert from 'node:assert/strict';
import {Editor} from '@tiptap/core';
import {inlineExtensions} from '../src/inline-editor.mjs';
import {resolveWorkspaceLink} from '../src/workspace-link-policy.mjs';
import {defaultWorkConfig} from '../shared/work-config.mjs';
import linkifyMarkdown from '../src/linkify-markdown.mjs';
const project={id:'p',code:'HS',workConfig:defaultWorkConfig()},items=[{id:'t1',projectId:'p',kind:'task',status:'todo',number:3,title:'测试链接'}],ctx={project,items,baseUrl:'https://heyso.example/?project=p'};
test('internal links resolve only current-project items on trusted current origin',()=>{
  const result=resolveWorkspaceLink('/?project=p&item=t1',ctx);assert.equal(result.kind,'internal');assert.equal(result.code,'HS-3');assert.equal(result.title,'测试链接');assert.ok(result.type&&result.status);
  assert.equal(resolveWorkspaceLink('/?project=p&item=missing',ctx).kind,'missing');
  assert.equal(resolveWorkspaceLink('/?project=other&item=t1',ctx).kind,'external');
  assert.equal(resolveWorkspaceLink('https://evil.example/?project=p&item=t1',ctx).kind,'external');
  for(const url of ['javascript:alert(1)','data:text/html,hi','//evil.example'])assert.equal(resolveWorkspaceLink(url,ctx).kind,'invalid');
});
test('inline links survive markdown roundtrip as atomic references, including pasted bare URLs',()=>{
  const editor=new Editor({element:null,extensions:inlineExtensions(),content:'[内部](https://heyso.example/?project=p&item=t1)\n\nhttps://example.org/',contentType:'markdown'});
  try{const json=JSON.stringify(editor.getJSON());assert.ok(json.includes('workspaceLink'));const output=editor.getMarkdown();const again=new Editor({element:null,extensions:inlineExtensions(),content:output,contentType:'markdown'});try{assert.deepEqual(again.getJSON(),editor.getJSON());}finally{again.destroy();}}finally{editor.destroy();}
});
test('plain URL display linkifies prose without changing code or existing links',()=>{
  const tree={type:'root',children:[{type:'paragraph',children:[{type:'text',value:'见 https://heyso.example/?project=p&item=t1。'}]},{type:'inlineCode',value:'https://example.org/'},{type:'link',url:'https://example.org/',children:[{type:'text',value:'https://example.org/'}]}]};
  linkifyMarkdown()(tree);assert.equal(tree.children[0].children.find(n=>n.type==='link').url,'https://heyso.example/?project=p&item=t1');assert.equal(tree.children[1].value,'https://example.org/');assert.equal(tree.children[2].children.length,1);
});

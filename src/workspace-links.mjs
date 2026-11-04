import {Node,nodeInputRule} from '@tiptap/core';
import {safeMarkdownUrl} from './markdown-policy.mjs';
import {resolveWorkspaceLink} from './workspace-link-policy.mjs';
export function createWorkspaceLinkExtension(access=()=>({})){return Node.create({
  name:'workspaceLink',priority:1100,group:'inline',inline:true,atom:true,selectable:true,markdownTokenName:'link',
  addAttributes(){return {href:{default:''},label:{default:''}};},
  addStorage(){const views=new Set();return {views,refresh:()=>{for(const update of views)update();}};},
  parseHTML(){return [{tag:'a[href]',getAttrs:element=>({href:element.getAttribute('href'),label:element.textContent})}];},
  renderHTML({node}){const href=safeMarkdownUrl(node.attrs.href,'href');return href?['a',{href,'data-workspace-link':''},node.attrs.label||href]:['span',{},'无效链接'];},
  parseMarkdown(token,helpers){return helpers.createNode('workspaceLink',{href:token.href,label:token.text||token.href});},
  renderMarkdown(node){const label=String(node.attrs.label||node.attrs.href).replace(/[\\\[\]]/g,'\\$&'),href=String(node.attrs.href).replace(/[<>\s]/g,c=>encodeURIComponent(c));return `[${label}](<${href}>)`;},
  addInputRules(){return [nodeInputRule({find:/(?<!\S)(https?:\/\/[^\s]+) $/,type:this.type,getAttributes:match=>({href:match[1],label:match[1]})})];},
  addNodeView(){return ({node})=>{
    let current=node,lastRender='';const dom=document.createElement('a');dom.contentEditable='false';
    const refresh=()=>{
      const api=access(),link=api.resolve?.(current.attrs.href)||resolveWorkspaceLink(current.attrs.href),parts=link.kind==='internal'?[['link-kind',link.type],['link-status',link.status],['link-title',link.title],['link-code',link.code]]:[['',link.kind==='missing'?'工作项不存在或无权访问':link.kind==='invalid'?'无效链接':current.attrs.label||current.attrs.href]];
      const renderKey=JSON.stringify([link.kind,link.href,link.color,parts]);if(renderKey===lastRender)return;lastRender=renderKey;
      dom.className=link.kind==='internal'?'work-item-reference':'workspace-external-link';dom.replaceChildren();
      if(link.href)dom.href=link.href;else dom.removeAttribute('href');
      for(const [className,text] of parts){const span=document.createElement('span');span.className=className;span.textContent=text;if(className==='link-kind')span.style.color=link.color;dom.append(span);}
      dom.setAttribute('aria-label',parts.map(p=>p[1]).join(' · '));
    };
    dom.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();access().follow?.(current.attrs.href);});refresh();this.storage.views.add(refresh);
    return {dom,update:next=>{if(next.type!==current.type)return false;current=next;refresh();return true;},ignoreMutation:()=>true,stopEvent:event=>event.type==='click',destroy:()=>this.storage.views.delete(refresh)};
  }},
});}

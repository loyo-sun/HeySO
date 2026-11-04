import {Extension,mergeAttributes} from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import {Markdown} from '@tiptap/markdown';
import {createWorkspaceLinkExtension} from './workspace-links.mjs';
import {Plugin} from '@tiptap/pm/state';
import {MAX_MARKDOWN_LENGTH,safeMarkdownUrl} from './markdown-policy.mjs';

const SafeImage=Image.extend({
  renderHTML({HTMLAttributes}) {
    const src=safeMarkdownUrl(HTMLAttributes.src,'src');
    return src?['img',mergeAttributes(this.options.HTMLAttributes,HTMLAttributes,{src,referrerpolicy:'no-referrer',loading:'lazy'})]:['span',{},HTMLAttributes.alt||'图片地址不可用'];
  },
});
export function completeBold(editor,from,to,text) {
  if(!editor||editor.isDestroyed||text!=='*'||from!==to||from<2||editor.isActive('codeBlock')||editor.isActive('code'))return false;
  if(editor.state.doc.textBetween(from-1,from)!=='*')return false;
  editor.chain().deleteRange({from:from-1,to:from}).toggleBold().run();
  return true;
}
export function inlineExtensions(placeholder='点击输入，支持 Markdown 和粘贴图片',links=()=>({})) {
  return [StarterKit.configure({heading:{levels:[1,2,3]},underline:false,link:false}),
    createWorkspaceLinkExtension(links),SafeImage.configure({allowBase64:true}),Placeholder.configure({placeholder}),Markdown,
    Extension.create({name:'boundedInlineContent',addProseMirrorPlugins(){return [new Plugin({filterTransaction:tr=>!tr.docChanged||JSON.stringify(tr.doc.toJSON()).length<=MAX_MARKDOWN_LENGTH})];}})];
}

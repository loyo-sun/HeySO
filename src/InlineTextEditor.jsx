import React,{useEffect,useRef,useState} from 'react';
import {useEditor,EditorContent} from '@tiptap/react';
import {inlineExtensions,completeBold} from './inline-editor.mjs';
import {MAX_MARKDOWN_LENGTH,pastedImageData} from './markdown-policy.mjs';
import './rich-text.css';
import {useWorkspaceLinks} from './WorkspaceLinks.jsx';

export default function RichTextEditor({value,defaultValue='',name,label='多行文本',onSave,onChange,onBusyChange,disabled=false,placeholder=''}) {
  const links=useWorkspaceLinks(),linksRef=useRef(links);linksRef.current=links;
  const [text,setText]=useState(value??defaultValue),[pending,setPending]=useState(false),[error,setError]=useState('');
  const draft=useRef(text),saved=useRef(text),inFlight=useRef(new Set()),conflict=useRef(false),busy=useRef(false),blurred=useRef(false),latest=useRef({onSave,onBusyChange,disabled});
  latest.current={onSave,onChange,onBusyChange,disabled};
  async function commit(){
    const next=draft.current;
    if(conflict.current){setError('云端内容已更新。请复制当前草稿，刷新后核对再保存。');return;}
    if(!latest.current.onSave||next===saved.current||busy.current||inFlight.current.has(next))return;
    inFlight.current.add(next);
    try{const result=await latest.current.onSave(next);if(result!==null&&result!==false)saved.current=next;}
    finally{inFlight.current.delete(next);}
  }
  const editor=useEditor({
    immediatelyRender:false,
    extensions:inlineExtensions(placeholder||undefined,()=>linksRef.current),content:value??defaultValue,contentType:'markdown',editable:!disabled,
    editorProps:{attributes:{role:'textbox','aria-label':label,'aria-multiline':'true',class:'inline-markdown markdown-content'},
      handleTextInput:(_view,from,to,text)=>completeBold(editor,from,to,text),
      handlePaste:(_view,event)=>{
        const images=[...event.clipboardData.items].filter(i=>i.kind==='file'&&i.type.startsWith('image/')).map(i=>i.getAsFile()).filter(Boolean);
        if(images.length){event.preventDefault();pasteImages(images);return true;}
        const markdown=event.clipboardData.getData('text/plain');
        if(markdown&&markdown.length+draft.current.length<=MAX_MARKDOWN_LENGTH){event.preventDefault();editor.commands.insertContent(markdown,{contentType:'markdown'});return true;}
        return false;
      }},
    onUpdate:({editor})=>{const next=editor.getMarkdown();draft.current=next;setText(next);setError('');latest.current.onChange?.(next);},
    onFocus:()=>{blurred.current=false;},onBlur:()=>{blurred.current=true;commit();},
  });
  useEffect(()=>{if(editor&&!editor.isDestroyed)editor.storage.workspaceLink?.refresh();},[editor,links]);
  useEffect(()=>{if(editor&&!editor.isDestroyed)editor.setEditable(!disabled&&!pending,false);},[editor,disabled,pending]);
  useEffect(()=>{
    if(value===undefined||!editor||editor.isDestroyed)return;
    if(draft.current===value){saved.current=value;conflict.current=false;return;}
    if(draft.current===saved.current||draft.current===value){draft.current=value;setText(value);editor.commands.setContent(value,{contentType:'markdown',emitUpdate:false});conflict.current=false;}
    else if(value!==saved.current&&!inFlight.current.has(value)){conflict.current=true;setError('云端内容已更新。请复制当前草稿，刷新后核对再保存。');}
    saved.current=value;
  },[editor,value]);
  async function pasteImages(files){
    if(!editor||busy.current||latest.current.disabled)return;
    const selection={from:editor.state.selection.from,to:editor.state.selection.to},original=draft.current;
    busy.current=true;setPending(true);setError('');latest.current.onBusyChange?.(1);
    try{
      const nodes=[];
      for(const file of files)nodes.push({type:'image',attrs:{src:await pastedImageData(file),alt:'粘贴的图片'}});
      if(editor.isDestroyed)return;
      if(draft.current!==original)throw Error('内容已更新，请重新粘贴图片。');
      const added=nodes.reduce((sum,n)=>sum+n.attrs.src.length,0);
      if(original.length+added>MAX_MARKDOWN_LENGTH)throw Error('内容过长，请减少图片后重试。');
      editor.commands.insertContentAt(selection,nodes);
      if(!blurred.current)editor.commands.focus();
    }catch(e){setError(e.message||'插入图片失败，请重试。');}
    finally{busy.current=false;setPending(false);latest.current.onBusyChange?.(-1);if(blurred.current)await commit();}
  }
  return <div className="rich-text-editor inline-text-editor">
    {name&&<input type="hidden" name={name} value={text}/>}
    <EditorContent editor={editor}/>
    {pending&&<p className="rich-text-hint" role="status">正在插入图片…</p>}
    {error&&<p className="rich-text-error" role="alert">{error}</p>}
  </div>;
}

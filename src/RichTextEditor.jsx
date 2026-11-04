import React, {lazy,Suspense,useEffect,useRef,useState} from 'react';
import { MAX_MARKDOWN_LENGTH,insertMarkdown,formatMarkdown,pastedImageData } from './markdown-policy.mjs';
import './rich-text.css';
const MarkdownView=lazy(()=>import('./MarkdownView.jsx'));

export default function RichTextEditor({value,defaultValue='',name,label='多行文本',onSave,onBusyChange,disabled=false,placeholder=''}) {
  const [text,setText]=useState(value ?? defaultValue),[preview,setPreview]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState('');
  const input=useRef(null),draft=useRef(text),saved=useRef(value ?? defaultValue),busy=useRef(false),blurred=useRef(false);
  const update=next=>{draft.current=next;setText(next);setError('');};
  useEffect(()=>{
    if(value===undefined)return;
    if(draft.current===saved.current||draft.current===value){draft.current=value;setText(value);}
    saved.current=value;
  },[value]);
  async function commit(next=draft.current) {
    if(!onSave || next===saved.current || busy.current)return;
    const result=await onSave(next);
    if(result!==null && result!==false)saved.current=next;
  }
  function insert(insertion,selection) {
    const element=input.current;
    const start=selection?.start ?? element?.selectionStart ?? draft.current.length,end=selection?.end ?? element?.selectionEnd ?? start;
    const next=formatMarkdown(draft.current,start,end,insertion);update(next.text);
    requestAnimationFrame(()=>{input.current?.focus();input.current?.setSelectionRange(next.cursor,next.cursor);});
  }
  async function pasteFiles(files) {
    if(busy.current||disabled)return;
    const selection={start:input.current?.selectionStart ?? draft.current.length,end:input.current?.selectionEnd ?? draft.current.length};
    const original=draft.current;
    busy.current=true;setPending(true);setError('');onBusyChange?.(1);
    try {
      const images=[];
      for(const file of files)images.push(`![粘贴的图片](${await pastedImageData(file)})`);
      if(draft.current!==original)throw Error('插图期间内容发生变化，请重新粘贴图片。');
      const next=insertMarkdown(original,selection.start,selection.end,'\n\n'+images.join('\n\n')+'\n\n');
      update(next.text);
      if(!blurred.current)requestAnimationFrame(()=>{input.current?.focus();input.current?.setSelectionRange(next.cursor,next.cursor);});
    } catch(e){setError(e.message || '插入图片失败，请重试。');}
    finally {busy.current=false;setPending(false);onBusyChange?.(-1);if(blurred.current)await commit();}
  }
  const tools=[['一级标题','# '],['二级标题','## '],['三级标题','### '],['粗体','**文字**'],['无序列表','- '],['有序列表','1. ']];
  return <div className="rich-text-editor" aria-label={label+'编辑器'}>
    {name && <input type="hidden" name={name} value={text}/>}
    <div className="rich-text-toolbar" role="toolbar" aria-label={label+'格式'}>
      <button type="button" aria-pressed={!preview} onMouseDown={e=>e.preventDefault()} onClick={()=>setPreview(false)} disabled={pending}>编辑</button>
      <button type="button" aria-label={'预览'+label} aria-pressed={preview} onMouseDown={e=>e.preventDefault()} onClick={()=>{setPreview(true);commit();}} disabled={pending}>预览</button>
      <span className="rich-text-divider"/>
      {!preview && tools.map(([title,syntax],index)=><button type="button" key={title} title={title} aria-label={label+'：'+title} disabled={disabled||pending} onMouseDown={e=>e.preventDefault()} onClick={()=>insert(syntax)}>{['H1','H2','H3','B','•','1.'][index]}</button>)}
    </div>
    {preview ? <div className="rich-text-preview"><Suspense fallback={<p className="muted">正在打开预览…</p>}><MarkdownView value={text}/></Suspense></div> : <textarea ref={input} aria-label={label} value={text} placeholder={placeholder || '支持 Markdown，可直接粘贴图片'} maxLength={MAX_MARKDOWN_LENGTH} disabled={disabled} readOnly={pending}
      onFocus={()=>{blurred.current=false;}}
      onChange={e=>update(e.target.value)}
      onBlur={()=>{blurred.current=true;commit();}}
      onPaste={e=>{const images=[...e.clipboardData.items].filter(item=>item.kind==='file'&&item.type.startsWith('image/')).map(item=>item.getAsFile()).filter(Boolean);if(images.length){e.preventDefault();pasteFiles(images);}}}
    />}
    <div className="rich-text-hint" aria-live="polite">{pending?'正在插入图片…':'支持标题、粗体、列表和粘贴图片；图片会自动压缩保存。'}</div>
    {error && <p className="rich-text-error" role="alert">{error}</p>}
  </div>;
}

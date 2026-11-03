import React, {useEffect, useRef, useState} from 'react';
import {ArrowLeft, ArrowRight, BookOpen, Download, Layers, GitBranch, Search, Workflow, X, ChevronRight} from 'lucide-react';
import {helpArticles, helpMarkdown} from './help-content.mjs';
import './help-center.css';
const icons={types:Layers,hierarchy:GitBranch,workflows:Workflow};
const snippet=(section,query)=>{
 const lines=section.blocks.flatMap(b=>b.text?[b.text]:b.items||b.rows?.map(row=>row.join('：'))||[]);
 const match=lines.find(text=>text.toLocaleLowerCase().includes(query))||lines[0]||'';
 const index=match.toLocaleLowerCase().indexOf(query);
 return (index>30?'…':'')+match.slice(Math.max(0,index-30),Math.max(0,index-30)+150);
};
function Block({block:b}){
 if(b.type==='table')return <div className="help-table-wrap"><table><thead><tr>{b.headers.map(h=><th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{b.rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>;
 if(b.type==='steps')return <ol className="help-steps">{b.items.map((text,i)=><li key={i}>{text}</li>)}</ol>;
 if(b.type==='list')return <ul>{b.items.map((text,i)=><li key={i}>{text}</li>)}</ul>;
 if(b.type==='note')return <aside className="help-note"><strong>{b.title}</strong><p>{b.text}</p></aside>;
 return <p>{b.text}</p>;
}
export default function HelpCenter({onClose,initialArticle='types'}){
 const [articleId,setArticleId]=useState(initialArticle),[query,setQuery]=useState('');
 const dialog=useRef(null),scroll=useRef(null),heading=useRef(null);
 const article=helpArticles.find(a=>a.id===articleId)||helpArticles[0];
 const normalized=query.trim().toLocaleLowerCase();
 const results=normalized?helpArticles.flatMap(a=>a.sections.filter(s=>JSON.stringify([a.title,s]).toLocaleLowerCase().includes(normalized)).map(s=>({article:a,section:s}))):[];
 useEffect(()=>{
   const focused=document.activeElement,overflow=document.body.style.overflow;document.body.style.overflow='hidden';heading.current?.focus();
   const key=e=>{if(e.key==='Escape'){e.preventDefault();onClose();}if(e.key==='Tab'){
     const focusable=[...dialog.current.querySelectorAll('button:not(:disabled),input,a[href],[tabindex="0"]')].filter(el=>el.getClientRects().length);
     const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===heading.current)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
   }};
   document.addEventListener('keydown',key);return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',key);focused?.focus();};
 },[]);
 function navigate(id,section){setArticleId(id);setQuery('');requestAnimationFrame(()=>{if(section){const el=dialog.current.querySelector('[data-help-section="'+section+'"]');el?.scrollIntoView({block:'start'});el?.focus();}else{scroll.current?.scrollTo({top:0});heading.current?.focus();}});}
 function download(){const blob=new Blob([helpMarkdown()],{type:'text/markdown;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='HeySO_工作项配置指南.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 const currentIndex=helpArticles.findIndex(a=>a.id===article.id);
 return <section className="help-center" role="dialog" aria-modal="true" aria-labelledby="help-center-title" ref={dialog}>
  <header className="help-header"><div><button className="help-back" onClick={onClose}><ArrowLeft size={16}/>返回工作台</button><span className="help-header-divider"/><BookOpen size={18}/><h1 id="help-center-title">帮助中心</h1></div><button className="help-download" onClick={download}><Download size={15}/><span>下载完整指南</span></button></header>
  <div className="help-layout"><aside className="help-sidebar"><label className="help-search"><Search size={16}/><input aria-label="搜索帮助文档" placeholder="搜索配置与操作" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button aria-label="清除帮助搜索" onClick={()=>setQuery('')}><X size={14}/></button>}</label><p className="help-nav-label">配置指南</p><nav aria-label="帮助文档章节">{helpArticles.map((a,index)=>{const Icon=icons[a.id];return <button key={a.id} aria-current={!normalized&&article.id===a.id?'page':undefined} className={!normalized&&article.id===a.id?'active':''} onClick={()=>navigate(a.id)}><Icon size={17}/><span>{a.title}<small>0{index+1} · {a.minutes}</small></span><ChevronRight size={13}/></button>;})}</nav><div className="help-sidebar-note"><strong>边看边配置</strong><p>打开帮助会保留工作台中的配置草稿。返回后可继续编辑。</p><p>文档依据当前 HeySO 功能编写。</p></div></aside>
   <div className="help-scroll" ref={scroll}>
    {normalized?<main className="help-search-results"><span className="help-eyebrow">搜索帮助</span><h2 ref={heading} tabIndex={-1}>“{query}” 的搜索结果</h2><p role="status">找到 {results.length} 个相关章节</p>{results.length?results.map(({article:a,section:s})=><button key={a.id+s.id} onClick={()=>navigate(a.id,s.id)}><small>{a.title}</small><strong>{s.title}<ArrowRight size={16}/></strong><p>{snippet(s,normalized)}</p></button>):<div className="help-empty"><Search size={28}/><h3>没有找到相关说明</h3><p>试试“父级”“归档”“迁移”或“验收”。</p><button onClick={()=>setQuery('')}>查看全部文档</button></div>}</main>:
    <div className="help-reading-layout"><article className="help-article"><div className="help-eyebrow">配置指南 / 0{currentIndex+1}</div><h2 ref={heading} tabIndex={-1}>{article.title}</h2><p className="help-lead">{article.subtitle}</p><div className="help-meta"><BookOpen size={14}/>{article.minutes}<span>适用于当前 HeySO</span></div><div className="help-learning-route"><span>学习顺序</span>{helpArticles.map((a,i)=><React.Fragment key={a.id}>{i>0&&<ChevronRight size={12}/>}<button className={a.id===article.id?'active':''} onClick={()=>navigate(a.id)}>{a.title}</button></React.Fragment>)}</div>
      {article.sections.map(s=><section className="help-section" key={s.id} data-help-section={s.id} tabIndex={-1}><h3 id={'help-'+article.id+'-'+s.id}>{s.title}</h3>{s.blocks.map((b,i)=><Block block={b} key={i}/>)}</section>)}
      <div className="help-next">{currentIndex>0?<button onClick={()=>navigate(helpArticles[currentIndex-1].id)}><ArrowLeft size={15}/><span><small>上一篇</small>{helpArticles[currentIndex-1].title}</span></button>:<span/>}{currentIndex<helpArticles.length-1?<button onClick={()=>navigate(helpArticles[currentIndex+1].id)}><span><small>接下来</small>{helpArticles[currentIndex+1].title}</span><ArrowRight size={15}/></button>:<button onClick={onClose}><span><small>开始实践</small>返回工作台</span><ArrowRight size={15}/></button>}</div><footer className="help-footer">合序 HeySO · 合而有序</footer>
    </article><nav className="help-toc" aria-label="本篇目录"><p>本篇目录</p>{article.sections.map(s=><button key={s.id} onClick={()=>navigate(article.id,s.id)}>{s.title}</button>)}<button className="help-toc-top" onClick={()=>navigate(article.id)}>回到顶部 ↑</button></nav></div>}
   </div>
  </div>
 </section>;
}

import {ReplicaButton,ReplicaInput} from './ReplicaControls.jsx';
import {AntSteps,AntMenu,AntFullscreen,AntHtmlTable,AntEmpty} from './AntStructures.jsx';
import {Anchor} from 'antd';
import React, {useEffect, useRef, useState} from 'react';
import {ArrowLeft, ArrowRight, BookOpen, Download, Layers, GitBranch, Search, Workflow, X, ChevronRight} from 'lucide-react';
import {helpArticles, helpMarkdown, helpVersion, helpUpdatedAt} from './help-content.mjs';

const icons={types:Layers,hierarchy:GitBranch,workflows:Workflow};
const snippet=(section,query)=>{
 const lines=section.blocks.flatMap(b=>b.text?[b.text]:b.items||b.rows?.map(row=>row.join('：'))||[]);
 const match=lines.find(text=>text.toLocaleLowerCase().includes(query))||lines[0]||'';
 const index=match.toLocaleLowerCase().indexOf(query);
 return (index>30?'…':'')+match.slice(Math.max(0,index-30),Math.max(0,index-30)+150);
};
function Block({block:b}){
 if(b.type==='table')return <div className="help-table-wrap"><AntHtmlTable><thead><tr>{b.headers.map(h=><th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{b.rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}</tbody></AntHtmlTable></div>;
 if(b.type==='steps')return <AntSteps className="help-steps">{b.items.map((text,i)=><li key={i}>{text}</li>)}</AntSteps>;
 if(b.type==='list')return <ul>{b.items.map((text,i)=><li key={i}>{text}</li>)}</ul>;
 if(b.type==='note')return <aside className="help-note"><strong>{b.title}</strong><p>{b.text}</p></aside>;
 return <p>{b.text}</p>;
}
export default function HelpCenter({onClose,initialArticle='start'}){
 const [articleId,setArticleId]=useState(initialArticle),[query,setQuery]=useState('');
 const dialog=useRef(null),scroll=useRef(null),heading=useRef(null);
 const article=helpArticles.find(a=>a.id===articleId)||helpArticles[0];
 const normalized=query.trim().toLocaleLowerCase();
 const results=normalized?helpArticles.flatMap(a=>a.sections.filter(s=>JSON.stringify([a.title,s]).toLocaleLowerCase().includes(normalized)).map(s=>({article:a,section:s}))):[];
 useEffect(()=>{heading.current?.focus();},[]);
 function navigate(id,section){setArticleId(id);setQuery('');requestAnimationFrame(()=>{if(section){const el=dialog.current.querySelector('[data-help-section="'+section+'"]');el?.scrollIntoView({block:'start'});el?.focus();}else{scroll.current?.scrollTo({top:0});heading.current?.focus();}});}
 function download(){const blob=new Blob([helpMarkdown()],{type:'text/markdown;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='HeySO_用户帮助手册.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 const currentIndex=helpArticles.findIndex(a=>a.id===article.id);
 return <AntFullscreen onClose={onClose} className="help-center" role="dialog" aria-modal="true" aria-labelledby="help-center-title" ref={dialog}>
  <header className="help-header"><div><ReplicaButton className="help-back" aria-label="返回工作台" onClick={onClose}><ArrowLeft size={16}/><span className="help-back-label">返回工作台</span></ReplicaButton><span className="help-header-divider"/><BookOpen size={18}/><h1 id="help-center-title">帮助中心</h1></div><ReplicaButton className="help-download" onClick={download}><Download size={15}/><span>下载完整手册</span></ReplicaButton></header>
  <div className="help-layout"><aside className="help-sidebar"><label className="help-search"><Search size={16}/><ReplicaInput aria-label="搜索帮助文档" placeholder="搜索功能、操作或问题" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<ReplicaButton aria-label="清除帮助搜索" onClick={()=>setQuery('')}><X size={14}/></ReplicaButton>}</label><p className="help-nav-label">用户手册</p><AntMenu aria-label="帮助文档章节">{helpArticles.map((a,index)=>{const Icon=icons[a.id]||BookOpen;return <ReplicaButton key={a.id} aria-current={!normalized&&article.id===a.id?'page':undefined} className={!normalized&&article.id===a.id?'active':''} onClick={()=>navigate(a.id)}><Icon size={17}/><span>{a.title}<small>{String(index+1).padStart(2,'0')} · {a.minutes}</small></span><ChevronRight size={13}/></ReplicaButton>;})}</AntMenu><div className="help-sidebar-note"><strong>按主题查阅，边做边学</strong><p>打开帮助会保留工作台中的配置草稿。返回后可继续编辑。</p><p>依据当前已实现功能编写。</p></div></aside>
   <div className="help-scroll" ref={scroll}>
    {normalized?<main className="help-search-results"><span className="help-eyebrow">搜索帮助</span><h2 ref={heading} tabIndex={-1}>“{query}” 的搜索结果</h2><p role="status">找到 {results.length} 个相关章节</p>{results.length?results.map(({article:a,section:s})=><ReplicaButton key={a.id+s.id} onClick={()=>navigate(a.id,s.id)}><small>{a.title}</small><strong>{s.title}<ArrowRight size={16}/></strong><p>{snippet(s,normalized)}</p></ReplicaButton>):<AntEmpty className="help-empty"><Search size={28}/><h3>没有找到相关说明</h3><p>试试“父级”“归档”“迁移”或“验收”。</p><ReplicaButton onClick={()=>setQuery('')}>查看全部文档</ReplicaButton></AntEmpty>}</main>:
    <div className="help-reading-layout"><article className="help-article" id="help-article-top"><div className="help-eyebrow">用户手册 / {String(currentIndex+1).padStart(2,'0')}</div><h2 ref={heading} tabIndex={-1}>{article.title}</h2><p className="help-lead">{article.subtitle}</p><div className="help-meta"><BookOpen size={14}/>{article.minutes}<span>{helpVersion} · 更新于 {helpUpdatedAt}</span></div><div className="help-learning-route"><span>查阅提示</span><span>左侧切换主题，右侧跳转本篇章节。共 {helpArticles.length} 篇，可搜索全文或下载手册。</span></div>
      {article.sections.map(s=><section className="help-section" id={`help-section-${article.id}-${s.id}`} key={s.id} data-help-section={s.id} tabIndex={-1}><h3 id={'help-'+article.id+'-'+s.id}>{s.title}</h3>{s.blocks.map((b,i)=><Block block={b} key={i}/>)}</section>)}
      <div className="help-next">{currentIndex>0?<ReplicaButton onClick={()=>navigate(helpArticles[currentIndex-1].id)}><ArrowLeft size={15}/><span><small>上一篇</small>{helpArticles[currentIndex-1].title}</span></ReplicaButton>:<span/>}{currentIndex<helpArticles.length-1?<ReplicaButton onClick={()=>navigate(helpArticles[currentIndex+1].id)}><span><small>接下来</small>{helpArticles[currentIndex+1].title}</span><ArrowRight size={15}/></ReplicaButton>:<ReplicaButton onClick={onClose}><span><small>开始实践</small>返回工作台</span><ArrowRight size={15}/></ReplicaButton>}</div><footer className="help-footer">合序 HeySO · 合而有序</footer>
    </article><aside className="help-toc" aria-label="本篇目录"><p>本篇目录</p><Anchor affix={false} getContainer={()=>scroll.current} onClick={(e,link)=>{e.preventDefault();requestAnimationFrame(()=>{if(link.href==='#help-article-top')heading.current?.focus({preventScroll:true});else document.getElementById(link.href.slice(1))?.focus({preventScroll:true});});}} items={[...article.sections.map(s=>({key:s.id,href:`#help-section-${article.id}-${s.id}`,title:s.title})),{key:'top',href:'#help-article-top',title:<span className="help-toc-top">回到顶部 ↑</span>}]}/></aside></div>}
   </div>
  </div>
 </AntFullscreen>;
}

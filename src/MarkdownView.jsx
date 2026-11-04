import React from 'react';
import ReactMarkdown from 'react-markdown';
import { safeMarkdownUrl } from './markdown-policy.mjs';
import './rich-text.css';

export default function MarkdownView({value, empty='暂无内容'}) {
  return <div className="markdown-content"><ReactMarkdown
    skipHtml
    urlTransform={safeMarkdownUrl}
    components={{
      img:({src,alt})=>src ? <img src={src} alt={alt || '粘贴的图片'} loading="lazy" referrerPolicy="no-referrer"/> : <span className="muted">图片地址不可用</span>,
      a:({href,children})=>href ? <a href={href} target="_blank" rel="noreferrer noopener">{children}</a> : <span>{children}</span>,
    }}
  >{value || empty}</ReactMarkdown></div>;
}

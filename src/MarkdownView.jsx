import React from 'react';
import ReactMarkdown from 'react-markdown';
import { safeMarkdownUrl } from './markdown-policy.mjs';
import './rich-text.css';
import {WorkspaceLink} from './WorkspaceLinks.jsx';
import linkifyMarkdown from './linkify-markdown.mjs';

export default function MarkdownView({value, empty='暂无内容'}) {
  return <div className="markdown-content"><ReactMarkdown
    skipHtml
    remarkPlugins={[linkifyMarkdown]}
    urlTransform={safeMarkdownUrl}
    components={{
      img:({src,alt})=>src ? <img src={src} alt={alt || '粘贴的图片'} loading="lazy" referrerPolicy="no-referrer"/> : <span className="muted">图片地址不可用</span>,
      a:({href,children})=>href ? <WorkspaceLink href={href}>{children}</WorkspaceLink> : <span>{children}</span>,
    }}
  >{value || empty}</ReactMarkdown></div>;
}

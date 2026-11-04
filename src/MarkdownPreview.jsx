import React, {lazy,Suspense} from 'react';
const MarkdownView=lazy(()=>import('./MarkdownView.jsx'));
export default function MarkdownPreview(props) {
  return <Suspense fallback={<p className="muted">正在显示内容…</p>}><MarkdownView {...props}/></Suspense>;
}

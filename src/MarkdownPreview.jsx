import React, {Suspense} from 'react';
import {recoverableLazy} from './recoverableLazy.jsx';
const MarkdownView=recoverableLazy(()=>import('./MarkdownView.jsx'),'内容预览',props=><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{props.value||props.empty}</pre>);
export default function MarkdownPreview(props) {
  return <Suspense fallback={<p className="muted">正在显示内容…</p>}><MarkdownView {...props}/></Suspense>;
}

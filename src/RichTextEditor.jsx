import {ReplicaInput} from './ReplicaControls.jsx';
import React,{Suspense} from 'react';
import {recoverableLazy} from './recoverableLazy.jsx';
import MarkdownPreview from './MarkdownPreview.jsx';
const InlineTextEditor=recoverableLazy(()=>import('./InlineTextEditor.jsx'),'文本编辑器',props=><>{props.name&&<ReplicaInput type="hidden" name={props.name} value={props.value??props.defaultValue??''}/>}<pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{props.value??props.defaultValue??''}</pre></>);
export default function RichTextEditor(props){
  return <Suspense fallback={<div aria-busy="true">{props.name&&<ReplicaInput type="hidden" name={props.name} value={props.value??props.defaultValue??''}/>}<MarkdownPreview value={props.value??props.defaultValue??''}/></div>}><InlineTextEditor {...props}/></Suspense>;
}

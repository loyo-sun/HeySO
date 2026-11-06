import {ReplicaInput} from './ReplicaControls.jsx';
import React,{lazy,Suspense} from 'react';
import MarkdownPreview from './MarkdownPreview.jsx';
const InlineTextEditor=lazy(()=>import('./InlineTextEditor.jsx'));
export default function RichTextEditor(props){
  return <Suspense fallback={<div aria-busy="true">{props.name&&<ReplicaInput type="hidden" name={props.name} value={props.value??props.defaultValue??''}/>}<MarkdownPreview value={props.value??props.defaultValue??''}/></div>}><InlineTextEditor {...props}/></Suspense>;
}

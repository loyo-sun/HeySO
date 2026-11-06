import {ReplicaButton,ReplicaInput} from './ReplicaControls.jsx';
import {AntAlert} from './AntStructures.jsx';
import React, { useState } from "react";
import { ArrowLeft, GitBranch } from "lucide-react";
import Select from "./Select.jsx";
import { collaborationNodes, checkWorkConfig } from "../shared/work-config.mjs";
export default function CollaborationRulesPage({workflow,config,onCancel,onApply}) {
  const [rules,setRules]=useState(()=>structuredClone(workflow.rules||{requireReview:false,nodes:{}})),[error,setError]=useState("");
  const statuses=workflow.statusIds.map(id=>config.statuses.find(s=>s.id===id)).filter(Boolean);
  function apply(){try{checkWorkConfig({...config,workflows:config.workflows.map(w=>w.id===workflow.id?{...w,rules}:w)});onApply(rules);}catch(e){setError(e.message);}}
  return <>
    <header className="wf-fullscreen-header"><ReplicaButton type="button" aria-label="返回流程图" onClick={onCancel}><ArrowLeft size={18}/></ReplicaButton><div><span>{workflow.name}</span><h1>HeySO 协作规则</h1></div><ReplicaButton type="button" className="primary wf-rules-done" onClick={apply}>完成</ReplicaButton></header>
    <div className="wf-rules-page"><div className="wf-rules-card"><div className="wf-rules-heading"><GitBranch size={24}/><div><h2>人工验收与 AI 协作</h2><p>选择流程中对应的协作节点，用于 AI 执行、进展跟踪和成果验收。</p></div></div>
    {error&&<AntAlert className="settings-error" role="alert">{error}</AntAlert>}
    <label className="wf-review-toggle"><div><strong>完成前须人工验收</strong><span>工作项通过人工验收后，才可进入完成状态。</span></div><ReplicaInput type="checkbox" checked={!!rules.requireReview} onChange={e=>{setRules(r=>({...r,requireReview:e.target.checked}));setError("");}}/></label>
    <div className="wf-rule-fields">{Object.entries(collaborationNodes).map(([key,label])=><label key={key}><span>{label}节点</span><Select aria-label={label+"协作节点"} value={rules.nodes?.[key]||""} onChange={e=>{setRules(r=>({...r,nodes:{...r.nodes,[key]:e.target.value}}));setError("");}}><option value="">不绑定</option>{statuses.filter(s=>s.category===(key==="todo"?"todo":["done","cancelled"].includes(key)?"done":"in_progress")).map(s=><option key={s.id} value={s.id} disabled={Object.entries(rules.nodes||{}).some(([role,id])=>role!==key&&id===s.id)}>{s.name}</option>)}</Select></label>)}</div>
    <p className="wf-muted">启用 AI 执行需要绑定执行、验收与完成节点。点击“完成”返回流程图，保存工作流后生效。</p>
    </div></div>
    <footer className="wf-fullscreen-footer"><ReplicaButton type="button" className="wf-rules-entry" onClick={onCancel}><ArrowLeft size={14}/>返回流程图</ReplicaButton><ReplicaButton type="button" onClick={onCancel}>取消</ReplicaButton><ReplicaButton type="button" className="primary" onClick={apply}>完成</ReplicaButton></footer>
  </>;
}

import { createPortal } from "react-dom";
import React, { useEffect, useRef, useState } from "react";
import { Plus, Copy, Trash2, ArrowRight, GitBranch, X, Undo2, Redo2, LayoutGrid, List, MousePointer2 } from "lucide-react";
import Select from "./Select.jsx";
import InfoTip from "./InfoTip.jsx";
import WorkType from "./WorkType.jsx";
import WorkflowCanvas, { layoutStatuses } from "./WorkflowCanvas.jsx";
import { progressCategories, collaborationNodes, workflowFor, workflowMigrationGroups, aiReady } from "../shared/work-config.mjs";
import "./workflow-editor.css";
import CollaborationRulesPage from "./CollaborationRulesPage.jsx";
const uid=(prefix)=>prefix+"_"+crypto.randomUUID().slice(0,8);
function WorkflowEditor({project,items,config,setConfig,migration,setMigration,busy,initialWorkflowId,initialTab="flows",fullscreen=false}) {
  const [tab,setTab]=useState(initialTab),[selected,setSelected]=useState(initialWorkflowId || config.workflowScheme.defaultWorkflowId),[view,setView]=useState("diagram"),[selection,setSelection]=useState(null);
  const [attach,setAttach]=useState(""),[newName,setNewName]=useState(""),[newCategory,setNewCategory]=useState("todo"),[message,setMessage]=useState("");
  const [edgeName,setEdgeName]=useState(""),[edgeFrom,setEdgeFrom]=useState("*"),[edgeTo,setEdgeTo]=useState("");
  const history=useRef({past:[],future:[]});
  useEffect(()=>{history.current={past:[],future:[]};setSelection(null);setMessage("");},[project.id,project.workConfig]);
  const workflow=config.workflows.find((w)=>w.id===selected)||config.workflows[0];
  const status=(id)=>config.statuses.find((s)=>s.id===id);
  const statuses=workflow.statusIds.map(status).filter(Boolean);
  const focused=selection?.kind==="status"?statuses.find((s)=>s.id===selection.id):null;
  const transition=selection?.kind==="transition"?workflow.transitions.find((t)=>t.id===selection.id):null;
  const edit=(fn)=>{if(busy)return;const next=structuredClone(config);fn(next);if(JSON.stringify(next)===JSON.stringify(config))return;history.current.past.push(structuredClone(config));history.current.past=history.current.past.slice(-50);history.current.future=[];setConfig(next);setMessage("");};
  const editFlow=(fn)=>edit((c)=>fn(c.workflows.find((w)=>w.id===workflow.id)));
  function travel(from,to) {if(!history.current[from].length)return;history.current[to].push(structuredClone(config));setConfig(history.current[from].pop());setSelection(null);setMessage("");}
  const groups=workflowMigrationGroups(project,items,config);
  const aiImpacts=items.filter(i=>i.aiEnabled&&!aiReady(workflowFor({...project,workConfig:config},i.kind)));
  const assigned=(id)=>config.types.filter((t)=>(config.workflowScheme.typeMappings[t.id]||config.workflowScheme.defaultWorkflowId)===id);
  const dirty=JSON.stringify(config)!==JSON.stringify(project.workConfig);
  function create(copy=false) {
    const id=uid("workflow");let name=copy?workflow.name+" 副本":"新工作流",n=2;while(config.workflows.some((w)=>w.name===name))name=(copy?workflow.name+" 副本":"新工作流")+" "+n++;
    const initial=config.statuses.find((s)=>s.enabled&&s.category==="todo")||config.statuses.find((s)=>s.enabled);
    edit((c)=>c.workflows.push(copy?{...structuredClone(workflow),id,name}:{id,name,statusIds:[initial.id],initialStatus:initial.id,transitions:[],rules:{requireReview:false,nodes:{}}}));setSelected(id);setSelection(null);
  }
  function openStatus() {setAttach("");setNewName("");setNewCategory("todo");setMessage("");setSelection({kind:"addStatus"});}
  function openTransition(from="*") {setEdgeName("");setEdgeFrom(from);setEdgeTo("");setMessage("");setSelection({kind:"addTransition"});}
  function addStatus() {
    let id=attach;const name=newName.trim();
    if(!id&&!name){setMessage("请选择已有状态或填写新状态名称");return;}
    if(!id&&config.statuses.some(s=>s.name.trim()===name)){setMessage("状态名称已存在，请从已有状态中选择");return;}
    if(!id&&config.statuses.length>=40){setMessage("状态库最多支持 40 个状态");return;}
    id ||= uid("status");
    edit(c=>{if(!attach)c.statuses.push({id,name,category:newCategory,enabled:true});c.workflows.find(w=>w.id===workflow.id).statusIds.push(id);});setSelection({kind:"status",id});
  }
  function addTransition() {
    if(!edgeName.trim()||!edgeTo)return;
    const id=uid("transition");editFlow(w=>w.transitions.push({id,name:edgeName.trim(),from:edgeFrom,to:edgeTo}));setSelection({kind:"transition",id});
  }
  function removeStatus() {
    editFlow(w=>{w.statusIds=w.statusIds.filter(id=>id!==focused.id);if(w.positions)delete w.positions[focused.id];w.transitions=w.transitions.filter(t=>t.from!==focused.id&&t.to!==focused.id);for(const key of Object.keys(w.rules?.nodes||{}))if(w.rules.nodes[key]===focused.id)delete w.rules.nodes[key];});setSelection(null);
  }
  const categoryOptions=Object.entries(progressCategories).map(([id,name])=><option key={id} value={id}>{name}</option>);
  const statusOptions=statuses.map(s=><option key={s.id} value={s.id}>{s.name}</option>);
  const stateCount=focused?items.filter(i=>i.status===focused.id&&workflowFor({...project,workConfig:config},i.kind)?.id===workflow.id).length:0;
  return <>
    {!fullscreen && <div className="wf-page-intro"><p>设计工作项从创建到完成的流转路径。</p><span className={"wf-draft-badge"+(dirty?" changed":"")}><span/>{dirty?"未发布的草稿":"已发布"} · v{project.workflowRevision||1}</span></div>}
    {!fullscreen && <div className="tabs workflow-tabs">{[["flows","工作流"],["scheme","工作流方案"],["statuses","状态库"]].map(([id,name])=><button type="button" key={id} className={tab===id?"active":""} onClick={()=>{setTab(id);setSelection(null);setMessage("");}}>{name}</button>)}</div>}
    {tab==="flows"&&<>
      {!fullscreen && <div className="wf-workflow-bar"><div><span className="wf-control-label">当前工作流</span><Select aria-label="选择工作流" value={workflow.id} disabled={busy} onChange={e=>{setSelected(e.target.value);setSelection(null);setMessage("");}}>{config.workflows.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</Select></div><span className="wf-assignment">{assigned(workflow.id).length} 种工作类型使用</span><button type="button" disabled={busy||config.workflows.length>=20} onClick={()=>create()}><Plus size={14}/>新建工作流</button><button type="button" aria-label="复制当前工作流" title="复制工作流" disabled={busy||config.workflows.length>=20} onClick={()=>create(true)}><Copy size={14}/></button><button type="button" aria-label="删除当前工作流" title={assigned(workflow.id).length?"请先在工作流方案中解除绑定":"删除工作流"} disabled={busy||assigned(workflow.id).length>0||config.workflowScheme.defaultWorkflowId===workflow.id} onClick={()=>{edit(c=>{c.workflows=c.workflows.filter(w=>w.id!==workflow.id);});setSelected(config.workflowScheme.defaultWorkflowId);setSelection(null);}}><Trash2 size={14}/></button></div>}
      <div className="wf-studio"><div className="wf-toolbar"><div className="wf-view-toggle"><button type="button" aria-pressed={view==="diagram"} onClick={()=>setView("diagram")}><GitBranch size={14}/>流程图</button><button type="button" aria-pressed={view==="list"} onClick={()=>setView("list")}><List size={14}/>列表</button></div><span className="wf-toolbar-divider"/><button type="button" disabled={busy} onClick={openStatus}><Plus size={14}/>添加状态</button><button type="button" disabled={busy||workflow.transitions.length>=160} onClick={()=>openTransition()}><ArrowRight size={14}/>添加转换</button><div className="wf-toolbar-end"><button type="button" aria-label="撤销工作流编辑" title="撤销" disabled={busy||!history.current.past.length} onClick={()=>travel("past","future")}><Undo2 size={15}/></button><button type="button" aria-label="重做工作流编辑" title="重做" disabled={busy||!history.current.future.length} onClick={()=>travel("future","past")}><Redo2 size={15}/></button><button type="button" aria-label="自动布局" title="按状态类别自动布局" disabled={busy} onClick={()=>editFlow(w=>{w.positions=layoutStatuses(statuses);})}><LayoutGrid size={15}/></button></div></div>
      <div className="wf-stage"><div className="wf-stage-main">{view==="diagram"?<WorkflowCanvas key={workflow.id} workflow={workflow} statuses={statuses} selection={selection} onSelect={s=>{setSelection(s);setMessage("");}} busy={busy} onMove={(id,point)=>editFlow(w=>{w.positions={...w.positions,[id]:point};})}/>:<div className="wf-list-view"><h3>状态与转换</h3>{statuses.map(s=><section key={s.id}><button type="button" className={"wf-list-status category-"+s.category} onClick={()=>setSelection({kind:"status",id:s.id})}><span/>{s.name}{s.id===workflow.initialStatus&&<small>初始状态</small>}</button>{workflow.transitions.filter(t=>t.from===s.id).map(t=><button type="button" className="wf-list-transition" key={t.id} onClick={()=>setSelection({kind:"transition",id:t.id})}><span>{t.name}</span><ArrowRight size={13}/>{status(t.to)?.name}</button>)}</section>)}{workflow.transitions.some(t=>t.from==="*")&&<section><h4>任意状态的转换</h4>{workflow.transitions.filter(t=>t.from==="*").map(t=><button type="button" className="wf-list-transition" key={t.id} onClick={()=>setSelection({kind:"transition",id:t.id})}><span>{t.name}</span><ArrowRight size={13}/>{status(t.to)?.name}</button>)}</section>}</div>}</div>
      <aside className="wf-inspector" aria-label="工作流属性面板"><header><h3>{focused?"状态详情":transition?"转换详情":selection?.kind==="addStatus"?"添加状态":selection?.kind==="addTransition"?"添加转换":"工作流详情"}</h3>{selection&&<button type="button" className="icon-btn" aria-label="关闭属性详情" onClick={()=>{setSelection(null);setMessage("");}}><X size={15}/></button>}</header>
      {message&&<p className="wf-panel-error" role="alert">{message}</p>}
      {!selection&&<><label className="field"><span>工作流名称</span><input aria-label="工作流名称" value={workflow.name} maxLength={80} disabled={busy} onChange={e=>editFlow(w=>{w.name=e.target.value;})}/></label><div className="wf-facts"><span>{statuses.length} 个状态</span><span>{workflow.transitions.length} 个转换</span></div><div className="wf-inspector-hint"><MousePointer2 size={22}/><p>选择画布中的状态或转换，查看和编辑详情。</p></div><h4>已关联的工作类型</h4><div className="wf-type-tags">{assigned(workflow.id).map(t=><WorkType key={t.id} type={t}/>)}</div>{!fullscreen && <button type="button" className="wf-text-button" onClick={()=>setTab("scheme")}>编辑工作流方案<ArrowRight size={13}/></button>}</>}
      {focused&&<><label className="field"><span>状态名称</span><input aria-label="选中状态名称" value={focused.name} maxLength={40} disabled={busy} onChange={e=>edit(c=>{c.statuses.find(s=>s.id===focused.id).name=e.target.value;})}/></label><label className="field"><span>状态类别</span><Select aria-label="选中状态类别" value={focused.category} disabled={busy} onChange={e=>edit(c=>{c.statuses.find(s=>s.id===focused.id).category=e.target.value;})}>{categoryOptions}</Select></label><p className="wf-muted">状态名称与类别会同步到引用它的所有工作流。</p><label className="config-toggle"><input type="checkbox" checked={workflow.initialStatus===focused.id} disabled={busy||workflow.initialStatus===focused.id} onChange={()=>editFlow(w=>{w.initialStatus=focused.id;})}/>设为初始状态</label><details className="wf-outgoing-details"><summary>从此状态出发</summary><div className="wf-outgoing-list">{workflow.transitions.filter(t=>t.from===focused.id||t.from==="*").map(t=><button type="button" className="wf-inspector-edge" key={t.id} onClick={()=>setSelection({kind:"transition",id:t.id})}><span>{t.name}<small>→ {status(t.to)?.name}</small></span><ArrowRight size={14}/></button>)}<button type="button" className="wf-text-button" disabled={busy||workflow.transitions.length>=160} onClick={()=>openTransition(focused.id)}><Plus size={13}/>添加出站转换</button></div></details><div className="wf-remove-state"><p>{stateCount?`${stateCount} 个工作项处于此状态，移除后须在保存前选择迁移目标。`:"移除状态时，关联转换也会从本流程移除。"}</p><button type="button" disabled={busy||workflow.initialStatus===focused.id||workflow.statusIds.length<=1} onClick={removeStatus}><Trash2 size={13}/>从工作流移除</button>{workflow.initialStatus===focused.id&&<small>请先将其他状态设为初始状态。</small>}</div></>}
      {transition&&<><label className="field"><span>转换名称</span><input aria-label="选中转换名称" value={transition.name} maxLength={80} disabled={busy} onChange={e=>editFlow(w=>{w.transitions.find(t=>t.id===transition.id).name=e.target.value;})}/></label><label className="field"><span>起始状态</span><Select aria-label="选中转换起点" value={transition.from} disabled={busy} onChange={e=>editFlow(w=>{w.transitions.find(t=>t.id===transition.id).from=e.target.value;})}><option value="*">任意状态</option>{statusOptions}</Select></label><label className="field"><span>目标状态</span><Select aria-label="选中转换终点" value={transition.to} disabled={busy} onChange={e=>editFlow(w=>{w.transitions.find(t=>t.id===transition.id).to=e.target.value;})}>{statusOptions}</Select></label><p className="wf-muted">转换为单向路径。需要退回时，请添加反向转换。“任意状态”允许从本流程的所有状态进入目标状态。</p><button type="button" className="wf-text-button" disabled={busy} onClick={()=>{editFlow(w=>w.transitions.push({id:uid("transition"),name:transition.name.slice(0,75)+"（返回）",from:transition.to,to:transition.from==="*"?workflow.initialStatus:transition.from}));}}>添加反向转换</button><button type="button" className="wf-delete-transition" disabled={busy} onClick={()=>{editFlow(w=>{w.transitions=w.transitions.filter(t=>t.id!==transition.id);});setSelection(null);}}><Trash2 size={13}/>移除转换</button></>}
      {selection?.kind==="addStatus"&&<><label className="field"><span>复用已有状态</span><Select aria-label="添加到流程的状态" value={attach} disabled={busy} onChange={e=>{setAttach(e.target.value);setMessage("");}}><option value="">创建新状态</option>{config.statuses.filter(s=>s.enabled&&!workflow.statusIds.includes(s.id)).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</Select></label>{!attach&&<><label className="field"><span>新状态名称</span><input aria-label="新状态名称" placeholder="例如：待评审" maxLength={40} value={newName} disabled={busy} onChange={e=>setNewName(e.target.value)}/></label><label className="field"><span>状态类别</span><Select aria-label="新状态类别" value={newCategory} disabled={busy} onChange={e=>setNewCategory(e.target.value)}>{categoryOptions}</Select></label></>}<button type="button" className="primary" disabled={busy||(!attach&&!newName.trim())} onClick={addStatus}>添加到工作流</button><p className="wf-muted">新增状态会进入状态库，其他工作流也可复用。</p></>}
      {selection?.kind==="addTransition"&&<><label className="field"><span>转换名称</span><input aria-label="新转换名称" placeholder="例如：提交评审" maxLength={80} value={edgeName} disabled={busy} onChange={e=>setEdgeName(e.target.value)}/></label><label className="field"><span>起始状态</span><Select aria-label="新转换起点" value={edgeFrom} disabled={busy} onChange={e=>setEdgeFrom(e.target.value)}><option value="*">任意状态</option>{statusOptions}</Select></label><label className="field"><span>目标状态</span><Select aria-label="新转换终点" value={edgeTo} disabled={busy} onChange={e=>setEdgeTo(e.target.value)}><option value="">选择目标状态</option>{statusOptions}</Select></label><button type="button" className="primary" disabled={busy||!edgeName.trim()||!edgeTo||workflow.transitions.length>=160} onClick={addTransition}>创建转换</button><p className="wf-muted">只创建当前方向的路径，保存后生效。</p></>}
      </aside></div></div>

    </>}
    {tab==="scheme"&&<div className="workflow-scheme"><label className="field"><span>方案名称</span><input aria-label="工作流方案名称" value={config.workflowScheme.name} maxLength={80} onChange={(e)=>edit((c)=>{c.workflowScheme.name=e.target.value;})}/></label><label className="field"><span>默认工作流<InfoTip label="默认工作流">未单独指定流程的工作类型使用默认工作流。绑定不同流程不会改变类型图标、颜色或所属层级。</InfoTip></span><Select aria-label="默认工作流" value={config.workflowScheme.defaultWorkflowId} onChange={(e)=>edit((c)=>{c.workflowScheme.defaultWorkflowId=e.target.value;})}>{config.workflows.map((w)=><option key={w.id} value={w.id}>{w.name}</option>)}</Select></label><table className="workflow-scheme-table"><thead><tr><th>工作类型</th><th>使用的工作流</th></tr></thead><tbody>{config.types.map((t)=><tr key={t.id}><td><WorkType type={t}/></td><td><Select aria-label={t.name+"绑定工作流"} value={config.workflowScheme.typeMappings[t.id]||""} onChange={(e)=>edit((c)=>{if(e.target.value)c.workflowScheme.typeMappings[t.id]=e.target.value;else delete c.workflowScheme.typeMappings[t.id];})}><option value="">使用默认工作流</option>{config.workflows.map((w)=><option key={w.id} value={w.id}>{w.name}</option>)}</Select></td></tr>)}</tbody></table></div>}
    {tab==="statuses"&&<div><table className="workflow-status-library"><thead><tr><th>状态名称</th><th>类别</th><th>引用</th><th>可用性</th></tr></thead><tbody>{config.statuses.map((s)=><tr key={s.id}><td><input aria-label={s.name+"状态名称"} value={s.name} maxLength={40} onChange={(e)=>edit((c)=>{c.statuses.find((x)=>x.id===s.id).name=e.target.value;})}/></td><td><Select aria-label={s.name+"状态类别"} value={s.category} onChange={(e)=>edit((c)=>{c.statuses.find((x)=>x.id===s.id).category=e.target.value;})}>{Object.entries(progressCategories).map(([key,name])=><option key={key} value={key}>{name}</option>)}</Select></td><td><small>{config.workflows.filter((w)=>w.statusIds.includes(s.id)).length} 个流程 · {items.filter((i)=>i.status===s.id).length} 项</small></td><td><label className="config-toggle"><input type="checkbox" checked={s.enabled} disabled={busy||config.workflows.some((w)=>w.statusIds.includes(s.id))} onChange={(e)=>edit((c)=>{c.statuses.find((x)=>x.id===s.id).enabled=e.target.checked;})}/>启用</label></td></tr>)}</tbody></table><div className="config-add"><input aria-label="新状态名称" placeholder="例如：待验证、设计中" maxLength={40} value={newName} onChange={(e)=>setNewName(e.target.value)}/><Select aria-label="新状态类别" value={newCategory} onChange={(e)=>setNewCategory(e.target.value)}>{Object.entries(progressCategories).map(([key,name])=><option key={key} value={key}>{name}</option>)}</Select><button type="button" disabled={busy||!newName.trim()||config.statuses.length>=40||config.statuses.some((s)=>s.name.trim()===newName.trim())} onClick={()=>{edit((c)=>c.statuses.push({id:uid("status"),name:newName.trim(),category:newCategory,enabled:true}));setNewName("");}}>添加状态</button></div></div>}
    {aiImpacts.length>0&&<div className="workflow-migration-preview" role="alert"><h3>{aiImpacts.length} 个工作项正在启用 AI</h3><p>目标流程缺少执行、验收或完成节点。请补齐协作节点，或先关闭这些工作项的 AI 执行，再保存。</p><p>{aiImpacts.slice(0,5).map(i=>i.title).join("、")}</p></div>}
    {groups.length>0&&<div className="workflow-migration-preview"><h3>保存前迁移状态</h3><p>新流程不包含以下工作项的当前状态，请指定保存后使用的状态。</p>{groups.map((g)=><label key={g.key}><span>{status(g.status)?.name||g.status} → {g.workflow?.name||"未绑定流程"} · {g.items.length} 项</span><Select aria-label={"迁移状态 "+g.key} value={migration[g.key]||""} onChange={(e)=>setMigration((m)=>({...m,[g.key]:e.target.value}))}><option value="">请选择迁移目标</option>{g.workflow?.statusIds.map((id)=><option key={id} value={id}>{status(id)?.name}</option>)}</Select></label>)}</div>}
    <p className="workflow-publish-note">已发布 v{project.workflowRevision||1} · 修改保留在草稿中，发布后统一应用到项目</p>
  </>;
}

export default function WorkflowSettings({project,items,config,setConfig,migration,setMigration,busy,onSave}) {
  const [tab,setTab]=useState("flows"),[query,setQuery]=useState(""),[editor,setEditor]=useState(null),[editorConfig,setEditorConfig]=useState(null),[editorMigration,setEditorMigration]=useState({}),[saving,setSaving]=useState(false),[error,setError]=useState(""),[confirmClose,setConfirmClose]=useState(false),[deleting,setDeleting]=useState(null),[rulesPage,setRulesPage]=useState(false);
  const baseline=useRef(null),dialog=useRef(null),returnFocus=useRef(null);
  useEffect(()=>{if(editor)setError("");},[editorConfig,editorMigration]);
  const editorDirty=!!editorConfig&&JSON.stringify(editorConfig)!==JSON.stringify(baseline.current);
  const working=busy||saving;
  const assigned=id=>config.types.filter(t=>(config.workflowScheme.typeMappings[t.id]||config.workflowScheme.defaultWorkflowId)===id);
  useEffect(()=>{
    if(!editor)return;
    const previous=document.body.style.overflow;document.body.style.overflow="hidden";
    dialog.current?.querySelector("button")?.focus();
    return ()=>{document.body.style.overflow=previous;returnFocus.current?.focus();};
  },[editor?.id]);
  useEffect(()=>{if(!editorDirty)return;const prevent=e=>{e.preventDefault();e.returnValue="";};window.addEventListener("beforeunload",prevent);return()=>window.removeEventListener("beforeunload",prevent);},[editorDirty]);
  useEffect(()=>{if(editor) [...(dialog.current?.querySelectorAll("button")||[])].find(n=>n.getClientRects().length)?.focus();},[rulesPage]);
  useEffect(()=>{if(confirmClose)dialog.current?.querySelector('[role="alertdialog"] button')?.focus();},[confirmClose]);
  function open(id,mode="edit") {
    if(working)return;
    returnFocus.current=document.activeElement;baseline.current=structuredClone(config);
    const draft=structuredClone(config);let target=id;
    if(mode!=="edit") {
      const source=draft.workflows.find(w=>w.id===id),baseName=mode==="copy"?source.name+" 副本":"新工作流";
      let name=baseName,n=2;while(draft.workflows.some(w=>w.name===name))name=baseName+" "+n++;
      target=uid("workflow");
      const initial=draft.statuses.find(s=>s.enabled&&s.category==="todo")||draft.statuses.find(s=>s.enabled);
      draft.workflows.push(mode==="copy"?{...structuredClone(source),id:target,name}:{id:target,name,statusIds:[initial.id],initialStatus:initial.id,transitions:[],rules:{requireReview:false,nodes:{}}});
    }
    setEditorConfig(draft);setEditorMigration({...migration});setRulesPage(false);setEditor({id:target});setError("");setConfirmClose(false);
  }
  function close() {setEditor(null);setEditorConfig(null);setConfirmClose(false);setError("");}
  function requestClose() {if(working)return;if(editorDirty)setConfirmClose(true);else close();}
  async function saveEditor() {
    if(working)return;
    if(!editorDirty){close();return;}
    setSaving(true);setError("");setConfirmClose(false);
    try {await onSave(editorConfig,editorMigration);close();}catch(e){setError(e.message);}finally{setSaving(false);}
  }
  async function saveManagement() {
    if(working)return;setSaving(true);setError("");
    try {await onSave(config,migration);}catch(e){setError(e.message);}finally{setSaving(false);}
  }
  const active=editorConfig?.workflows.find(w=>w.id===editor?.id);
  const rows=config.workflows.filter(w=>w.name.toLowerCase().includes(query.trim().toLowerCase()));
  function trap(e) {
    if(e.key==="Escape"){e.preventDefault();e.stopPropagation();if(confirmClose)setConfirmClose(false);else if(rulesPage)setRulesPage(false);else requestClose();}
    if(e.key==="Tab"){
      const scope=confirmClose?dialog.current.querySelector('[role="alertdialog"]'):dialog.current;
      const nodes=[...scope.querySelectorAll('button:not(:disabled),input:not(:disabled),[tabindex="0"],textarea:not(:disabled),select:not(:disabled)')].filter(n=>n.getClientRects().length);
      const first=nodes[0],last=nodes.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    }
  }
  return <>
    <div className="wf-page-intro"><p>双击工作流进入全屏编辑，保存后应用到项目。</p><span className="wf-draft-badge"><span/>v{project.workflowRevision||1}</span></div>
    <div className="tabs workflow-tabs">{[["flows","工作流"],["scheme","工作流方案"],["statuses","状态库"]].map(([id,name])=><button type="button" key={id} className={tab===id?"active":""} onClick={()=>{setTab(id);setError("");}}>{name}</button>)}</div>
    {error&&!editor&&<p className="settings-error" role="alert">{error}</p>}
    {tab==="flows"?<>
      <div className="wf-list-toolbar"><input aria-label="搜索工作流" placeholder="搜索工作流" value={query} onChange={e=>setQuery(e.target.value)}/><span>{config.workflows.length} 个工作流</span><button type="button" className="primary" disabled={working||config.workflows.length>=20} onClick={()=>open(null,"new")}><Plus size={14}/>新建工作流</button></div>
      <div className="wf-directory"><table><thead><tr><th>工作流名称</th><th>状态</th><th>转换</th><th>关联工作类型</th><th>操作</th></tr></thead><tbody>{rows.map(w=><tr key={w.id} tabIndex={0} aria-label={`工作流 ${w.name}`} onDoubleClick={()=>open(w.id)} onKeyDown={e=>{if(e.target===e.currentTarget&&e.key==="Enter"){e.preventDefault();open(w.id);}}}>
        <td><button type="button" className="wf-directory-name" onClick={e=>{if(e.detail===0)open(w.id);}}><GitBranch size={16}/><span>{w.name}{w.id===config.workflowScheme.defaultWorkflowId&&<small>默认</small>}</span></button></td><td>{w.statusIds.length}</td><td>{w.transitions.length}</td><td><div className="wf-directory-types">{assigned(w.id).length?assigned(w.id).map(t=><WorkType key={t.id} type={t}/>):<span className="wf-muted">尚未关联</span>}</div></td><td><div className="wf-row-actions" onDoubleClick={e=>e.stopPropagation()}><button type="button" disabled={working} onClick={()=>open(w.id)}>编辑</button><button type="button" aria-label={`复制工作流 ${w.name}`} disabled={working||config.workflows.length>=20} onClick={()=>open(w.id,"copy")}><Copy size={14}/></button><button type="button" aria-label={`删除工作流 ${w.name}`} title={assigned(w.id).length?"请先在工作流方案中解除绑定":"删除工作流"} disabled={working||!!assigned(w.id).length||w.id===config.workflowScheme.defaultWorkflowId} onClick={()=>{setDeleting(w);setError("");}}><Trash2 size={14}/></button></div></td>
      </tr>)}</tbody></table>{!rows.length&&<p className="wf-directory-empty">没有找到匹配的工作流。</p>}</div>
    </>:<><WorkflowEditor key={tab} project={project} items={items} config={config} setConfig={setConfig} migration={migration} setMigration={setMigration} busy={working} initialTab={tab} fullscreen/><div className="settings-save"><button type="button" className="primary" disabled={working||JSON.stringify(config)===JSON.stringify(project.workConfig)} onClick={saveManagement}>{saving?"正在保存…":"保存更改"}</button></div></>}
    {editor&&createPortal(<div className="wf-fullscreen" role="dialog" aria-modal="true" aria-label="全屏编辑工作流" ref={dialog} onKeyDown={trap}>
      <div className="wf-fullscreen-content" inert={confirmClose?true:undefined}>
      {rulesPage && <CollaborationRulesPage workflow={active} config={editorConfig} onCancel={()=>setRulesPage(false)} onApply={rules=>{setEditorConfig(c=>({...c,workflows:c.workflows.map(w=>w.id===editor.id?{...w,rules}:w)}));setRulesPage(false);}}/>}
      <div className="wf-flow-page" hidden={rulesPage}>
        <header className="wf-fullscreen-header"><button type="button" aria-label="返回工作流列表" disabled={working} onClick={requestClose}><X size={18}/></button><div><span>工作流编辑</span><h1>{active?.name || "未命名工作流"}</h1></div><span className={"wf-draft-badge"+(editorDirty?" changed":"")}><span/>{editorDirty?"有未保存的修改":"已保存"}</span><button type="button" className="primary" disabled={working} onClick={saveEditor}>{saving?"正在保存…":"保存并返回"}</button></header>
        <div className="wf-fullscreen-body" role="region" aria-label="工作流编辑区域">{error&&<div className="settings-error" role="alert">{error}</div>}<WorkflowEditor project={project} items={items} config={editorConfig} setConfig={setEditorConfig} migration={editorMigration} setMigration={setEditorMigration} busy={working} initialWorkflowId={editor.id} fullscreen/></div>
        <footer className="wf-fullscreen-footer"><button type="button" className="wf-rules-entry" onClick={()=>setRulesPage(true)}>HeySO 协作规则<ArrowRight size={14}/></button><button type="button" disabled={working} onClick={requestClose}>取消</button><button type="button" className="primary" disabled={working} onClick={saveEditor}>{saving?"正在保存…":"保存并返回"}</button></footer>
      </div>
      </div>
      {confirmClose&&<div className="wf-close-overlay"><section role="alertdialog" aria-modal="true" aria-labelledby="wf-close-title" aria-describedby="wf-close-description"><h2 id="wf-close-title">保存工作流修改？</h2><p id="wf-close-description">此工作流还有未保存的修改。可以保存后返回，或放弃本次编辑。</p><div><button type="button" onClick={()=>setConfirmClose(false)}>继续编辑</button><button type="button" onClick={close}>放弃修改</button><button type="button" className="primary" onClick={saveEditor}>保存并返回</button></div></section></div>}
    </div>,document.body)}
    {deleting&&<div className="wf-close-overlay" role="alertdialog" aria-modal="true" aria-label="删除工作流"><section><h2>删除「{deleting.name}」？</h2><p>此工作流没有关联工作类型，删除不会移除工作项。</p>{error&&<p className="settings-error">{error}</p>}<div><button type="button" disabled={working} onClick={()=>setDeleting(null)}>取消</button><button type="button" disabled={working} onClick={async()=>{setSaving(true);try{const next=structuredClone(config);next.workflows=next.workflows.filter(w=>w.id!==deleting.id);await onSave(next,migration);setDeleting(null);}catch(e){setError(e.message);}finally{setSaving(false);}}}>删除工作流</button></div></section></div>}
  </>;
}

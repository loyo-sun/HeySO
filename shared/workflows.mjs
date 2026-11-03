export const progressCategories = { todo: "待办", in_progress: "进行中", done: "完成" };
export const collaborationNodes = { todo: "待开始", active: "执行中", blocked: "阻塞", review: "待验收", done: "已完成", cancelled: "已取消" };
export const progressCategory = (project, status) => project?.workConfig?.statuses.find((s) => s.id === status)?.category;
export const workflowFor = (project, kind) => {
  const c = project?.workConfig; if(!c?.workflowScheme) return undefined; const id = c.workflowScheme.typeMappings[kind] || c.workflowScheme.defaultWorkflowId;
  return c.workflows.find((w) => w.id === id);
};
export const workflowStatuses = (project, kind) => { const w = workflowFor(project, kind); return (w?.statusIds || []).map((id) => project.workConfig.statuses.find((s) => s.id === id)).filter((s) => s?.enabled); };
export const workflowAllows = (project, from, to, kind) => { const w = workflowFor(project, kind); return !!w && w.statusIds.includes(to) && (from === to || w.transitions.some((t) => (t.from === from || t.from === "*") && t.to === to)); };
export const aiReady = (workflow) => { const ids = ["active", "review", "done"].map(key=>workflow?.rules?.nodes?.[key]); return new Set(ids).size === 3 && ids.every(id=>id && workflow?.statusIds.includes(id)); };
export function workflowStage(project, status, kind) {
  const w = workflowFor(project, kind), nodes = w?.rules?.nodes || {};
  for (const key of ["cancelled", "review", "blocked", "backlog", "todo", "active", "done"]) if (nodes[key] === status) return key;
  return {todo:"todo",in_progress:"active",done:"done"}[progressCategory(project,status)] || status;
}
export function workflowNode(project, stage, kind) {
  const w = workflowFor(project, kind), mapped = w?.rules?.nodes?.[stage];
  if (mapped && w.statusIds.includes(mapped)) return mapped;
  if (["blocked", "review", "cancelled"].includes(stage)) return undefined;
  const category = ["todo", "backlog"].includes(stage) ? "todo" : stage === "done" ? "done" : "in_progress";
  return workflowStatuses(project,kind).find((s) => s.category === category)?.id;
}
export const boardStatuses = (project) => {
  const ids = new Set(project.workConfig.types.filter((t) => t.enabled && t.level === 0).flatMap((t) => workflowFor(project,t.id)?.statusIds || []));
  return project.workConfig.statuses.filter((s) => s.enabled && ids.has(s.id));
};
export function upgradeWorkflowConfig(input, legacy = false) {
  if(input.workflowVersion === 2) return structuredClone(input);
  const c=structuredClone(input), old=structuredClone(c.statuses);
  const stageCategory = (stage) => ["backlog","todo"].includes(stage)?"todo":["done","cancelled"].includes(stage)?"done":"in_progress";
  c.statuses=c.statuses.map((s)=>({...s,category: Object.hasOwn(progressCategories,s.category)?s.category:stageCategory(s.category)}));
  const choose = (stage) => old.find((s)=>s.enabled && s.id===stage)?.id || old.find((s)=>s.enabled && s.category===stage)?.id;
  const todo=choose("todo")||c.statuses.find((s)=>s.enabled&&s.category==="todo")?.id;
  const active=choose("active")||c.statuses.find((s)=>s.enabled&&s.category==="in_progress")?.id;
  const done=choose("done")||c.statuses.find((s)=>s.enabled&&s.category==="done")?.id;
  const review=choose("review"),blocked=choose("blocked"),cancelled=choose("cancelled");
  const edge=(name,from,to,n)=>({id:"transition_"+n,name,from,to});
  const basic={id:"standard",name:"标准工作流",statusIds:[todo,active,done].filter(Boolean),initialStatus:todo,rules:{requireReview:false,nodes:{todo,active,done}},transitions:[edge("开始处理",todo,active,1),edge("完成",active,done,2),edge("直接完成",todo,done,3),edge("重新打开",done,active,4),edge("退回待办",active,todo,5)].filter((t)=>t.from&&t.to)};
  c.workflows=[basic];
  if(review&&active&&done) {
    const delivery={id:"delivery",name:"交付验收工作流",statusIds:[todo,active,blocked,review,done,cancelled].filter(Boolean),initialStatus:todo,rules:{requireReview:true,nodes:{todo,active,review,done,...(blocked?{blocked}:{}),...(cancelled?{cancelled}:{})}},transitions:[edge("开始执行",todo,active,1),edge("提交验收",active,review,2),edge("验收通过",review,done,3),edge("要求修改",review,active,4),edge("提交人工交付",todo,review,5),edge("退回待办","*",todo,6)]};
    if(blocked) delivery.transitions.push(edge("遇到阻塞",active,blocked,7),edge("恢复执行",blocked,active,8));
    if(cancelled) delivery.transitions.push(edge("取消","*",cancelled,9));
    c.workflows.push(delivery);
  }
  let defaultId="standard";
  if(legacy) {
    const statusIds=old.filter((s)=>s.enabled).map((s)=>s.id),nodes={};
    for(const stage of ["backlog","todo","active","blocked","review","done","cancelled"]){const id=choose(stage); if(id)nodes[stage]=id;}
    let seq=0;
    c.workflows.unshift({id:"legacy",name:"原有协作工作流",statusIds,initialStatus:c.initialStatus||statusIds[0],rules:{requireReview:true,nodes},transitions:Object.entries(c.transitions||{}).flatMap(([from,targets])=>targets.filter((to)=>statusIds.includes(from)&&statusIds.includes(to)).map((to)=>edge(c.statuses.find((s)=>s.id===to)?.name||"转换",from,to,++seq)))});
    defaultId="legacy";
  }
  c.workflowVersion=2; c.workflowScheme={name:"项目工作流方案",defaultWorkflowId:defaultId,typeMappings:{}};
  delete c.initialStatus; delete c.transitions;
  return c;
}
export function workflowMigrationGroups(project, items, nextConfig) {
  const target={...project,workConfig:nextConfig}, groups=new Map();
  for(const item of items.filter((i)=>i.projectId===project.id)) {
    const w=workflowFor(target,item.kind);
    if(!w||!w.statusIds.includes(item.status)||!nextConfig.statuses.some((s)=>s.id===item.status&&s.enabled)) {
      const key=(w?.id||"missing")+"::"+item.status;
      if(!groups.has(key))groups.set(key,{key,workflow:w,status:item.status,items:[]}); groups.get(key).items.push(item);
    }
  }
  return [...groups.values()];
}
export function validateWorkflows(c,bad) {
  const validId=(id)=>typeof id==="string"&&/^[a-z][a-z0-9_]{0,47}$/.test(id)&&!["constructor","prototype"].includes(id);
  if(c.workflowVersion!==2||!Array.isArray(c.workflows)||!c.workflows.length||c.workflows.length>20||!c.workflowScheme||typeof c.workflowScheme.typeMappings!=="object"||!c.workflowScheme.typeMappings)bad("工作流配置格式无效，请刷新到最新版本");
  if(new Set(c.workflows.map((w)=>w.id)).size!==c.workflows.length||new Set(c.workflows.map((w)=>w.name?.trim())).size!==c.workflows.length)bad("工作流标识和名称不能重复");
  for(const s of c.statuses)if(!Object.hasOwn(progressCategories,s.category))bad("状态类别只能是待办、进行中或完成");
  for(const w of c.workflows) {
    if(!validId(w.id)||typeof w.name!=="string"||!w.name.trim()||w.name.length>80||!Array.isArray(w.statusIds)||!w.statusIds.length||new Set(w.statusIds).size!==w.statusIds.length||w.statusIds.some((id)=>!c.statuses.some((s)=>s.id===id&&s.enabled)))bad("工作流需有名称，且只能使用启用的状态");
    if(!w.statusIds.includes(w.initialStatus))bad("初始状态必须属于当前工作流");
    if(!Array.isArray(w.transitions)||w.transitions.length>160||new Set(w.transitions.map((t)=>t.id)).size!==w.transitions.length)bad("状态转换格式或数量无效");
    for(const t of w.transitions)if(!validId(t.id)||typeof t.name!=="string"||!t.name.trim()||t.name.length>80||(t.from!=="*"&&!w.statusIds.includes(t.from))||!w.statusIds.includes(t.to))bad("转换需有名称，起点和终点必须属于当前工作流");
    if(w.positions && (typeof w.positions !== "object" || Array.isArray(w.positions) || Object.entries(w.positions).some(([id,p])=>!w.statusIds.includes(id)||!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>4000||p.y<0||p.y>4000)))bad("流程图节点位置无效");
    if(w.rules&&typeof w.rules.requireReview!=="boolean")bad("人工验收规则无效");
    for(const [key,id] of Object.entries(w.rules?.nodes||{}))if(id&&(!["backlog",...Object.keys(collaborationNodes)].includes(key)||!w.statusIds.includes(id)))bad("协作节点必须属于当前工作流");
    for(const [key,id] of Object.entries(w.rules?.nodes||{}))if(id){const expected=["todo","backlog"].includes(key)?"todo":["done","cancelled"].includes(key)?"done":"in_progress";if(c.statuses.find((s)=>s.id===id)?.category!==expected)bad("协作节点的状态类别不匹配："+key);}
    const boundRoles=Object.values(w.rules?.nodes||{}).filter(Boolean);
    if(new Set(boundRoles).size!==boundRoles.length)bad("不同协作节点必须绑定不同状态，避免执行、验收或取消阶段混淆");
    if(w.rules?.requireReview&&(!aiReady(w)||!w.transitions.some((t)=>(t.from===w.rules.nodes.review||t.from==="*")&&t.to===w.rules.nodes.done)))bad("开启人工验收需要执行、验收、完成节点，以及验收到完成的转换");
  }
  if(typeof c.workflowScheme.name!=="string"||!c.workflowScheme.name.trim()||c.workflowScheme.name.length>80||!c.workflows.some((w)=>w.id===c.workflowScheme.defaultWorkflowId))bad("请选择有效的默认工作流");
  for(const [kind,id] of Object.entries(c.workflowScheme.typeMappings))if(!c.types.some((t)=>t.id===kind)||!c.workflows.some((w)=>w.id===id))bad("工作类型与工作流映射无效");
  if(Object.hasOwn(c,"initialStatus")||Object.hasOwn(c,"transitions"))bad("初始状态和转换必须配置在各自工作流内");
}

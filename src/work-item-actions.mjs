import { sprintReadOnlyReason, aiExecutionEnabled, typeNames, isWorkItem, isExecutionItem, runTargetId, categoryOf, allowedTransition, workflowFor, workflowStatuses } from "../shared/work-config.mjs";

export function workItemEntries({ item: i, snapshot = false, project, data, handlers: h }) {
  const items = data.items.filter((x) => x.projectId === project.id);
  const live = items.find((x) => x.id === i.id);
  const code = i.number ? `${project.code}-${i.number}` : i.id;
  const copy = {label:"复制", children:[
    {label:"复制编号", run:() => h.copy(code)},
    {label:"复制标题", run:() => h.copy(i.title)},
    {label:"复制编号与标题", run:() => h.copy(`${code} ${i.title}`)},
  ]};
  if (snapshot) return [
    {label:"查看历史快照", run:() => h.snapshot(i)},
    {label:"查看当前工作项", disabled:!live, reason:!live ? "当前工作项已删除" : "", run:() => h.open(live)},
    copy,
  ];
  if (!live) return [{label:"工作项已删除", disabled:true}];
  const readOnlyReason = sprintReadOnlyReason(live,items,data.sprints,project);
  if (readOnlyReason) return [
    {label:"查看详情（只读）",run:()=>h.open(live)},
    {label:"已完成冲刺 · 只读",disabled:true,reason:readOnlyReason},
    copy,
  ];
  const update = (patch) => h.update(i.id, patch);
  const choice = (label, value, current, field) => ({label, checked:value === current, run:() => update({[field]:value})});
  const group = (label, children, separator = false) => ({label, children, separator, searchable:["设置负责人","安排到 Sprint","安排到版本"].includes(label), disabled:!children.length, reason:!children.length ? "暂无可用选项" : ""});
  const standard = isWorkItem(i, project);
  const executable = isExecutionItem(i, project);
  const statuses = workflowStatuses(project, i.kind).filter((s) => s.id !== i.status && s.enabled && allowedTransition(project, i.status, s.id, i.kind));
  const entries = [
    {label:"查看详情", run:() => h.open(i)},
    {label:"编辑内容与日期…", run:() => h.edit(i)},
    group("修改状态", statuses.map((s) => {
      const reviewRequired = executable && workflowFor(project, i.kind).rules?.requireReview && categoryOf(project, s.id, i.kind) === "done" && categoryOf(project, i.status, i.kind) !== "done";
      return {...choice(s.name,s.id,i.status,"status"), disabled:reviewRequired, reason:reviewRequired ? "请通过人工验收完成" : ""};
    })),
    group("设置负责人", project.members.map((m) => choice(m,m,i.owner,"owner"))),
    group("设置优先级", Object.entries({high:"高",medium:"中",low:"低"}).map(([v,n]) => choice(n,v,i.priority,"priority"))),
  ];
  if (standard) {
    entries.push(group("安排到 Sprint", [choice("移回产品待办池（清除 Sprint）",null,i.sprintId,"sprintId"), ...data.sprints.filter((s) => s.projectId === project.id && s.status !== "closed").map((s) => choice(s.name,s.id,i.sprintId,"sprintId"))], true));
    entries.push(group("安排到版本", [choice("移出当前版本（清除版本）",null,i.releaseId,"releaseId"), ...data.releases.filter((r) => r.projectId === project.id && !r.archived && r.status !== "released").map((r) => choice(r.name,r.id,i.releaseId,"releaseId"))]));
    entries.push(group("设置故事点", [0,1,2,3,5,8,13,21,34].map((n) => choice(n ? String(n) : "未估算", n, i.points || 0,"points"))));
  }
  if (items.some((x) => x.parentId === i.id) && h.toggleBranch) entries.push({label:h.collapsed ? "展开当前分支" : "收起当前分支",run:() => h.toggleBranch(i.id)});
  if (executable) {
    entries.push({label:"查看交付与验收",run:() => h.deliveries(i),separator:true});
    if (aiExecutionEnabled(i,items) && h.instruction) entries.push({label:"复制 AI 执行指令",run:() => h.instruction(i)});
    if (categoryOf(project,i.status,i.kind) === "review" && h.review) entries.push({label:"进入人工验收…",run:() => h.review(i)});
  }
  const reason = items.some((x) => x.parentId === i.id) ? "已有子项，请先处理子项" : data.runs.some((r) => runTargetId(r) === i.id || r.storyId === i.id) ? "已有执行记录，需保留历史" : data.sprints.some((s) => s.baseline?.some((x) => x.id === i.id)) ? "已纳入冲刺基线，需保留历史" : "";
  entries.push({...copy, separator:true}, {label:"删除工作项…",danger:true,disabled:!!reason,reason,run:() => h.remove(i)});
  return entries;
}

export function executionInstruction(project, i) {
  const cloud = project.cloud ? `\n云端 MCP：${project.cloud.base}/mcp/heyso\n云文件 fileId：${project.cloud.fileId}\n对该项目调用工具时均携带上述 fileId；update_progress 也要提供唯一 requestId，重试复用。` : "";
  return `请执行 HeySO 项目「${project.name}」中的${typeNames(project)[i.kind]}「${i.title}」。\n项目 ID：${project.id}\n条目 ID：${i.id}${cloud}\n\n先使用 get_story_context 获取最新目标、验收标准、项目约定及审核意见。所有执行调用均使用上述条目 ID 作为 itemId；若为子任务，不要替换为父级 ID，storyVersion 使用上下文中的 story.contentVersion，itemVersion 使用 targetTask.contentVersion（非子任务则使用 story.contentVersion）。\n执行前调用 update_progress，显式传入 status="active"，将目标工作项更新为执行中，并保留返回的 run.id 作为后续 runId。遇到阻塞时再次调用 update_progress，传入 status="blocked" 和具体原因；解除阻塞后传入 status="active" 继续同一次执行。每次进展更新使用唯一 requestId，重试复用它。需要时在授权范围内使用你自己的文件、终端、Git 等工具。\n完成实现和验证后，必须调用 submit_result 提交成果说明、可访问的成果链接与验证结果，携带同一 itemId、runId、读取到的 story.contentVersion 及唯一 requestId，重试复用它，将目标工作项更新为待验收。子任务的执行记录、交付成果和验收仅归属该子任务，不改变父级或其他子任务的状态。不能只在聊天中宣告完成。\n提交成功后，再次调用 get_story_context 回读核对：子任务检查 targetTask.status，其他执行层工作项检查 story.status，确认已进入其工作流的验收节点，并在回复中说明实际状态。若状态未更新、工具失败或工作流缺少节点或转换，明确报告原因及待处理事项，不得宣称状态已更新。不要自行改动验收标准，也不要将目标工作项或父级标记为已完成；已完成由人工验收决定。`;
}

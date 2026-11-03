import { typeNames, isWorkItem, categoryOf, allowedTransition, workflowFor, workflowStatuses } from "../shared/work-config.mjs";

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
  const update = (patch) => h.update(i.id, patch);
  const choice = (label, value, current, field) => ({label, checked:value === current, run:() => update({[field]:value})});
  const group = (label, children, separator = false) => ({label, children, separator, searchable:["设置负责人","安排到 Sprint","安排到版本"].includes(label), disabled:!children.length, reason:!children.length ? "暂无可用选项" : ""});
  const standard = isWorkItem(i, project);
  const statuses = workflowStatuses(project, i.kind).filter((s) => s.id !== i.status && s.enabled && allowedTransition(project, i.status, s.id, i.kind));
  const entries = [
    {label:"查看详情", run:() => h.open(i)},
    {label:"编辑内容与日期…", run:() => h.edit(i)},
    group("修改状态", statuses.map((s) => {
      const reviewRequired = standard && workflowFor(project, i.kind).rules?.requireReview && categoryOf(project, s.id, i.kind) === "done" && categoryOf(project, i.status, i.kind) !== "done";
      return {...choice(s.name,s.id,i.status,"status"), disabled:reviewRequired, reason:reviewRequired ? "请通过人工验收完成" : ""};
    })),
    group("设置负责人", project.members.map((m) => choice(m,m,i.owner,"owner"))),
    group("设置优先级", Object.entries({high:"高",medium:"中",low:"低"}).map(([v,n]) => choice(n,v,i.priority,"priority"))),
  ];
  if (standard) {
    entries.push(group("安排到 Sprint", [choice("移回产品待办池（清除 Sprint）",null,i.sprintId,"sprintId"), ...data.sprints.filter((s) => s.projectId === project.id && s.status !== "closed").map((s) => choice(s.name,s.id,i.sprintId,"sprintId"))], true));
    entries.push(group("安排到版本", [choice("移出当前版本（清除版本）",null,i.releaseId,"releaseId"), ...data.releases.filter((r) => r.projectId === project.id && r.status !== "released").map((r) => choice(r.name,r.id,i.releaseId,"releaseId"))]));
    entries.push(group("设置故事点", [0,1,2,3,5,8,13,21,34].map((n) => choice(n ? String(n) : "未估算", n, i.points || 0,"points"))));
  }
  if (items.some((x) => x.parentId === i.id) && h.toggleBranch) entries.push({label:h.collapsed ? "展开当前分支" : "收起当前分支",run:() => h.toggleBranch(i.id)});
  if (standard) {
    entries.push({label:"查看交付与验收",run:() => h.deliveries(i),separator:true});
    if (i.aiEnabled && h.instruction) entries.push({label:"复制 AI 执行指令",run:() => h.instruction(i)});
    if (categoryOf(project,i.status,i.kind) === "review" && h.review) entries.push({label:"进入人工验收…",run:() => h.review(i)});
  }
  const reason = items.some((x) => x.parentId === i.id) ? "已有子项，请先处理子项" : data.runs.some((r) => r.storyId === i.id) ? "已有执行记录，需保留历史" : data.sprints.some((s) => s.baseline?.some((x) => x.id === i.id)) ? "已纳入冲刺基线，需保留历史" : "";
  entries.push({...copy, separator:true}, {label:"删除工作项…",danger:true,disabled:!!reason,reason,run:() => h.remove(i)});
  return entries;
}

export function executionInstruction(project, i) {
  const cloud = project.cloud ? `\n云端 MCP：${project.cloud.base}/mcp/heyso\n云文件 fileId：${project.cloud.fileId}\n对该项目调用工具时均携带上述 fileId；update_progress 也要提供唯一 requestId，重试复用。` : "";
  return `请执行 HeySO 项目「${project.name}」中的${typeNames(project)[i.kind]}「${i.title}」。\n项目 ID：${project.id}\n条目 ID：${i.id}${cloud}\n\n先使用 get_story_context 获取最新目标、验收标准、项目约定及审核意见。执行前调用 update_progress 并保留 runId。需要时在授权范围内使用你自己的文件、终端、Git 等工具。遇到阻塞请记录原因。完成后通过 submit_result 提交成果说明、可访问的成果链接与验证结果，使用唯一 requestId，重试时复用它。提交时携带读取到的 story.contentVersion。不要自行改动验收标准或标记故事完成，等待人工验收。`;
}

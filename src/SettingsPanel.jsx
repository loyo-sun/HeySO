import { memberRole, rolesForMembers, defaultMemberRole } from "../shared/member-roles.mjs";
import React, { useState, useEffect, useRef } from "react";
import { Settings, Users, ListChecks, Plug, Database, Download, Upload, Plus, X, ArrowUpRight, Trash2, RefreshCw, CheckCircle2, AlertCircle, Layers, GitBranch, Rows3 } from "lucide-react";
import { DateFields } from "./Schedule.jsx";
import Select from "./Select.jsx";
import InfoTip from "./InfoTip.jsx";
import "./settings.css";
import WorkConfigSettings from "./WorkConfigSettings.jsx";
import { configFor, checkWorkConfig, hierarchyConflicts, workflowMigrationGroups, workflowFor, aiReady } from "../shared/work-config.mjs";

export const settingsPages = [
  ["general", "常规", Settings], ["members", "成员", Users], ["roles", "角色", Users],
  ["types", "工作项类型", Layers], ["hierarchy", "层级关系", GitBranch],
  ["states", "工作流", Rows3], ["workflow", "协作约定", ListChecks], ["integrations", "AI 与 MCP", Plug],
  ["data", "数据与备份", Database],
];
export const settingsDescriptions = {
  general: "管理项目的基本信息、目标和背景。",
  members: "维护项目成员、分配角色与指定项目负责人。",
  roles: "独立维护项目角色，供成员选择。",
  types: "定义工作项类型，按项目需要启用或添加类型。",
  hierarchy: "确定每种类型可以归属哪些父级。",
  states: "自定义流程、复用状态，并按工作类型绑定。",
  workflow: "明确协作方式与所有故事共同遵循的交付标准。",
  integrations: "检查本地服务，配置外部 AI 工具的连接。",
  data: "导出、检查和恢复本地工作空间数据。",
};
const settingsHelp = {
  general: "项目目标与背景会提供给 AI。所有工作项日期须在项目周期内；缩短周期前需处理超出范围的工作项。",
  members: "成员通过下拉选择项目中已创建的角色。角色在角色页面独立维护。成员角色用于记录职责，不改变访问权限；当前在线项目由云账号所有者访问。",
  roles: "创建、重命名角色并维护职责说明。修改角色名称会同步到关联成员；已分配给成员的角色须先重新分配后才能删除。默认成员角色始终保留。",
  types: "编辑类型名称、图标、颜色和可用性。归档仅收起创建入口，已有工作项保留；仍有数据的类型不能停用。类型所属层级在层级关系中设置。",
  hierarchy: "将工作类型放入层级分组，同层类型并列。默认结构是 Epic、标准工作项、子任务；故事、任务和缺陷在标准层并列。具体工作项的父子关系在工作项详情或工作项层级中设置。\n拖入归档区仅收起类型创建入口，不改变已有工作项。恢复默认和智能推荐只生成草稿，保存后生效。历史数据需要的扩展层会保留；有冲突时禁止保存。",
  states: "状态库中的状态归入待办、进行中或完成三种类别。每个工作流独立配置初始状态和单向转换，通过工作流方案映射到工作类型。可新建或复制流程，拖动节点调整图示位置。双击工作流列表进入全屏编辑，保存后应用；如新流程不包含现有状态，须先选择迁移目标。人工验收是 HeySO 的可选扩展规则。",
  workflow: "协作约定和完成定义随工作项上下文提供给 AI，与工作项自身的验收标准共同约束交付。",
  integrations: "AI 通过 MCP 读取上下文、报告进展和提交成果。服务正常表示 HeySO 已就绪，外部 AI 工具仍需单独配置。密钥作用于整个本地工作空间，只交给信任的工具。",
  data: "备份与恢复覆盖整个本地工作空间，包含所有项目。备份不包含 MCP 密钥及交付链接对应的外部文件。",
};
const groups = {
  general: ["name", "description", "goal", "startDate", "endDate"],
  members: ["owner", "members", "memberRoles"],
  roles: ["roles"],
  workflow: ["definitionOfDone", "workingAgreements"],
};
const keys = Object.values(groups).flat();
const same = (a, b) => JSON.stringify(a ?? "") === JSON.stringify(b ?? "");
const countNames = { projects: "项目", items: "需求与任务", sprints: "冲刺", releases: "版本", notes: "项目记忆", runs: "执行与交付", events: "活动记录" };
function Field({ label, children, hint }) {
  return <label className="field"><span className="field-title">{label}{hint && <InfoTip label={label}>{hint}</InfoTip>}</span>{children}</label>;
}
export default function SettingsPanel({
  project, section, action, data, setData, setToast, busy, onConnect, onDelete, onDirtyChange, cloudPanel,
}) {
  const [form, setForm] = useState(project);
  const [workDraft, setWorkDraft] = useState(() => structuredClone(configFor(project)));
  const [statusMigration, setStatusMigration] = useState({});
  const [member, setMember] = useState("");
  const [newMemberRole, setNewMemberRole] = useState(defaultMemberRole);
  const [roleName, setRoleName] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [service, setService] = useState({ state: "idle" });
  const [connecting, setConnecting] = useState(false);
  const [restore, setRestore] = useState(null);
  const [checkingFile, setCheckingFile] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const base = useRef(project);
  const request = useRef(0);
  const restoreLock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; request.current++; }, []);
  useEffect(() => {
    const previous = base.current;
    base.current = project;
    setWorkDraft((draft) => previous.id !== project.id || same(draft, configFor(previous)) ? structuredClone(configFor(project)) : draft);
    if (previous.id !== project.id) {
      setForm(project); setStatusMigration({}); setMember(""); setRoleName(""); setNewMemberRole(defaultMemberRole); setRestore(null); setError(""); setSaved("");
    } else {
      setForm((draft) => ({
        ...project,
        ...Object.fromEntries(keys.filter((key) => !same(draft[key], previous[key])).map((key) => [key, draft[key]])),
      }));
    }
  }, [project]);
  useEffect(() => { setError(""); setSaved(""); }, [section]);
  const dirtyKeys = keys.filter((key) => !same(form[key], project[key]));
  const configDirty = !same(workDraft, configFor(project));
  const conflicts = hierarchyConflicts(project, data.items, workDraft);
  const pendingWorkflowMigrations = workflowMigrationGroups(project, data.items, workDraft).filter((g) => !g.workflow?.statusIds.includes(statusMigration[g.key]));
  const aiWorkflowConflicts = data.items.filter(i => i.projectId === project.id && i.aiEnabled && !aiReady(workflowFor({...project,workConfig:workDraft},i.kind)));
  const dirty = dirtyKeys.length > 0 || !!member.trim() || newMemberRole !== defaultMemberRole || !!roleName.trim() || configDirty;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  useEffect(() => {
    if (section === "integrations") checkService();
  }, [section]);
  const change = (key, value) => { setForm((old) => ({ ...old, [key]: value })); setError(""); setSaved(""); };
  const field = (key) => ({ value: form[key] || "", maxLength: 20000, onChange: (e) => change(key, e.target.value) });
  const changed = (sectionKey) => groups[sectionKey]?.some((key) => !same(form[key], project[key]));
  const reset = (sectionKey) => {
    setForm((old) => ({ ...old, ...Object.fromEntries(groups[sectionKey].map((key) => [key, project[key]])) }));
    if (sectionKey === "members") { setMember(""); setNewMemberRole(defaultMemberRole); }
    if (sectionKey === "roles") setRoleName("");
    setError(""); setSaved("");
  };
  async function save(sectionKey) {
    if (busy || restoring) return;
    setError(""); setSaved("");
    if (sectionKey === "roles" && roleName.trim()) { setError("请先添加角色，或清空新角色名称后再保存。"); return; }
    const selected = groups[sectionKey];
    const result = await action("project.update", {
      id: project.id, ...Object.fromEntries(selected.map((key) => [key, form[key] ?? ""])),
    }, true);
    if (!mounted.current) return;
    if (result) {
      setForm((old) => ({ ...old, ...Object.fromEntries(selected.map((key) => [key, result[key]])) }));
      setSaved("更改已保存"); setToast("项目设置已保存");
    } else setError("保存未完成，已保留你的修改。请根据提示调整后重试。");
  }
  function saveBar(sectionKey, label) {
    const hasChanges = changed(sectionKey);
    const hasDraft = hasChanges || (sectionKey === "members" && (!!member.trim() || newMemberRole !== defaultMemberRole)) || (sectionKey === "roles" && !!roleName.trim());
    return <div className="settings-save">
      <button className="primary" type="submit" disabled={busy || !hasChanges}>{busy ? "正在保存…" : label}</button>
      <button type="button" disabled={busy || !hasDraft} onClick={() => reset(sectionKey)}>撤销修改</button>
      <span>{hasDraft ? "有未保存的修改" : "已与项目数据同步"}</span>
    </div>;
  }
  async function saveWorkflowConfig(nextConfig, nextMigration = {}) {
    checkWorkConfig(nextConfig);
    if (hierarchyConflicts(project, data.items, nextConfig).length) throw Error("请先处理现有工作项与新层级的冲突。");
    if (data.items.some(i => i.projectId === project.id && i.aiEnabled && !aiReady(workflowFor({...project,workConfig:nextConfig},i.kind)))) throw Error("请先补齐 AI 协作节点，或关闭受影响工作项的 AI 执行。");
    if (workflowMigrationGroups(project, data.items, nextConfig).some(g => !g.workflow?.statusIds.includes(nextMigration[g.key]))) throw Error("请选择所有受影响工作项的迁移状态后再保存。");
    const result = await action("project.workConfig", { id: project.id, config: nextConfig, statusMigration: nextMigration }, true);
    if (!result) throw Error("保存未完成，修改已保留，请根据提示重试。");
    setWorkDraft(structuredClone(result.workConfig)); setStatusMigration({}); setError(""); setSaved("工作流已保存"); setToast("工作流已保存");
    return result.workConfig;
  }
  async function checkService() {
    setService({ state: "checking" });
    try {
      const response = await fetch("/api/health", { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw Error();
      const result = await response.json();
      if (result.status !== "ok") throw Error();
      if (mounted.current) setService({ state: "ready", version: result.version, tools: result.tools, checkedAt: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) });
    } catch {
      if (mounted.current) setService({ state: "error" });
    }
  }
  async function selectBackup(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const seq = ++request.current;
    setRestore(null); setConfirmation(""); setError(""); setCheckingFile(true);
    try {
      if (file.size > 5 * 1024 * 1024) throw Error("备份文件不能超过 5 MB。");
      let state;
      try { state = JSON.parse(await file.text()); } catch { throw Error("无法读取 JSON，请选择 HeySO 导出的备份文件。"); }
      const response = await fetch("/api/restore/preview", {
        method: "POST", headers: { "Content-Type": "application/json", "X-HeySO-Client": "local-ui" },
        body: JSON.stringify({ state }), signal: AbortSignal.timeout(10000),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "备份检查失败");
      if (seq === request.current) setRestore({ state, preview: result, filename: file.name });
    } catch (e) {
      if (seq === request.current) setError(e.name === "TimeoutError" ? "检查超时，请确认本地服务正常后重试。" : e.message);
    } finally {
      if (seq === request.current) setCheckingFile(false);
    }
  }
  async function restoreBackup() {
    if (!restore || confirmation !== "恢复" || restoreLock.current || busy || dirty) return;
    restoreLock.current = true; setRestoring(true); setError("");
    try {
      const response = await fetch("/api/restore", {
        method: "POST", headers: { "Content-Type": "application/json", "X-HeySO-Client": "local-ui" },
        body: JSON.stringify({ state: restore.state, revision: restore.preview.revision }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "恢复未完成");
      setData(result.state);
      const restoredProject = result.state.projects.find((p) => p.id === project.id);
      if (restoredProject) { setForm(restoredProject); base.current = restoredProject; setWorkDraft(structuredClone(configFor(restoredProject))); setStatusMigration({}); }
      onDirtyChange?.(false); setRestore(null); setConfirmation(""); setToast("工作空间备份已恢复"); setSaved("备份已恢复");
    } catch (e) { if (mounted.current) setError(e.message); }
    finally { restoreLock.current = false; if (mounted.current) setRestoring(false); }
  }
  const title = settingsPages.find((p) => p[0] === section)?.[1];
  return <div className={"settings-content" + (section === "states" ? " workflow-settings-content" : "")}>
    <div className="settings-heading"><div className="heading-with-info"><h1>{title}</h1><InfoTip key={section} label={title}>{settingsHelp[section] || settingsDescriptions[section]}</InfoTip></div></div>
    {dirty && <div className="settings-draft-note" role="status"><span>有未保存的修改</span></div>}
    {error && <div className="settings-error" role="alert"><AlertCircle size={16}/><span>{error}</span></div>}
    {saved && <div className="settings-success" role="status"><CheckCircle2 size={16}/>{saved}</div>}
    {section === "general" && <>
      <div className="project-identity"><span className="project-glyph">{project.name.slice(0, 1)}</span><div><h2>{project.name}</h2><span>{project.cloud ? "在线项目" : "本地项目"} · {project.code}</span></div></div>
      <form className="settings-section" onSubmit={(e) => { e.preventDefault(); save("general"); }}>
        <Field label="项目 ID"><input value={project.code} readOnly/><small>工作项编号：{project.code}-序号，项目 ID 创建后固定。</small></Field><Field label="项目名称"><input {...field("name")} maxLength={120} placeholder="项目名称" required disabled={busy}/></Field>
        <Field label="背景与说明"><textarea {...field("description")} placeholder="补充项目背景、受众和工作范围" disabled={busy}/></Field>
        <Field label="项目目标" hint="项目目标和背景会作为共享上下文提供给执行故事的 AI。"><textarea {...field("goal")} required placeholder="描述项目希望实现的结果" disabled={busy}/></Field>
        <DateFields prefix="项目" start={form.startDate} end={form.endDate} setStart={(v) => change("startDate", v)} setEnd={(v) => change("endDate", v)} disabled={busy}/>
        {saveBar("general", "保存更改")}
      </form>
      <section className="settings-section project-danger-zone"><div><h3>删除项目</h3><p>{project.cloud ? "请在 LoyoCloud 云空间管理或删除此 .heyso 文件。" : "永久删除本项目及其需求、冲刺、版本、记忆和交付记录。"}</p></div><button className="danger-button" disabled={busy || dirty || !!project.cloud} onClick={onDelete}><Trash2 size={14}/>删除项目</button></section>
    </>}
    {section === "members" && <>
      <section className="settings-section">
        <p className="member-role-note">从已有角色中选择成员职位。角色名称与说明在「角色」中统一管理。</p>
        <Field label="项目负责人" hint="负责人须来自成员名册。"><Select aria-label="项目负责人" value={form.owner} disabled={busy} onChange={(e) => change("owner", e.target.value)}>{form.members.map((m) => <option key={m} value={m}>{m}</option>)}</Select></Field>
        <div className="member-header"><h3 className="heading-with-info">成员名册<InfoTip label="成员名册">项目负责人或仍负责工作项的成员，须先重新分配责任后才能移除。</InfoTip></h3><span>{form.members.length} 位成员</span></div>
        <div className="member-list">{form.members.map((m) => {
          const assigned = data.items.filter((i) => i.projectId === project.id && i.owner === m).length;
          const reason = m === form.owner ? "请先更换项目负责人" : assigned ? "请先重新分配该成员负责的需求" : form.members.length === 1 ? "至少保留一位成员" : "";
          return <div className="member-row" key={m}><span className="avatar">{m.slice(0, 1)}</span><div className="member-identity"><b>{m}</b><small>{m === form.owner ? "项目负责人 · " : ""}负责 {assigned} 个需求</small></div><label className="member-role-field"><span>角色 / 职位</span><Select aria-label={`${m}的角色`} value={memberRole(form, m)} disabled={busy} onChange={(e) => change("memberRoles", { ...form.memberRoles, [m]: e.target.value })}>{project.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</Select></label><button type="button" className="icon-btn" aria-label={`移除成员 ${m}`} title={reason || "从名册移除"} disabled={busy || !!reason} onClick={() => {
            const members = form.members.filter((name) => name !== m);
            setForm((old) => ({ ...old, members, memberRoles: rolesForMembers(members, old.memberRoles) })); setError(""); setSaved("");
          }}><X size={15}/></button></div>;
        })}</div>
        <form className="add-member" onSubmit={(e) => {
          e.preventDefault(); const name = member.trim();
          if (!name) return;
          if (form.members.includes(name)) { setError("该成员已在名册中"); return; }
          if (form.members.length >= 100) { setError("成员名册最多支持 100 位成员"); return; }
          if (!newMemberRole.trim()) { setError("请填写成员角色职位"); return; }
          const members = [...form.members, name];
          setForm((old) => ({ ...old, members, memberRoles: { ...rolesForMembers(members, old.memberRoles), [name]: newMemberRole.trim() } }));
          setMember(""); setNewMemberRole(defaultMemberRole); setError(""); setSaved("");
        }}><input aria-label="新成员姓名" placeholder="输入成员姓名" maxLength={80} value={member} disabled={busy} onChange={(e) => { setMember(e.target.value); setError(""); }}/><Select className="new-member-role" aria-label="新成员角色" value={newMemberRole} disabled={busy} onChange={(e) => { setNewMemberRole(e.target.value); setError(""); }}>{project.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</Select><button type="submit" disabled={busy || !member.trim() || !newMemberRole.trim()}><Plus size={15}/>添加到名册</button></form>
        <form onSubmit={(e) => { e.preventDefault(); save("members"); }}>{saveBar("members", "保存成员")}</form>
      </section>
    </>}
    {section === "roles" && <section className="settings-section">
      <p className="member-role-note">统一维护项目角色，再在「成员」中分配。本地角色展示职位；云端角色用于权限管理。</p>
      <div className="member-header"><h3>项目角色</h3><span>{form.roles.length} 个角色</span></div>
      <div className="project-role-list">{form.roles.map((role) => {
        const assigned = project.members.filter((name) => memberRole(project, name) === role.id).length;
        const pendingAssigned = form.members.some((name) => memberRole(form, name) === role.id);
        const reason = role.id === defaultMemberRole ? "默认成员角色不能删除" : assigned || pendingAssigned ? "请先在成员中重新分配并保存，再删除角色" : "";
        return <div className="project-role-row" key={role.id}>
          <label><span>角色名称</span><input aria-label={`角色名称 ${role.name}`} value={role.name} maxLength={40} disabled={busy} onChange={(e) => change("roles", form.roles.map((r) => r.id === role.id ? { ...r, name: e.target.value } : r))}/></label>
          <label><span>职责说明</span><input aria-label={`角色说明 ${role.name}`} value={role.description} maxLength={500} placeholder="说明该角色的职责" disabled={busy} onChange={(e) => change("roles", form.roles.map((r) => r.id === role.id ? { ...r, description: e.target.value } : r))}/></label>
          <span className="role-usage">{assigned} 位成员{role.id === defaultMemberRole ? " · 默认" : ""}</span>
          <button type="button" className="icon-btn" aria-label={`删除角色 ${role.name}`} title={reason || "删除角色"} disabled={busy || !!reason} onClick={() => change("roles", form.roles.filter((r) => r.id !== role.id))}><Trash2 size={15}/></button>
        </div>;
      })}</div>
      <form className="config-add" onSubmit={(e) => {
        e.preventDefault(); const name = roleName.trim();
        if (!name) return;
        if (form.roles.some((r) => r.name.trim() === name)) { setError("角色名称不能重复"); return; }
        if (form.roles.length >= 50) { setError("最多支持 50 个角色"); return; }
        change("roles", [...form.roles, { id: `role_${crypto.randomUUID()}`, name, description: "" }]); setRoleName("");
      }}><input aria-label="新角色名称" placeholder="输入新角色名称" maxLength={40} disabled={busy} value={roleName} onChange={(e) => { setRoleName(e.target.value); setError(""); }}/><button type="submit" disabled={busy || !roleName.trim()}><Plus size={15}/>添加角色</button></form>
      <form onSubmit={(e) => { e.preventDefault(); save("roles"); }}>{saveBar("roles", "保存角色")}</form>
    </section>}
    {["types", "hierarchy", "states"].includes(section) && <form className="settings-section" onKeyDown={(e) => { if (section === "states" && e.key === "Enter" && e.target.tagName === "INPUT" && e.target.type !== "checkbox") e.preventDefault(); }} onSubmit={async (e) => {
      e.preventDefault(); setError(""); setSaved("");
      if (aiWorkflowConflicts.length) { setError("请先补齐 AI 协作节点，或关闭受影响工作项的 AI 执行。"); return; }
      if (pendingWorkflowMigrations.length) { setError("请选择受影响工作项的迁移状态。"); return; }
      if (conflicts.length) { setError("请先处理现有工作项与新层级的冲突，历史数据未改变。"); return; }
      try { checkWorkConfig(workDraft); } catch (error) { setError(error.message); return; }
      const result = await action("project.workConfig", { id: project.id, config: workDraft, statusMigration }, true);
      if (result) { setWorkDraft(structuredClone(result.workConfig)); setStatusMigration({}); setSaved("工作项配置已保存"); setToast("工作项配置已保存"); }
      else setError("配置未保存。请按提示检查现有工作项的父级、类型和状态。");
    }}>
      <WorkConfigSettings project={project} items={data.items.filter((i) => i.projectId === project.id)} section={section} config={workDraft} setConfig={setWorkDraft} migration={statusMigration} setMigration={setStatusMigration} busy={busy} onSave={saveWorkflowConfig}/>
      {configDirty && conflicts.length > 0 && <div className="hierarchy-impact" role="alert"><h3>{conflicts.length} 个现有关联与新规则冲突，暂不能保存</h3><p>已有工作项尚未改变。请撤销层级调整，或先转换、归类相关工作项后再调整层级。</p><ul>{conflicts.slice(0, 8).map(({ item, parent, reason }) => <li key={item.id}><strong>{item.number ? project.code + "-" + item.number + " · " : ""}{item.title}</strong><span>{parent ? "父级：" + parent.title + " · " : ""}{reason}</span></li>)}</ul>{conflicts.length > 8 && <p>另有 {conflicts.length - 8} 个冲突。</p>}</div>}
      {section !== "states" && <div className={"settings-save" + (section === "states" ? " wf-publish-bar" : "")}><button className="primary" type="submit" disabled={busy || !configDirty || conflicts.length > 0 || pendingWorkflowMigrations.length > 0 || aiWorkflowConflicts.length > 0}>{busy ? "正在保存…" : section === "states" ? "发布更改" : "保存工作项配置"}</button><button type="button" disabled={busy || !configDirty} onClick={() => { setWorkDraft(structuredClone(configFor(project))); setStatusMigration({}); setError(""); }}>撤销配置修改</button><span>{configDirty ? (section === "states" ? "草稿尚未生效，发布后应用到项目" : "三个配置栏目共同保存") : "已与项目数据同步"}</span></div>}
    </form>}
    {section === "workflow" && <>
      <form className="settings-section" onSubmit={(e) => { e.preventDefault(); save("workflow"); }}>
        <h3 className="heading-with-info">共同的工作方式<InfoTip label="共同的工作方式">这些约定会随工作项上下文提供给 AI，让每次执行遵循同一套规则。</InfoTip></h3>
        <Field label="协作约定" hint="例如：先报告计划；阻塞时说明原因；涉及范围变更时先与负责人确认。"><textarea rows={5} {...field("workingAgreements")} disabled={busy} placeholder="补充本项目的协作方式、沟通习惯和执行约定"/></Field>
        <Field label="完成定义（Definition of Done）" hint="项目内所有故事共同遵循的完成标准，与故事自身的验收标准一起使用。"><textarea rows={5} {...field("definitionOfDone")} required disabled={busy}/></Field>
        {saveBar("workflow", "保存工作约定")}
      </form>

    </>}
    {section === "integrations" && <>
      {cloudPanel}
      <section className="settings-section integration-settings">
        <div className="integration-heading"><span className="integration-icon"><Plug size={24}/></span><div><h3 className="heading-with-info">MCP 连接<InfoTip label="MCP 连接">AI 通过 MCP 读取上下文、报告进展并提交成果。外部 AI 工具需要单独配置连接；检测成功只代表本地服务正常。</InfoTip></h3></div></div>
        <div className={"settings-service " + service.state} role="status">
          {service.state === "ready" ? <CheckCircle2 size={18}/> : service.state === "error" ? <AlertCircle size={18}/> : <Plug size={18}/>}
          <div><strong>{({ idle: "尚未检测", checking: "正在检测本地服务…", ready: "本地服务正常", error: "无法连接本地服务" })[service.state]}</strong><small>{service.state === "ready" ? `${service.version} · ${service.tools} 个 MCP 工具 · ${service.checkedAt} 检测` : service.state === "error" ? "请确认 HeySO 服务正在运行，然后重试。" : "检测服务可用性，不读取或显示访问密钥。"}</small></div>
          <button disabled={service.state === "checking"} onClick={checkService}><RefreshCw size={14}/>重新检测</button>
        </div>
        <div className="config-facts"><div><span>连接范围</span><b>当前本地工作空间中的项目</b></div><div><span>写入授权</span><b>逐故事启用 AI 执行</b></div><div><span>成果确认</span><b>人工验收</b></div></div>
        <button className="primary" disabled={connecting || service.state !== "ready"} onClick={async () => {
          setConnecting(true); setError("");
          try { await onConnect(); } catch (e) { setError(e.message || "无法读取连接配置，请重试。"); }
          finally { if (mounted.current) setConnecting(false); }
        }}>{connecting ? "读取配置…" : "查看连接配置"}<ArrowUpRight size={15}/></button>
      </section>
    </>}
    {section === "data" && <>
      <section className="settings-section"><h3>导出备份</h3><p className="section-description">当前工作空间：{data.projects.length} 个项目、{data.items.length} 个需求与任务、{data.runs.length} 条执行与交付。</p><a className="button" href="/api/export" download><Download size={15}/>导出工作空间备份</a></section>
      <section className="settings-section"><h3 className="heading-with-info">从备份恢复<InfoTip label="从备份恢复">先检查文件，再核对项目与记录数量。恢复会替换整个工作空间，请先导出当前数据。</InfoTip></h3>
        <label className={"button" + (checkingFile || restoring ? " backup-disabled" : "")}><Upload size={15}/>{checkingFile ? "正在检查备份…" : "选择 JSON 备份文件"}<input type="file" accept=".json,application/json" hidden disabled={checkingFile || restoring} onChange={selectBackup}/></label>
        {restore && <div className="backup-preview">
          <h4>备份检查通过</h4><p className="backup-filename">{restore.filename}</p>
          <table><thead><tr><th>记录类型</th><th>当前工作空间</th><th>备份文件</th></tr></thead><tbody>{Object.entries(restore.preview.counts).map(([key, counts]) => <tr key={key}><th>{countNames[key]}</th><td>{counts.current}</td><td>{counts.backup}</td></tr>)}</tbody></table>
          <div className="backup-projects"><strong>恢复后的项目</strong>{restore.preview.projects.length ? <ul>{restore.preview.projects.map((p) => <li key={p.id}>{p.name}</li>)}</ul> : <p>此备份为空，恢复后将移除当前全部项目。</p>}</div>
          <p className="deletion-warning">恢复会覆盖当前工作空间的全部记录，无法直接撤销。MCP 密钥和外部文件保持原样。</p>
          {dirty && <p className="settings-inline-error">请先保存或撤销其他设置栏目的修改，再恢复备份。</p>}
          <Field label="输入“恢复”以确认替换"><input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="off" disabled={restoring}/></Field>
          <div className="inline"><button className="danger-button" disabled={busy || restoring || dirty || confirmation !== "恢复"} onClick={restoreBackup}>{restoring ? "正在恢复…" : "确认恢复工作空间"}</button><button disabled={restoring} onClick={() => { setRestore(null); setConfirmation(""); setError(""); }}>取消</button></div>
        </div>}
      </section>
    </>}
  </div>;
}

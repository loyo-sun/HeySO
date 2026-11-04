import {aiExecutionEnabled} from '../shared/work-config.mjs';
import ActivityDetails from './ActivityDetails.jsx';
import {WorkspaceSync,watchWorkspaceUpdates} from './workspace-sync.mjs';
import React, { useState, useEffect, useRef } from "react";
import AccessGate, { useHosting } from './AccessGate.jsx';
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  Layers,
  Rows3,
  Kanban,
  Timer,
  Flag,
  BookOpen,
  Bot,
  Settings,
  Plus,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  X,
  Copy,
  Download,
  Upload,
  Play,
  Send,
  Target,
  GitBranch,
  Box,
  ListChecks,
  MoreHorizontal,
  Calendar,
  Activity,
  Link,
  Trash2,
  RefreshCw,
  Sparkles,
  PanelRightClose,
  ArrowLeft,
  FolderKanban,
  CircleHelp,
} from "lucide-react";
import "./style.css";
import "./plane.css";
import SettingsPanel, {
  settingsPages,
  settingsDescriptions,
} from "./SettingsPanel.jsx";
import CloudPanel from "./CloudPanel.jsx";
import Presence from "./Presence.jsx";
import DeleteProjectDialog from "./DeleteProjectDialog.jsx";
import ItemSchedule, { DateFields } from "./Schedule.jsx";
import Select, { StatusIcon, PriorityIcon } from "./Select.jsx";
import Sidebar from "./Sidebar.jsx";
import "./brand.css";
import heysoIcon from "./assets/heyso-icon.svg";
import { WorkConfigContext, useWorkProject } from "./WorkConfigContext.jsx";
import Kind from "./WorkType.jsx";
import InfoTip from "./InfoTip.jsx";
import HelpCenter from "./HelpCenter.jsx";
import ContextMenu from "./ContextMenu.jsx";
import Dashboard from "./Dashboard.jsx";
import useWorkspaceRoute from "./useWorkspaceRoute.jsx";
import "./dashboard.css";
import "./page-layout.css";
import WorkItemDialog from "./WorkItemDialog.jsx";
import WorkItemTitle from "./WorkItemTitle.jsx";
import RichTextEditor from "./RichTextEditor.jsx";
import MarkdownPreview from "./MarkdownPreview.jsx";
import { workItemEntries, executionInstruction } from "./work-item-actions.mjs";
import { isExecutionItem, runTargetId, configFor, typeFor, typeNames, statusNamesFor, isWorkItem, isSubtask, categoryOf, hasStatus, terminal, statusFor, allowedTransition, parentCandidates, childTypes, canParent, statusCategories, workflowFor, workflowStatuses, progressCategory, boardStatuses, aiReady } from "../shared/work-config.mjs";

const statusNames = {
  backlog: "待规划",
  todo: "待开始",
  active: "执行中",
  blocked: "阻塞",
  review: "待验收",
  done: "已完成",
  cancelled: "已取消",
};
const Roadmap = React.lazy(() => import('./Roadmap.jsx'));
const kinds = {
  theme: "战略主题",
  epic: "史诗",
  feature: "特性",
  story: "故事",
  task: "任务",
  bug: "缺陷",
  subtask: "子任务",
};
const kindIcons = {
  theme: Target,
  epic: Layers,
  feature: Box,
  story: BookOpen,
  task: ListChecks,
  bug: AlertCircle,
  subtask: ListChecks,
};
const priorities = { high: "高", medium: "中", low: "低" };
const navs = [
  ["overview", "概览", LayoutDashboard, "查看项目目标、进度和待验收成果。"],
  ["roadmap", "路线图", Calendar, "在时间轴上查看工作项、进度和版本里程碑，调整计划日期。"],
  ["hierarchy", "工作项", Layers, "管理具体工作项的父子关系，支持拖拽归类。"],
  ["backlog", "待办池", Rows3, "整理故事优先级，安排版本与冲刺。"],
  ["board", "看板", Kanban, "按状态查看故事，拖动卡片推进工作。"],
  ["sprints", "Sprint 冲刺", Timer, "规划冲刺、跟踪执行、完成评审与复盘。"],
  ["releases", "版本管理", Flag, "规划版本范围，管理发布与交付记录。"],
  ["memory", "记忆", BookOpen, "保存项目背景、关键决定和共享知识。"],
  ["ai", "智能", Bot, "跟踪 AI 执行，审核成果并完成验收。"],
];
const fmt = (d) =>
  d
    ? new Date(d).toLocaleDateString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
      })
    : "未设置";
const time = (d) =>
  new Date(d).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
const percent = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const sum = (arr) => arr.reduce((a, x) => a + (x.points || 0), 0);
function Badge({ status, workflow = true }) {
  const project = useWorkProject();
  const category = workflow ? ({todo:"todo",in_progress:"active",done:"done"}[progressCategory(project,status)] || status) : status;
  const names = workflow ? { ...statusNames, ...statusNamesFor(project) } : statusNames;
  return (
    <span className={"badge " + category}>
      <StatusIcon value={status} />
      {names[status] ||
        {
          planned: "规划中",
          closed: "已结束",
          planning: "规划中",
          ready: "待发布",
          released: "已发布",
          accepted: "已通过",
          changes: "需修改",
        }[status] ||
        status}
    </span>
  );
}
function Empty({
  title = "还没有内容",
  text = "从一个清晰的目标开始，逐步推进工作。",
  action,
}) {
  return (
    <div className="empty">
      <Box size={30} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
function Progress({ value }) {
  return (
    <div className="progress">
      <div style={{ width: value + "%" }} />
    </div>
  );
}
function App() {
  const hosting = useHosting();
  const routeGuard = useRef(null);
  const { page, setPage, projectId, setProjectId, view, setView, settingsSection, setSettingsSection,
    selected, setSelected, tab, setTab } = useWorkspaceRoute({
      views: [...navs.map(([id]) => id), 'settings'], sections: settingsPages.map(([id]) => id),
      fallbackProject: localStorage.getItem('heyso-project') || 'p_heyso',
    }, routeGuard);
  useEffect(() => { window.scrollTo(0, 0); }, [page]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("heyso-sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });
  const [narrowSidebar, setNarrowSidebar] = useState(
    () => window.matchMedia("(max-width: 900px)").matches,
  );
  const sidebarCompact = sidebarCollapsed || narrowSidebar;
  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const update = () => setNarrowSidebar(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("heyso-sidebar-collapsed", String(sidebarCollapsed));
    } catch {
      /* Keep the control usable when browser storage is unavailable. */
    }
  }, [sidebarCollapsed]);
  const [data, setData] = useState(null),
    [draggedItem, setDraggedItem] = useState(null),
    [dragOverItem, setDragOverItem] = useState(null),
    [collapsedItems, setCollapsedItems] = useState(() => new Set()),
    [treeQuery, setTreeQuery] = useState(""),
    [modal, setModal] = useState(null),
    [toast, setToast] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [sprintFilter, setSprintFilter] = useState("all"),
    [releaseFilter, setReleaseFilter] = useState("unreleased"),
    [ownerFilter, setOwnerFilter] = useState("all"),
    [busy, setBusy] = useState(false),
    [connection, setConnection] = useState(null),
    [online, setOnline] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const contextTrigger = useRef(null);
  const closeContextMenu = () => {
    setContextMenu(null);
    if (contextTrigger.current?.isConnected) contextTrigger.current.focus({ preventScroll: true });
  };
  useEffect(() => { setContextMenu(null); }, [projectId, view, selected, modal, helpOpen, data?.revision]);
  const settingsDirtyRef = useRef(false);
  const [settingsNavigation, setSettingsNavigation] = useState(null);
  const setSettingsDirty = React.useCallback((dirty) => { settingsDirtyRef.current = dirty; }, []);
  const requestSettingsNavigation = (navigate) => {
    if (busy) return;
    if (view === "settings" && settingsDirtyRef.current) setSettingsNavigation(() => navigate);
    else navigate();
  };
  routeGuard.current = {
    blocked: () => view === 'settings' && settingsDirtyRef.current,
    request: requestSettingsNavigation,
  };
  const receiveCloudState = (result) => {
    syncRef.current.receive(result.state);
    if(result.projectId){setProjectId(result.projectId);localStorage.setItem("heyso-project",result.projectId);setSelected(null);}
  };
  useEffect(()=>{
    const fileId=new URLSearchParams(window.location.search).get('cloudFile');
    if(fileId){setView('settings');setSettingsSection('integrations');}
  },[]);
  const syncRef=useRef(null);
  if(!syncRef.current)syncRef.current=new WorkspaceSync({cloud:hosting.provider==='loyocloud',onData:setData,onBusy:setBusy,onMessage:setToast,onOnline:setOnline,onExpired:()=>{if(hosting.hosted)window.dispatchEvent(new Event('heyso-session-expired'));}});
  const refresh=()=>syncRef.current.refresh();
  useEffect(() => {
    return watchWorkspaceUpdates(syncRef.current,{intervalMs:hosting.hosted?2000:3500});
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(() => {
    setFilter("all");
    setReleaseFilter("unreleased");
    setQuery("");
    setOwnerFilter("all");
    setTreeQuery("");
    setCollapsedItems(new Set());
    setDraggedItem(null);
    setDragOverItem(null);
  }, [projectId]);
  useEffect(() => {
    if (!data || data.projects.some((p) => p.id === projectId)) return;
    const nextId = data.projects[0]?.id || "";
    setProjectId(nextId);
    setSelected(null);
    setSprintFilter("all");
    if (nextId) localStorage.setItem("heyso-project", nextId);
    else localStorage.removeItem("heyso-project");
  }, [data, projectId]);
  useEffect(() => {
    if (!data || !selected || data.items.some(item => item.id === selected && item.projectId === projectId)) return;
    setSelected(null);
    setToast('此工作项已不存在，已返回项目页面');
  }, [data, projectId, selected]);
  async function action(type, payload, quiet = false) {
    return syncRef.current.action(type,payload,projectId,quiet);
  }
  async function copy(text, successMessage = "已复制") {
    try {
      await navigator.clipboard.writeText(text);
      setToast(successMessage);
    } catch {
      setToast("复制失败，请手动复制");
    }
  }
  async function getConnection() {
    const r = await fetch("/api/connection");
    const c = await r.json();
    if (!r.ok || !c.url || (!c.token && !c.oauth)) throw Error(c.error || "无法读取连接配置，请确认服务正常。");
    setConnection(c);
    return c;
  }
  const open = (i) => {
    setSelected(i.id);
    setTab("detail");
  };
  const go = (v) => {
    const navigate = () => {
    if (v !== "settings") settingsDirtyRef.current = false;
    setPage("projects");
    setFilter("all");
    setOwnerFilter("all");
    setQuery("");
    setView(v);
    setSelected(null);
    };
    if (v === "settings") navigate();
    else requestSettingsNavigation(navigate);
  };
  const switchProject = (id) => {
    if (id === projectId) return;
    requestSettingsNavigation(() => {
    settingsDirtyRef.current = false;
    setProjectId(id);
    localStorage.setItem("heyso-project", id);
    setSelected(null);
    setQuery("");
    setFilter("all");
    setOwnerFilter("all");
    setSprintFilter("all");
    });
  };
  const openProjectSettings = () => {
    setSelected(null);
    setModal(null);
    setSettingsSection("general");
    go("settings");
  };
  const switchPage = (next) => {
    if (next === page) return;
    requestSettingsNavigation(() => {
      if (view === "settings") {
        settingsDirtyRef.current = false;
        setView("overview");
      }
      setSelected(null);
      setContextMenu(null);
      setPage(next);
    });
  };
  if (!data)
    return (
      <div className="loading">
        <img className="mark" src={heysoIcon} alt="合序" />
        <h2>HeySO</h2>
        <p>
          {online
            ? "正在打开你的工作空间…"
            : "服务暂时不可用，请稍后重试。"}
        </p>
        <button onClick={refresh}>重新连接</button>
      </div>
    );
  const project =
    data.projects.find((p) => p.id === projectId) || data.projects[0];
  if (!project)
    return (
      <>
      <div className="empty-workspace" inert={helpOpen ? true : undefined}>
        <div className="empty-workspace-brand">
          <img className="mark" src={heysoIcon} alt="" />
          <b>HeySO</b>
          <span>合序</span>
        </div>
        <button className="help-entry empty-help-entry" aria-label="帮助中心" title="帮助中心" onClick={() => setHelpOpen(true)}><CircleHelp size={19}/></button>
        <section>
          <FolderKanban size={36} />
          <h1>创建你的第一个项目</h1>
          <p>从一个项目开始，规划需求、冲刺与版本，记录每一次交付。</p>
          <button
            className="primary"
            onClick={() => setModal({ type: "project" })}
          >
            <Plus size={16} />
            创建项目
          </button>
        </section>
        <CloudPanel busy={busy} onState={receiveCloudState} setToast={setToast}/>
        <footer>{hosting.hosted ? "在线保存" : "本地保存"} · alpha_0.1 {hosting.hosted && <><button className="text-btn" onClick={hosting.configure}>云端存储</button><button className="text-btn" onClick={hosting.logout}>退出工作空间</button></>}</footer>
        <Presence
          present={modal?.type === "project"}
          onClose={() => setModal(null)}
        >
          {modal?.type === "project" && (
            <EditorModal
              modal={modal}
              setModal={setModal}
              data={data}
              project={{ id: "" }}
              action={action}
              busy={busy}
              setProjectId={(id) => {
                switchProject(id);
                go("overview");
              }}
            />
          )}
        </Presence>
      {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </div>
      {helpOpen && <HelpCenter onClose={() => setHelpOpen(false)}/>}
      </>
    );
  const kinds = typeNames(project);
  const statusNames = Object.fromEntries(configFor(project).statuses.filter((s) => s.enabled).map((s) => [s.id, s.name]));
  const items = data.items.filter((x) => x.projectId === project.id),
    stories = items.filter((x) => isWorkItem(x, project)),
    sprints = data.sprints.filter((x) => x.projectId === project.id),
    releases = data.releases.filter((x) => x.projectId === project.id),
    notes = data.notes.filter((x) => x.projectId === project.id),
    runs = data.runs.filter((x) => x.projectId === project.id),
    events = data.events.filter((x) => x.projectId === project.id),
    activeSprint = sprints.find((x) => x.status === "active");
  const completed = stories.filter((x) => hasStatus(x, project, "done")),
    review = stories.filter((x) => hasStatus(x, project, "review")),
    blocked = stories.filter((x) => hasStatus(x, project, "blocked"));
  const filtered = stories.filter(
    (i) =>
      (filter === "all" || (filter.startsWith("category:") ? hasStatus(i, project, filter.slice(9)) : i.status === filter)) &&
      (ownerFilter === "all" || i.owner === ownerFilter) &&
      (!query ||
        `${i.title} ${project.code}-${i.number} ${i.description}`
          .toLowerCase()
          .includes(query.toLowerCase())),
  );
  const selectedItem = items.find((x) => x.id === selected);
  const create = (kind, parentId, defaults = {}) => {
    const possible = configFor(project).types.filter((t) => t.enabled && !t.hidden);
    const selectedKind = kind && possible.some((t) => t.id === kind) ? kind : possible.find((t) => t.id === "story")?.id || possible.find((t) => t.level === 0)?.id;
    if (selectedKind) setModal({ type: "item", kind: selectedKind, parentId, ...defaults });
    else setToast("请先启用一种工作项类型");
  };
  const handleContextMenu = (event) => {
    const keyboard = event.type === "keydown";
    if (keyboard && !(event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))) return;
    if (event.target.closest("input, textarea, select, [contenteditable=true], a")) return;
    const row = event.target.closest("[data-work-item-id]");
    const scope = event.target.closest("[data-work-scope]");
    if (!row && (!scope || event.target.closest("button"))) return;
    if (busy || !online || selectedItem || modal || helpOpen) return;
    const historical = row?.dataset.history === "true";
    let item = items.find((i) => i.id === row?.dataset.workItemId);
    if (historical) {
      const source = scope?.dataset.workScope === "release" ? releases.find((r) => r.id === scope.dataset.scopeId)?.publishedStories : sprints.find((sp) => sp.id === scope?.dataset.scopeId)?.finalStories;
      item = source?.find((i) => i.id === row.dataset.workItemId);
    }
    if (row && !item) return;
    event.preventDefault(); event.stopPropagation();
    contextTrigger.current = row || scope;
    const rect = (row || scope).getBoundingClientRect();
    setContextMenu({x:keyboard ? rect.left + 24 : event.clientX,y:keyboard ? rect.top + 24 : event.clientY,item,snapshot:historical,
      runId:row?.dataset.workRunId,scope:scope?.dataset.workScope,scopeId:scope?.dataset.scopeId,title:item ? `${item.number ? project.code + "-" + item.number + " · " : ""}${item.title}` : "新建与管理工作项"});
  };
  const contextEntries = () => {
    if (!contextMenu) return [];
    const i = contextMenu.item;
    if (i) return workItemEntries({item:i,snapshot:contextMenu.snapshot,project,data,handlers:{
      copy,open,create,
      update:(id,patch) => action("item.update",{id,...patch}),
      move:(id,parentId) => action("item.move",{id,parentId,projectId:project.id}),
      edit:(item) => open(item),
      snapshot:(item) => setModal({type:"workSnapshot",item}),
      deliveries:(item) => { open(item); setTab("runs"); },
      instruction:(item) => copy(executionInstruction(project,item)),
      review:(item) => setModal({type:"review",story:item,run:runs.find((r) => runTargetId(r) === item.id && r.status === "review")}),
      remove:(item) => setModal({type:"delete",item}),
      collapsed:collapsedItems.has(i.id),
      toggleBranch:view === "hierarchy" ? (id) => setCollapsedItems((old) => { const next = new Set(old); next.has(id) ? next.delete(id) : next.add(id); return next; }) : null,
    }});
    const {scope,scopeId} = contextMenu;
    const sprint = sprints.find((s) => s.id === scopeId);
    const release = releases.find((r) => r.id === scopeId);
    if ((scope === "sprint" && sprint?.status === "closed") || (scope === "release" && release?.status === "released")) return [{label:"历史记录，仅可查看",disabled:true}];
    const types = configFor(project).types.filter((t) => t.enabled && !t.hidden &&
      (!(scope === "sprint" || scope === "release" || scope === "board") || isWorkItem({kind:t.id},project)) &&
      (scope !== "board" || workflowFor(project,t.id).initialStatus === scopeId));
    const defaults = scope === "sprint" ? {sprintId:scopeId} : scope === "release" ? {releaseId:scopeId} : {};
    const result = [{label:scope === "board" ? "在此状态新建工作项" : "新建工作项",disabled:!types.length,reason:!types.length ? "没有以此状态创建的可用类型" : "",children:types.map((t) => ({label:t.name,run:() => create(t.id,null,defaults)}))}];
    if (scope === "hierarchy") result.push({label:"全部展开",run:() => setCollapsedItems(new Set())},{label:"全部收起",run:() => setCollapsedItems(new Set(items.filter((i) => items.some((x) => x.parentId === i.id)).map((i) => i.id)))});
    if (scope === "sprint" || scope === "release") {
      const field = scope === "sprint" ? "sprintId" : "releaseId";
      const candidates = stories.filter((s) => s[field] !== scopeId && (scope !== "sprint" || !s.sprintId));
      result.push({label:scope === "sprint" ? "从待办池添加" : "添加现有工作项",disabled:!candidates.length,reason:!candidates.length ? "没有可添加的工作项" : "",children:candidates.map((s) => ({label:`${project.code}-${s.number} · ${s.title}`,run:() => action("item.update",{id:s.id,[field]:scopeId})}))});
    }
    return result;
  };
  const storyRows = (rows, compact = false, historical = false) => (
    <div className={"story-table " + (compact ? "compact" : "")}>
      <div className="table-head">
        <span>工作项</span>
        <span>状态</span>
        <span>优先级</span>
        <span>负责人</span>
        <span>故事点</span>
      </div>
      {rows.length ? (
        rows.map((i) => (
          <button className="story-row" key={i.id} data-work-item-id={i.id} data-history={historical} onClick={() => historical ? setModal({type:"workSnapshot",item:i}) : open(i)}>
            <div className="story-name">
              <Kind kind={i.kind} iconOnly />
              <small>{project.code}-{i.number}</small>
              <span>{i.title}</span>
              {i.aiEnabled && <Bot size={14} className="purple" />}
            </div>
            <Badge status={i.status} />
            <span className={"priority " + i.priority}>
              <PriorityIcon value={i.priority} /> {priorities[i.priority]}
            </span>
            <span className="person">
              <span className="avatar">{i.owner?.slice(0, 1) || "?"}</span>
              {i.owner}
            </span>
            <span className="points">{i.points || "—"}</span>
          </button>
        ))
      ) : (
        <Empty title="没有符合条件的工作项" />
      )}
    </div>
  );
  const toolbar = (
    <div className="toolbar">
      <div className="search">
        <Search size={16} />
        <input
          aria-label="搜索工作项"
          placeholder="搜索工作项标题或编号…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <Select
        aria-label="状态筛选"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      >
        <option value="all">所有状态</option>
        {filter.startsWith("category:") && <option value={filter}>{statusCategories[filter.slice(9)]}（全部状态）</option>}
        {Object.entries(statusNames).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </Select>
      <Select
        aria-label="负责人筛选"
        value={ownerFilter}
        onChange={(e) => setOwnerFilter(e.target.value)}
      >
        <option value="all">所有负责人</option>
        {project.members.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </Select>
      <span className="muted ml-auto">{filtered.length} 个工作项</span>
    </div>
  );
  const pageTitle=navs.find(n=>n[0]===view)?.[1];
  const visibleReleases=releases.filter(r=>releaseFilter==="all"||(releaseFilter==="released"?r.status==="released":r.status!=="released"));
  const header = (title, description, button) => (
    <div className="page-heading">
      <div>
        <h1 className="heading-with-info">{pageTitle||title}{view !== "overview" && description && <InfoTip label={pageTitle||title}>{description}</InfoTip>}</h1>
        {view === "overview" && <p>{description}</p>}
      </div>
      {button}
    </div>
  );
  async function moveWorkItem(event, parentId) {
    event.preventDefault(); event.stopPropagation();
    const id = event.dataTransfer.getData("application/x-heyso-item") || event.dataTransfer.getData("text/plain");
    setDraggedItem(null); setDragOverItem(null);
    const item = items.find((i) => i.id === id);
    if (!item || id === parentId) { setToast("请选择当前项目中可移动的工作项"); return; }
    if ((!parentId && isSubtask(item, project)) || (parentId && !parentCandidates(project, items, item.kind, id).some((p) => p.id === parentId))) {
      setToast("此类型不能放到该父级下，请检查层级规则"); return;
    }
    if ((item.parentId || null) === parentId) return;
    const result = await action("item.move", { id, parentId, projectId: project.id });
    if (result) {
      setCollapsedItems((old) => { const next = new Set(old); next.delete(parentId); return next; });
      setToast(parentId ? "已更新父级工作项，子项随之保留" : "已移至未归类");
    }
  }
  function renderItemTree({ parent = null, depth = 0 } = {}) {
    return <>
      {items.filter((i) => (i.parentId || null) === parent).map((i) => {
        const descendants = (id) => items.filter((x) => x.parentId === id).flatMap((x) => [x, ...descendants(x.id)]);
        const nested = descendants(i.id);
        const searchText = treeQuery.trim().toLowerCase();
        const matches = (x) => `${x.title} ${typeNames(project)[x.kind]} ${project.code}-${x.number || ""}`.toLowerCase().includes(searchText);
        if (searchText && ![i, ...nested].some(matches)) return null;
        const children = nested.filter((x) => isWorkItem(x, project));
        const collapsed = !searchText && collapsedItems.has(i.id);
        const next = childTypes(project, i.kind)[0]?.id;
        const dragItem = items.find((x) => x.id === draggedItem);
        const validTarget = dragItem && parentCandidates(project, items, dragItem.kind, dragItem.id).some((p) => p.id === i.id);
        return <React.Fragment key={i.id}>
          <div className={"tree-row" + (dragOverItem === i.id ? (validTarget ? " drag-target" : " drag-invalid") : "") + (draggedItem === i.id ? " dragging" : "")}
            data-work-item-id={i.id} tabIndex={0} style={{ paddingLeft: 20 + depth * 28 }} draggable={!busy}
            onDragStart={(e) => { e.dataTransfer.setData("application/x-heyso-item", i.id); e.dataTransfer.setData("text/plain", i.id); e.dataTransfer.effectAllowed = "move"; setDraggedItem(i.id); }}
            onDragEnd={() => { setDraggedItem(null); setDragOverItem(null); }}
            onDragOver={(e) => { if (draggedItem) { e.preventDefault(); e.stopPropagation(); setDragOverItem(i.id); e.dataTransfer.dropEffect = validTarget ? "move" : "none"; } }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverItem(null); }} onDrop={(e) => moveWorkItem(e, i.id)}>
            <span aria-hidden="true" className="tree-drag-handle" title="拖动以更改父级">⠿</span>
            {draggedItem && dragOverItem === i.id && !validTarget && <span className="tree-drop-invalid-icon" role="img" aria-label="无法放入" title="无法放入：类型或层级不匹配"><X size={18} strokeWidth={3} aria-hidden="true"/></span>}
            {nested.length ? <button className="tree-fold icon-btn" aria-label={(collapsed ? "展开" : "收起") + i.title} aria-expanded={!collapsed} onClick={() => setCollapsedItems((old) => { const next = new Set(old); next.has(i.id) ? next.delete(i.id) : next.add(i.id); return next; })}>{collapsed ? <ChevronRight size={14}/> : <ChevronDown size={14}/>}</button> : <span className="tree-fold-placeholder"/>}
            <button className="tree-title" onClick={() => open(i)}><Kind kind={i.kind} iconOnly/><span>{i.title}</span>{i.number && <small>{project.code}-{i.number}</small>}</button>
            {collapsed && <span className="muted tree-child-count">{nested.length} 个子项</span>}
            {children.length > 0 && <span className="muted">{children.filter((x) => hasStatus(x, project, "done")).length}/{children.length} 工作项</span>}
            <Badge status={i.status}/>
            {draggedItem && dragOverItem === i.id && <span className="tree-drop-label">{validTarget ? "松开归入此项" : "无法放入：类型或层级不匹配"}</span>}
            {next && <button className="icon-btn" title={"添加子项到" + i.title} onClick={() => create(next, i.id)}><Plus size={16}/></button>}
          </div>
          {!collapsed && renderItemTree({ parent: i.id, depth: depth + 1 })}
        </React.Fragment>;
      })}
    </>;
  }
  function renderOverview() {
    const sprintStories = activeSprint
      ? stories.filter((x) => x.sprintId === activeSprint.id)
      : [];
    return (
      <>
        {header(
          project.name,
          project.description || "查看项目进度、当前冲刺和待验收成果。",
          <button className="primary" onClick={() => create()}>
            <Plus size={16} />
            新建工作项
          </button>,
        )}
        <div className="inline" style={{marginBottom:16,gap:12}}><span>{project.cloud ? '在线项目 · LoyoCloud' : hosting.hosted ? '工作空间项目' : '本地项目'}</span><button onClick={()=>{go('settings');setSettingsSection('integrations');}}>{project.cloud ? '云空间与 AI 连接' : hosting.hosted ? '保存至 LoyoCloud' : '转为在线项目'}</button></div>
        {project.cloud?.error&&<div className="settings-error" role="alert">{project.cloud.error}。当前显示最近读取的内容，联网后刷新。</div>}
        <div className="project-goal-strip">
          <Target size={18} />
          <div>
            <span>项目目标</span>
            <p>
              {project.goal ||
                "在项目设置中补充目标，为团队与 AI 提供共同方向。"}
            </p>
          </div>
          <button className="text-btn" onClick={() => go("hierarchy")}>
            工作项全景
            <ArrowRight size={14} />
          </button>
        </div>
        <div className="project-period">
          <Calendar size={14} />
          <span>
            项目周期：
            {project.startDate && project.endDate
              ? `${project.startDate} 至 ${project.endDate}`
              : "待设置"}
          </span>
          {(!project.startDate || !project.endDate) && (
            <button className="text-btn" onClick={openProjectSettings}>
              设置日期
            </button>
          )}
        </div>
        <div className="stats">
          {[
            [stories.length, "全部工作项", "从目标到行动", BookOpen, "neutral"],
            [
              completed.length,
              "已完成",
              `${percent(completed.length, stories.length)}% 工作项已完成`,
              CheckCircle2,
              "green",
            ],
            [
              review.length,
              "等待人工验收",
              "让成果获得最后确认",
              Clock,
              "orange",
            ],
            [
              blocked.length,
              "需要关注",
              "及时解除执行阻塞",
              AlertCircle,
              "purple",
            ],
          ].map(([n, label, sub, I, color]) => (
            <button
              className="stat"
              key={label}
              onClick={() => {
                go("backlog");
                setFilter(
                  label === "已完成"
                    ? "category:done"
                    : label === "等待人工验收"
                      ? "category:review"
                      : label === "需要关注"
                        ? "category:blocked"
                        : "all",
                );
              }}
            >
              <div className="stat-top">
                <span>{label}</span>
                <I className={color} size={18} />
              </div>
              <strong>
                {n}
                <small>个</small>
              </strong>
              <p>{sub}</p>
            </button>
          ))}
        </div>
        <div className="overview-grid">
          <section className="panel">
            <div className="panel-title">
              <h3>
                <Timer size={18} />
                当前冲刺
              </h3>
              <button className="text-btn" onClick={() => go("sprints")}>
                管理冲刺 <ArrowUpRight size={14} />
              </button>
            </div>
            {activeSprint ? (
              <>
                <div className="sprint-summary">
                  <div>
                    <Badge status="active" workflow={false} />
                    <h2>{activeSprint.name}</h2>
                    <p>{activeSprint.goal}</p>
                    <div className="muted">
                      <Calendar size={14} />
                      {fmt(activeSprint.startDate)} —{" "}
                      {fmt(activeSprint.endDate)}
                      <span> · </span>
                      {sprintStories.length} 个工作项
                    </div>
                  </div>
                  <div
                    className="ring"
                    style={{
                      "--p":
                        percent(
                          sprintStories.filter((x) => hasStatus(x, project, "done"))
                            .length,
                          sprintStories.length,
                        ) + "%",
                    }}
                  >
                    <div>
                      <strong>
                        {percent(
                          sprintStories.filter((x) => hasStatus(x, project, "done"))
                            .length,
                          sprintStories.length,
                        )}
                        <small>%</small>
                      </strong>
                      <span>验收完成</span>
                    </div>
                  </div>
                </div>
                <div className="sprint-footer">
                  <span>
                    <i className="dot green-bg" /> 已完成{" "}
                    {sum(sprintStories.filter((x) => hasStatus(x, project, "done")))} SP
                  </span>
                  <span>计划容量 {activeSprint.capacity} SP</span>
                  <button
                    className="text-btn"
                    onClick={() => {
                      go("board");
                      setSprintFilter(activeSprint.id);
                    }}
                  >
                    进入看板 <ArrowRight size={14} />
                  </button>
                </div>
              </>
            ) : (
              <Empty
                title="开始你的第一次冲刺"
                action={
                  <button onClick={() => setModal({ type: "sprint" })}>
                    创建 Sprint
                  </button>
                }
              />
            )}
          </section>
          <section className="panel">
            <div className="panel-title">
              <h3>
                <Flag size={18} />
                版本计划
              </h3>
              <button className="text-btn" onClick={() => go("releases")}>
                全部 <ArrowUpRight size={14} />
              </button>
            </div>
            {releases.slice(0, 2).map((r) => {
              const a = stories.filter((x) => x.releaseId === r.id),
                n = a.filter((x) => hasStatus(x, project, "done")).length;
              return (
                <div className="release-mini" key={r.id}>
                  <div>
                    <b>{r.name}</b>
                    <Badge status={r.status} workflow={false} />
                  </div>
                  <p>{r.goal}</p>
                  <Progress value={percent(n, a.length)} />
                  <small>
                    {n} / {a.length} 故事完成{" "}
                    <span>{fmt(r.plannedDate)} 计划发布</span>
                  </small>
                </div>
              );
            })}
            {!releases.length && <Empty title="还没有版本" />}
          </section>
        </div>
        <div className="overview-grid bottom-grid">
          <section className="panel">
            <div className="panel-title">
              <h3>
                <Clock size={18} />
                待你验收 <span className="count">{review.length}</span>
              </h3>
              <button
                className="text-btn"
                onClick={() => {
                  go("ai");
                }}
              >
                查看全部 <ArrowUpRight size={14} />
              </button>
            </div>
            {review.length ? (
              review.map((i) => (
                <button
                  className="review-row" data-work-item-id={i.id}
                  key={i.id}
                  onClick={() => {
                    open(i);
                    setTab("runs");
                  }}
                >
                  <div className="bot-box">
                    <Bot size={20} />
                  </div>
                  <div>
                    <small>
                      {project.code}-{i.number} · {i.owner}
                    </small>
                    <strong>{i.title}</strong>
                    <p>成果已准备好，等待你的确认</p>
                  </div>
                  <ArrowRight size={17} />
                </button>
              ))
            ) : (
              <Empty
                title="暂时没有待验收成果"
                text="AI 提交的成果会出现在这里。"
              />
            )}
          </section>
          <section className="panel">
            <div className="panel-title">
              <h3>
                <Activity size={18} />
                最近动态
              </h3>
            </div>
            <div className="activity">
              {events.slice(0, 5).map((e) => (
                <div key={e.id}>
                  <i />
                  <section>
                    <strong>{e.title}</strong>
                    <ActivityDetails event={e}/>
                    <small>{e.actor || "操作者未记录"} · {time(e.at)}</small>
                  </section>
                </div>
              ))}
            </div>
          </section>
        </div>
      </>
    );
  }
  function renderSprints() {
    return (
      <>
        {header(
          "Sprint 冲刺",
          "规划、执行、评审与复盘，形成持续改进的工作节奏。",
          <button
            className="primary"
            onClick={() => setModal({ type: "sprint" })}
          >
            <Plus size={16} />
            创建 Sprint
          </button>,
        )}
        {sprints.length ? (
          sprints.map((sp) => (
            <SprintCard
              key={sp.id}
              sp={sp}
              stories={stories}
              action={action}
              setModal={setModal}
              open={open}
              go={go}
              setSprintFilter={setSprintFilter}
              storyRows={storyRows}
            />
          ))
        ) : (
          <Empty title="还没有 Sprint" />
        )}
      </>
    );
  }
  return (
    <WorkConfigContext.Provider value={project}>
    <>
    <div inert={helpOpen ? true : undefined} className={`app${sidebarCompact ? " sidebar-compact" : ""}`}>
      <header className="appbar">
        <button
          className="app-brand"
          onClick={() => switchPage("dashboard")}
          aria-label="HeySO 首页"
        >
          <img className="mark" src={heysoIcon} alt="" />
          <b>HeySO</b>
          <span>合序</span>
        </button>
        <div className="appbar-tabs" role="tablist" aria-label="工作空间页面">
          {[["dashboard", "仪表盘", LayoutDashboard], ["projects", "项目", FolderKanban]].map(([id, label, Icon]) => (
            <button key={id} id={`tab-${id}`} role="tab" aria-selected={page === id} aria-controls={`panel-${id}`} tabIndex={page === id ? 0 : -1}
              className={page === id ? "active" : ""} onClick={() => switchPage(id)}
              onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === "Home" ? "dashboard" : event.key === "End" ? "projects" : id === "dashboard" ? "projects" : "dashboard";
                document.getElementById(`tab-${next}`)?.focus();
                switchPage(next);
              }}><Icon size={15}/><span>{label}</span></button>
          ))}
        </div>
        <div className="appbar-actions">
        <button className="help-entry" aria-label="复制当前页面链接" title="复制当前页面链接" onClick={() => copy(window.location.href)}><Link size={18}/></button>
        <button className="help-entry" aria-label="帮助中心" title="帮助中心" onClick={() => setHelpOpen(true)}><CircleHelp size={19}/></button>
        <button
          className="global-search"
          aria-label="搜索工作项"
          title="搜索工作项"
          onClick={() => {
            go("backlog");
            requestAnimationFrame(() =>
              document.querySelector('input[aria-label="搜索工作项"]')?.focus(),
            );
          }}
        >
          <Search size={18} />
        </button></div>
      </header>
      {page === "dashboard" && <main className="dashboard-main" id="panel-dashboard" role="tabpanel" aria-labelledby="tab-dashboard">
        {!online && <div className="offline-banner">服务连接已断开，恢复连接后可继续保存。</div>}
        <Dashboard data={data} onRefresh={refresh} onProject={(id) => { switchProject(id); go("overview"); }}
          onOpen={(item) => { switchProject(item.projectId); go("backlog"); open(item); }}
          onCreateProject={() => setModal({ type: "project" })}/>
      </main>}
      {page === "projects" && <>
      <Sidebar
        id="project-sidebar"
        className="sidebar"
        compact={sidebarCompact}
        aria-label={view === "settings" ? "项目设置导航" : "项目管理导航"}
      >
        {view === "settings" && (
          <div className="sidebar-title">
            <button
              className="back-to-project"
              aria-label="返回项目管理"
              data-sidebar-tooltip="返回项目管理"
              data-sidebar-description="返回项目概览和日常工作菜单。"
              onClick={() => go("overview")}
            >
              <ArrowLeft size={16} />
              <span>返回项目管理</span>
            </button>
          </div>
        )}
        <div className="workspace">
          <Select
            kind="project"
            aria-label="切换项目"
            sidebarTooltip={sidebarCompact ? "切换项目" : undefined}
            sidebarDescription={`当前项目：${project.name}。点击切换或创建项目。`}
            value={project.id}
            onCreate={() => requestSettingsNavigation(() => {
              settingsDirtyRef.current = false;
              setView("overview");
              setModal({ type: "project" });
            })}
            onChange={(e) => switchProject(e.target.value)}
          >
            {data.projects.map((p) => (
              <option
                key={p.id}
                value={p.id}
                data-code={p.code}
                data-description={p.description}
              >
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        {view !== "settings" && (
          <button
            className="sidebar-create"
            aria-label="新建工作项"
            data-sidebar-tooltip="新建工作项"
            data-sidebar-description="创建用户故事，明确目标和验收标准。"
            onClick={() => create()}
          >
            <Plus size={15} />
            <span>新建工作项</span>
          </button>
        )}
        <div className="nav-label">
          {view === "settings" ? "项目设置" : "项目管理"}
        </div>
        <nav
          key={view === "settings" ? "settings" : "management"}
          className="sidebar-nav"
        >
          {(view === "settings" ? settingsPages : navs).map(
            ([id, label, I, description]) => (
              <button
                key={id}
                aria-label={label}
                data-sidebar-tooltip={label}
                data-sidebar-description={
                  description || settingsDescriptions[id]
                }
                aria-description={description || settingsDescriptions[id]}
                aria-current={
                  (view === "settings" ? settingsSection === id : view === id)
                    ? "page"
                    : undefined
                }
                className={
                  (view === "settings" ? settingsSection === id : view === id)
                    ? "nav-item active"
                    : "nav-item"
                }
                onClick={() =>
                  view === "settings" ? setSettingsSection(id) : go(id)
                }
              >
                <I size={16} />
                <span>{label}</span>
                {id === "ai" && review.length > 0 && (
                  <small>{review.length}</small>
                )}
              </button>
            ),
          )}
        </nav>
        <div className="sidebar-bottom">
          {view !== "settings" && (
            <button
              className="settings-entry"
              aria-label="项目设置"
              data-sidebar-tooltip="项目设置"
              data-sidebar-description="管理项目资料、成员、工作约定和 AI 连接。"
              onClick={() => {
                setSettingsSection("general");
                go("settings");
              }}
            >
              <Settings size={16} />
              <span>项目设置</span>
              <ChevronRight size={14} />
            </button>
          )}
        </div>
        <button
          type="button"
          className="sidebar-toggle"
          aria-label={sidebarCollapsed ? "展开左侧菜单" : "收起左侧菜单"}
          aria-expanded={!sidebarCompact}
          aria-controls="project-sidebar"
          data-sidebar-tooltip={
            sidebarCollapsed ? "展开左侧菜单" : "收起左侧菜单"
          }
          data-tooltip-always="true"
          onClick={() => setSidebarCollapsed((value) => !value)}
        >
          {sidebarCollapsed ? (
            <ChevronRight size={16} strokeWidth={1.6} />
          ) : (
            <ChevronLeft size={16} strokeWidth={1.6} />
          )}
        </button>
      </Sidebar>
      <main id="panel-projects" role="tabpanel" aria-labelledby="tab-projects">
        <header className="topbar">
          <div>
            <Select
              className="mobile-project"
              kind="project"
              onCreate={() => requestSettingsNavigation(() => {
                settingsDirtyRef.current = false;
                setView("overview");
                setModal({ type: "project" });
              })}
              aria-label="切换工作项目"
              value={project.id}
              onChange={(e) => switchProject(e.target.value)}
            >
              {data.projects.map((p) => (
                <option
                  key={p.id}
                  value={p.id}
                  data-code={p.code}
                  data-description={p.description}
                >
                  {p.name}
                </option>
              ))}
            </Select>
            <span className="desktop-project">{project.name}</span>
            <ChevronRight size={14} />
            {view === "settings" && (
              <>
                <span>项目设置</span>
                <ChevronRight size={14} />
              </>
            )}
            <b>
              {view === "settings"
                ? settingsPages.find((x) => x[0] === settingsSection)?.[1]
                : navs.find((x) => x[0] === view)?.[1]}
            </b>
          </div>
          <div>
            {hosting.hosted && hosting.configure && <button className="text-btn" onClick={hosting.configure}>云端存储</button>}
            {hosting.hosted && <button className="text-btn" onClick={hosting.logout}>退出工作空间</button>}
            <button
              className="icon-btn"
              title="刷新数据"
              onClick={() => {
                refresh();
                setToast("已刷新");
              }}
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </header>
        {!online && (
          <div className="offline-banner">
            服务连接已断开，恢复连接后可继续保存。
          </div>
        )}
        <div className={"content view-" + view} key={project.id + view} onContextMenu={handleContextMenu} onKeyDown={handleContextMenu}>
          {view === "overview" && renderOverview()}
          {view === 'roadmap' && <React.Suspense fallback={<p className="muted" role="status">正在打开路线图…</p>}><Roadmap onSchedule={(item, dates) => action("item.update", { id: item.id, ...dates })} key={project.id} project={project} items={items} releases={releases} busy={busy} onOpen={open} onCreate={() => create()} onReleases={() => go('releases')} onProjectSettings={openProjectSettings}/></React.Suspense>}
          {view === "hierarchy" && (
            <>
              {header(
                "工作项层级",
                "管理具体工作项的父子关系，拖动条目即可调整归属。",
                <button className="primary" onClick={() => create()}>
                  <Plus size={16} />
                  新建工作项
                </button>,
              )}
              <div className="hierarchy-legend">
                {Object.keys(kinds).filter((k) => typeFor(project, k)?.enabled && !typeFor(project, k)?.hidden).map((k, i) => (
                  <React.Fragment key={k}>
                    <Kind kind={k} />

                  </React.Fragment>
                ))}
                <span className="ml-auto muted">点击条目查看详情</span>
              </div>
              <section className="panel tree" data-work-scope="hierarchy" tabIndex={0}>
                <div className="tree-sticky-header">
                <div className="panel-title">
                  <div className="tree-search"><Search size={15}/><input aria-label="搜索层级工作项" placeholder="搜索标题、编号或类型，保留父级路径" value={treeQuery} onChange={(e) => setTreeQuery(e.target.value)}/>{treeQuery && <button className="icon-btn" aria-label="清除层级搜索" onClick={() => setTreeQuery("")}><X size={13}/></button>}</div>
                  <Select
                    aria-label="新建工作项类型"
                    value=""
                    onChange={(e) => create(e.target.value)}
                  >
                    <option value="">新建条目</option>
                    {Object.entries(kinds)
                      .filter(([k]) => typeFor(project, k)?.enabled && !typeFor(project, k)?.hidden)
                      .map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                  </Select>
                </div>
                <div className="tree-toolbar">
                  <div className={"tree-root-drop" + (dragOverItem === "root" ? " drag-target" : "")} aria-label="移至未归类"
                    onDragOver={(e) => { if (draggedItem) { e.preventDefault(); setDragOverItem("root"); } }}
                    onDragLeave={() => setDragOverItem(null)} onDrop={(e) => moveWorkItem(e, null)}>
                    {draggedItem ? `正在移动「${items.find((i) => i.id === draggedItem)?.title}」 · 松开移至未归类，或拖到允许的父级行` : "拖到这里移至根层级 / 未归类 · 子任务须保留父级，也可在详情中选择父级"}
                  </div>
                  <button onClick={() => setCollapsedItems(new Set())}>全部展开</button>
                  <button onClick={() => setCollapsedItems(new Set(items.filter((i) => items.some((x) => x.parentId === i.id)).map((i) => i.id)))}>全部收起</button>
                </div>
                </div>
                {renderItemTree()}
                {!items.length && <Empty title="从你的第一个目标开始" />}
              </section>
            </>
          )}
          {view === "backlog" && (
            <>
              <div className="backlog-sticky-heading">
              {header(
                "产品待办池",
                "梳理故事、明确优先级，再安排到合适的版本和冲刺。",
                <button className="primary" onClick={() => create()}>
                  <Plus size={16} />
                  新建工作项
                </button>,
              )}
              <div className="backlog-toolbar-panel">{toolbar}</div>
              </div>
              <section className="panel backlog-list" data-work-scope="backlog" tabIndex={0}>
                {storyRows(
                  [...filtered].sort(
                    (a, b) =>
                      ({ high: 0, medium: 1, low: 2 })[a.priority] -
                      { high: 0, medium: 1, low: 2 }[b.priority],
                  ),
                )}
              </section>
            </>
          )}
          {view === "board" && (
            <>
              {header(
                "工作看板",
                "执行与验收分开，让每一个成果都有明确的下一步。",
                <button className="primary" onClick={() => create()}>
                  <Plus size={16} />
                  新建工作项
                </button>,
              )}
              <div className="board-toolbar">
                {toolbar}
                <Select
                  aria-label="冲刺筛选"
                  value={sprintFilter}
                  onChange={(e) => setSprintFilter(e.target.value)}
                >
                  <option value="all">全部 Sprint</option>
                  {sprints.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="board" style={{ gridTemplateColumns: `repeat(${boardStatuses(project).length}, minmax(205px, 1fr))` }}>
                {boardStatuses(project).map(
                  ({ id: status }) => {
                    const rows = filtered.filter(
                      (x) =>
                        x.status === status &&
                        (sprintFilter === "all" || x.sprintId === sprintFilter),
                    );
                    return (
                      <section
                        className="board-column" data-work-scope="board" data-scope-id={status} tabIndex={0}
                        key={status}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const id = e.dataTransfer.getData("text/plain");
                          if (id) action("item.update", { id, status });
                        }}
                      >
                        <div className="column-title">
                          <Badge status={status} />
                          <span>{rows.length}</span>
                          <button
                            title="新建工作项"
                            className="icon-btn ml-auto"
                            onClick={() => create()}
                          >
                            <Plus size={15} />
                          </button>
                        </div>
                        {rows.map((i) => (
                          <button
                            className="story-card" data-work-item-id={i.id}
                            key={i.id}
                            draggable
                            onDragStart={(e) =>
                              e.dataTransfer.setData("text/plain", i.id)
                            }
                            onClick={() => open(i)}
                          >
                            <div>
                              <Kind kind={i.kind} iconOnly/><small>{project.code}-{i.number}</small>
                              {i.aiEnabled && <Bot size={15} />}
                            </div>
                            <h4>{i.title}</h4>
                            <p>
                              {releases.find((r) => r.id === i.releaseId)
                                ?.name || "未安排版本"}
                            </p>
                            <footer>
                              <span className={"priority " + i.priority}>
                                <PriorityIcon value={i.priority} />{" "}
                                {priorities[i.priority]}
                              </span>
                              <span className="points">{i.points || "—"}</span>
                              <span className="avatar ml-auto" title={i.owner}>
                                {i.owner?.slice(0, 1)}
                              </span>
                            </footer>
                          </button>
                        ))}
                        {!rows.length && (
                          <div className="drop-hint">拖动工作项到这里</div>
                        )}
                      </section>
                    );
                  },
                )}
              </div>
            </>
          )}
          {view === "sprints" && renderSprints()}
          {view === "releases" && (
            <>
              {header(
                "版本发布",
                "独立规划发布范围，记录实际交付与延期内容。",
                <button
                  className="primary"
                  onClick={() => setModal({ type: "release" })}
                >
                  <Plus size={16} />
                  创建版本
                </button>,
              )}
              <div className="release-filters tabs" role="tablist" aria-label="版本分类">
                {[["all","全部"],["released","已发布"],["unreleased","未发布"]].map(([value,label])=><button key={value} role="tab" aria-selected={releaseFilter===value} className={releaseFilter===value?"active":""} onClick={()=>setReleaseFilter(value)}>{label}<span>{releases.filter(r=>value==="all"||(value==="released"?r.status==="released":r.status!=="released")).length}</span></button>)}
              </div>
              {visibleReleases.map((r) => {
                const rows =
                    r.status === "released"
                      ? r.publishedStories || []
                      : stories.filter((x) => x.releaseId === r.id),
                  done = rows.filter((x) => hasStatus(x, project, "done"));
                return (
                  <section className="panel release-card" key={r.id} data-work-scope="release" data-scope-id={r.id} tabIndex={0}>
                    <div className="release-heading">
                      <div className="release-icon">
                        <Flag size={22} />
                      </div>
                      <div>
                        <div className="inline">
                          <h2>{r.name}</h2>
                          <Badge status={r.status} workflow={false} />
                        </div>
                        <p>{r.goal}</p>
                      </div>
                      <div className="ml-auto release-actions">
                        <span className="muted">
                          计划发布 {fmt(r.plannedDate)}
                        </span>
                        {r.status !== "released" && (
                          <>
                            <Select
                              aria-label={`${r.name} 状态`}
                              value={r.status}
                              onChange={(e) =>
                                action("release.update", {
                                  id: r.id,
                                  status: e.target.value,
                                })
                              }
                            >
                              <option value="planning">规划中</option>
                              <option value="active">开发中</option>
                              <option value="ready">待发布</option>
                            </Select>
                            <button
                              className="primary"
                              onClick={() =>
                                setModal({ type: "publish", release: r })
                              }
                            >
                              确认发布 <ArrowUpRight size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="release-progress">
                      <Progress value={percent(done.length, rows.length)} />
                      <span>
                        {done.length} / {rows.length} 故事已验收
                      </span>
                    </div>
                    {storyRows(rows, true, r.status === "released")}
                    {r.status === "released" && (
                      <div className="release-notes">
                        <h4>发布记录 · {time(r.publishedAt)}</h4>
                        <p>{r.notes}</p>
                        <p className="muted">
                          延期 {r.deferredStories?.length || 0}{" "}
                          个工作项，已记录去向。
                        </p>
                      </div>
                    )}
                  </section>
                );
              })}
              {!visibleReleases.length && <Empty title={!releases.length?"规划你的第一个版本":releaseFilter==="released"?"暂无已发布版本":"暂无未发布版本"} />}
            </>
          )}
          {view === "memory" && (
            <>
              {header(
                "项目记忆",
                "持续保存项目约定、关键决定与经验，成为人和 AI 共享的记忆。",
                <button
                  className="primary"
                  onClick={() => setModal({ type: "note" })}
                >
                  <Plus size={16} />
                  记录记忆
                </button>,
              )}
              <div className="memory-grid">
                {notes.map((n) => (
                  <article className="panel memory-card" key={n.id}>
                    <span
                      className={
                        "kind " + (n.type === "decision" ? "epic" : "feature")
                      }
                    >
                      {n.type === "decision" ? (
                        <GitBranch size={14} />
                      ) : (
                        <BookOpen size={14} />
                      )}
                      {
                        {
                          decision: "关键决定",
                          context: "工作上下文",
                          learning: "经验与复盘",
                        }[n.type]
                      }
                    </span>
                    <h3>{n.title}</h3>
                    <p>{n.body}</p>
                    <footer>
                      <span className="avatar">我</span>
                      <span>
                        {n.author} · {fmt(n.createdAt)}
                      </span>
                      <span className="ml-auto">
                        <CheckCircle2 size={13} /> 人工记录
                      </span>
                    </footer>
                  </article>
                ))}
              </div>
              {!notes.length && <Empty title="记录第一个共识" />}
            </>
          )}
          {view === "ai" && (
            <>
              {header(
                "AI 交付",
                "跟踪执行进展、查看交付结果，并完成人工验收。",
                <button
                  onClick={() => {
                    setSettingsSection("integrations");
                    go("settings");
                  }}
                >
                  <Settings size={15} />
                  管理 AI 连接
                </button>,
              )}
              <div className="stats three">
                {[
                  [
                    items.filter((x) => isExecutionItem(x, project) && aiExecutionEnabled(x,items)).length,
                    "已启用 AI 的工作项",
                  ],
                  [runs.length, "累计执行记录"],
                  [
                    runs.filter((x) => x.status === "review").length,
                    "等待审核的交付",
                  ],
                ].map(([n, l]) => (
                  <div className="stat" key={l}>
                    <span>{l}</span>
                    <strong>{n}</strong>
                  </div>
                ))}
              </div>
              <section className="panel">
                <div className="panel-title">
                  <h3>执行与交付</h3>
                  <span className="muted">成果由人确认</span>
                </div>
                {runs.length ? (
                  runs
                    .slice()
                    .reverse()
                    .map((r) => {
                      const i = items.find((x) => x.id === runTargetId(r));
                      return (
                        <button
                          className="run-row" data-work-item-id={i?.id} data-work-run-id={r.id}
                          key={r.id}
                          onClick={() => {
                            open(i);
                            setTab("runs");
                          }}
                        >
                          <div className="bot-box">
                            <Bot size={20} />
                          </div>
                          <div>
                            <h4>{i?.title}</h4>
                            <p>
                              {r.agent} · {project.code}-{i?.number} · {time(r.createdAt)}
                            </p>
                          </div>
                          <Badge status={r.status} workflow={false} />
                          <ChevronRight size={16} />
                        </button>
                      );
                    })
                ) : (
                  <Empty
                    title="等待你的第一次 AI 交付"
                    text="在工作项中启用 AI，然后复制执行指令到已连接的 AI 工具。"
                  />
                )}
              </section>
            </>
          )}
          {view === "settings" && (
            <SettingsPanel
              key={project.id}
              project={project}
              cloudPanel={<CloudPanel project={project} busy={busy||settingsDirtyRef.current} onState={receiveCloudState} setToast={setToast}/>}
              section={settingsSection}
              action={action}
              data={data}
              setData={next=>syncRef.current.receive(next)}
              setToast={setToast}
              busy={busy}
              onDirtyChange={setSettingsDirty}
              onDelete={() => setModal({ type: "deleteProject", project })}
              onConnect={async () => {
                await getConnection();
                setModal({ type: "connection" });
              }}
            />
          )}
          <footer className="page-footer">
            <span>合序 HeySO</span>
            <span>Hey, Shared Outcomes.</span>
            <span>{project.cloud ? "LoyoCloud 在线项目" : hosting.hosted ? "在线保存" : "本地保存"} · alpha_0.1</span>
          </footer>
        </div>
      </main>
      </>}
      <Presence present={!!selectedItem} onClose={() => setSelected(null)}>
        {selectedItem && (
          <Detail
            busy={busy}
            onProjectSettings={openProjectSettings}
            item={selectedItem}
            items={items}
            project={project}
            data={data}
            sprints={sprints}
            releases={releases}
            action={action}
            close={() => setSelected(null)}
            tab={tab}
            setTab={setTab}
            create={create}
            open={open}
            copy={copy}
            setModal={setModal}
          />
        )}
      </Presence>
      <Presence
        present={!!modal}
        onClose={() => {
          if (modal?.type !== "deleteProject" || !busy) setModal(null);
        }}
      >
        {modal &&
          (modal.type === "deleteProject" ? (
            <DeleteProjectDialog
              project={
                data.projects.find((p) => p.id === modal.project.id) ||
                modal.project
              }
              data={data}
              action={action}
              busy={busy}
              onClose={() => setModal(null)}
              onDeleted={(result) => {
                switchProject(result.remainingProjectId || "");
                if (!result.remainingProjectId)
                  localStorage.removeItem("heyso-project");
                setModal(null);
                go("overview");
                setToast("项目已删除");
              }}
            />
          ) : modal.type === "workSnapshot" ? (
            <WorkItemDialog key={modal.type + modal.item.id} modal={modal} project={project} items={items} action={action} busy={busy} onClose={() => setModal(null)}/>
          ) : (
            <EditorModal
              modal={modal}
              setModal={setModal}
              data={data}
              project={project}
              action={action}
              busy={busy}
              connection={connection}
              copy={copy}
              onProjectSettings={openProjectSettings}
              setProjectId={setProjectId}
            />
          ))}
      </Presence>
      {contextMenu && <ContextMenu key={`${contextMenu.x}:${contextMenu.y}:${contextMenu.item?.id || contextMenu.scopeId || contextMenu.scope}`} menu={contextMenu} entries={contextEntries()} onClose={closeContextMenu}/>}
        <Presence present={!!settingsNavigation} onClose={() => setSettingsNavigation(null)}>
        {settingsNavigation && <div className="modal-layer">
          <section className="modal unsaved-settings-modal" role="dialog" aria-modal="true" aria-labelledby="unsaved-settings-title" aria-describedby="unsaved-settings-description">
            <header><span className="unsaved-settings-icon"><AlertCircle size={23}/></span><h2 id="unsaved-settings-title">设置尚未保存</h2><button className="icon-btn" aria-label="继续编辑设置" onClick={() => setSettingsNavigation(null)}><X size={18}/></button></header>
            <div className="modal-body"><p id="unsaved-settings-description">离开将丢失本次修改。你可以继续编辑，保存后再离开。</p></div>
            <footer><button className="discard-settings-button" onClick={() => {
              const navigate = settingsNavigation;
              settingsDirtyRef.current = false;
              setSettingsNavigation(null);
              navigate();
            }}>放弃并离开</button><button className="primary" autoFocus onClick={() => setSettingsNavigation(null)}>继续编辑</button></footer>
          </section>
        </div>}
      </Presence>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={17} />
          {toast}
          <button className="icon-btn" onClick={() => setToast("")}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
    {helpOpen && <HelpCenter initialArticle={view === "settings" ? ({types:"types",hierarchy:"hierarchy",states:"workflows"}[settingsSection] || "types") : "types"} onClose={() => setHelpOpen(false)}/>}
    </>
    </WorkConfigContext.Provider>
  );
}
function SprintCard({
  sp,
  stories,
  action,
  setModal,
  open,
  go,
  setSprintFilter,
  storyRows,
}) {
  const project = useWorkProject();
  const [expanded, setExpanded] = useState(sp.status === "active"),
    [section, setSection] = useState("stories"),
    [review, setReview] = useState(sp.review),
    [retro, setRetro] = useState(sp.retro);
  const rows =
      sp.status === "closed"
        ? sp.finalStories || []
        : stories.filter((x) => x.sprintId === sp.id),
    done = rows.filter((x) => hasStatus(x, project, "done"));
  const daily = Object.values(
    Object.fromEntries((sp.snapshots || []).map((x) => [x.date, x])),
  );
  const max = Math.max(1, ...daily.map((x) => x.total));
  return (
    <section className="panel sprint-card" data-work-scope="sprint" data-scope-id={sp.id} tabIndex={0}>
      <div className="sprint-heading">
        <button
          className="icon-btn"
          aria-label={expanded ? "收起冲刺" : "展开冲刺"}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>
        <div>
          <div className="inline">
            <h2>{sp.name}</h2>
            <Badge status={sp.status} workflow={false} />
          </div>
          <p>{sp.goal}</p>
          <div className="muted">
            <Calendar size={14} />
            {fmt(sp.startDate)} — {fmt(sp.endDate)}{" "}
            <span>· 容量 {sp.capacity} SP</span>
          </div>
        </div>
          <div className="sprint-metrics">
            <span>
              <strong>{rows.length}</strong>范围内工作项
            </span>
            <span>
              <strong>{sum(rows)}</strong>总故事点
            </span>
            <span>
              <strong>{sum(done)}</strong>已完成故事点
            </span>
            <span>
              <strong>{rows.filter((x) => !x.points).length}</strong>未估算
            </span>
            <div>
              <Progress value={percent(done.length, rows.length)} />
              <small>{percent(done.length, rows.length)}% 已验收</small>
            </div>
          </div>
        <div className="inline sprint-actions">
          {sp.status === "planned" && (
            <button
              className="primary"
              onClick={() => action("sprint.start", { id: sp.id })}
            >
              <Play size={15} />
              启动冲刺
            </button>
          )}
          {sp.status === "active" && (
            <>
              <button
                onClick={() => {
                  go("board");
                  setSprintFilter(sp.id);
                }}
              >
                打开看板
              </button>
              <button
                className="primary"
                onClick={() => setModal({ type: "closeSprint", sprint: sp })}
              >
                结束冲刺
              </button>
            </>
          )}
        </div>
      </div>
      {expanded && (
        <>
          <div className="tabs">
            {[
              ["stories", "冲刺范围"],
              ["review", "评审与复盘"],
              ["tracking", "基线与燃尽"],
            ].map(([id, label]) => (
              <button
                className={section === id ? "active" : ""}
                key={id}
                onClick={() => setSection(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {section === "stories" && (
            <>
              {storyRows(rows, false, sp.status === "closed")}
              {sp.status === "planned" && (
                <div className="section-pad">
                  <button
                    onClick={() => {
                      go("backlog");
                    }}
                  >
                    从待办池安排故事 <ArrowRight size={14} />
                  </button>
                  <p className="muted">
                    在故事详情中选择当前 Sprint，即可加入冲刺范围。
                  </p>
                </div>
              )}
              {sp.status === "closed" && sp.carryover?.length > 0 && (
                <div className="section-pad">
                  <h4>未完成故事的去向</h4>
                  {sp.carryover.map((x) => (
                    <p key={x.id}>
                      {x.title}{" "}
                      <span className="muted">
                        →{" "}
                        {x.to === "backlog"
                          ? "产品待办池"
                          : x.to === "cancel"
                            ? "已取消"
                            : "后续 Sprint"}
                      </span>
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
          {section === "review" && (
            <div className="section-pad">
              <div className="form-grid">
                <Field label="冲刺评审 · 目标与成果">
                  <textarea
                    disabled={sp.status === "closed"}
                    value={review}
                    onChange={(e) => setReview(e.target.value)}
                    placeholder="目标是否达成？实际交付了什么？"
                  />
                </Field>
                <Field label="做得好的地方">
                  <textarea
                    disabled={sp.status === "closed"}
                    value={retro.wentWell}
                    onChange={(e) =>
                      setRetro({ ...retro, wentWell: e.target.value })
                    }
                    placeholder="哪些做法值得保留？"
                  />
                </Field>
                <Field label="需要改进的地方">
                  <textarea
                    disabled={sp.status === "closed"}
                    value={retro.improve}
                    onChange={(e) =>
                      setRetro({ ...retro, improve: e.target.value })
                    }
                    placeholder="哪些问题影响了交付？"
                  />
                </Field>
                <Field label="下次采取的行动">
                  <textarea
                    disabled={sp.status === "closed"}
                    value={retro.actions}
                    onChange={(e) =>
                      setRetro({ ...retro, actions: e.target.value })
                    }
                    placeholder="写清行动，结束时可以转为后续故事。"
                  />
                </Field>
              </div>
              {sp.status !== "closed" && (
                <button
                  className="primary"
                  onClick={() =>
                    action("sprint.update", { id: sp.id, review, retro })
                  }
                >
                  保存评审与复盘
                </button>
              )}
            </div>
          )}
          {section === "tracking" && (
            <div className="section-pad">
              <div className="form-grid">
                <div>
                  <h4>范围基线</h4>
                  <p className="muted">
                    启动时 {sp.baseline.length} 个工作项 · {sum(sp.baseline)}{" "}
                    SP；当前 {rows.length} 个工作项 · {sum(rows)} SP
                  </p>
                  <div className="baseline-list">
                    {sp.baseline.map((x) => (
                      <div key={x.id}>
                        <span>{x.title}</span>
                        <b>{x.points || "—"} SP</b>
                      </div>
                    ))}
                  </div>
                  <h4>冲刺内范围变化</h4>
                  {sp.scopeChanges.length ? (
                    sp.scopeChanges.map((x, i) => (
                      <p key={i} className="muted">
                        {fmt(x.at)} · {x.action}「{x.title}」· {x.reason}
                      </p>
                    ))
                  ) : (
                    <p className="muted">暂无范围变化</p>
                  )}
                </div>
                <div>
                  <h4>剩余故事点</h4>
                  {daily.length ? (
                    <>
                      <svg
                        className="burn-chart"
                        viewBox="0 0 420 210"
                        role="img"
                        aria-label="燃尽图：实际剩余故事点"
                      >
                        <line
                          x1="30"
                          y1="180"
                          x2="400"
                          y2="180"
                          stroke="#dde2e7"
                        />
                        <line
                          x1="30"
                          y1="20"
                          x2="30"
                          y2="180"
                          stroke="#dde2e7"
                        />
                        {[0, 0.5, 1].map((n) => (
                          <g key={n}>
                            <line
                              x1="30"
                              x2="400"
                              y1={180 - n * 150}
                              y2={180 - n * 150}
                              stroke="#edf0f3"
                            />
                            <text
                              x="0"
                              y={185 - n * 150}
                              fontSize="11"
                              fill="#87919c"
                            >
                              {Math.round(max * n)}
                            </text>
                          </g>
                        ))}
                        <polyline
                          points={daily
                            .map(
                              (d, i) =>
                                `${45 + (daily.length > 1 ? (i / (daily.length - 1)) * 340 : 0)},${180 - (d.remaining / max) * 150}`,
                            )
                            .join(" ")}
                          fill="none"
                          stroke="var(--accent)"
                          strokeWidth="3"
                        />
                        {daily.map((d, i) => (
                          <g key={d.date}>
                            <circle
                              cx={
                                45 +
                                (daily.length > 1
                                  ? (i / (daily.length - 1)) * 340
                                  : 0)
                              }
                              cy={180 - (d.remaining / max) * 150}
                              r="4"
                              fill="var(--accent)"
                            />
                            <text
                              x={
                                45 +
                                (daily.length > 1
                                  ? (i / (daily.length - 1)) * 340
                                  : 0)
                              }
                              y="202"
                              textAnchor="middle"
                              fontSize="10"
                              fill="#87919c"
                            >
                              {fmt(d.date)}
                            </text>
                          </g>
                        ))}
                      </svg>
                      <p className="muted">
                        按实际变更记录每日最后的剩余量。
                        {daily.length === 1
                          ? "当前只有一天的数据，后续随执行累积。"
                          : ""}
                      </p>
                    </>
                  ) : (
                    <p className="muted">启动冲刺后开始记录实际数据。</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
function Field({ label, children, wide }) {
  const Container = React.Children.toArray(children).some(child => React.isValidElement(child) && child.type === RichTextEditor) ? "div" : "label";
  return (
    <Container className={"field " + (wide ? "wide" : "")}>
      <span>{label}</span>
      {React.Children.map(children, (child) =>
        React.isValidElement(child) && child.type === Select
          ? React.cloneElement(child, {
              "aria-label": child.props["aria-label"] || label,
            })
          : child,
      )}
    </Container>
  );
}
function Detail({
  busy,
  onProjectSettings,
  item: i,
  items,
  project,
  data,
  sprints,
  releases,
  action,
  close,
  tab,
  setTab,
  create,
  open,
  copy,
  setModal,
}) {
  const update = (p) => action("item.update", { id: i.id, ...p });
  const [pendingKind, setPendingKind] = useState("");
  const [pendingStatus, setPendingStatus] = useState("");
  const changeKind = (kind) => {
    if(workflowStatuses(project,kind).some(s=>s.id===i.status)) update({kind});
    else {setPendingKind(kind);setPendingStatus(workflowFor(project,kind).initialStatus);}
  };
  const kinds = typeNames(project);
  const statusNames = statusNamesFor(project);
  const possibleParents = parentCandidates(project, items, i.kind, i.id);
  const parentItem = items.find((p) => p.id === i.parentId);
  const ancestors = [];
  let ancestor = parentItem;
  while (ancestor && !ancestors.some((a) => a.id === ancestor.id)) { ancestors.unshift(ancestor); ancestor = items.find((p) => p.id === ancestor.parentId); }
  const parentKind = configFor(project).types.some((t) => t.enabled && canParent(project, i.kind, { kind: t.id }));
  const tasks = items.filter((x) => x.parentId === i.id);
  const story =
    isWorkItem(i, project)
      ? i
      : items.find((x) => x.id === i.parentId && isWorkItem(x, project));
  const runs = data.runs
    .filter((r) => runTargetId(r) === i.id)
    .slice()
    .reverse();
  const events = data.events.filter((x) => x.itemId === i.id);
  const prompt = executionInstruction(project, i);
  const aiOn=aiExecutionEnabled(i,items);
  return (
    <div className="drawer-layer">
      <div className="drawer-scrim" onClick={close} />
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="条目详情"
      >
        <header>
          <div>
            <Kind kind={i.kind} />
            <button className="work-item-code" aria-label="复制工作项 ID" title="点击复制工作项 ID" onClick={() => { const code = i.number ? project.code + "-" + i.number : i.id; copy(code, "已复制工作项 ID：" + code); }}>{i.number ? project.code + "-" + i.number : i.id}</button>
          </div>
          <div>
            <button className="icon-btn" aria-label="复制工作项链接" title="复制工作项链接" onClick={() => copy(window.location.href)}><Link size={17}/></button>
            {isExecutionItem(i,project)&&<button className={'icon-btn detail-ai-button'+(aiOn?' on':'')} aria-label={aiOn?'停用 AI 执行':'启用 AI 执行'} aria-pressed={aiOn} title={!aiOn&&!aiReady(workflowFor(project,i.kind))?'请先配置执行、验收和完成节点':aiOn?'停用当前工作项的 AI 执行':'启用当前工作项的 AI 执行'} disabled={busy||(!aiOn&&!aiReady(workflowFor(project,i.kind)))} onClick={()=>update({aiEnabled:!aiOn,aiDisabled:aiOn})}><Bot size={18}/></button>}
          </div>
        </header>
        <div className="drawer-body">
          {ancestors.length > 0 && <nav className="item-parent-path" aria-label="父级路径">{ancestors.map((parent) => <React.Fragment key={parent.id}><button onClick={() => open(parent)} title={parent.title}><Kind kind={parent.kind} iconOnly/><span>{parent.title}</span></button><ChevronRight size={12}/></React.Fragment>)}<span>当前工作项</span></nav>}
          <div className="detail-heading">
            <div className="detail-title-row">
              <span
                className="detail-status-icon"
                role="img"
                aria-label={"当前状态：" + (statusNames[i.status] || i.status)}
                title={statusNames[i.status] || i.status}
              >
                <StatusIcon value={i.status} stage={categoryOf(project, i.status, i.kind)} size={21} />
              </span>
              <WorkItemTitle
                key={i.id + "title"}
                value={i.title}
                save={(title) => update({ title })}
              />
            </div>

          </div>
          <div className="tabs">
            {[
              ["detail", "详情"],
              ["children", isWorkItem(i, project) ? "子任务" : "子项"],
              ...(isExecutionItem(i, project) ? [["runs", "交付与验收"]] : []),
              ["history", "活动记录"],
            ].map(([k, v]) => (
              <button
                key={k}
                className={tab === k ? "active" : ""}
                onClick={() => setTab(k)}
              >
                {v}
              </button>
            ))}
          </div>
          {tab === "detail" && (
            <>
              <div className="form-grid detail-fields">
                <Field label="工作项类型"><Select value={i.kind} onChange={(e) => changeKind(e.target.value)}>{configFor(project).types.filter((t) => t.enabled && (!t.hidden || t.id === i.kind) && t.level === typeFor(project, i.kind)?.level).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
                {pendingKind && <div className="workflow-migration-preview"><p>目标类型使用不同工作流，请选择转换后的状态。</p><Select aria-label="类型转换后的状态" value={pendingStatus} onChange={e=>setPendingStatus(e.target.value)}>{workflowStatuses(project,pendingKind).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</Select><button onClick={async()=>{const result=await update({kind:pendingKind,status:pendingStatus});if(result)setPendingKind("");}}>确认转换</button><button onClick={()=>setPendingKind("")}>取消</button></div>}

                <Field label="负责人">
                  <Select
                    value={i.owner}
                    onChange={(e) => update({ owner: e.target.value })}
                  >
                    {project.members.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="状态">
                  <Select
                    value={i.status}
                    onChange={(e) => update({ status: e.target.value })}
                  >
                    {Object.entries(statusNames)
                      .filter(([key]) => key === i.status || (configFor(project).statuses.some((s) => s.id === key && s.enabled) && allowedTransition(project, i.status, key, i.kind)))
                      .filter(
                        ([k]) =>
                          !isExecutionItem(i, project) || !workflowFor(project,i.kind).rules?.requireReview ||
                          categoryOf(project, k, i.kind) !== "done" ||
                          hasStatus(i, project, "done"),
                      )
                      .map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                  </Select>
                </Field>
                <Field label="优先级">
                  <Select
                    value={i.priority}
                    onChange={(e) => update({ priority: e.target.value })}
                  >
                    {Object.entries(priorities).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </Field>
                {parentKind && (
                  <Field label="父级工作项">
                    <Select
                      value={i.parentId || ""}
                      onChange={(e) => update({ parentId: e.target.value })}
                    >
                      {!isSubtask(i, project) && <option value="">暂不归类</option>}
                      {items
                        .filter((x) => possibleParents.some((p) => p.id === x.id))
                        .map((x) => (
                          <option key={x.id} value={x.id} data-kind={x.kind} data-description={typeNames(project)[x.kind] + (x.parentId ? " · " + (items.find((p) => p.id === x.parentId)?.title || "") : " · 根层级")}>
                            {x.number ? `${project.code}-${x.number} · ${x.title}` : x.title}
                          </option>
                        ))}
                    </Select>
                  </Field>
                )}
                {isWorkItem(i, project) && (
                  <>
                    <Field label="目标版本">
                      <Select
                        value={i.releaseId || ""}
                        onChange={(e) => update({ releaseId: e.target.value })}
                      >
                        <option value="">未安排</option>
                        {releases
                          .filter(
                            (r) =>
                              r.status !== "released" || r.id === i.releaseId,
                          )
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                      </Select>
                    </Field>
                    <Field label="Sprint">
                      <Select
                        value={i.sprintId || ""}
                        onChange={(e) => update({ sprintId: e.target.value })}
                      >
                        <option value="">产品待办池</option>
                        {sprints
                          .filter(
                            (s) => s.status !== "closed" || s.id === i.sprintId,
                          )
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                      </Select>
                    </Field>
                    <Field label="故事点">
                      <Select
                        value={i.points || 0}
                        onChange={(e) =>
                          update({ points: Number(e.target.value) })
                        }
                      >
                        {[0, 1, 2, 3, 5, 8, 13, 21, 34].map((n) => (
                          <option key={n} value={n}>
                            {n || "未估算"}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </>
                )}
              </div>
              <ItemSchedule
                item={i}
                project={project}
                parent={parentItem}
                onSave={update}
                onProjectSettings={onProjectSettings}
                busy={busy}
              />
              <Field label="描述">
                <RichTextEditor
                  key={i.id + "desc"}
                  value={i.description}
                  label="描述"
                  onSave={(description) => update({ description })}
                  placeholder="描述背景、目标与需要提供的材料…"
                />
              </Field>
              {isExecutionItem(i, project) && (
                <Field label="验收标准">
                  <RichTextEditor
                    key={i.id + "ac"}
                    value={i.acceptance}
                    label="验收标准"
                    onSave={(acceptance) => update({ acceptance })}
                    placeholder="什么样的结果可以被确认完成？"
                  />
                </Field>
              )}
              {i.kind === "theme" && (
                <Field label="目标与衡量标准">
                  <RichTextEditor
                    value={i.goal}
                    label="目标与衡量标准"
                    onSave={(goal) => update({ goal })}
                  />
                </Field>
              )}
              {(isWorkItem(i, project) || isSubtask(i, project)) && (
                <div className="instruction-box">
                  <h4>
                    <Bot size={17} />
                    交给你熟悉的 AI 工具
                  </h4>
                  <p>
                    先连接项目 MCP，再复制执行指令。AI
                    会读取最新上下文，并将成果交回这里。
                  </p>
                  <button
                    disabled={!aiOn}
                    onClick={() => copy(prompt)}
                  >
                    <Copy size={15} />
                    复制执行指令
                  </button>
                  {!aiOn && (
                    <small>请先为所属工作项启用 AI 执行</small>
                  )}
                </div>
              )}
              <div className="detail-actions">
                {isExecutionItem(i, project) && hasStatus(i, project, "review") && (
                  <button
                    className="primary"
                    onClick={() =>
                      setModal({
                        type: "review",
                        story: i,
                        run: runs.find((r) => r.status === "review"),
                      })
                    }
                  >
                    人工验收
                  </button>
                )}
                {isExecutionItem(i, project) &&
                  !terminal(i, project) && statusFor(project,"review",i.kind) && allowedTransition(project,i.status,statusFor(project,"review",i.kind),i.kind) && (
                    <button onClick={() => update({ status: statusFor(project, "review", i.kind) })}>
                      提交人工交付
                    </button>
                  )}
                <button
                  className="danger text-btn ml-auto"
                  onClick={() =>
                    setModal({ type: "delete", item: i, after: close })
                  }
                >
                  <Trash2 size={14} />
                  删除条目
                </button>
              </div>
            </>
          )}
          {tab === "children" && (
            <>
              <div className="panel-title">
                <h3>{isWorkItem(i, project) ? "子任务" : "下级条目"}</h3>
                {childTypes(project, i.kind).length > 0 && (
                  <button
                    onClick={() =>
                      create(childTypes(project, i.kind)[0]?.id, i.id)
                    }
                  >
                    <Plus size={14} />
                    添加
                  </button>
                )}
              </div>
              {tasks.length ? (
                tasks.map((t) => (
                  <button
                    key={t.id}
                    className="child-row"
                    onClick={() => open(t)}
                  >
                    <Kind kind={t.kind} iconOnly />
                    <span>{t.title}</span>
                    <Badge status={t.status} />
                  </button>
                ))
              ) : (
                <Empty
                  title="暂无子项"
                  text={
                    isSubtask(i, project)
                      ? "子任务不再嵌套下级工作项。"
                      : "可以拆分子项，也可以直接推进当前故事。"
                  }
                />
              )}
            </>
          )}
          {tab === "runs" && (
            <>
              <div className="panel-title">
                <h3>交付与人工验收</h3>
                {!terminal(i, project) && aiOn && (
                  <button
                    onClick={() => setModal({ type: "delivery", story: i })}
                  >
                    <Plus size={14} />
                    记录交付
                  </button>
                )}
              </div>
              {runs.length ? (
                runs.map((r) => (
                  <article className="delivery" key={r.id}>
                    <div className="inline">
                      <div className="bot-box">
                        <Bot size={19} />
                      </div>
                      <div>
                        <b>{r.agent}</b>
                        <small>
                          {time(r.createdAt)} · {r.itemVersion !== undefined ? "工作项 v" + r.itemVersion : "原父级上下文 v" + r.storyVersion}
                        </small>
                      </div>
                      <Badge status={r.status} workflow={false} />
                    </div>
                    {((r.itemVersion !== undefined && r.itemVersion !== i.contentVersion) || r.storyVersion !== story?.contentVersion) && (
                      <div className="warning">
                        此交付依据的要求已变化，请核对当前工作项及所属任务的要求。
                      </div>
                    )}
                    <p>{r.summary || "正在执行…"}</p>
                    {r.progress?.map((p, n) => (
                      <p key={n} className="muted">
                        {time(p.at)} · {p.message}
                      </p>
                    ))}
                    {r.verification && (
                      <div className="verification">
                        <b>验证结果</b>
                        <p>{r.verification}</p>
                      </div>
                    )}
                    {r.artifacts?.map((a, n) => (
                      <div key={n} className="artifact">
                        <Link size={14} />
                        {/^https?:\/\//.test(a.url) ? (
                          <a href={a.url} target="_blank" rel="noreferrer">
                            {a.title}
                          </a>
                        ) : (
                          <span>
                            {a.title}
                            {a.url ? " · " + a.url : ""}
                          </span>
                        )}
                      </div>
                    ))}
                    {r.reviews?.map((rv) => (
                      <div className="review-note" key={rv.id}>
                        <b>
                          {rv.decision === "accept" ? "验收通过" : "要求修改"} ·{" "}
                          {rv.author}
                        </b>
                        <p>{rv.comment}</p>
                        <small>{time(rv.at)}</small>
                      </div>
                    ))}
                    {r.status === "review" && (
                      <button
                        className="primary"
                        onClick={() =>
                          setModal({ type: "review", story: i, run: r })
                        }
                      >
                        审核交付 <ArrowRight size={14} />
                      </button>
                    )}
                    {["active", "blocked"].includes(r.status) && (
                      <button
                        onClick={() => action("run.cancel", { id: r.id })}
                      >
                        取消此次执行
                      </button>
                    )}
                  </article>
                ))
              ) : (
                <Empty
                  title="还没有交付记录"
                  text="AI 通过 MCP 提交后，成果与审核历史会显示在这里。"
                />
              )}
            </>
          )}
          {tab === "history" && (
            <div className="activity detail-activity">
              {events.map((e) => (
                <div key={e.id}>
                  <i />
                  <section>
                    <strong>{e.title}</strong>
                    <ActivityDetails event={e}/>
                    <small>{e.actor || "操作者未记录"} · {time(e.at)}</small>
                  </section>
                </div>
              ))}
              {!events.length && <Empty title="暂无变更记录" />}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
function EditorModal({
  modal: m,
  setModal,
  data,
  project,
  action,
  busy,
  connection,
  copy,
  setProjectId,
  onProjectSettings,
}) {
  const kinds = typeNames(project);
  const [itemKind, setItemKind] = useState(m.kind || "story");
  const [itemParent, setItemParent] = useState(m.parentId || "");
  const [error, setError] = useState("");
  const [imagePending,setImagePending] = useState(0);
  const imageBusy = delta => setImagePending(n => Math.max(0,n+delta));
  const [showToken, setShowToken] = useState(false);
  const [planStart, setPlanStart] = useState(
    m.type === "item" ? data.items.find((i) => i.id === m.parentId)?.startDate || project.startDate || "" : "",
  );
  const [planEnd, setPlanEnd] = useState(
    m.type === "item" ? data.items.find((i) => i.id === m.parentId)?.endDate || project.endDate || "" : "",
  );
  const close = () => setModal(null);
  const items = data.items.filter((x) => x.projectId === project.id);
  const titles = {
    item: "新建工作项",
    sprint: "规划新的 Sprint",
    release: "规划新的版本",
    note: "记录项目记忆",
    project: "创建新项目",
    review: "人工验收",
    delivery: "记录一次交付",
    closeSprint: "完成本次冲刺",
    publish: "确认版本发布",
    connection: "连接你的 AI 工具",
    delete: "删除条目",
  };
  const get = (f, k) => String(f.get(k) || "").trim();
  async function submit(e) {
    e.preventDefault();
    if (busy || imagePending) return;
    const f = new FormData(e.target);
    let type,
      p = { projectId: project.id };
    setError("");
    if (m.type === "item") {
      type = "item.create";
      Object.assign(p, {
        kind: itemKind,
        title: get(f, "title"),
        description: get(f, "description"),
        parentId: itemParent || null,
        owner: get(f, "owner") || project.owner,
        acceptance: get(f, "acceptance"),
        priority: get(f, "priority") || "medium",
        points: Number(get(f, "points")) || 0,
        startDate: get(f, "startDate"),
        endDate: get(f, "endDate"),
        sprintId: m.sprintId || null,
        releaseId: m.releaseId || null,
      });
    }
    if (m.type === "project") {
      type = "project.create";
      p = {
        name: get(f, "name"),
        code: get(f, "code"),
        description: get(f, "description"),
        goal: get(f, "goal"),
        startDate: get(f, "startDate"),
        endDate: get(f, "endDate"),
      };
    }
    if (m.type === "sprint") {
      type = "sprint.create";
      Object.assign(p, {
        name: get(f, "name"),
        goal: get(f, "goal"),
        startDate: get(f, "startDate"),
        endDate: get(f, "endDate"),
        capacity: Number(get(f, "capacity")),
      });
    }
    if (m.type === "release") {
      type = "release.create";
      Object.assign(p, {
        name: get(f, "name"),
        goal: get(f, "goal"),
        plannedDate: get(f, "plannedDate"),
      });
    }
    if (m.type === "note") {
      type = "note.create";
      Object.assign(p, {
        title: get(f, "title"),
        body: get(f, "body"),
        type: get(f, "noteType"),
      });
    }
    if (m.type === "review") {
      type = "review";
      p = {
        storyId: m.story.id,
        runId: m.run?.id,
        decision: get(f, "decision"),
        comment: get(f, "comment"),
        acknowledgeVersion: f.has("acknowledge"),
      };
    }
    if (m.type === "delivery") {
      type = "run.submit";
      p = {
        itemId: m.story.id,
        storyVersion: (isSubtask(m.story, project) ? items.find(i => i.id === m.story.parentId) : m.story).contentVersion,
        itemVersion: m.story.contentVersion,
        agent: get(f, "agent"),
        summary: get(f, "summary"),
        verification: get(f, "verification"),
        requestId: crypto.randomUUID(),
        artifacts: get(f, "url")
          ? [
              {
                title: get(f, "artifactTitle") || "交付成果",
                url: get(f, "url"),
              },
            ]
          : [],
      };
    }
    if (m.type === "closeSprint") {
      type = "sprint.close";
      p = {
        id: m.sprint.id,
        dispositions: Object.fromEntries(
          [...f]
            .filter(([k]) => k.startsWith("dest:"))
            .map(([k, v]) => [k.slice(5), v]),
        ),
        createImprovement: f.has("improvement"),
      };
    }
    if (m.type === "publish") {
      type = "release.publish";
      p = {
        id: m.release.id,
        notes: get(f, "notes"),
        dispositions: Object.fromEntries(
          [...f]
            .filter(([k]) => k.startsWith("dest:"))
            .map(([k, v]) => [k.slice(5), v]),
        ),
      };
    }
    if (m.type === "delete") {
      type = "item.delete";
      p = { id: m.item.id };
    }
    const r = await action(type, p);
    if (r) {
      if (m.type === "project" && r) {
        setProjectId(r.id);
        localStorage.setItem("heyso-project", r.id);
      }
      if (m.type === "delete") m.after();
      close();
    } else setError("操作未完成，请查看提示并调整后重试。");
  }
  const parentKind = configFor(project).types.some((t) => t.enabled && canParent(project, itemKind, { kind: t.id }));
  const possibleParents = parentCandidates(project, items, itemKind);
  const parentItem = items.find((i) => i.id === itemParent);
  const minDate = [project.startDate, parentItem?.startDate].filter(Boolean).sort().at(-1);
  const maxDate = [project.endDate, parentItem?.endDate].filter(Boolean).sort()[0];
  return (
    <div
      className="modal-layer"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={titles[m.type]}
      >
        <header>
          <div>
            <h2>{titles[m.type]}</h2>
          </div>
          <button
            type="button"
            className="icon-btn"
            title="关闭弹窗"
            onClick={close}
          >
            <X size={20} />
          </button>
        </header>
        {m.type === "connection" ? (
          <div className="modal-body">
            <p className="muted">
              {connection?.oauth ? 'LoyoCloud 使用独立的 OAuth 授权。将下方地址添加到支持 OAuth 的 AI 工具，登录云账号并选择允许访问的项目。' : '在支持 Streamable HTTP MCP 和自定义请求头的 AI 工具中添加以下连接。首次配置后，可在故事中复制执行指令。'}
            </p>
            <Field label="MCP 地址">
              <div className="copy-row">
                <code>{connection?.url}</code>
                <button onClick={() => copy(connection.url)}>
                  <Copy size={14} />
                </button>
              </div>
            </Field>
            {!connection?.oauth && <><Field label="Authorization 请求头">
              <div className="copy-row">
                <code>
                  {showToken
                    ? "Bearer " + connection?.token
                    : "Bearer ••••••••••••••••••••••••"}
                </code>
                <button onClick={() => copy("Bearer " + connection.token)}>
                  <Copy size={14} />
                </button>
              </div>
            </Field>
            <button
              className="text-btn"
              onClick={() => setShowToken(!showToken)}
            >
              {showToken ? "隐藏密钥" : "显示密钥"}
            </button></>}
            <div className="instruction-box">
              <h4>可直接复制的连接配置</h4>
              <p>
                各 AI 客户端的配置格式可能不同，请按对应工具要求填写 URL
                {connection?.oauth ? '并完成 OAuth 授权。' : '与请求头。'}
              </p>
              <button
                onClick={() =>
                  copy(
                    JSON.stringify(
                      {
                        mcpServers: {
                          heyso: {
                            url: connection.url,
                            ...(!connection.oauth ? { headers: {
                              Authorization: "Bearer " + connection.token,
                            } } : {}),
                          },
                        },
                      },
                      null,
                      2,
                    ),
                  )
                }
              >
                <Copy size={15} />
                复制 JSON 配置
              </button>
            </div>
            <h4>已提供的 MCP 工具</h4>
            {connection?.tools.map((t) => (
              <div className="tool-row" key={t.name}>
                <code>{t.name}</code>
                <small>{t.description}</small>
              </div>
            ))}
            <p className="muted">
              当前连接访问此工作空间；写入还需故事启用
              AI。此连接属于单工作空间模式；LoyoCloud 项目可另行使用云端授权。
            </p>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="modal-body">
              {m.type === "item" && (
                <>
                  {(!project.startDate || !project.endDate) && (
                    <div className="warning">
                      请先设置项目周期，才能安排需求日期。
                      <button
                        type="button"
                        className="text-btn"
                        onClick={onProjectSettings}
                      >
                        设置项目周期
                      </button>
                    </div>
                  )}
                  <Field label="工作项类型"><Select name="kind" value={itemKind} required onChange={(e) => {
                    const kind = e.target.value; setItemKind(kind);
                    if (!possibleParents.some((p) => p.id === itemParent && canParent(project, kind, p))) setItemParent("");
                  }}>{configFor(project).types.filter((t) => t.enabled && !t.hidden).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
                  <Field label="标题">
                    <input
                      name="title"
                      autoFocus
                      required
                      placeholder={`给${kinds[itemKind]}一个清晰的名称`}
                    />
                  </Field>
                  {parentKind && (
                    <Field label="父级工作项">
                      <Select
                        name="parentId"
                        value={itemParent}
                        onChange={(e) => {
                          const id = e.target.value; setItemParent(id);
                          const parent = items.find((i) => i.id === id);
                          if (parent?.startDate) setPlanStart(parent.startDate);
                          if (parent?.endDate) setPlanEnd(parent.endDate);
                        }}
                        required={isSubtask({ kind: itemKind }, project)}
                      >
                        <option value="">
                          {isSubtask({ kind: itemKind }, project) ? "请选择执行层父级" : "暂不归类"}
                        </option>
                        {items
                          .filter((x) => possibleParents.some((p) => p.id === x.id))
                          .map((x) => (
                            <option key={x.id} value={x.id} data-kind={x.kind} data-description={typeNames(project)[x.kind] + (x.parentId ? " · " + (items.find((p) => p.id === x.parentId)?.title || "") : " · 根层级")}>
                              {x.number ? `${project.code}-${x.number} · ${x.title}` : x.title}
                            </option>
                          ))}
                      </Select>
                    </Field>
                  )}
                  <DateFields
                    start={planStart}
                    end={planEnd}
                    setStart={setPlanStart}
                    setEnd={setPlanEnd}
                    min={minDate}
                    max={maxDate}
                    disabled={!project.startDate || !project.endDate}
                  />
                  {project.startDate && project.endDate && (
                    <p className="schedule-hint">
                      日期范围：{minDate} 至 {maxDate}
                    </p>
                  )}
                  <Field label="描述">
                    <RichTextEditor name="description" label="描述" onBusyChange={imageBusy} disabled={busy} placeholder="说明背景、目标与预期结果"/>
                  </Field>
                  <div className="form-grid">
                    <Field label="负责人">
                      <Select name="owner">
                        {project.members.map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="优先级">
                      <Select name="priority" defaultValue="medium">
                        <option value="high">高</option>
                        <option value="medium">中</option>
                        <option value="low">低</option>
                      </Select>
                    </Field>
                  </div>
                  {isExecutionItem({ kind: itemKind }, project) && (
                    <>
                      <Field label="验收标准">
                        <RichTextEditor name="acceptance" label="验收标准" onBusyChange={imageBusy} disabled={busy} placeholder="达到什么条件，才能确认完成？"/>
                      </Field>
                      {isWorkItem({kind:itemKind}, project) && <Field label="故事点">
                        <input
                          name="points"
                          type="number"
                          min="0"
                          max="1000"
                          defaultValue="0"
                        />
                      </Field>}
                    </>
                  )}
                </>
              )}
              {m.type === "project" && (
                <>
                  <Field label="项目名称">
                    <input
                      name="name"
                      autoFocus
                      required
                      placeholder="例如：产品研发、网站重构"
                    />
                  </Field>
                  <Field label="项目 ID"><input name="code" required minLength={2} maxLength={8} pattern="[A-Za-z][A-Za-z0-9]{1,7}" placeholder="例如：HS；创建后固定" style={{textTransform:"uppercase"}}/><small>2 至 8 位字母或数字，以字母开头。工作项编号示例：HS-928。</small></Field>
                  <Field label="项目简介">
                    <textarea
                      name="description"
                      placeholder="这个项目准备实现什么？"
                    />
                  </Field>
                  <Field label="项目目标">
                    <textarea
                      name="goal"
                      required
                      placeholder="描述项目希望达成的结果与验收方向"
                    />
                  </Field>
                  <DateFields
                    prefix="项目"
                    start={planStart}
                    end={planEnd}
                    setStart={setPlanStart}
                    setEnd={setPlanEnd}
                  />
                  <p className="muted">需求层级的起止日期将受项目周期约束。</p>
                </>
              )}
              {(m.type === "sprint" || m.type === "release") && (
                <>
                  <Field
                    label={m.type === "sprint" ? "Sprint 名称" : "版本名称"}
                  >
                    <input
                      name="name"
                      required
                      autoFocus
                      placeholder={
                        m.type === "sprint" ? "Sprint 03" : "alpha_0.2"
                      }
                    />
                  </Field>
                  <Field label="目标">
                    <textarea
                      name="goal"
                      required
                      placeholder="本次准备达成什么成果？"
                    />
                  </Field>
                  {m.type === "sprint" ? (
                    <div className="form-grid">
                      <Field label="开始日期">
                        <input type="date" name="startDate" required />
                      </Field>
                      <Field label="结束日期">
                        <input type="date" name="endDate" required />
                      </Field>
                      <Field label="计划容量（SP）">
                        <input
                          name="capacity"
                          type="number"
                          min="0"
                          defaultValue="20"
                        />
                      </Field>
                    </div>
                  ) : (
                    <Field label="计划发布日期">
                      <input type="date" name="plannedDate" />
                    </Field>
                  )}
                </>
              )}
              {m.type === "note" && (
                <>
                  <Field label="记忆类型">
                    <Select name="noteType">
                      <option value="context">工作上下文</option>
                      <option value="decision">关键决定</option>
                      <option value="learning">经验与复盘</option>
                    </Select>
                  </Field>
                  <Field label="标题">
                    <input name="title" required autoFocus />
                  </Field>
                  <Field label="内容">
                    <textarea name="body" required rows="6" />
                  </Field>
                </>
              )}
              {m.type === "review" && (
                <>
                  <div className="context-preview">
                    <small>{project.code}-{m.story.number}</small>
                    <h3>{m.story.title}</h3>
                    <h4>验收标准</h4>
                    <MarkdownPreview value={m.story.acceptance} empty="尚未填写"/>
                  </div>
                  <Field label="审核决定">
                    <Select name="decision">
                      <option value="accept">通过，确认工作项完成</option>
                      <option value="changes">要求修改，继续执行</option>
                    </Select>
                  </Field>
                  <Field label="审核意见">
                    <textarea
                      name="comment"
                      required
                      placeholder="说明结果是否满足标准，或明确需要修改的地方。"
                    />
                  </Field>
                  {m.run && ((m.run.itemVersion !== undefined && m.run.itemVersion !== m.story.contentVersion) || m.run.storyVersion !== (isSubtask(m.story, project) ? items.find(i => i.id === m.story.parentId) : m.story).contentVersion) && (
                    <label className="check-label">
                      <input type="checkbox" name="acknowledge" />
                      我已核对旧版交付与当前工作项要求的差异
                    </label>
                  )}
                </>
              )}
              {m.type === "delivery" && (
                <>
                  <p className="muted">
                    手动记录外部执行的成果。自动回传请使用 MCP 的
                    submit_result。
                  </p>
                  <Field label="执行者">
                    <input
                      name="agent"
                      required
                      placeholder="例如：我的 AI 工具"
                    />
                  </Field>
                  <Field label="交付说明">
                    <textarea name="summary" required />
                  </Field>
                  <Field label="验证结果">
                    <textarea
                      name="verification"
                      required
                      placeholder="做了哪些验证？哪些尚未验证？"
                    />
                  </Field>
                  <div className="form-grid">
                    <Field label="成果名称">
                      <input name="artifactTitle" />
                    </Field>
                    <Field label="成果链接或文件路径">
                      <input
                        name="url"
                        placeholder="https://… 或本地文件路径"
                      />
                    </Field>
                  </div>
                </>
              )}
              {m.type === "closeSprint" && (
                <>
                  <p>
                    结束 <b>{m.sprint.name}</b>{" "}
                    后会保留本次范围、完成情况和复盘记录。
                  </p>
                  {(!m.sprint.review ||
                    !m.sprint.retro.wentWell ||
                    !m.sprint.retro.improve) && (
                    <div className="warning">
                      请先在「评审与复盘」中保存评审总结、做得好的地方和需要改进的地方。
                    </div>
                  )}
                  <h4>安排未完成故事</h4>
                  {items
                    .filter(
                      (x) =>
                        isWorkItem(x, project) &&
                        x.sprintId === m.sprint.id &&
                        !terminal(x, project),
                    )
                    .map((i) => (
                      <Field key={i.id} label={`${project.code}-${i.number} · ${i.title}`}>
                        <Select
                          kind="sprint"
                          name={"dest:" + i.id}
                          defaultValue="backlog"
                        >
                          <option value="backlog">放回产品待办池</option>
                          {data.sprints
                            .filter(
                              (x) =>
                                x.projectId === project.id &&
                                x.status === "planned",
                            )
                            .map((x) => (
                              <option key={x.id} value={x.id}>
                                移入 {x.name}
                              </option>
                            ))}
                          <option value="cancel">取消该故事</option>
                        </Select>
                      </Field>
                    ))}
                  {m.sprint.retro.actions && (
                    <label className="check-label">
                      <input
                        type="checkbox"
                        name="improvement"
                        defaultChecked
                      />
                      将复盘改进行动创建为后续故事
                    </label>
                  )}
                </>
              )}
              {m.type === "publish" && (
                <>
                  <p>
                    确认 <b>{m.release.name}</b>{" "}
                    的实际交付。已验收故事进入发布记录。
                  </p>
                  <h4>安排尚未完成的故事</h4>
                  {items
                    .filter(
                      (x) =>
                        isWorkItem(x, project) &&
                        x.releaseId === m.release.id &&
                        !terminal(x, project),
                    )
                    .map((i) => (
                      <Field key={i.id} label={i.title}>
                        <Select kind="release" name={"dest:" + i.id}>
                          <option value="backlog">
                            取消目标版本，保留在待办池
                          </option>
                          {data.releases
                            .filter(
                              (r) =>
                                r.projectId === project.id &&
                                r.id !== m.release.id &&
                                r.status !== "released",
                            )
                            .map((r) => (
                              <option key={r.id} value={r.id}>
                                延期至 {r.name}
                              </option>
                            ))}
                        </Select>
                      </Field>
                    ))}
                  <Field label="发布说明">
                    <textarea
                      name="notes"
                      required
                      placeholder="描述本次实际交付及已知限制。"
                    />
                  </Field>
                </>
              )}
              {m.type === "delete" && (
                <p>
                  确认删除「{m.item.title}
                  」？已有子项、执行记录或冲刺基线的条目无法删除，可以将其取消。
                </p>
              )}
              {error && <p className="danger">{error}</p>}
            </div>
            <footer>
              <button type="button" onClick={close}>
                取消
              </button>
              <button
                className={m.type === "delete" ? "danger-button" : "primary"}
                disabled={
                  busy || imagePending > 0 ||
                  (m.type === "item" &&
                    (!project.startDate || !project.endDate))
                }
                type="submit"
              >
                {busy
                  ? "正在保存…"
                  : {
                      review: "保存审核决定",
                      closeSprint: "确认结束冲刺",
                      publish: "确认发布",
                      delete: "删除",
                      delivery: "提交成果",
                    }[m.type] || "保存"}
              </button>
            </footer>
          </form>
        )}
      </section>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<AccessGate><App /></AccessGate>);

import useViewPreferences,{ViewPreferencesNotice} from './useViewPreferences.jsx';
import {ReplicaField,ReplicaForm,ReplicaModal,ReplicaDrawer,ReplicaButton,ReplicaInput,ReplicaTextArea} from './ReplicaControls.jsx';
import {AntTimeline,AntAlert,AntList,AntToast,AntRing,AntCard,AntStatistic,AntBreadcrumb,AntTag,AntAvatar,AntTabs,AntMenu,AntDisclosure} from './AntStructures.jsx';
import {Empty as AntDesignEmpty,Progress as AntDesignProgress} from 'antd';
import ReplicaTheme from './ReplicaTheme.jsx';
import './app.css';
import {aiExecutionEnabled} from '../shared/work-config.mjs';
import ActivityDetails from './ActivityDetails.jsx';
import SprintWorkspace, {SprintStatusCounts} from "./SprintWorkspace.jsx";
import SubtaskFilter from './SubtaskFilter.jsx';
import {RoadmapNavigationIcon,SmartNavigationIcon} from './NavigationIcons.jsx';
import {detailStatusOptions} from './detail-status-options.mjs';
import {sprintPlanningItems} from './sprint-items.mjs';
import ReleaseWorkspace from "./ReleaseWorkspace.jsx";
import BacklogTable from './BacklogTable.jsx';
import {WorkspaceLinksProvider,WorkspaceLink} from './WorkspaceLinks.jsx';
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
  ChevronsUpDown,
  ChevronsDownUp,
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
  BarChart3,
} from "lucide-react";


import MemoryPanel from './MemoryPanel.jsx';
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

import heysoIcon from "./assets/heyso-icon.svg";
import { WorkConfigContext, useWorkProject } from "./WorkConfigContext.jsx";
import Kind from "./WorkType.jsx";
import InfoTip from "./InfoTip.jsx";
import PageTitle,{pageDescriptions} from "./PageTitle.jsx";
import HelpCenter from "./HelpCenter.jsx";
import ContextMenu from "./ContextMenu.jsx";
import Dashboard from "./Dashboard.jsx";
import useWorkspaceRoute from "./useWorkspaceRoute.jsx";


import WorkItemDialog from "./WorkItemDialog.jsx";
import WorkItemTitle from "./WorkItemTitle.jsx";
import RichTextEditor from "./RichTextEditor.jsx";
import Board from "./Board.jsx";
import MarkdownPreview from "./MarkdownPreview.jsx";
import { workItemEntries, executionInstruction } from "./work-item-actions.mjs";
import { effectiveSprintId, isExecutionItem, runTargetId, configFor, typeFor, typeNames, statusNamesFor, isWorkItem, isSubtask, categoryOf, hasStatus, terminal, statusFor, allowedTransition, parentCandidates, childTypes, canParent, statusCategories, workflowFor, workflowStatuses, progressCategory, boardStatuses, aiReady } from "../shared/work-config.mjs";

const statusNames = {
  backlog: "待规划",
  todo: "待开始",
  active: "执行中",
  blocked: "阻塞",
  review: "待验收",
  done: "已完成",
  cancelled: "已取消",
};
const Reports = React.lazy(() => import('./Reports.jsx'));
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
  ["roadmap", "线路", RoadmapNavigationIcon, "查看时间安排、工作进度和版本里程碑。"],
  ["backlog", "冲刺", Timer, "规划冲刺、安排工作项并跟踪交付。"],
  ["board", "看板", Kanban, "按状态推进工作，查看执行进度。"],
  ["list", "清单", Rows3, "查询、筛选和管理全部工作项。"],
  ["releases", "发布", Flag, "管理版本范围、发布与交付记录。"],
  ["reports", "报告", BarChart3, "分析冲刺、流程、工作量和交付趋势。"],
  ["ai", "智能", SmartNavigationIcon, "跟踪 AI 执行，审核成果并完成验收。"],
];
const workViews = ["backlog", "board", "list", "sprints"];
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
    <AntTag className={"badge " + category}>
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
    </AntTag>
  );
}
function Empty({
  title = "还没有内容",
  text = "从一个清晰的目标开始，逐步推进工作。",
  action,
}) {
  return <AntDesignEmpty className="empty heyso-empty-state" image={<Box size={30}/>} description={<><h3>{title}</h3><p>{text}</p></>}>{action}</AntDesignEmpty>;
}
function Progress({value}) {return <AntDesignProgress className="heyso-progress" percent={value} showInfo={false} strokeWidth={4}/>;}

function App() {
  const hosting = useHosting();
  const routeGuard = useRef(null);
  const { page, setPage, projectId, setProjectId, view, setView, settingsSection, setSettingsSection,
    selected, setSelected, tab, setTab, releaseId, setReleaseId } = useWorkspaceRoute({
      views: [...navs.map(([id]) => id), ...workViews, 'overview', 'work', 'settings'], sections: settingsPages.map(([id]) => id),
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
    [modal, setModal] = useState(null),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [connection, setConnection] = useState(null),
    [online, setOnline] = useState(true);
  const boardPreferences=useViewPreferences(data?.projects.find(p=>p.id===projectId)||projectId,'board',{query:'',status:'all',sprint:'all',release:'all',showSubtasks:false,owner:'all'});
  const [query,setQuery]=boardPreferences.field('query'),[filter,setFilter]=boardPreferences.field('status'),[sprintFilter,setSprintFilter]=boardPreferences.field('sprint'),[boardReleaseFilter,setBoardReleaseFilter]=boardPreferences.field('release'),[boardShowSubtasks,setBoardShowSubtasks]=boardPreferences.field('showSubtasks'),[ownerFilter,setOwnerFilter]=boardPreferences.field('owner');
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
    if (!data || data.projects.some((p) => p.id === projectId)) return;
    const nextId = data.projects[0]?.id || "";
    setProjectId(nextId);
    setSelected(null);
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
    setView(v === "work" ? "backlog" : v);
    setSelected(null);
    setReleaseId(null);
    };
    if (v === "settings") navigate();
    else requestSettingsNavigation(navigate);
  };
  const switchProject = (id) => {
    if (id === projectId) return;
    requestSettingsNavigation(() => {
    settingsDirtyRef.current = false;
    setProjectId(id);
    setReleaseId(null);
    localStorage.setItem("heyso-project", id);
    setSelected(null);
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
        setView("roadmap");
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
        <ReplicaButton onClick={refresh}>重新连接</ReplicaButton>
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
        <ReplicaButton className="help-entry empty-help-entry" aria-label="帮助中心" title="帮助中心" onClick={() => setHelpOpen(true)}><CircleHelp size={19}/></ReplicaButton>
        <section>
          <FolderKanban size={36} />
          <h1>创建你的第一个项目</h1>
          <p>从一个项目开始，规划需求、冲刺与版本，记录每一次交付。</p>
          <ReplicaButton
            className="primary"
            onClick={() => setModal({ type: "project" })}
          >
            <Plus size={16} />
            创建项目
          </ReplicaButton>
        </section>
        <CloudPanel busy={busy} onState={receiveCloudState} setToast={setToast}/>
        <footer>{hosting.hosted ? "在线保存" : "本地保存"} · alpha_0.1 {hosting.hosted && <><ReplicaButton className="text-btn" onClick={hosting.configure}>云端存储</ReplicaButton><ReplicaButton className="text-btn" onClick={hosting.logout}>退出工作空间</ReplicaButton></>}</footer>
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
                go("roadmap");
              }}
            />
          )}
        </Presence>
      {toast && (
          <AntToast className="toast" role="status">
            {toast}
          </AntToast>
        )}
      </div>
      {helpOpen && <HelpCenter onClose={() => setHelpOpen(false)}/>}
      </>
    );
  const kinds = typeNames(project);
  const statusNames = Object.fromEntries(configFor(project).statuses.filter((s) => s.enabled).map((s) => [s.id, s.name]));
  const items = data.items.filter((x) => x.projectId === project.id),
    stories = items.filter((x) => isWorkItem(x, project)),
    sprintItems = sprintPlanningItems(items, project),
    sprints = data.sprints.filter((x) => x.projectId === project.id),
    releases = data.releases.filter((x) => x.projectId === project.id),
    notes = data.notes.filter((x) => x.projectId === project.id),
    runs = data.runs.filter((x) => x.projectId === project.id),
    events = data.events.filter((x) => x.projectId === project.id),
    activeSprint = sprints.find((x) => x.status === "active");
  const completed = stories.filter((x) => hasStatus(x, project, "done")),
    review = stories.filter((x) => hasStatus(x, project, "review")),
    blocked = stories.filter((x) => hasStatus(x, project, "blocked"));
  const filtered = items.filter(i=>isExecutionItem(i,project)||!!i.sprintId).map(i=>({...i,sprintId:effectiveSprintId(i,items,project)})).filter(
    (i) =>
      (view !== 'board' || boardShowSubtasks || !isSubtask(i,project)) &&
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

    }});
    const {scope,scopeId} = contextMenu;
    const sprint = sprints.find((s) => s.id === scopeId);
    const release = releases.find((r) => r.id === scopeId);
    if ((scope === "sprint" && sprint?.status === "closed") || (scope === "release" && (release?.status === "released" || release?.archived))) return [{label:"历史记录，仅可查看",disabled:true}];
    const types = configFor(project).types.filter((t) => t.enabled && !t.hidden &&
      (!(scope === "sprint" || scope === "release" || scope === "board") || scope==="release" || (scope==="board"?isExecutionItem({kind:t.id},project):!isSubtask({kind:t.id},project))) &&
      (scope !== "board" || workflowFor(project,t.id).initialStatus === scopeId));
    const defaults = scope === "sprint" ? {sprintId:scopeId} : scope === "release" ? {releaseId:scopeId} : {};
    const result = [{label:scope === "board" ? "在此状态新建工作项" : "新建工作项",disabled:!types.length,reason:!types.length ? "没有以此状态创建的可用类型" : "",children:types.map((t) => ({label:t.name,run:() => create(t.id,null,defaults)}))}];
    if (scope === "sprint" || scope === "release") {
      const field = scope === "sprint" ? "sprintId" : "releaseId";
      const candidates = (scope==="release"?items:stories).filter((s) => s[field] !== scopeId && (scope !== "sprint" || !s.sprintId));
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
          <ReplicaButton className="story-row" key={i.id} data-work-item-id={i.id} data-history={historical} onClick={() => historical ? setModal({type:"workSnapshot",item:i}) : open(i)}>
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
              <AntAvatar className="avatar">{i.owner?.slice(0, 1) || "?"}</AntAvatar>
              {i.owner}
            </span>
            <span className="points">{i.points || "—"}</span>
          </ReplicaButton>
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
        <ReplicaInput
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
  const inWork = workViews.includes(view) || view === "work";
  const pageTitle=navs.find(n=>n[0]===view)?.[1] || (inWork ? "冲刺" : undefined);
  const openRelease = id => {go("releases");setReleaseId(typeof id === "string" ? id : null);};
  const header = (title, description, button) => (
    <div className="page-heading">
      <div>
        <h1 className="heading-with-info">{pageTitle||title}{view !== "overview" && description && <InfoTip label={pageTitle||title}>{pageDescriptions[view]||description}</InfoTip>}</h1>
        {view === "overview" && <p>{description}</p>}
      </div>
      {button}
    </div>
  );
  function renderMemory() {
    return <MemoryPanel notes={notes} projectId={project.id} action={action} busy={busy}/>;
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
        )}
        <div className="inline" style={{marginBottom:16,gap:12}}><span>{project.cloud ? '在线项目 · LoyoCloud' : hosting.hosted ? '工作空间项目' : '本地项目'}</span><ReplicaButton onClick={()=>{go('settings');setSettingsSection('integrations');}}>{project.cloud ? '云空间与 AI 连接' : hosting.hosted ? '保存至 LoyoCloud' : '转为在线项目'}</ReplicaButton></div>
        {project.cloud?.error&&<AntAlert className="settings-error" role="alert">{project.cloud.error}。当前显示最近读取的内容，联网后刷新。</AntAlert>}
        <div className="project-goal-strip">
          <Target size={18} />
          <div>
            <span>项目目标</span>
            <p>
              {project.goal ||
                "在项目设置中补充目标，为团队与 AI 提供共同方向。"}
            </p>
          </div>
          <ReplicaButton className="text-btn" onClick={() => go("list")}>
            工作项全景
            <ArrowRight size={14} />
          </ReplicaButton>
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
            <ReplicaButton className="text-btn" onClick={openProjectSettings}>
              设置日期
            </ReplicaButton>
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
            <AntCard
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
              <AntStatistic>
                {n}
                <small>个</small>
              </AntStatistic>
              <p>{sub}</p>
            </AntCard>
          ))}
        </div>
        <div className="overview-grid">
          <AntCard className="panel">
            <div className="panel-title">
              <h3>
                <Timer size={18} />
                当前冲刺
              </h3>
              <ReplicaButton className="text-btn" onClick={() => go("sprints")}>
                管理冲刺 <ArrowUpRight size={14} />
              </ReplicaButton>
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
                  <AntRing
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
                  </AntRing>
                </div>
                <div className="sprint-footer">
                  <span>
                    <i className="dot green-bg" /> 已完成{" "}
                    {sum(sprintStories.filter((x) => hasStatus(x, project, "done")))} SP
                  </span>
                  <span>计划容量 {activeSprint.capacity} SP</span>
                  <ReplicaButton
                    className="text-btn"
                    onClick={() => {
                      go("board");
                      setSprintFilter(activeSprint.id);
                    }}
                  >
                    进入看板 <ArrowRight size={14} />
                  </ReplicaButton>
                </div>
              </>
            ) : (
              <Empty
                title="开始你的第一次冲刺"
                action={
                  <ReplicaButton onClick={() => setModal({ type: "sprint" })}>
                    创建 Sprint
                  </ReplicaButton>
                }
              />
            )}
          </AntCard>
          <AntCard className="panel">
            <div className="panel-title">
              <h3>
                <Flag size={18} />
                版本计划
              </h3>
              <ReplicaButton className="text-btn" onClick={() => go("releases")}>
                全部 <ArrowUpRight size={14} />
              </ReplicaButton>
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
          </AntCard>
        </div>
        <div className="overview-grid bottom-grid">
          <AntCard className="panel">
            <div className="panel-title">
              <h3>
                <Clock size={18} />
                待你验收 <span className="count">{review.length}</span>
              </h3>
              <ReplicaButton
                className="text-btn"
                onClick={() => {
                  go("ai");
                }}
              >
                查看全部 <ArrowUpRight size={14} />
              </ReplicaButton>
            </div>
            {review.length ? (
              review.map((i) => (
                <ReplicaButton
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
                </ReplicaButton>
              ))
            ) : (
              <Empty
                title="暂时没有待验收成果"
                text="AI 提交的成果会出现在这里。"
              />
            )}
          </AntCard>
          <AntCard className="panel">
            <div className="panel-title">
              <h3>
                <Activity size={18} />
                最近动态
              </h3>
            </div>
            <AntTimeline className="activity">
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
            </AntTimeline>
          </AntCard>
        </div>
      </>
    );
  }
  return (
    <WorkConfigContext.Provider value={project}><WorkspaceLinksProvider project={project} items={items} onOpen={item=>{if(modal){const url=new URL(window.location.href);url.searchParams.set("item",item.id);url.searchParams.set("project",project.id);window.open(url.href,"_blank","noopener,noreferrer");}else open(item);}}>
    <>
    <div inert={helpOpen ? true : undefined} className={`app${sidebarCompact ? " sidebar-compact" : ""}`}>
      <header className="appbar">
        <ReplicaButton
          className="app-brand"
          onClick={() => switchPage("dashboard")}
          aria-label="HeySO 首页"
        >
          <img className="mark" src={heysoIcon} alt="" />
          <b>HeySO</b>
          <span>合序</span>
        </ReplicaButton>
        <AntTabs className="appbar-tabs" role="tablist" aria-label="工作空间页面">
          {[["dashboard", "仪表盘", LayoutDashboard], ["projects", "项目", FolderKanban]].map(([id, label, Icon]) => (
            <ReplicaButton key={id} id={`tab-${id}`} role="tab" aria-selected={page === id} aria-controls={`panel-${id}`} tabIndex={page === id ? 0 : -1}
              className={page === id ? "active" : ""} onClick={() => switchPage(id)}
              onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === "Home" ? "dashboard" : event.key === "End" ? "projects" : id === "dashboard" ? "projects" : "dashboard";
                document.getElementById(`tab-${next}`)?.focus();
                switchPage(next);
              }}><Icon size={15}/><span>{label}</span></ReplicaButton>
          ))}
        </AntTabs>
        <div className="appbar-actions">
        <ReplicaButton className="help-entry" aria-label="复制当前页面链接" title="复制当前页面链接" onClick={() => copy(window.location.href)}><Link size={18}/></ReplicaButton>
        <ReplicaButton className="help-entry" aria-label="帮助中心" title="帮助中心" onClick={() => setHelpOpen(true)}><CircleHelp size={19}/></ReplicaButton>
        <ReplicaButton
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
        </ReplicaButton></div>
      </header>
      {page === "dashboard" && <main className="dashboard-main" id="panel-dashboard" role="tabpanel" aria-labelledby="heyso-workspace-tabs-tab-dashboard">
        {!online && <AntAlert className="offline-banner">服务连接已断开，恢复连接后可继续保存。</AntAlert>}
        <Dashboard data={data} onRefresh={refresh} onProject={(id) => { switchProject(id); go("roadmap"); }}
          onOpen={(item) => { switchProject(item.projectId); go("backlog"); open(item); }}
          onCreateProject={() => setModal({ type: "project" })}/>
      </main>}
      {page === "projects" && <>
      <Sidebar
        id="project-sidebar"
        className="sidebar"
        compact={sidebarCompact}
        aria-label={view === "settings" ? "项目设置导航" : "项目导航"}
      >
        {view === "settings" && (
          <div className="sidebar-title">
            <ReplicaButton
              className="back-to-project"
              aria-label="返回项目"
              data-sidebar-tooltip="返回项目"
              data-sidebar-description="返回项目概览和日常工作菜单。"
              onClick={() => go("roadmap")}
            >
              <ArrowLeft size={16} />
              <span>返回项目</span>
            </ReplicaButton>
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
              setView("roadmap");
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
          <ReplicaButton
            className="sidebar-create primary"
            aria-label="新建工作项"
            data-sidebar-tooltip="新建工作项"
            data-sidebar-description="创建用户故事，明确目标和验收标准。"
            onClick={() => create()}
          >
            <Plus size={15} />
            <span>新建工作项</span>
          </ReplicaButton>
        )}
        {view === "settings" && <div className="nav-label">项目设置</div>}
        <AntMenu
          key={view === "settings" ? "settings" : "management"}
          className="sidebar-nav"
        >
          {(view === "settings" ? settingsPages : navs).map(
            ([id, label, I, description]) => (
              <ReplicaButton
                key={id}
                aria-label={label}
                data-sidebar-tooltip={label}
                data-sidebar-description={
                  description || settingsDescriptions[id]
                }
                aria-description={description || settingsDescriptions[id]}
                aria-current={
                  (view === "settings" ? settingsSection === id : view === id || (id === "backlog" && ["work","sprints"].includes(view)))
                    ? "page"
                    : undefined
                }
                className={
                  (view === "settings" ? settingsSection === id : view === id || (id === "backlog" && ["work","sprints"].includes(view)))
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
              </ReplicaButton>
            ),
          )}
        </AntMenu>
        <div className="sidebar-bottom">
          {view !== "settings" && (
            <ReplicaButton
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
            </ReplicaButton>
          )}
        </div>
        <ReplicaButton
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
        </ReplicaButton>
      </Sidebar>
      <main id="panel-projects" role="tabpanel" aria-labelledby="heyso-workspace-tabs-tab-projects">

        {!online && (
          <AntAlert className="offline-banner">
            服务连接已断开，恢复连接后可继续保存。
          </AntAlert>
        )}
        <div className={"content view-" + view} key={project.id + view} onContextMenu={handleContextMenu} onKeyDown={handleContextMenu}>
          {inWork && view!=="list" && <section className="work-page-header">
            <div className="page-heading"><PageTitle view={view} title={pageTitle}/></div>
          </section>}
          {view === "overview" && renderOverview()}
          {view === 'reports' && <React.Suspense fallback={<p className="muted" role="status">正在生成报告…</p>}><Reports key={project.id} project={project} items={items} sprints={sprints} releases={releases} events={events} runs={runs} onOpen={open} onSnapshot={item=>setModal({type:'workSnapshot',item})} onRelease={openRelease}/></React.Suspense>}
          {view === 'roadmap' && <React.Suspense fallback={<p className="muted" role="status">正在打开路线图…</p>}><Roadmap onSchedule={(item, dates) => action("item.update", { id: item.id, ...dates })} key={project.id} project={project} items={items} releases={releases} busy={busy} onOpen={open} onCreate={() => create()} onReleases={openRelease} onProjectSettings={openProjectSettings}/></React.Suspense>}
          {view === "list" && <BacklogTable key={project.id + "all"} rows={items} project={project} items={items} sprints={sprints} releases={releases} onOpen={open} kind={kind=><Kind kind={kind} iconOnly/>} status={status=><Badge status={status}/>} priority={value=><span className={'priority '+value}><PriorityIcon value={value}/>{priorities[value]}</span>}/>}
          {["backlog", "work", "sprints"].includes(view) && <SprintWorkspace key={project.id} project={project} stories={sprintItems} sprints={sprints} releases={releases} onRelease={openRelease} busy={busy} action={action} onOpen={open} onOpenSnapshot={item => setModal({type:"workSnapshot",item})} onCreate={create} renderSprint={(sp, planning) => <SprintCard key={sp.id} sp={sp} stories={sprintItems} action={action} setModal={setModal} open={open} go={go} setSprintFilter={setSprintFilter} storyRows={storyRows} onCreate={() => create(undefined, null, {sprintId:sp.id})} {...planning}/>}/>}

          {view === "board" && (
            <>
              <div className="board-toolbar">
                {toolbar}
                <SubtaskFilter checked={boardShowSubtasks} onChange={setBoardShowSubtasks}/>
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
                <Select aria-label="看板版本筛选" value={boardReleaseFilter} onChange={e=>setBoardReleaseFilter(e.target.value)}><option value="all">全部版本</option><option value="none">未安排版本</option>{releases.filter(r=>!r.archived).map(r=><option value={r.id} key={r.id}>{r.name}</option>)}</Select>
              </div>
              <Board project={project} items={items} rows={filtered.filter(x=>(sprintFilter==='all'||x.sprintId===sprintFilter)&&(boardReleaseFilter==='all'||(boardReleaseFilter==='none'?!x.releaseId:x.releaseId===boardReleaseFilter)))} releases={releases} busy={busy} action={action} onOpen={open} onCreate={()=>create()} onNotice={setToast} renderStatus={status=><Badge status={status}/>}/>
            </>
          )}

          {view === "releases" && <ReleaseWorkspace key={project.id} project={project} items={items} releases={releases} sprints={sprints} releaseId={releaseId} onSelect={setReleaseId} action={action} busy={busy} onOpen={open} onSnapshot={item=>setModal({type:"workSnapshot",item})} onCreate={create}/>}
          {view === "ai" && (
            <>
              {header(
                "AI 交付",
                "跟踪执行进展、查看交付结果，并完成人工验收。",
                <ReplicaButton
                  onClick={() => {
                    setSettingsSection("integrations");
                    go("settings");
                  }}
                >
                  <Settings size={15} />
                  管理 AI 连接
                </ReplicaButton>,
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
                    <AntStatistic>{n}</AntStatistic>
                  </div>
                ))}
              </div>
              <AntCard className="panel">
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
                        <ReplicaButton
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
                        </ReplicaButton>
                      );
                    })
                ) : (
                  <Empty
                    title="等待你的第一次 AI 交付"
                    text="在工作项中启用 AI，然后复制执行指令到已连接的 AI 工具。"
                  />
                )}
              </AntCard>
            </>
          )}
          {view === "settings" && (
            <SettingsPanel
              key={project.id}
              project={project}
              cloudPanel={<CloudPanel project={project} busy={busy||settingsDirtyRef.current} onState={receiveCloudState} setToast={setToast}/>}
              section={settingsSection}
              memoryPanel={renderMemory()}
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
                go("roadmap");
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
        {settingsNavigation && <div className="replica-dialog-host">
          <ReplicaModal className="modal unsaved-settings-modal" role="dialog" aria-modal="true" aria-labelledby="unsaved-settings-title" aria-describedby="unsaved-settings-description">
            <header><span className="unsaved-settings-icon"><AlertCircle size={23}/></span><h2 id="unsaved-settings-title">设置尚未保存</h2><ReplicaButton className="icon-btn" aria-label="继续编辑设置" onClick={() => setSettingsNavigation(null)}><X size={18}/></ReplicaButton></header>
            <div className="modal-body"><p id="unsaved-settings-description">离开将丢失本次修改。你可以继续编辑，保存后再离开。</p></div>
            <footer><ReplicaButton className="discard-settings-button" onClick={() => {
              const navigate = settingsNavigation;
              settingsDirtyRef.current = false;
              setSettingsNavigation(null);
              navigate();
            }}>放弃并离开</ReplicaButton><ReplicaButton className="primary" autoFocus onClick={() => setSettingsNavigation(null)}>继续编辑</ReplicaButton></footer>
          </ReplicaModal>
        </div>}
      </Presence>
      <ViewPreferencesNotice project={project}/>
      {toast && (
        <AntToast className="toast" role="status">
          <CheckCircle2 size={17} />
          {toast}
          <ReplicaButton className="icon-btn" aria-label="关闭提示" onClick={() => setToast("")}>
            <X size={14} />
          </ReplicaButton>
        </AntToast>
      )}
    </div>
    {helpOpen && <HelpCenter initialArticle={page === "dashboard" ? "start" : view === "settings" ? ({types:"types",hierarchy:"hierarchy",states:"workflows",memory:"memory",integrations:"ai",data:"data",general:"projects",members:"projects",roles:"projects",workflow:"projects"}[settingsSection] || "start") : ({roadmap:"roadmap",backlog:"sprints",sprints:"sprints",board:"list",list:"list",releases:"releases",reports:"reports",ai:"ai"}[view] || "start")} onClose={() => setHelpOpen(false)}/>}
    </>
    </WorkspaceLinksProvider></WorkConfigContext.Provider>
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
  storyRows, workRows, onStart, onEdit, onClose, onCreate, scopeFilter, busy, activeSprint,
}) {
  const project = useWorkProject();
  const personal=useViewPreferences(project,'backlog',{expandedSprints:{}});
  const expanded=personal.values.expandedSprints[sp.id]??sp.status!=='closed';
  const setExpanded=value=>personal.set(old=>({expandedSprints:{...old.expandedSprints,[sp.id]:value}}));
  const rows =
      sp.status === "closed"
        ? sp.finalStories || []
        : stories.filter((x) => x.sprintId === sp.id),
    done = rows.filter((x) => hasStatus(x, project, "done"));
  const visibleRows = scopeFilter ? rows.filter(scopeFilter) : rows;
  const menuRef = useRef(null);
  return (
    <AntCard className="panel sprint-card" data-work-scope="sprint" data-scope-id={sp.id} tabIndex={0}>
      <div className="sprint-heading">
        <ReplicaButton className="icon-btn" aria-label={(expanded ? "收起" : "展开") + sp.name} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}</ReplicaButton>
        <div className="sprint-heading-info"><h2 title={sp.name}>{sp.name}</h2><ReplicaButton className="sprint-date-link" disabled={busy || sp.status === "closed"} aria-label={"编辑" + sp.name + "日期"} onClick={onEdit}><Calendar size={12}/>{fmt(sp.startDate)} — {fmt(sp.endDate)}</ReplicaButton><span className="sprint-item-count">（{visibleRows.length} 个工作项）</span></div>
        <div className="inline sprint-actions">
          <SprintStatusCounts rows={visibleRows} project={project}/>
          {sp.status === "planned" && <ReplicaButton className="primary" disabled={busy || !rows.length || !!activeSprint} title={activeSprint ? "请先完成当前冲刺" : !rows.length ? "先从待办池安排工作项" : "确认目标和周期后启动"} onClick={onStart}>启动冲刺</ReplicaButton>}
          {sp.status === "active" && <ReplicaButton className="primary" disabled={busy} onClick={onClose}>完成冲刺</ReplicaButton>}
          {sp.status!=="closed"&&<AntDisclosure className="sprint-more-menu" ref={menuRef}><summary aria-label={sp.name + "更多操作"}><MoreHorizontal size={17}/></summary><div className="sprint-more-options">
            {sp.status !== "closed" && <ReplicaButton disabled={busy} onClick={() => {menuRef.current?.removeAttribute("open");onEdit();}}>编辑冲刺</ReplicaButton>}
            {sp.status === "active" && <ReplicaButton onClick={() => {go("board");setSprintFilter(sp.id);}}>打开看板</ReplicaButton>}

          </div></AntDisclosure>}
        </div>
      </div>
      {expanded && (
        <>
              {workRows(rows)}
              {sp.status !== "closed" && <div className="sprint-create-row"><ReplicaButton className="text-btn" disabled={busy} onClick={onCreate}><Plus size={15}/>新建工作项</ReplicaButton></div>}
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
    </AntCard>
  );
}
function InheritedPlanning({parent,sprints,compact=false}) {
  return <div className={'inherited-planning'+(compact?' is-compact':' wide')}><Field label="Sprint（随父级）"><ReplicaInput aria-label="继承的 Sprint" readOnly value={parent?(sprints.find(sp=>sp.id===parent.sprintId)?.name||"产品待办池"):"请先选择父级工作项"}/></Field></div>;
}
function Field({ label, children, wide }) {
  const Container = ReplicaField;
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
  useEffect(()=>{if(isSubtask(i,project)&&tab==='children')setTab('detail');},[i.id,i.kind,tab,project,setTab]);
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
    <div className="replica-dialog-host">
      <div className="drawer-scrim" onClick={close} />
      <ReplicaDrawer onClose={close}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="条目详情"
      >
        <header>
          <div>
            <Kind kind={i.kind} />
            <ReplicaButton className="work-item-code" aria-label="复制工作项 ID" title="点击复制工作项 ID" onClick={() => { const code = i.number ? project.code + "-" + i.number : i.id; copy(code, "已复制工作项 ID：" + code); }}>{i.number ? project.code + "-" + i.number : i.id}</ReplicaButton>
          </div>
          <div>
            <ReplicaButton className="icon-btn" aria-label="复制工作项链接" title="复制工作项链接" onClick={() => copy(window.location.href)}><Link size={17}/></ReplicaButton>
            {isExecutionItem(i,project)&&<ReplicaButton className={'icon-btn detail-ai-button'+(aiOn?' on':'')} aria-label={aiOn?'停用 AI 执行':'启用 AI 执行'} aria-pressed={aiOn} title={!aiOn&&!aiReady(workflowFor(project,i.kind))?'请先配置执行、验收和完成节点':aiOn?'停用当前工作项的 AI 执行':'启用当前工作项的 AI 执行'} disabled={busy||(!aiOn&&!aiReady(workflowFor(project,i.kind)))} onClick={()=>update({aiEnabled:!aiOn,aiDisabled:aiOn})}><Bot size={18}/></ReplicaButton>}
          </div>
        </header>
        <div className="drawer-body">
          {ancestors.length > 0 && <AntBreadcrumb className="item-parent-path" aria-label="所属工作项路径">{ancestors.map((parent) => <React.Fragment key={parent.id}><ReplicaButton onClick={() => open(parent)} title={parent.title}><Kind kind={parent.kind} iconOnly/><span>{parent.title}</span></ReplicaButton><ChevronRight size={12}/></React.Fragment>)}<span>当前工作项</span></AntBreadcrumb>}
          <div className="detail-heading">
            <div className="detail-title-row">
              <Select className="detail-status-icon detail-status-picker" aria-label="变更工作项状态" kind="status" value={i.status} searchable={false} disabled={busy} onChange={e=>update({status:e.target.value})}>
                {detailStatusOptions(project,i).map(status=><option key={status.id} value={status.id}>{status.name}</option>)}
              </Select>
              <WorkItemTitle
                key={i.id + "title"}
                value={i.title}
                save={(title) => update({ title })}
              />
            </div>

          </div>
          <AntTabs className="tabs">
            {[
              ["detail", "详情"],
              ...(!isSubtask(i,project)?[["children", isWorkItem(i, project) ? "子任务" : "子项"]]:[]),
              ...(isExecutionItem(i, project) ? [["runs", "交付与验收"]] : []),
              ["history", "活动记录"],
            ].map(([k, v]) => (
              <ReplicaButton
                key={k}
                className={tab === k ? "active" : ""}
                onClick={() => setTab(k)}
              >
                {v}
              </ReplicaButton>
            ))}
          </AntTabs>
          {tab === "detail" && (
            <>
              <div className="form-grid detail-fields">
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
                  <Field label="所属工作项">
                    <Select
                      value={i.parentId || ""}
                      onChange={(e) => update({ parentId: e.target.value })}
                    >
                      {!isSubtask(i, project) && <option value="">暂不归类</option>}
                      {items
                        .filter((x) => possibleParents.some((p) => p.id === x.id))
                        .map((x) => (
                          <option key={x.id} value={x.id} data-kind={x.kind} data-description={typeNames(project)[x.kind] + (x.parentId ? " · " + (items.find((p) => p.id === x.parentId)?.title || "") : " · 未关联所属工作项")}>
                            {x.number ? `${project.code}-${x.number} · ${x.title}` : x.title}
                          </option>
                        ))}
                    </Select>
                  </Field>
                )}
                {<>
                    <Field label="目标版本">
                      <Select
                        value={i.releaseId || ""}
                        onChange={(e) => update({ releaseId: e.target.value })}
                      >
                        <option value="">未安排</option>
                        {releases
                          .filter(
                            (r) =>
                              (!r.archived && r.status !== "released") || r.id === i.releaseId,
                          )
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                      </Select>
                    </Field>
                    {isSubtask(i,project)?<InheritedPlanning parent={parentItem} sprints={sprints} compact/>:<Field label="Sprint">
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
                    </Field>}
                    {isWorkItem(i,project)&&<Field label="故事点">
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
                    </Field>}
                  </>}
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
                  <ReplicaButton
                    disabled={!aiOn}
                    onClick={() => copy(prompt)}
                  >
                    <Copy size={15} />
                    复制执行指令
                  </ReplicaButton>
                  {!aiOn && (
                    <small>请先为所属工作项启用 AI 执行</small>
                  )}
                </div>
              )}
              <div className="detail-actions">
                {isExecutionItem(i, project) && hasStatus(i, project, "review") && (
                  <ReplicaButton
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
                  </ReplicaButton>
                )}
                {isExecutionItem(i, project) &&
                  !terminal(i, project) && statusFor(project,"review",i.kind) && allowedTransition(project,i.status,statusFor(project,"review",i.kind),i.kind) && (
                    <ReplicaButton onClick={() => update({ status: statusFor(project, "review", i.kind) })}>
                      提交人工交付
                    </ReplicaButton>
                  )}
                <ReplicaButton
                  className="danger text-btn ml-auto"
                  onClick={() =>
                    setModal({ type: "delete", item: i, after: close })
                  }
                >
                  <Trash2 size={14} />
                  删除条目
                </ReplicaButton>
              </div>
            </>
          )}
          {tab === "children" && (
            <>
              <div className="panel-title">
                <h3>{isWorkItem(i, project) ? "子任务" : "下级条目"}</h3>
                {childTypes(project, i.kind).length > 0 && (
                  <ReplicaButton
                    onClick={() =>
                      create(childTypes(project, i.kind)[0]?.id, i.id)
                    }
                  >
                    <Plus size={14} />
                    添加
                  </ReplicaButton>
                )}
              </div>
              {tasks.length ? (
                tasks.map((t) => (
                  <ReplicaButton
                    key={t.id}
                    className="child-row"
                    onClick={() => open(t)}
                  >
                    <Kind kind={t.kind} iconOnly />
                    <span>{t.title}</span>
                    <Badge status={t.status} />
                  </ReplicaButton>
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
                  <ReplicaButton
                    onClick={() => setModal({ type: "delivery", story: i })}
                  >
                    <Plus size={14} />
                    记录交付
                  </ReplicaButton>
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
                      <AntAlert className="warning">
                        此交付依据的要求已变化，请核对当前工作项及所属任务的要求。
                      </AntAlert>
                    )}
                    <MarkdownPreview value={r.summary || "正在执行…"}/>
                    {r.progress?.map((p, n) => (
                      <div key={n} className="muted">
                        {time(p.at)}<MarkdownPreview value={p.message}/>
                      </div>
                    ))}
                    {r.verification && (
                      <div className="verification">
                        <b>验证结果</b>
                        <MarkdownPreview value={r.verification}/>
                      </div>
                    )}
                    {r.artifacts?.map((a, n) => (
                      <div key={n} className="artifact">
                        <Link size={14} />
                        {/^https?:\/\//.test(a.url) ? (
                          <WorkspaceLink href={a.url}>{a.title}</WorkspaceLink>
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
                        <MarkdownPreview value={rv.comment}/>
                        <small>{rv.automatic&&"系统自动触发 · "}{time(rv.at)}</small>
                      </div>
                    ))}
                    {r.status === "review" && (
                      <ReplicaButton
                        className="primary"
                        onClick={() =>
                          setModal({ type: "review", story: i, run: r })
                        }
                      >
                        审核交付 <ArrowRight size={14} />
                      </ReplicaButton>
                    )}
                    {["active", "blocked"].includes(r.status) && (
                      <ReplicaButton
                        onClick={() => action("run.cancel", { id: r.id })}
                      >
                        取消此次执行
                      </ReplicaButton>
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
            <AntTimeline className="activity detail-activity">
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
            </AntTimeline>
          )}
        </div>
      </ReplicaDrawer>
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
  const [itemSprint,setItemSprint]=useState(m.sprintId||""),[itemRelease,setItemRelease]=useState(m.releaseId||"");
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
        sprintId: isSubtask({kind:itemKind},project)?null:itemSprint||null,
        releaseId: itemRelease||null,
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
      className="replica-dialog-host"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <ReplicaModal
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={titles[m.type]}
      >
        <header>
          <div>
            <h2>{titles[m.type]}</h2>
          </div>
          <ReplicaButton
            type="button"
            className="icon-btn"
            title="关闭弹窗"
            onClick={close}
          >
            <X size={20} />
          </ReplicaButton>
        </header>
        {m.type === "connection" ? (
          <div className="modal-body">
            <p className="muted">
              {connection?.oauth ? 'LoyoCloud 使用独立的 OAuth 授权。将下方地址添加到支持 OAuth 的 AI 工具，登录云账号并选择允许访问的项目。' : '在支持 Streamable HTTP MCP 和自定义请求头的 AI 工具中添加以下连接。首次配置后，可在故事中复制执行指令。'}
            </p>
            <Field label="MCP 地址">
              <div className="copy-row">
                <code>{connection?.url}</code>
                <ReplicaButton onClick={() => copy(connection.url)}>
                  <Copy size={14} />
                </ReplicaButton>
              </div>
            </Field>
            {!connection?.oauth && <><Field label="Authorization 请求头">
              <div className="copy-row">
                <code>
                  {showToken
                    ? "Bearer " + connection?.token
                    : "Bearer ••••••••••••••••••••••••"}
                </code>
                <ReplicaButton onClick={() => copy("Bearer " + connection.token)}>
                  <Copy size={14} />
                </ReplicaButton>
              </div>
            </Field>
            <ReplicaButton
              className="text-btn"
              onClick={() => setShowToken(!showToken)}
            >
              {showToken ? "隐藏密钥" : "显示密钥"}
            </ReplicaButton></>}
            <div className="instruction-box">
              <h4>可直接复制的连接配置</h4>
              <p>
                各 AI 客户端的配置格式可能不同，请按对应工具要求填写 URL
                {connection?.oauth ? '并完成 OAuth 授权。' : '与请求头。'}
              </p>
              <ReplicaButton
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
              </ReplicaButton>
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
          <ReplicaForm onSubmit={submit}>
            <div className="modal-body">
              {m.type === "item" && (
                <>
                  {(!project.startDate || !project.endDate) && (
                    <AntAlert className="warning">
                      请先设置项目周期，才能安排需求日期。
                      <ReplicaButton
                        type="button"
                        className="text-btn"
                        onClick={onProjectSettings}
                      >
                        设置项目周期
                      </ReplicaButton>
                    </AntAlert>
                  )}
                  <Field label="工作项类型"><Select name="kind" value={itemKind} required onChange={(e) => {
                    const kind = e.target.value; setItemKind(kind);
                    if (!possibleParents.some((p) => p.id === itemParent && canParent(project, kind, p))) setItemParent("");
                  }}>{configFor(project).types.filter((t) => t.enabled && !t.hidden).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
                  <Field label="标题">
                    <ReplicaInput
                      name="title"
                      autoFocus
                      required
                      placeholder={`给${kinds[itemKind]}一个清晰的名称`}
                    />
                  </Field>
                  {parentKind && (
                    <Field label="所属工作项">
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
                            <option key={x.id} value={x.id} data-kind={x.kind} data-description={typeNames(project)[x.kind] + (x.parentId ? " · " + (items.find((p) => p.id === x.parentId)?.title || "") : " · 未关联所属工作项")}>
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
                  {<div className="form-grid"><Field label="目标版本"><Select name="releaseId" value={itemRelease} onChange={e=>setItemRelease(e.target.value)}><option value="">未安排版本</option>{data.releases.filter(r=>r.projectId===project.id&&!r.archived&&r.status!=="released").map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>{!isSubtask({kind:itemKind},project)&&<Field label="Sprint"><Select name="sprintId" value={itemSprint} onChange={e=>setItemSprint(e.target.value)}><option value="">产品待办池</option>{data.sprints.filter(sp=>sp.projectId===project.id&&sp.status!=="closed").map(sp=><option key={sp.id} value={sp.id}>{sp.name}</option>)}</Select></Field>}</div>}
                  {isSubtask({kind:itemKind},project)&&<InheritedPlanning parent={items.find(i=>i.id===itemParent)} releases={data.releases} sprints={data.sprints}/>}
                  {isExecutionItem({ kind: itemKind }, project) && (
                    <>
                      <Field label="验收标准">
                        <RichTextEditor name="acceptance" label="验收标准" onBusyChange={imageBusy} disabled={busy} placeholder="达到什么条件，才能确认完成？"/>
                      </Field>
                      {isWorkItem({kind:itemKind}, project) && <Field label="故事点">
                        <ReplicaInput
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
                    <ReplicaInput
                      name="name"
                      autoFocus
                      required
                      placeholder="例如：产品研发、网站重构"
                    />
                  </Field>
                  <Field label="项目 ID"><ReplicaInput name="code" required minLength={2} maxLength={8} pattern="[A-Za-z][A-Za-z0-9]{1,7}" placeholder="例如：HS；创建后固定" style={{textTransform:"uppercase"}}/><small>2 至 8 位字母或数字，以字母开头。工作项编号示例：HS-928。</small></Field>
                  <Field label="项目简介">
                    <ReplicaTextArea
                      name="description"
                      placeholder="这个项目准备实现什么？"
                    />
                  </Field>
                  <Field label="项目目标">
                    <ReplicaTextArea
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
                  <p className="muted">工作项的起止日期须在项目周期内。</p>
                </>
              )}
              {(m.type === "sprint" || m.type === "release") && (
                <>
                  <Field
                    label={m.type === "sprint" ? "Sprint 名称" : "版本名称"}
                  >
                    <ReplicaInput
                      name="name"
                      required
                      autoFocus
                      placeholder={
                        m.type === "sprint" ? "Sprint 03" : "alpha_0.2"
                      }
                    />
                  </Field>
                  <Field label="目标">
                    <ReplicaTextArea
                      name="goal"
                      required
                      placeholder="本次准备达成什么成果？"
                    />
                  </Field>
                  {m.type === "sprint" ? (
                    <div className="form-grid">
                      <Field label="开始日期">
                        <ReplicaInput type="date" name="startDate" required />
                      </Field>
                      <Field label="结束日期">
                        <ReplicaInput type="date" name="endDate" required />
                      </Field>
                      <Field label="计划容量（SP）">
                        <ReplicaInput
                          name="capacity"
                          type="number"
                          min="0"
                          defaultValue="20"
                        />
                      </Field>
                    </div>
                  ) : (
                    <Field label="计划发布日期">
                      <ReplicaInput type="date" name="plannedDate" />
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
                    <ReplicaInput name="title" required autoFocus />
                  </Field>
                  <Field label="内容">
                    <RichTextEditor name="body" label="内容" onBusyChange={imageBusy} disabled={busy}/>
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
                    <RichTextEditor name="comment" label="审核意见" onBusyChange={imageBusy} disabled={busy}/>
                  </Field>
                  {m.run && ((m.run.itemVersion !== undefined && m.run.itemVersion !== m.story.contentVersion) || m.run.storyVersion !== (isSubtask(m.story, project) ? items.find(i => i.id === m.story.parentId) : m.story).contentVersion) && (
                    <label className="check-label">
                      <ReplicaInput type="checkbox" name="acknowledge" />
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
                    <ReplicaInput
                      name="agent"
                      required
                      placeholder="例如：我的 AI 工具"
                    />
                  </Field>
                  <Field label="交付说明">
                    <RichTextEditor name="summary" label="交付说明" onBusyChange={imageBusy} disabled={busy}/>
                  </Field>
                  <Field label="验证结果">
                    <RichTextEditor name="verification" label="验证结果" onBusyChange={imageBusy} disabled={busy}/>
                  </Field>
                  <div className="form-grid">
                    <Field label="成果名称">
                      <ReplicaInput name="artifactTitle" />
                    </Field>
                    <Field label="成果链接或文件路径">
                      <ReplicaInput
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
                    <AntAlert className="warning">
                      请先在「评审与复盘」中保存评审总结、做得好的地方和需要改进的地方。
                    </AntAlert>
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
                      <ReplicaInput
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
                                !r.archived && r.status !== "released",
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
                    <RichTextEditor name="notes" label="发布说明" onBusyChange={imageBusy} disabled={busy}/>
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
              <ReplicaButton type="button" onClick={close}>
                取消
              </ReplicaButton>
              <ReplicaButton
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
              </ReplicaButton>
            </footer>
          </ReplicaForm>
        )}
      </ReplicaModal>
    </div>
  );
}
const appContainer=document.getElementById("root");
const appRoot=appContainer.__heysoRoot ||= createRoot(appContainer);
appRoot.render(<ReplicaTheme><AccessGate><App /></AccessGate></ReplicaTheme>);

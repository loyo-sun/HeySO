import {ReplicaButton,ReplicaInput} from './ReplicaControls.jsx';
import {AntList,AntTag,AntEmpty,AntCard,AntStatistic} from './AntStructures.jsx';
import React, { useState } from 'react';
import { LayoutDashboard, ListChecks, AlertCircle, Calendar, Clock, Search, ArrowUpRight, FolderKanban, Plus, RefreshCw, ArrowRight, CheckCircle2 } from 'lucide-react';
import { dashboardTodos, matchesTodoScope, localDay } from './dashboard.mjs';
import { WorkConfigContext } from './WorkConfigContext.jsx';
import { statusNamesFor, progressCategory } from '../shared/work-config.mjs';
import Kind from './WorkType.jsx';
import Select, { StatusIcon, PriorityIcon } from './Select.jsx';

const scopes = [['all', '全部待办', ListChecks], ['overdue', '已逾期', AlertCircle], ['today', '今日到期', Calendar], ['review', '待验收', Clock], ['blocked', '有阻塞', AlertCircle]];
export default function Dashboard({ data, onOpen, onProject, onRefresh, onCreateProject }) {
  const [scope, setScope] = useState('all');
  const [projectId, setProjectId] = useState('all');
  const [owner, setOwner] = useState('all');
  const [query, setQuery] = useState('');
  const today = localDay();
  const todos = dashboardTodos(data, today);
  const owners = [...new Set(todos.map(({ item }) => item.owner || ''))].sort((a,b) => a.localeCompare(b, 'zh-CN'));
  const scoped = todos.filter(({ item, project }) => (projectId === 'all' || project.id === projectId)
    && (owner === 'all' || (item.owner || '') === owner)
    && `${project.name} ${project.code}-${item.number} ${item.title}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const visible = scoped.filter(row => matchesTodoScope(row, scope));
  const reset = () => { setScope('all'); setProjectId('all'); setOwner('all'); setQuery(''); };
  return <div className="content dashboard-content">
    <div className="page-heading">
      <div><div className="dashboard-eyebrow"><LayoutDashboard size={14}/> 工作空间总览 <span>{today.replaceAll('-', '.')}</span></div>
        <h1>仪表盘</h1><p>汇总所有项目的待办，让下一步更清楚。</p></div>
      <ReplicaButton className="icon-btn" aria-label="刷新仪表盘" title="刷新仪表盘" onClick={onRefresh}><RefreshCw size={17}/></ReplicaButton>
    </div>
    <div className="dashboard-stats">
      {scopes.map(([id, label, Icon]) => <AntCard key={id} className={`stat dashboard-stat ${scope === id ? 'selected' : ''} ${id}`} aria-pressed={scope === id} onClick={() => setScope(id)}>
        <div className="stat-top"><span>{label}</span><Icon size={17}/></div><AntStatistic>{scoped.filter(row => matchesTodoScope(row, id)).length}<small> 个</small></AntStatistic>
      </AntCard>)}
    </div>
    <div className="dashboard-layout">
      <AntCard className="panel dashboard-todos" aria-label="项目待办">
        <div className="panel-title"><h3><ListChecks size={18}/> 项目待办 <span className="count">{visible.length}</span></h3><span className="muted">逾期优先 · 按截止日期排序</span></div>
        <div className="dashboard-filters">
          <div className="dashboard-search"><Search size={15}/><ReplicaInput aria-label="搜索所有项目待办" placeholder="搜索标题、编号或项目" value={query} onChange={e => setQuery(e.target.value)}/></div>
          <Select aria-label="筛选项目" value={projectId} onChange={e => setProjectId(e.target.value)}><option value="all">全部项目</option>{data.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
          <Select aria-label="筛选待办负责人" value={owner} onChange={e => setOwner(e.target.value)}><option value="all">全部负责人</option>{owners.map(name => <option key={name} value={name}>{name || '未分配'}</option>)}</Select>
        </div>
        <p className="dashboard-hint">包含标准工作项与子任务，已完成和已取消的工作不计入待办。</p>
        <AntList className="dashboard-todo-list">
          {visible.map(({ item, project, dueDate, overdue, today: dueToday }) => <WorkConfigContext.Provider key={item.id} value={project}>
            <ReplicaButton className="dashboard-todo" onClick={() => onOpen(item)}>
              <div className="dashboard-todo-title"><span className="dashboard-item-code">{project.code}-{item.number}</span><strong>{item.title}</strong><ArrowUpRight size={15}/></div>
              <div className="dashboard-todo-meta"><span className="dashboard-project-name"><FolderKanban size={13}/>{project.name}</span><Kind kind={item.kind}/><AntTag className={`badge ${progressCategory(project, item.status) === 'in_progress' ? 'active' : 'todo'}`}><StatusIcon value={item.status}/>{statusNamesFor(project)[item.status] || item.status}</AntTag><span className="dashboard-priority"><PriorityIcon value={item.priority}/>{{high:'高优先级',medium:'中优先级',low:'低优先级'}[item.priority] || '未设优先级'}</span><span>{item.owner || '未分配'}</span><span className={`dashboard-due ${overdue ? 'overdue' : dueToday ? 'due-today' : ''}`}><Calendar size={13}/>{dueDate ? `${dueDate.slice(5).replace('-', '/')} ${overdue ? '已逾期' : dueToday ? '今日到期' : '截止'}` : '未设截止日期'}</span></div>
            </ReplicaButton>
          </WorkConfigContext.Provider>)}
          {!visible.length && <AntEmpty className="empty"><CheckCircle2 size={30}/><h3>{todos.length ? '没有符合条件的待办' : '当前没有未完成的待办'}</h3><p>{todos.length ? '试试其他筛选条件，或清除筛选查看全部。' : '到项目中规划工作，新的待办会自动汇总到这里。'}</p><ReplicaButton onClick={todos.length ? reset : () => onProject(data.projects[0].id)}>{todos.length ? '清除筛选' : '进入项目'}<ArrowRight size={14}/></ReplicaButton></AntEmpty>}
        </AntList>
      </AntCard>
      <AntCard className="panel dashboard-projects" aria-label="项目汇总">
        <div className="panel-title"><h3><FolderKanban size={17}/> 项目 <span className="count">{data.projects.length}</span></h3><ReplicaButton className="icon-btn" aria-label="创建项目" onClick={onCreateProject}><Plus size={16}/></ReplicaButton></div>
        {data.projects.map(project => {
          const pending = todos.filter(row => row.project.id === project.id);
          const overdue = pending.filter(row => row.overdue).length;
          return <ReplicaButton className="dashboard-project" key={project.id} onClick={() => onProject(project.id)}><span className="dashboard-project-icon"><FolderKanban size={18}/></span><span><strong>{project.name}</strong><small>{pending.length} 个待办{overdue > 0 && <em> · {overdue} 个逾期</em>}</small></span><ArrowUpRight size={15}/></ReplicaButton>;
        })}
      </AntCard>
    </div>
    <footer className="page-footer"><span>合序 HeySO</span><span>Hey, Shared Outcomes.</span><span>工作空间 · {data.projects.length} 个项目</span></footer>
  </div>;
}

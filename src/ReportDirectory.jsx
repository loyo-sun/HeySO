import {ReplicaButton,ReplicaInput} from './ReplicaControls.jsx';
import {AntCard,AntTabs,AntEmpty,AntStatistic} from './AntStructures.jsx';
import React,{useState} from 'react';
import PageTitle from './PageTitle.jsx';
import {TrendingDown,TrendingUp,Layers,Clock,PlusCircle,PieChart,Users,Flag,ListFilter,Search,ArrowRight,CalendarDays,Target,TriangleAlert,Bot,Star,X} from 'lucide-react';
export const reportCategories=[
 ['敏捷与冲刺','冲刺的承诺是否兑现，下一轮可以承接多少工作？'],
 ['流程与效率','工作在哪里积压，从开始到交付需要多久？'],
 ['计划与交付','目标推进到哪里，哪些工作需要提前干预？'],
 ['工作分布','工作如何分配，不同维度的范围是否清晰？'],
 ['AI 协作','AI 提交了什么，人工验收是否及时？'],
];
export const reportCatalog=[
 ['sprint','冲刺报告',ListFilter,'对照启动承诺、已完成范围与执行中的范围变化。','敏捷与冲刺','启动基线与结束快照'],
 ['burndown','燃尽图',TrendingDown,'比较实际剩余故事点与理想进度，检查冲刺目标。','敏捷与冲刺','每日故事点快照'],
 ['velocity','速率图',TrendingUp,'比较已结束冲刺的承诺与完成，辅助下一轮规划。','敏捷与冲刺','已结束冲刺'],
 ['flow','累积流程图',Layers,'观察各阶段存量，识别持续增宽的积压与瓶颈。','流程与效率','状态变更历史'],
 ['cycle','控制图',Clock,'查看执行周期、波动范围与异常样本。','流程与效率','执行与完成记录'],
 ['aging','平均年龄报告',Clock,'查看未完成工作存续多久，识别长期未推进的需求。','流程与效率','创建与状态历史'],
 ['created','新增与完成报告',PlusCircle,'比较需求进入与交付速度，判断范围是否持续增长。','流程与效率','创建与完成时间'],
 ['recent','最近创建报告',PlusCircle,'按创建批次查看新增需求及其完成情况。','流程与效率','按创建日分组'],
 ['resolution','解决时间报告',Clock,'查看工作从创建到最终完成的平均时长。','流程与效率','创建至最终完成'],
 ['hierarchy','目标进展',Target,'从规划层追踪下属执行工作，核对目标与实际成果。','计划与交付','层级关系与当前状态'],
 ['risks','交付风险',TriangleAlert,'集中定位逾期、阻塞、缺少负责人和交付安排的工作。','计划与交付','当前计划与工作状态'],
 ['versions','版本报告',Flag,'核对版本范围、完成进度与发布时保留的交付快照。','计划与交付','当前范围 / 发布快照'],
 ['versionworkload','版本工作量报告',Users,'按版本与负责人定位发布前尚未完成的工作。','计划与交付','未发布版本当前范围'],
 ['distribution','饼图报告',PieChart,'按状态、类型、负责人等维度查看工作项分布。','工作分布','当前工作项'],
 ['grouping','单级分组报告',ListFilter,'按单个字段汇总数量与故事点，展开检查明细。','工作分布','当前工作项'],
 ['datecounts','日期统计报告',CalendarDays,'按创建、更新、到期或完成日期汇总工作项。','工作分布','所选日期字段'],
 ['workload','负责人工作量',Users,'查看各负责人的待处理、在制与已完成工作。','工作分布','当前分配，非实际工时'],
 ['workloadpie','剩余工作量分布',PieChart,'比较各负责人的未完成工作量和相对占比。','工作分布','未完成工作项'],
 ['collaboration','AI 交付与验收',Bot,'跟踪提交、验收结果和等待时间，回顾人与 AI 的协作。','AI 协作','执行记录与人工审核'],
];
const readIds=key=>{try{const ids=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(ids)?ids.filter(id=>reportCatalog.some(c=>c[0]===id)):[];}catch{return [];}};
export function rememberReport(projectId,id){try{const key='heyso:reports:recent:'+projectId;localStorage.setItem(key,JSON.stringify([id,...readIds(key).filter(v=>v!==id)].slice(0,4)));}catch{}}
export default function ReportDirectory({onSelect,project,insights}){
 const [category,setCategory]=useState('全部'),[query,setQuery]=useState('');
 const favoriteKey='heyso:reports:favorites:'+project.id;
 const [favorites,setFavorites]=useState(()=>readIds(favoriteKey));
 const recent=readIds('heyso:reports:recent:'+project.id);
 const matching=reportCatalog.filter(c=>(category==='全部'||category==='常用报告'&&favorites.includes(c[0])||c[4]===category)&&`${c[1]} ${c[3]} ${c[4]}`.includes(query.trim()));
 const toggle=id=>{const next=favorites.includes(id)?favorites.filter(v=>v!==id):[...favorites,id];setFavorites(next);try{localStorage.setItem(favoriteKey,JSON.stringify(next));}catch{}};
 const {rows,open,done,risks,ai}=insights;
 const actionable=insights.actionable,completion=actionable.length?Math.round(done.length/actionable.length*100):null;
 const metrics=[['未完成工作',open.length,'项','执行层工作项','distribution'],['完成比例',completion??'—',completion===null?'':'%','按当前工作项数量','distribution'],['已逾期',risks[0].rows.length,'项','结束日期已过且未完成','risks'],['AI 待验收',ai.pending.length,'次','当前等待人工审核的交付','collaboration']];
 return <div className="reports-page report-hub">
  <div className="page-heading"><PageTitle view="reports"/></div>
  <div className="report-hub-intro"><p>从计划、执行到成果验收，让每一次复盘都有依据。</p><span>当前项目 · {project.name}</span></div>
  <div className="report-hub-metrics">{metrics.map(([label,value,suffix,note,id])=><AntCard key={label} className="report-hub-metric"><span>{label}</span><AntStatistic>{value}<small>{suffix}</small></AntStatistic><div><small>{note}</small><ReplicaButton className="text-btn" aria-label={{distribution:'查看工作项分布',risks:'查看交付风险',collaboration:'查看当前 AI 待验收'}[id]} onClick={()=>onSelect(id,id==='collaboration'?'pending':undefined)}><ArrowRight size={14}/></ReplicaButton></div></AntCard>)}</div>
  <div className="report-hub-shortcuts"><div><strong>开始一次复盘</strong><span>先看范围与风险，再追踪交付效率。</span></div><ReplicaButton onClick={()=>onSelect('sprint')}>冲刺复盘 <ArrowRight size={13}/></ReplicaButton><ReplicaButton onClick={()=>onSelect('risks')}>检查交付风险 <ArrowRight size={13}/></ReplicaButton><ReplicaButton onClick={()=>onSelect('collaboration')}>查看 AI 验收 <ArrowRight size={13}/></ReplicaButton></div>
  {recent.length>0&&<div className="report-hub-recent"><span>最近查看</span>{recent.map(id=><ReplicaButton key={id} className="text-btn" onClick={()=>onSelect(id)}>{reportCatalog.find(c=>c[0]===id)?.[1]}</ReplicaButton>)}</div>}
  <div className="report-hub-toolbar"><AntTabs className="report-hub-tabs" aria-label="报告分类">{['全部','常用报告',...reportCategories.map(c=>c[0])].map(c=><ReplicaButton key={c} aria-selected={c===category} onClick={()=>setCategory(c)}>{c}</ReplicaButton>)}</AntTabs><label className="report-hub-search"><Search size={15}/><ReplicaInput aria-label="搜索报告" placeholder="搜索报告或分析目的" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<ReplicaButton aria-label="清空报告搜索" className="text-btn" onClick={()=>setQuery('')}><X size={13}/></ReplicaButton>}</label></div>
  {reportCategories.filter(([c])=>matching.some(r=>r[4]===c)).map(([c,question])=><section className="report-hub-section" key={c}><header><h2>{c}<small>{matching.filter(r=>r[4]===c).length}</small></h2><p>{question}</p></header><div className="report-hub-grid">{matching.filter(r=>r[4]===c).map(([id,title,Icon,description,,source])=><AntCard className="report-hub-card" key={id}><ReplicaButton className="report-hub-entry" onClick={()=>onSelect(id)}><span className="report-hub-icon"><Icon size={21}/></span><span className="report-hub-copy"><strong>{title}</strong><span>{description}</span><small>{source}</small></span><ArrowRight size={15}/></ReplicaButton><ReplicaButton className={'report-favorite text-btn'+(favorites.includes(id)?' is-favorite':'')} aria-label={(favorites.includes(id)?'取消常用：':'设为常用：')+title} aria-pressed={favorites.includes(id)} onClick={()=>toggle(id)}><Star size={15}/></ReplicaButton></AntCard>)}</div></section>)}
  {!matching.length&&<AntEmpty className="report-empty">{category==='常用报告'?'还没有常用报告，点击报告旁的星标即可添加。':'没有匹配报告，请尝试其他关键词。'}</AntEmpty>}
  <p className="report-hub-footnote">执行统计不重复计入规划层和子任务；AI 报告按执行记录统计，包含子任务交付。缺少历史记录时明确展示数据不足。</p>
 </div>;
}

import React,{useState} from 'react';
import PageTitle from './PageTitle.jsx';
import {TrendingDown,TrendingUp,Layers,Clock,PlusCircle,PieChart,Users,Flag,ListFilter,Search,ArrowRight,CalendarDays} from 'lucide-react';
export const reportCatalog=[
 ['sprint','冲刺报告',ListFilter,'对比冲刺承诺、完成与未完成的范围，回顾范围变化。','敏捷报告','选择一个冲刺，以启动基线和结束快照为依据。'],
 ['burndown','燃尽图',TrendingDown,'查看冲刺内剩余故事点与理想进度的差距。','敏捷报告','需要已启动冲刺的每日故事点快照。'],
 ['velocity','速率图',TrendingUp,'对比多轮已结束冲刺的承诺量和实际完成量。','敏捷报告','仅包含已结束冲刺，保留当时的承诺和完成范围。'],
 ['flow','累积流程图',Layers,'观察各状态随时间的工作项存量，定位积压。','敏捷报告','使用状态变更记录回溯，缺失时段会单独标记。'],
 ['cycle','控制图',Clock,'查看执行周期、滚动平均和标准差边界。','敏捷报告','需要工作开始和完成的状态记录；包含返工的工作时间。'],
 ['aging','平均年龄报告',Clock,'查看未完成工作项在各日期的平均存续天数。','工作项分析','以创建时间及状态历史计算，历史缺失的样本不补算。'],
 ['created','新增与完成报告',PlusCircle,'对比一个时间段内新增与最终完成的工作项数量。','工作项分析','按创建日期和最终完成日期分组。'],
 ['distribution','饼图报告',PieChart,'将筛选结果按状态、负责人、类型等统计字段分布。','工作项分析','选择统计字段，可点击图形或图例查看对应工作项。'],
 ['recent','最近创建报告',PlusCircle,'查看工作项的创建趋势，以及其中已完成的数量。','工作项分析','按创建日期组成队列，区分完成与未完成。'],
 ['resolution','解决时间报告',Clock,'查看各日期完成工作项的平均创建至完成时间。','工作项分析','需要有效创建时间和完成时间，与执行周期不同。'],
 ['grouping','单级分组报告',ListFilter,'按一个统计字段汇总搜索结果，展开查看明细。','工作项分析','支持状态、负责人、类型、优先级、版本和冲刺。'],
 ['datecounts','日期统计报告',CalendarDays,'统计各日期创建、更新、到期或完成的工作项。','工作项分析','选择日期字段和分析区间，没有日期的记录不参与分组。'],
 ['workload','用户工作量报告',Users,'查看各负责人分配的待处理、在制与已完成工作。','工作量分析','按工作项数量反映当前分配，不等同于登记工时。'],
 ['workloadpie','工作量饼图',PieChart,'比较各负责人的未完成工作量及相对占比。','工作量分析','可按工作项数量或故事点统计，不包含已完成和已取消。'],
 ['versionworkload','版本工作量报告',Users,'按版本与负责人查看交付前尚未完成的工作。','工作量分析','使用当前版本范围，点击分组查看待完成明细。'],
 ['versions','版本报告',Flag,'查看版本范围、完成比例和剩余工作项。','版本分析','已发布版本使用发布快照，其余使用当前范围。'],
];
export default function ReportDirectory({onSelect}){
 const [category,setCategory]=useState('全部'),[query,setQuery]=useState('');
 const categories=['敏捷报告','工作项分析','工作量分析','版本分析'];
 const matching=reportCatalog.filter(c=>(category==='全部'||c[4]===category)&&`${c[1]} ${c[3]}`.includes(query.trim()));
 return <div className="reports-page report-directory"><div className="page-heading"><div><PageTitle view="reports"/><p>选择报告，配置统计范围，再生成分析结果。</p></div></div>
 <div className="report-directory-toolbar"><div className="report-directory-categories" role="tablist" aria-label="报告分类">{['全部',...categories].map(c=><button role="tab" aria-selected={category===c} key={c} onClick={()=>setCategory(c)}>{c}</button>)}</div><label className="report-directory-search"><Search size={15}/><input aria-label="搜索报告" placeholder="搜索报告…" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
 {categories.filter(c=>matching.some(r=>r[4]===c)).map(c=><section className="report-directory-section" key={c}><h2>{c}<small>{matching.filter(r=>r[4]===c).length}</small></h2><div className="report-directory-grid">{matching.filter(r=>r[4]===c).map(([id,title,Icon,description])=><button className="report-directory-card" key={id} onClick={()=>onSelect(id)}><div className={'report-card-illustration report-art-'+id}><Icon size={36} strokeWidth={1.4}/></div><div className="report-card-copy"><h3>{title}</h3><p>{description}</p><span>配置报告 <ArrowRight size={13}/></span></div></button>)}</div></section>)}
 {!matching.length&&<p className="report-empty panel">没有匹配的报告，请尝试其他关键词。</p>}
 </div>;
}

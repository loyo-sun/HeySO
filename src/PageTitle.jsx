import React from 'react';
import InfoTip from './InfoTip.jsx';
export const pageDescriptions={
 roadmap:'将工作与整体业务战略、产品愿景及关键战略举措保持一致。',
 backlog:'一个固定的时间段，团队在这段时间内完成产品待办事项中的工作。',
 board:'可视化项目管理工具，助力团队管理工作流、限制进行中的工作量。',
 list:'项目全部工作项汇总、筛选、查阅和管理。',
 releases:'产品发布是一个多阶段的过程，包括发布前规划、发布执行和发布后监控。',
 reports:'按冲刺、流程、交付计划、工作分布和 AI 验收分析项目，筛选后查看图表与工作项明细。',
 ai:'跟踪 AI 完成的工作，并进行人工验收。',
};
const names={roadmap:'线路',backlog:'冲刺',board:'看板',list:'清单',releases:'发布',reports:'报告',ai:'智能'};
export default function PageTitle({view,title}){const key=['work','sprints'].includes(view)?'backlog':view,label=title||names[key];return <h1 className="heading-with-info">{label}{pageDescriptions[key]&&<InfoTip label={names[key]||label}>{pageDescriptions[key]}</InfoTip>}</h1>;}

import {ReplicaButton,BindField,SidebarTip} from './ReplicaControls.jsx';
import React, {
  Children,
  Fragment,
  useRef,
  useState,
} from "react";
import { Select as AntSelect, Input } from "antd";
import {
  Check,
  ChevronDown,
  ChevronsUpDown,
  Search,
  X,
  Plus,
  Circle,
  CircleDashed,
  CircleDot,
  CircleCheck,
  CircleX,
  OctagonPause,
  Clock3,
  Flag,
  Timer,
  Layers,
  BookOpen,
  ListChecks,
  Target,
  Box,
  Hash,
  Users,
  FileText,
  ListFilter,
} from "lucide-react";

import { useWorkProject } from "./WorkConfigContext.jsx";
import { progressCategory } from "../shared/work-config.mjs";
import { TypeIcon } from "./WorkType.jsx";

const statusIcons = {
  backlog: CircleDashed,
  planning: CircleDashed,
  planned: CircleDashed,
  todo: Circle,
  active: CircleDot,
  blocked: OctagonPause,
  review: Clock3,
  ready: Clock3,
  done: CircleCheck,
  accepted: CircleCheck,
  accept: CircleCheck,
  released: CircleCheck,
  closed: CircleCheck,
  cancelled: CircleX,
  cancel: CircleX,
  changes: CircleDot,
};
export function StatusIcon({ value, stage, size = 15 }) {
  const project = useWorkProject();
  const category = stage || ({todo:"todo",in_progress:"active",done:"done"}[progressCategory(project,value)]) || value;
  const Icon = statusIcons[category] || ({in_progress:CircleDot}[value]) || Circle;
  return (
    <Icon
      size={size}
      className={`status-icon tone-${category}`}
      aria-hidden="true"
    />
  );
}
export function PriorityIcon({ value }) {
  const level = { high: 3, medium: 2, low: 1 }[value] || 0;
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      className={`priority-icon priority-${value}`}
      aria-hidden="true"
    >
      {[5, 8, 11].map((height, n) => (
        <rect
          key={n}
          x={2 + n * 4.5}
          y={14 - height}
          width="3"
          height={height}
          rx="0.8"
          fill="currentColor"
          opacity={n < level ? 1 : 0.18}
        />
      ))}
    </svg>
  );
}
const kindIcons = {
  theme: Target,
  epic: Layers,
  feature: Box,
  story: BookOpen,
  task: ListChecks,
  bug: OctagonPause,
  subtask: ListChecks,
};
function OptionIcon({ kind, option }) {
  if (kind === "type" && option.value) return <TypeIcon kind={option.value} size={15}/>;
  if (kind === "parent" && option.itemKind) return <TypeIcon kind={option.itemKind} size={15}/>;
  if (option.value === "all") {
    const Icon =
      kind === "status" ? ListFilter : kind === "sprint" ? Timer : Users;
    return <Icon size={15} className="select-icon-muted" aria-hidden="true" />;
  }
  if (kind === "project")
    return (
      <span className="select-project-icon" aria-hidden="true">
        {(option.code || option.label).slice(0, 2)}
      </span>
    );
  if (kind === "status" || kind === "decision")
    return <StatusIcon value={option.value} />;
  if (kind === "priority") return <PriorityIcon value={option.value} />;
  if (kind === "person")
    return (
      <span className="select-person-icon" aria-hidden="true">
        {option.label.slice(0, 1)}
      </span>
    );
  const Icon =
    kind === "release"
      ? Flag
      : kind === "sprint"
        ? Timer
        : kind === "points"
          ? Hash
          : kind === "type"
            ? kindIcons[option.value] || Plus
            : kind === "parent"
              ? Layers
              : kind === "note"
                ? FileText
                : null;
  return Icon ? (
    <Icon size={15} className="select-icon-muted" aria-hidden="true" />
  ) : null;
}
function plainText(node) {
  return Children.toArray(node)
    .map((child) =>
      typeof child === "object"
        ? plainText(child.props.children)
        : String(child),
    )
    .join("");
}
function readOptions(children) {
  return Children.toArray(children).flatMap((child) => {
    if (child.type === Fragment) return readOptions(child.props.children);
    if (child.type !== "option") return [];
    const label = plainText(child.props.children);
    return [
      {
        value: String(child.props.value ?? label),
        label,
        disabled: child.props.disabled,
        code: child.props["data-code"],
        description: child.props["data-description"],
        itemKind: child.props["data-kind"],
      },
    ];
  });
}
function fieldKind(label = "", name = "") {
  if (label.includes("状态")) return "status";
  if (label.includes("优先级") || name === "priority") return "priority";
  if (label.includes("负责人") || name === "owner") return "person";
  if (label.includes("版本")) return "release";
  if (label.includes("Sprint") || label.includes("冲刺")) return "sprint";
  if (label.includes("故事点")) return "points";
  if (label.includes("所属") || label.includes("父级") || name === "parentId") return "parent";
  if ((label.includes("需求类型") || label.includes("工作项类型"))) return "type";
  if (name === "decision") return "decision";
  if (name === "noteType") return "note";
  return "default";
}

// Ant Select owns the option list, filtering, keyboard navigation and focus.
export default function Select({children,value,defaultValue,onChange,name,required,disabled,className='',kind:givenKind,searchable,selectedIconOnly=false,popupWidth,showSelectionTitle=true,onCreate,sidebarTooltip,sidebarDescription,id,'aria-label':label='选择选项'}) {
  const options=readOptions(children),[local,setLocal]=useState(()=>String(defaultValue??options[0]?.value??''));
  const current=value===undefined?local:String(value),kind=givenKind||fieldKind(label,name);
  const canSearch=searchable??!['priority','decision','points','note','type'].includes(kind);
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),select=useRef(null);
  const selected=options.find(o=>o.value===current),iconOnly=selectedIconOnly||className.includes('detail-status-picker');
  const change=next=>{if(value===undefined)setLocal(next);onChange?.({target:{value:next,name},currentTarget:{value:next,name}});};
  const renderLabel=option=><>{option&&<OptionIcon kind={kind} option={option}/>}{kind==='project'&&<ChevronsUpDown size={18} className="sidebar-project-switch-icon" aria-hidden="true"/>}{!iconOnly&&<span className="select-value"><span>{option?.label||'请选择'}</span>{kind==='project'&&<small>{option?.code||'项目'} · 当前项目</small>}</span>}</>;
  return <div className={`select-control ${kind==='project'?'project-switcher':''} ${className}`}>
    {name&&<input type="hidden" name={name} value={current} disabled={disabled}/>}
    <SidebarTip label={kind==='project'?sidebarTooltip:undefined} description={sidebarDescription}><BindField name={name||(id?['__ui',id]:undefined)} value={current} required={required} disabled={disabled} label={label}>
    <AntSelect id={id} ref={select} value={current} onChange={change} disabled={disabled} aria-label={label} title={!showSelectionTitle||sidebarTooltip?undefined:selected?.label}
      className="select-trigger heyso-select" data-sidebar-tooltip={sidebarTooltip} data-sidebar-description={sidebarDescription}
      open={open} onOpenChange={next=>{setOpen(next);if(!next)setQuery('');}}
      options={options} virtual={false} showSearch={false} labelRender={()=>renderLabel(selected)}
      suffix={className.includes('detail-status-picker')?null:<ChevronDown size={13} className="select-chevron"/>} listHeight={280}
      popupMatchSelectWidth={false} placement="bottomLeft" notFoundContent={<div className="select-empty">没有匹配的{kind==='project'?'项目':'选项'}</div>}
      classNames={{popup:{root:`heyso-select-popup select-popover-${kind}`}}}
      styles={{popup:{root:{width:popupWidth??(kind==='project'?320:240),maxWidth:'calc(100vw - 16px)'}}}}
      optionFilterProp="label" optionRender={({data:option})=><>{kind!=='project'&&<OptionIcon kind={kind} option={option}/>}<span className="select-option-label"><span>{option.label}</span>{kind==='project'&&<small>{option.code}{option.description?` · ${option.description}`:''}</small>}</span>{option.value===current&&<Check size={14} className="select-check"/>}</>}
      menuItemSelectedIcon={null}
      popupRender={menu=><>{kind==='project'&&<div className="select-heading">切换项目 <span>{options.length}</span></div>}{canSearch&&<div className="select-search"><Search size={15}/><Input autoFocus aria-label={`搜索${kind==='project'?'项目':'选项'}`} placeholder={kind==='project'?'搜索项目名称或标识…':'搜索选项…'} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Escape')setOpen(false);if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();select.current?.focus();}}}/>{query&&<ReplicaButton type="button" aria-label="清空搜索" onClick={()=>setQuery('')}><X size={13}/></ReplicaButton>}</div>}{menu}{onCreate&&<div className="select-footer"><ReplicaButton type="button" onClick={()=>{setOpen(false);onCreate();}}><Plus size={15}/>创建新项目</ReplicaButton></div>}</>}
      filterOption={false} {...(query?{options:options.filter(o=>`${o.label} ${o.code||''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))}:{})}/>
    </BindField></SidebarTip>
  </div>;
}

import React,{useState} from 'react';
import { ArrowRight } from 'lucide-react';
import './activity-details.css';
import MarkdownPreview from './MarkdownPreview.jsx';

function Change({change}) {
  const [open,setOpen]=useState(false),markdown=['description','acceptance','goal'].includes(change.field),label=change.field==='description'?'描述':change.label;
  const values=<div className="activity-value-change"><div className="activity-value-before"><small>原值</small>{markdown?<MarkdownPreview value={change.beforeText}/>:change.beforeText}</div><ArrowRight size={13} aria-label="修改为"/><div className="activity-value-after"><small>新值</small>{markdown?<MarkdownPreview value={change.afterText}/>:change.afterText}</div></div>;
  return markdown?<details className="activity-markdown" onToggle={e=>setOpen(e.currentTarget.open)}><summary>{label}已修改<span>查看修改前后内容</span></summary>{open&&values}</details>:<div className="activity-field-change"><b>{label}</b>{values}</div>;
}
export default function ActivityDetails({ event }) {
  if (!event.changes?.length) return (event.detail||'').length>240?<details className="activity-markdown"><summary>查看活动详情</summary><p className="activity-note">{event.detail}</p></details>:<p className="activity-note">{event.detail}</p>;
  return <div className="activity-change-list">
    {event.changes.map(change => <Change change={change} key={change.field}/>)}
    {event.note && <p className="activity-note">{event.note}</p>}
  </div>;
}

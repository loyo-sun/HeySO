import React from 'react';
import { ArrowRight } from 'lucide-react';
import './activity-details.css';
import MarkdownPreview from './MarkdownPreview.jsx';

export default function ActivityDetails({ event }) {
  if (!event.changes?.length) return <p className="activity-note">{event.detail}</p>;
  return <div className="activity-change-list">
    {event.changes.map(change => <div className="activity-field-change" key={change.field}>
      <b>{change.field === "description" ? "描述" : change.label}</b>
      <div className="activity-value-change"><div className="activity-value-before"><small>原值</small>{["description","acceptance","goal"].includes(change.field) ? <MarkdownPreview value={change.beforeText}/> : change.beforeText}</div><ArrowRight size={13} aria-label="修改为"/><div className="activity-value-after"><small>新值</small>{["description","acceptance","goal"].includes(change.field) ? <MarkdownPreview value={change.afterText}/> : change.afterText}</div></div>
    </div>)}
    {event.note && <p className="activity-note">{event.note}</p>}
  </div>;
}

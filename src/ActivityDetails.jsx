import React from 'react';
import { ArrowRight } from 'lucide-react';
import './activity-details.css';

export default function ActivityDetails({ event }) {
  if (!event.changes?.length) return <p className="activity-note">{event.detail}</p>;
  return <div className="activity-change-list">
    {event.changes.map(change => <div className="activity-field-change" key={change.field}>
      <b>{change.label}</b>
      <div className="activity-value-change"><span className="activity-value-before"><small>原值</small>{change.beforeText}</span><ArrowRight size={13} aria-label="修改为"/><span className="activity-value-after"><small>新值</small>{change.afterText}</span></div>
    </div>)}
    {event.note && <p className="activity-note">{event.note}</p>}
  </div>;
}

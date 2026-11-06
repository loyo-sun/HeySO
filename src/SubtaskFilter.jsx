import {ReplicaInput} from './ReplicaControls.jsx';
import React from 'react';

export default function SubtaskFilter({checked,onChange}) {
 return <label className="subtask-visibility-filter"><ReplicaInput type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/>显示子任务</label>;
}

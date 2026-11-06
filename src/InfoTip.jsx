import {ReplicaButton} from './ReplicaControls.jsx';
import React, { useId, useState } from 'react';
import { Tooltip } from 'antd';
import { Info } from 'lucide-react';

export default function InfoTip({ label, children }) {
  const [open,setOpen]=useState(false),id=useId();
  return <Tooltip open={open} onOpenChange={setOpen} placement="bottomLeft" arrow={false} mouseLeaveDelay={0.12} title={<span id={id} className="info-tip-bubble">{children}</span>} classNames={{root:'replica-tip'}}>
    <ReplicaButton type="button" className="info-tip-trigger" aria-label={label+'说明'} aria-expanded={open} aria-describedby={open?id:undefined} onClick={e=>{e.preventDefault();e.stopPropagation();setOpen(true);}} onFocus={()=>setOpen(true)} onBlur={()=>setOpen(false)} onKeyDown={e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();setOpen(true);}if(e.key==='Escape')setOpen(false);}}><Info size={14} aria-hidden="true"/></ReplicaButton>
  </Tooltip>;
}

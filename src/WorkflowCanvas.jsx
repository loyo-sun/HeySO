import {ReplicaInput,ReplicaButton} from './ReplicaControls.jsx';
import { routeTransition } from "../shared/workflow-routing.mjs";
import React, { useId, useRef, useState, useEffect } from "react";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { progressCategories } from "../shared/work-config.mjs";
export function layoutStatuses(statuses) {
  const counts = {};
  return Object.fromEntries(statuses.map((s) => {
    const column = Object.keys(progressCategories).indexOf(s.category);
    const row = counts[s.category] || 0; counts[s.category] = row + 1;
    return [s.id, { x: 35 + column * 240, y: 100 + row * 115 }];
  }));
}
export default function WorkflowCanvas({ workflow, statuses, selection, onSelect, onMove, busy }) {
  const marker = useId().replace(/[^a-z0-9]/gi, ""), drag = useRef(null);
  const [camera,setCamera] = useState({x:0,y:0,zoom:1}), [size,setSize] = useState({width:740,height:430}), [ghost, setGhost] = useState(null), [relatedOnly, setRelatedOnly] = useState(false);
  const viewport = useRef(null), svg = useRef(null), pan = useRef(null), fitted = useRef(false);
  const zoom=camera.zoom;
  useEffect(() => {
    const observer=new ResizeObserver(([entry])=>setSize({width:entry.contentRect.width,height:entry.contentRect.height}));
    if(viewport.current)observer.observe(viewport.current);
    return()=>observer.disconnect();
  }, []);
  const visibleEdges = !relatedOnly || !selection || !["status","transition"].includes(selection.kind) ? workflow.transitions : selection.kind === "status" ? workflow.transitions.filter(t => t.from === selection.id || t.to === selection.id || t.from === "*") : workflow.transitions.filter(t => t.id === selection.id);
  const points = { ...layoutStatuses(statuses), ...workflow.positions, ...(ghost ? { [ghost.id]: ghost.point } : {}) };
  const routes = visibleEdges.map((t,n) => ({ transition:t, route:routeTransition(t,points,n) })).filter(x=>x.route);
  const height = Math.max(430, ...Object.values(points).map(p=>p.y+90), ...routes.map(x=>x.route.maxY+35));
  const width = Math.max(740, ...routes.map(x=>x.route.maxX+20));
  function fit() { setCamera({x:0,y:0,zoom:Math.max(.08,Math.min(1,size.width/width,size.height/height))}); }
  useEffect(()=>{if(!fitted.current&&size.width>0&&size.height>0&&viewport.current?.clientWidth===size.width){fit();fitted.current=true;}},[size.width,size.height]);
  function location(e) { const p=svg.current.createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(svg.current.getScreenCTM().inverse()); }
  function edge({transition:t,route}) {
    const {d,label:{x,y,anchor}}=route;
    const active=selection?.kind==="transition"&&selection.id===t.id;
    return <g key={t.id} className={"wf-edge"+(active?" selected":"")} role="button" tabIndex={0} aria-label={`转换 ${t.name}`} onClick={()=>onSelect({kind:"transition",id:t.id})} onKeyDown={(e)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onSelect({kind:"transition",id:t.id});}}}>
      <path d={d} className="wf-edge-hit"/><path d={d} className="wf-edge-line" markerEnd={`url(#${marker})`}/><text x={x} y={y} textAnchor={anchor}>{t.from==="*"?"任意状态 · ":""}{t.name.length>9?t.name.slice(0,9)+"…":t.name}</text>
    </g>;
  }
  return <div className="wf-canvas-shell"><div className="wf-canvas-scroll" ref={viewport}><svg ref={svg} width="100%" height="100%" viewBox={`${camera.x} ${camera.y} ${size.width/zoom} ${size.height/zoom}`} aria-label="工作流画布" onPointerDown={e=>{if(e.target!==e.currentTarget)return;e.currentTarget.setPointerCapture(e.pointerId);pan.current={x:e.clientX,y:e.clientY,start:camera};}} onPointerMove={e=>{if(!pan.current)return;const d=pan.current;setCamera({...d.start,x:Math.max(0,d.start.x-(e.clientX-d.x)/zoom),y:Math.max(0,d.start.y-(e.clientY-d.y)/zoom)});}} onPointerUp={e=>{pan.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>{pan.current=null;}}>
    <defs><marker id={marker} markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6" fill="#8493a6"/></marker></defs>
    {routes.map(edge)}
    {statuses.map((s)=>{const p=points[s.id],active=selection?.kind==="status"&&selection.id===s.id;return <g key={s.id} transform={`translate(${p.x},${p.y})`} role="button" tabIndex={0} aria-label={`状态 ${s.name}`} className={`wf-node category-${s.category}${active?" selected":""}`} onClick={()=>onSelect({kind:"status",id:s.id})} onKeyDown={(e)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onSelect({kind:"status",id:s.id});}}}
      onPointerDown={(e)=>{if(busy||e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);const cursor=location(e);drag.current={id:s.id,x:cursor.x,y:cursor.y,start:p};onSelect({kind:"status",id:s.id});}}
      onPointerMove={(e)=>{const d=drag.current;if(d?.id===s.id){const cursor=location(e);setGhost({id:s.id,point:{x:Math.max(24,Math.min(4000,d.start.x+cursor.x-d.x)),y:Math.max(30,Math.min(3800,d.start.y+cursor.y-d.y))}});}}}
      onPointerUp={(e)=>{if(drag.current?.id===s.id&&ghost)onMove(s.id,ghost.point);drag.current=null;setGhost(null);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>{drag.current=null;setGhost(null);}}>
      {workflow.initialStatus===s.id&&<><circle cx="-17" cy="22" r="5" className="wf-start"/><path d="M-12 22 H0" stroke="#8493a6"/><text x="0" y="-12" className="wf-initial-label">初始状态</text></>}
      <rect width="170" height="44" rx="5"/><circle cx="16" cy="22" r="4"/><text x="29" y="27">{s.name.length>11?s.name.slice(0,11)+"…":s.name}</text><title>{s.name} · 点击编辑，拖动布局</title>
    </g>;})}
  </svg></div><div className="wf-canvas-bottom"><label className="wf-edge-toggle"><ReplicaInput type="checkbox" checked={relatedOnly} onChange={e=>setRelatedOnly(e.target.checked)}/>仅显示关联转换 <small>{visibleEdges.length}/{workflow.transitions.length}</small></label><div><ReplicaButton type="button" aria-label="缩小画布" disabled={zoom<=.08} onClick={()=>setCamera(c=>({...c,zoom:Math.max(.08,c.zoom/1.2)}))}><ZoomOut size={15}/></ReplicaButton><span>{Math.round(zoom*100)}%</span><ReplicaButton type="button" aria-label="放大画布" disabled={zoom>=2} onClick={()=>setCamera(c=>({...c,zoom:Math.min(2,c.zoom*1.2)}))}><ZoomIn size={15}/></ReplicaButton><ReplicaButton type="button" aria-label="适应画布" title="显示完整流程图" onClick={fit}><Maximize2 size={14}/></ReplicaButton></div></div></div>;
}

import React,{useState} from 'react';
export default function ReportChart({data,series,mode='line',label,unit='',onChoose}){
 const [hidden,setHidden]=useState([]),[hover,setHover]=useState(null);
 const shown=series.filter(s=>!hidden.includes(s.key)),W=760,H=250,L=48,R=18,T=18,B=38,iw=W-L-R,ih=H-T-B;
 const max=Math.max(1,...data.map(d=>mode==='area'?shown.reduce((s,k)=>s+(d[k.key]||0),0):Math.max(0,...shown.map(s=>d[s.key]??0))));
 const x=i=>L+(data.length===1?iw/2:i/Math.max(1,data.length-1)*iw),y=value=>T+ih-value/max*ih;
 const choose=index=>onChoose?.(data[index],index);
 const activate=(e,index)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(index);}};
 const segments=key=>{const result=[];let path=[];data.forEach((d,i)=>{if(d[key]===null||d[key]===undefined){if(path.length)result.push(path);path=[];}else path.push(`${x(i)},${y(d[key])}`);});if(path.length)result.push(path);return result;};
 return <div className="report-chart"><div className="report-legend">{series.map(s=><button type="button" key={s.key} aria-pressed={!hidden.includes(s.key)} onClick={()=>setHidden(old=>old.includes(s.key)?old.filter(k=>k!==s.key):[...old,s.key])}><i style={{background:s.color,opacity:hidden.includes(s.key)?.25:1}}/>{s.label}</button>)}</div>
 {!data.length?<div className="report-chart-empty">暂无可用于此图的历史数据</div>:<><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
 {[0,.25,.5,.75,1].map(n=><g key={n}><line x1={L} x2={W-R} y1={y(max*n)} y2={y(max*n)} stroke="#edf0f3"/><text x={L-10} y={y(max*n)+4} textAnchor="end">{Number((max*n).toFixed(1))}</text></g>)}
 <text x={L} y={12}>{unit}</text>
 {mode==='area'&&shown.map((s,k)=>{const top=data.map((d,i)=>`${x(i)},${y(shown.slice(0,k+1).reduce((a,v)=>a+(d[v.key]||0),0))}`),bottom=data.map((d,i)=>`${x(i)},${y(shown.slice(0,k).reduce((a,v)=>a+(d[v.key]||0),0))}`).reverse();return <polygon key={s.key} points={[...top,...bottom].join(' ')} fill={s.color} opacity=".75"/>;})}
 {shown.map((s,k)=>mode==='bar'?data.map((d,i)=>{const gap=iw/Math.max(1,data.length),w=Math.min(28,gap/(shown.length+1)),bx=L+gap*i+gap/2+(k-shown.length/2)*w;return <rect key={s.key+i} x={bx} y={y(d[s.key]||0)} width={Math.max(2,w-3)} height={Math.max(0,ih-(y(d[s.key]||0)-T))} rx="2" fill={s.color} role={onChoose?'button':undefined} tabIndex={onChoose?0:undefined} aria-label={`${d.label} ${s.label} ${d[s.key]??0}`} onClick={()=>choose(i)} onKeyDown={e=>activate(e,i)} onPointerEnter={()=>setHover(i)} onFocus={()=>setHover(i)}><title>{d.label} · {s.label}：{d[s.key]??0} {unit}</title></rect>;}):mode==='area'?null:<g key={s.key}>
 {(mode!=='scatter'||s.line)&&segments(s.key).map((points,n)=><polyline key={n} points={points.join(' ')} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed?'5 5':undefined}/>)}
 {!s.line&&data.map((d,i)=>d[s.key]===null||d[s.key]===undefined?null:<circle key={i} cx={x(i)} cy={y(d[s.key])} r={mode==='scatter'?5:3} fill={s.color} tabIndex={onChoose?0:undefined} role={onChoose?'button':undefined} aria-label={`${d.label} ${s.label} ${d[s.key]}`} onClick={()=>choose(i)} onKeyDown={e=>activate(e,i)} onPointerEnter={()=>setHover(i)} onFocus={()=>setHover(i)}><title>{d.label} · {s.label}：{Number(d[s.key].toFixed(2))} {unit}</title></circle>)}
 </g>)}
 {data.map((d,i)=>(i===0||i===data.length-1||i%Math.max(1,Math.ceil(data.length/6))===0)?<text key={i} x={mode==='bar'?L+iw/data.length*(i+.5):x(i)} y={H-12} textAnchor="middle">{d.label.length>12?d.label.slice(0,11)+'…':d.label}</text>:null)}
 </svg><p className="report-chart-readout" aria-live="polite">{hover!==null&&data[hover]?`${data[hover].label} · `+shown.map(s=>`${s.label}：${data[hover][s.key]===null?'未记录':Number((data[hover][s.key]||0).toFixed(2))}`).join('　'):'悬停查看数值，点击数据点或柱形查看工作项。'}</p></>}
 </div>;
}

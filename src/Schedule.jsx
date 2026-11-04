import React, { useEffect, useRef, useState } from "react";
import { Calendar } from "lucide-react";

export function DateFields({
  start,
  end,
  setStart,
  setEnd,
  min,
  max,
  disabled,
  prefix = "",
}) {
  const startMax = [end, max].filter(Boolean).sort()[0];
  const endMin = [start, min].filter(Boolean).sort().at(-1);
  return (
    <div className="form-grid date-range-fields">
      <label className="field">
        <span>{prefix}开始日期</span>
        <input
          type="date"
          name="startDate"
          value={start || ""}
          onChange={(e) => setStart(e.target.value)}
          onInput={(e) => setStart(e.currentTarget.value)}
          min={min || undefined}
          max={startMax}
          required
          disabled={disabled}
        />
      </label>
      <label className="field">
        <span>{prefix}结束日期</span>
        <input
          type="date"
          name="endDate"
          value={end || ""}
          onChange={(e) => setEnd(e.target.value)}
          onInput={(e) => setEnd(e.currentTarget.value)}
          min={endMin}
          max={max || undefined}
          required
          disabled={disabled}
        />
      </label>
    </div>
  );
}

export default function ItemSchedule({
  item,
  project,
  parent,
  onSave,
  onProjectSettings,
  busy,
}) {
  const [start, setStart] = useState(item.startDate || ""),
    [end, setEnd] = useState(item.endDate || item.dueDate || "");
  const confirmed=useRef({id:item.id,start:item.startDate||'',end:item.endDate||item.dueDate||''});
  const [conflict,setConflict]=useState(false);
  const [saveError,setSaveError]=useState('');
  const attempted=useRef(''),inFlight=useRef(false),latest=useRef(null);
  useEffect(() => {
    const next={id:item.id,start:item.startDate||'',end:item.endDate||item.dueDate||''};
    if(item.id!==confirmed.current.id||(start===confirmed.current.start&&end===confirmed.current.end)||(start===next.start&&end===next.end)) {setStart(next.start);setEnd(next.end);setConflict(false);}
    else if(next.start!==confirmed.current.start||next.end!==confirmed.current.end)setConflict(true);
    confirmed.current=next;
  }, [item.id, item.startDate, item.endDate, item.dueDate]);
  const ready = Boolean(project.startDate && project.endDate);
  const minDate = [project.startDate, parent?.startDate].filter(Boolean).sort().at(-1);
  const maxDate = [project.endDate, parent?.endDate].filter(Boolean).sort()[0];
  const changed =
    start !== (item.startDate || "") || end !== (item.endDate || "");
  latest.current={start,end,busy,ready,conflict,onSave,minDate,maxDate,changed};
  async function saveDates(){
    const v=latest.current,signature=v.start+'|'+v.end;
    if(!v.ready||v.busy||v.conflict||!v.changed||inFlight.current||attempted.current===signature)return;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(v.start)||!/^\d{4}-\d{2}-\d{2}$/.test(v.end)||v.start>v.end||(v.minDate&&v.start<v.minDate)||(v.maxDate&&v.end>v.maxDate)){setSaveError('请选择项目及父级周期内的有效起止日期。');return;}
    attempted.current=signature;inFlight.current=true;setSaveError('');
    try{const result=await v.onSave({startDate:v.start,endDate:v.end});if(result===null||result===false)setSaveError('日期未保存，请重试。');}
    finally{inFlight.current=false;}
  }
  useEffect(()=>{if(!changed||busy||conflict)return;const timer=setTimeout(saveDates,350);return()=>clearTimeout(timer);},[start,end,busy,conflict,item.id,item.startDate,item.endDate,ready,minDate,maxDate]);
  return (
    <section className="item-schedule">
      <div className="schedule-title">
        <Calendar size={15} />
        <h4>计划周期</h4>
        {(!item.startDate || !item.endDate) && <small>日期待设置</small>}
      </div>
      {ready ? (
        <p className="schedule-hint">
          可用周期：{minDate} 至 {maxDate}{parent ? "（受父级周期约束）" : ""}
          。开始和结束日期均需在此范围内。
        </p>
      ) : (
        <p className="schedule-hint">
          请先设置项目起止日期，再安排需求周期。
          <button
            type="button"
            className="text-btn"
            onClick={onProjectSettings}
          >
            设置项目周期
          </button>
        </p>
      )}
      <DateFields
        start={start}
        end={end}
        setStart={setStart}
        setEnd={setEnd}
        min={minDate}
        max={maxDate}
        disabled={!ready || busy}
      />
      {conflict&&<p role="alert" className="error">日期已有更新。请记录当前日期，刷新后核对再保存。</p>}
      {busy&&changed&&<small role="status">正在保存日期…</small>}
      {saveError&&!conflict&&<p role="alert" className="error">{saveError}<button className="text-btn" type="button" disabled={busy} onClick={()=>{attempted.current='';saveDates();}}>重试</button></p>}
    </section>
  );
}

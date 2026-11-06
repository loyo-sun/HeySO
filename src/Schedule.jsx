import {ReplicaField,ReplicaInput,ReplicaButton} from './ReplicaControls.jsx';
import {AntAlert} from './AntStructures.jsx';
import {DatePicker} from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
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
  range = false,
  showLabel = true,
}) {
  if (range) return <WorkItemDateRange {...{start,end,setStart,setEnd,min,max,disabled,prefix,showLabel}}/>;
  const startMax = [end, max].filter(Boolean).sort()[0];
  const endMin = [start, min].filter(Boolean).sort().at(-1);
  return (
    <div className="form-grid date-range-fields">
      <ReplicaField className="field">
        <span>{prefix}开始日期</span>
        <ReplicaInput
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
      </ReplicaField>
      <ReplicaField className="field">
        <span>{prefix}结束日期</span>
        <ReplicaInput
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
      </ReplicaField>
    </div>
  );
}

function WorkItemDateRange({start,end,setStart,setEnd,min,max,disabled,prefix,showLabel}) {
  const [draft,setDraft]=useState([start||'',end||'']),open=useRef(false),latest=useRef(draft);
  const change=dates=>{const next=[dates?.[0]?.format('YYYY-MM-DD')||'',dates?.[1]?.format('YYYY-MM-DD')||''];latest.current=next;setDraft(next);return next;};
  const commit=next=>{setStart(next[0]);setEnd(next[1]);};
  useEffect(()=>{if(!open.current){const next=[start||'',end||''];latest.current=next;setDraft(next);}},[start,end]);
  return <ReplicaField className="field work-item-date-range">{showLabel&&<span>{prefix}计划日期</span>}
    <DatePicker.RangePicker aria-label="工作项计划日期" locale={zhCN.DatePicker} value={draft.map(d=>d?dayjs(d):null)} format="YYYY/MM/DD" placeholder={['开始日期','结束日期']} allowEmpty={[true,true]} allowClear classNames={{popup:{root:'work-item-range-popup'}}} disabled={disabled} minDate={min?dayjs(min):undefined} maxDate={max?dayjs(max):undefined} onCalendarChange={change} onChange={dates=>{const next=change(dates);if(!open.current)commit(next);}} onOpenChange={isOpen=>{open.current=isOpen;if(!isOpen)commit(latest.current);}}/>
    <input type="hidden" name="startDate" value={start||''}/><input type="hidden" name="endDate" value={end||''}/>
  </ReplicaField>;
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
    if((v.start&&!dayjs(v.start,'YYYY-MM-DD',true).isValid())||(v.end&&!dayjs(v.end,'YYYY-MM-DD',true).isValid())||(v.start&&v.end&&v.start>v.end)||[v.start,v.end].filter(Boolean).some(d=>(v.minDate&&d<v.minDate)||(v.maxDate&&d>v.maxDate))){setSaveError('请选择项目及父级周期内的有效起止日期。');return;}
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
      {!ready && (
        <p className="schedule-hint">
          请先设置项目起止日期，再安排需求周期。
          <ReplicaButton
            type="button"
            className="text-btn"
            onClick={onProjectSettings}
          >
            设置项目周期
          </ReplicaButton>
        </p>
      )}
      <DateFields range showLabel={false}
        start={start}
        end={end}
        setStart={setStart}
        setEnd={setEnd}
        min={minDate}
        max={maxDate}
        disabled={!ready || busy}
      />
      {conflict&&<AntAlert role="alert" className="error">日期已有更新。请记录当前日期，刷新后核对再保存。</AntAlert>}
      {busy&&changed&&<small role="status">正在保存日期…</small>}
      {saveError&&!conflict&&<AntAlert role="alert" className="error">{saveError}<ReplicaButton className="text-btn" type="button" disabled={busy} onClick={()=>{attempted.current='';saveDates();}}>重试</ReplicaButton></AntAlert>}
    </section>
  );
}

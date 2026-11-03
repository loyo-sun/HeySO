import React, { useEffect, useState } from "react";
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
  useEffect(() => {
    setStart(item.startDate || "");
    setEnd(item.endDate || item.dueDate || "");
  }, [item.id, item.startDate, item.endDate, item.dueDate]);
  const ready = Boolean(project.startDate && project.endDate);
  const minDate = [project.startDate, parent?.startDate].filter(Boolean).sort().at(-1);
  const maxDate = [project.endDate, parent?.endDate].filter(Boolean).sort()[0];
  const changed =
    start !== (item.startDate || "") || end !== (item.endDate || "");
  return (
    <form
      className="item-schedule"
      onSubmit={(e) => {
        e.preventDefault();
        const values = new FormData(e.currentTarget);
        if (ready && !busy)
          onSave({
            startDate: String(values.get("startDate") || ""),
            endDate: String(values.get("endDate") || ""),
          });
      }}
    >
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
      <button type="submit" disabled={!ready || busy || !changed}>
        {busy ? "正在保存…" : "保存日期"}
      </button>
    </form>
  );
}

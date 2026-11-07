import {ReplicaTextArea} from './ReplicaControls.jsx';
import {AntAlert} from './AntStructures.jsx';
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

export default function WorkItemTitle({ value, save }) {
  const [title, setTitle] = useState(value || "");
  const saved=useRef(value||''),draft=useRef(value||''),pending=useRef(new Set());
  const [conflict,setConflict]=useState(false);
  const input = useRef(null);
  useEffect(() => {
    const next=value||'';
    if(draft.current===saved.current||draft.current===next){draft.current=next;setTitle(next);setConflict(false);}
    else if(next!==saved.current&&!pending.current.has(next))setConflict(true);
    saved.current=next;
  }, [value]);

  const resize = () => {
    const element = input.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${element.scrollHeight}px`;
  };
  useLayoutEffect(resize, [title]);
  useEffect(() => {
    const element = input.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    let width = element.getBoundingClientRect().width;
    const observer = new ResizeObserver(([entry]) => {
      const nextWidth = entry.contentRect.width;
      if (nextWidth !== width) {
        width = nextWidth;
        resize();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="detail-title-editor"><ReplicaTextArea
      ref={input}
      className="detail-title"
      aria-label="工作项标题"
      aria-required="true"
      rows={1}
      value={title}
      onChange={(event) => {draft.current=event.target.value;setTitle(event.target.value);}}
      onBlur={async () => {
        if (!conflict&&title !== saved.current&&!pending.current.has(title)) {pending.current.add(title);try{await save(title);}finally{pending.current.delete(title);}}
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />{conflict&&<AntAlert role="alert" className="error">标题已有更新。请复制草稿，刷新后核对再保存。</AntAlert>}</div>
  );
}

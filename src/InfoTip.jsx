import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import "./info-tip.css";

export default function InfoTip({ label, children }) {
  const id = useId(), trigger = useRef(null), bubble = useRef(null), timer = useRef(null);
  const [open, setOpen] = useState(false), [position, setPosition] = useState({ left: 0, top: 0 });
  const show = () => { clearTimeout(timer.current); setOpen(true); };
  const hide = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(false), 120); };
  useEffect(() => () => clearTimeout(timer.current), []);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const a = trigger.current?.getBoundingClientRect(), b = bubble.current?.getBoundingClientRect();
      if (!a || !b) return;
      setPosition({ left: Math.max(12, Math.min(a.left, window.innerWidth - b.width - 12)), top: a.bottom + b.height + 10 < window.innerHeight ? a.bottom + 8 : Math.max(12, a.top - b.height - 8) });
    };
    const dismiss = (e) => { if (e.key === "Escape") { clearTimeout(timer.current); setOpen(false); } };
    const outside = (e) => { if (!trigger.current?.contains(e.target) && !bubble.current?.contains(e.target)) setOpen(false); };
    place(); window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    document.addEventListener("keydown", dismiss); document.addEventListener("pointerdown", outside);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); document.removeEventListener("keydown", dismiss); document.removeEventListener("pointerdown", outside); };
  }, [open]);
  return <>
    <span ref={trigger} className="info-tip-trigger" role="button" tabIndex={0} aria-label={label + "说明"} aria-expanded={open} aria-describedby={open ? id : undefined} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} onClick={(e) => { e.preventDefault(); e.stopPropagation(); clearTimeout(timer.current); setOpen(true); }} onKeyDown={(e) => { if (["Enter", " "].includes(e.key)) { e.preventDefault(); clearTimeout(timer.current); setOpen(true); } }}><Info size={14} aria-hidden="true"/></span>
    {open && createPortal(<span ref={bubble} id={id} role="tooltip" className="info-tip-bubble" style={position} onMouseEnter={show} onMouseLeave={hide}>{children}</span>, document.body)}
  </>;
}

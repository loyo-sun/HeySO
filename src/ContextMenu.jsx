import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Check } from "lucide-react";
import "./context-menu.css";

function MenuPanel({ depth, title, options, anchor, origin, active, searchable, onHover, onActivate, onEnter }) {
  const root = useRef(null);
  const [query, setQuery] = useState("");
  const visible = options.filter((entry) => !query || entry.label.toLowerCase().includes(query.toLowerCase()));
  useLayoutEffect(() => {
    const el = root.current;
    const rect = el.getBoundingClientRect();
    let x = origin.x, y = origin.y;
    if (anchor?.isConnected) {
      const row = anchor.getBoundingClientRect();
      const parent = anchor.closest(".work-context-menu").getBoundingClientRect();
      x = parent.right - 1;
      if (x + rect.width > window.innerWidth - 8) x = parent.left - rect.width + 1;
      y = row.top - 6;
    }
    el.style.left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)) + "px";
    el.style.top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)) + "px";
  }, [origin, anchor, query, options]);
  return <div ref={root} className="work-context-menu" data-context-depth={depth}
    style={{left: origin.x, top: origin.y, zIndex:3000 + depth}} role="menu" aria-label={depth ? title : "工作项操作"} onPointerEnter={onEnter}>
    <div className="work-context-heading"><span title={title}>{title || "工作项操作"}</span></div>
    {depth > 0 && (searchable || options.length > 8) && <input aria-label="搜索菜单选项" placeholder="搜索选项…" value={query} onChange={(e) => {setQuery(e.target.value); onHover(null,depth,null,true);}}/>}
    <div className="work-context-options" onScroll={() => onHover(null,depth,null,true)}>
      {visible.map((entry, index) => <React.Fragment key={entry.label + index}>
        {entry.separator && <div role="separator" className="work-context-divider"/>}
        <button role="menuitem" className={(entry.danger ? "danger " : "") + (active === entry.label ? "submenu-open" : "")} aria-disabled={entry.disabled || undefined}
          aria-haspopup={entry.children ? "menu" : undefined} aria-expanded={entry.children ? active === entry.label : undefined}
          title={entry.reason || entry.label}
          onPointerEnter={(e) => {if (e.pointerType !== "touch") onHover(entry,depth,e.currentTarget);}}
          onClick={(e) => onActivate(entry,depth,e.currentTarget)}>
          <span className="work-context-check">{entry.checked && <Check size={14}/>}</span>
          <span>{entry.label}{entry.disabled && entry.reason && <small>{entry.reason}</small>}</span>
          {entry.children && <ChevronRight className="work-context-arrow" size={14}/>}
        </button>
      </React.Fragment>)}
      {!visible.length && <p className="work-context-empty">没有可用选项</p>}
    </div>
  </div>;
}

export default function ContextMenu({ menu, entries, onClose }) {
  const root = useRef(null);
  const [path, setPath] = useState([]);
  const hoverTimer = useRef(null);
  const focusDepth = useRef(0);
  const close = useRef(onClose);
  close.current = onClose;
  const cancelHover = () => clearTimeout(hoverTimer.current);
  const expand = (entry, depth, anchor, focus = false) => {
    cancelHover();
    if (focus) focusDepth.current = depth + 1;
    setPath((old) => [...old.slice(0,depth), ...(entry?.children && !entry.disabled ? [{entry,anchor}] : [])]);
  };
  useLayoutEffect(() => {
    if (focusDepth.current === null) return;
    root.current.querySelector(`[data-context-depth="${focusDepth.current}"] [role="menuitem"]`)?.focus({preventScroll:true});
    focusDepth.current = null;
  }, [path]);
  useEffect(() => {
    const dismiss = (e) => { if (!root.current?.contains(e.target)) close.current(); };
    const cancel = () => close.current();
    const scroll = (e) => { if (!root.current?.contains(e.target)) cancel(); };
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", cancel);
    window.addEventListener("blur", cancel);
    return () => {
      cancelHover();
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", cancel);
      window.removeEventListener("blur", cancel);
    };
  }, []);
  const hover = (entry, depth, anchor, immediate = false) => {
    cancelHover();
    if (immediate) { setPath((old) => old.slice(0,depth)); return; }
    hoverTimer.current = setTimeout(() => expand(entry,depth,anchor),140);
  };
  const activate = (entry, depth, anchor) => {
    cancelHover();
    if (entry.disabled) return;
    if (entry.children) expand(entry,depth,anchor,true);
    else { onClose(); entry.run?.(); }
  };
  return createPortal(<div ref={root} className="work-context-surface" onContextMenu={(e) => e.preventDefault()}
    onPointerLeave={cancelHover}
    onKeyDown={(e) => {
      cancelHover();
      const panel = e.target.closest("[data-context-depth]");
      if (!panel) return;
      const depth = Number(panel.dataset.contextDepth);
      const buttons = [...panel.querySelectorAll('[role="menuitem"]')];
      const index = buttons.indexOf(document.activeElement);
      if ((e.key === "Escape" || e.key === "ArrowLeft") && depth > 0) {
        e.preventDefault(); e.stopPropagation();
        const anchor = path[depth - 1]?.anchor;
        setPath((old) => old.slice(0,depth - 1));
        anchor?.focus({preventScroll:true});
      } else if (e.key === "Escape" || e.key === "Tab") {
        if (e.key === "Escape") e.preventDefault();
        e.stopPropagation(); onClose();
      } else if (e.key === "ArrowRight" && index >= 0) {
        e.preventDefault(); if (document.activeElement.getAttribute("aria-haspopup") === "menu") buttons[index].click();
      } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key) && e.target.tagName !== "INPUT") {
        e.preventDefault();
        const next = e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : (index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    }}>
    {[{title:menu.title,options:entries}, ...path.map(({entry,anchor}) => ({title:entry.label,options:entry.children,searchable:entry.searchable,anchor}))].map((panel,depth) =>
      <MenuPanel key={depth + ":" + panel.title} {...panel} depth={depth} origin={menu} active={path[depth]?.entry.label} onHover={hover} onActivate={activate} onEnter={cancelHover}/>
    )}
  </div>, document.body);
}

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./sidebar.css";

// Render hints outside the scrolling sidebar so they are never clipped.
export default function Sidebar({ compact, children, ...props }) {
  const [hint, setHint] = useState(null);
  const active = useRef(null);
  const hideTimer = useRef(null);
  const cancelHide = () => clearTimeout(hideTimer.current);
  const hide = () => {
    cancelHide();
    active.current = null;
    setHint(null);
  };
  const leave = () => {
    cancelHide();
    hideTimer.current = setTimeout(hide, 120);
  };
  useEffect(() => {
    hide();
    const escape = (e) => {
      if (e.key === "Escape") hide();
    };
    window.addEventListener("resize", hide);
    window.addEventListener("scroll", hide, true);
    document.addEventListener("keydown", escape);
    return () => {
      cancelHide();
      window.removeEventListener("resize", hide);
      window.removeEventListener("scroll", hide, true);
      document.removeEventListener("keydown", escape);
    };
  }, [compact]);
  function show(e) {
    if (e.pointerType === "touch") return;
    const target = e.target.closest("[data-sidebar-tooltip]");
    if (!target || (!compact && !target.dataset.tooltipAlways)) return;
    if (
      target.getAttribute("aria-expanded") === "true" &&
      target.getAttribute("role") === "combobox"
    )
      return;
    cancelHide();
    if (active.current === target) return;
    active.current = target;
    const rect = target.getBoundingClientRect();
    setHint({
      label: target.dataset.sidebarTooltip,
      description: target.dataset.sidebarDescription,
      left: rect.right + 10,
      top: Math.max(
        8,
        Math.min(rect.top + rect.height / 2 - 22, window.innerHeight - 100),
      ),
    });
  }
  return (
    <>
      <aside
        {...props}
        onPointerOver={show}
        onPointerOut={(e) => {
          if (
            !(e.relatedTarget instanceof Node) ||
            !active.current?.contains(e.relatedTarget)
          )
            leave();
        }}
        onFocusCapture={(e) => {
          if (e.target.matches(":focus-visible")) show(e);
        }}
        onBlurCapture={leave}
        onPointerDownCapture={hide}
        onKeyDownCapture={(e) => {
          if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) hide();
        }}
      >
        {children}
      </aside>
      {hint &&
        createPortal(
          <div
            role="tooltip"
            className="sidebar-tooltip"
            style={{ left: hint.left, top: hint.top }}
            onPointerEnter={cancelHide}
            onPointerLeave={leave}
          >
            <strong>{hint.label}</strong>
            {hint.description && <span>{hint.description}</span>}
          </div>,
          document.body,
        )}
    </>
  );
}

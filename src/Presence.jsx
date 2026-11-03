import React, { useEffect, useRef, useState } from "react";
// Keep overlays mounted during their exit transition and restore keyboard focus.
export default function Presence({ present, children, onClose }) {
  const [mounted, setMounted] = useState(present);
  const last = useRef(children);
  const root = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  if (present) last.current = children;
  useEffect(() => {
    if (present) {
      setMounted(true);
      return;
    }
    const t = setTimeout(() => setMounted(false), 200);
    return () => clearTimeout(t);
  }, [present]);
  useEffect(() => {
    if (!present) return;
    const previous = document.activeElement;
    const frame = requestAnimationFrame(() => {
      if (root.current && !root.current.contains(document.activeElement))
        root.current
          .querySelector(
            "input:not([disabled]), textarea:not([disabled]), button:not([disabled])",
          )
          ?.focus();
    });
    const handler = (e) => {
      if (e.defaultPrevented || e.target?.closest?.("[data-select-popover]"))
        return;
      const open = [
        ...document.querySelectorAll('.presence[data-state="open"]'),
      ];
      if (open.at(-1) !== root.current) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close.current?.();
      }
      if (e.key === "Tab") {
        const els = [
          ...root.current.querySelectorAll(
            'button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href],[tabindex="0"]',
          ),
        ].filter(
          (el) =>
            el.getClientRects().length &&
            el.tabIndex !== -1 &&
            !el.closest('[aria-hidden="true"]'),
        );
        if (!els.length) return;
        const first = els[0],
          last = els.at(-1);
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            !root.current.contains(document.activeElement))
        ) {
          e.preventDefault();
          last.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last ||
            !root.current.contains(document.activeElement))
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handler);
      if (previous?.isConnected) previous.focus();
    };
  }, [present]);
  if (!present && !mounted) return null;
  return (
    <div
      ref={root}
      className="presence"
      data-state={present ? "open" : "closing"}
      aria-hidden={!present}
    >
      {present ? children : last.current}
    </div>
  );
}

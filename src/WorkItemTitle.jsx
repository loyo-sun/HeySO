import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

export default function WorkItemTitle({ value, save }) {
  const [title, setTitle] = useState(value || "");
  const input = useRef(null);
  useEffect(() => setTitle(value || ""), [value]);

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
    <textarea
      ref={input}
      className="detail-title"
      aria-label="工作项标题"
      rows={1}
      value={title}
      onChange={(event) => setTitle(event.target.value)}
      onBlur={() => {
        if (title !== (value || "")) save(title);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}

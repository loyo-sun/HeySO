import React, {
  Children,
  Fragment,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronDown,
  ChevronsUpDown,
  Search,
  X,
  Plus,
  Circle,
  CircleDashed,
  CircleDot,
  CircleCheck,
  CircleX,
  OctagonPause,
  Clock3,
  Flag,
  Timer,
  Layers,
  BookOpen,
  ListChecks,
  Target,
  Box,
  Hash,
  Users,
  FileText,
  ListFilter,
} from "lucide-react";
import "./select.css";
import { useWorkProject } from "./WorkConfigContext.jsx";
import { progressCategory } from "../shared/work-config.mjs";
import { TypeIcon } from "./WorkType.jsx";

const statusIcons = {
  backlog: CircleDashed,
  planning: CircleDashed,
  planned: CircleDashed,
  todo: Circle,
  active: CircleDot,
  blocked: OctagonPause,
  review: Clock3,
  ready: Clock3,
  done: CircleCheck,
  accepted: CircleCheck,
  accept: CircleCheck,
  released: CircleCheck,
  closed: CircleCheck,
  cancelled: CircleX,
  cancel: CircleX,
  changes: CircleDot,
};
export function StatusIcon({ value, stage, size = 15 }) {
  const project = useWorkProject();
  const category = stage || ({todo:"todo",in_progress:"active",done:"done"}[progressCategory(project,value)]) || value;
  const Icon = statusIcons[category] || ({in_progress:CircleDot}[value]) || Circle;
  return (
    <Icon
      size={size}
      className={`status-icon tone-${category}`}
      aria-hidden="true"
    />
  );
}
export function PriorityIcon({ value }) {
  const level = { high: 3, medium: 2, low: 1 }[value] || 0;
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      className={`priority-icon priority-${value}`}
      aria-hidden="true"
    >
      {[5, 8, 11].map((height, n) => (
        <rect
          key={n}
          x={2 + n * 4.5}
          y={14 - height}
          width="3"
          height={height}
          rx="0.8"
          fill="currentColor"
          opacity={n < level ? 1 : 0.18}
        />
      ))}
    </svg>
  );
}
const kindIcons = {
  theme: Target,
  epic: Layers,
  feature: Box,
  story: BookOpen,
  task: ListChecks,
  bug: OctagonPause,
  subtask: ListChecks,
};
function OptionIcon({ kind, option }) {
  if (kind === "type" && option.value) return <TypeIcon kind={option.value} size={15}/>;
  if (kind === "parent" && option.itemKind) return <TypeIcon kind={option.itemKind} size={15}/>;
  if (option.value === "all") {
    const Icon =
      kind === "status" ? ListFilter : kind === "sprint" ? Timer : Users;
    return <Icon size={15} className="select-icon-muted" aria-hidden="true" />;
  }
  if (kind === "project")
    return (
      <span className="select-project-icon" aria-hidden="true">
        {(option.code || option.label).slice(0, 2)}
      </span>
    );
  if (kind === "status" || kind === "decision")
    return <StatusIcon value={option.value} />;
  if (kind === "priority") return <PriorityIcon value={option.value} />;
  if (kind === "person")
    return (
      <span className="select-person-icon" aria-hidden="true">
        {option.label.slice(0, 1)}
      </span>
    );
  const Icon =
    kind === "release"
      ? Flag
      : kind === "sprint"
        ? Timer
        : kind === "points"
          ? Hash
          : kind === "type"
            ? kindIcons[option.value] || Plus
            : kind === "parent"
              ? Layers
              : kind === "note"
                ? FileText
                : null;
  return Icon ? (
    <Icon size={15} className="select-icon-muted" aria-hidden="true" />
  ) : null;
}
function plainText(node) {
  return Children.toArray(node)
    .map((child) =>
      typeof child === "object"
        ? plainText(child.props.children)
        : String(child),
    )
    .join("");
}
function readOptions(children) {
  return Children.toArray(children).flatMap((child) => {
    if (child.type === Fragment) return readOptions(child.props.children);
    if (child.type !== "option") return [];
    const label = plainText(child.props.children);
    return [
      {
        value: String(child.props.value ?? label),
        label,
        disabled: child.props.disabled,
        code: child.props["data-code"],
        description: child.props["data-description"],
        itemKind: child.props["data-kind"],
      },
    ];
  });
}
function fieldKind(label = "", name = "") {
  if (label.includes("状态")) return "status";
  if (label.includes("优先级") || name === "priority") return "priority";
  if (label.includes("负责人") || name === "owner") return "person";
  if (label.includes("版本")) return "release";
  if (label.includes("Sprint") || label.includes("冲刺")) return "sprint";
  if (label.includes("故事点")) return "points";
  if (label.includes("所属") || label.includes("父级") || name === "parentId") return "parent";
  if ((label.includes("需求类型") || label.includes("工作项类型"))) return "type";
  if (name === "decision") return "decision";
  if (name === "noteType") return "note";
  return "default";
}

// A styled select that retains native form submission and required-field validation.
export default function Select({
  children,
  value,
  defaultValue,
  onChange,
  name,
  required,
  disabled,
  className = "",
  kind: givenKind,
  searchable,
  onCreate,
  sidebarTooltip,
  sidebarDescription,
  "aria-label": label = "选择选项",
}) {
  const options = readOptions(children);
  const [localValue, setLocalValue] = useState(() =>
    String(defaultValue ?? options[0]?.value ?? ""),
  );
  const current = value === undefined ? localValue : String(value);
  const kind = givenKind || fieldKind(label, name);
  const canSearch =
    searchable ??
    !["priority", "decision", "points", "note", "type"].includes(kind);
  const selected = options.find((option) => option.value === current);
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [active, setActive] = useState(current),
    [invalid, setInvalid] = useState(false);
  const [position, setPosition] = useState(null);
  const trigger = useRef(null),
    menu = useRef(null),
    search = useRef(null),
    list = useRef(null);
  const id = useId();
  const matches = options.filter((option) =>
    `${option.label} ${option.code || ""}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  const enabled = matches.filter((option) => !option.disabled);
  const activeIndex = matches.findIndex((option) => option.value === active);
  const activeId = activeIndex < 0 ? undefined : `${id}-option-${activeIndex}`;
  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  };
  function show() {
    if (disabled) return;
    setPosition(null);
    setQuery("");
    setActive(
      selected?.value ?? options.find((option) => !option.disabled)?.value,
    );
    setOpen(true);
  }
  function choose(option) {
    if (option.disabled) return;
    if (value === undefined) setLocalValue(option.value);
    setInvalid(false);
    close();
    if (option.value !== current)
      onChange?.({
        target: { value: option.value, name },
        currentTarget: { value: option.value, name },
      });
  }
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current.getBoundingClientRect();
      const viewport = window.visualViewport;
      const height = viewport?.height || window.innerHeight;
      const width = Math.min(
        Math.max(rect.width, kind === "project" ? 320 : 240),
        document.documentElement.clientWidth - 16,
      );
      const below = height - rect.bottom - 14,
        above = rect.top - 14;
      const up = below < 260 && above > below;
      const maxHeight = Math.max(100, Math.min(390, up ? above : below));
      const menuHeight = Math.min(menu.current?.scrollHeight || 390, maxHeight);
      setPosition({
        left: Math.max(
          8,
          Math.min(rect.left, document.documentElement.clientWidth - width - 8),
        ),
        top: up ? rect.top - menuHeight - 6 : rect.bottom + 6,
        width,
        maxHeight,
      });
    };
    place();
    const observer = new ResizeObserver(place);
    if (menu.current) observer.observe(menu.current);
    const onScroll = (e) => {
      if (!menu.current?.contains(e.target)) place();
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onScroll, true);
    window.visualViewport?.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onScroll, true);
      window.visualViewport?.removeEventListener("resize", place);
    };
  }, [open, kind]);
  useEffect(() => {
    if (!open) return;
    const outside = (e) => {
      if (
        !menu.current?.contains(e.target) &&
        !trigger.current?.contains(e.target)
      )
        close(false);
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [open]);
  useEffect(() => {
    if (open && position) (search.current || list.current)?.focus();
  }, [open, Boolean(position)]);
  useEffect(() => {
    if (open && activeId)
      document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [open, activeId]);
  function keyboard(e) {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") close();
    else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
      if (!enabled.length) return;
      e.preventDefault();
      let index = enabled.findIndex((option) => option.value === active);
      index =
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? enabled.length - 1
            : (index + (e.key === "ArrowDown" ? 1 : -1) + enabled.length) %
              enabled.length;
      setActive(enabled[index].value);
    } else if (e.key === "Enter" || (e.key === " " && !canSearch)) {
      e.preventDefault();
      const option = enabled.find((option) => option.value === active);
      if (option) choose(option);
    }
  }
  return (
    <div
      className={`select-control ${kind === "project" ? "project-switcher" : ""} ${className}`}
    >
      <select
        className="select-native"
        tabIndex={-1}
        aria-hidden="true"
        name={name}
        value={current}
        required={required}
        disabled={disabled}
        onChange={() => {}}
        onInvalid={(e) => {
          e.preventDefault();
          setInvalid(true);
          show();
        }}
      >
        {children}
      </select>
      <button
        ref={trigger}
        type="button"
        className={`select-trigger ${invalid ? "invalid" : ""}`}
        role="combobox"
        aria-label={label}
        data-sidebar-tooltip={sidebarTooltip}
        data-sidebar-description={sidebarDescription}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        title={sidebarTooltip ? undefined : selected?.label}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          if (["ArrowDown", "ArrowUp"].includes(e.key)) {
            e.preventDefault();
            show();
          }
        }}
      >
        {selected && <OptionIcon kind={kind} option={selected} />}
        {kind === 'project' && <ChevronsUpDown size={18} className="sidebar-project-switch-icon" aria-hidden="true"/>}
        <span className="select-value">
          <span>{selected?.label || "请选择"}</span>
          {kind === "project" && (
            <small>{selected?.code || "项目"} · 当前项目</small>
          )}
        </span>
        <ChevronDown size={13} className="select-chevron" aria-hidden="true" />
      </button>
      {invalid && (
        <small className="select-error" role="alert">
          请选择{label}
        </small>
      )}
      {open &&
        createPortal(
          <div
            ref={menu}
            className={`select-popover select-popover-${kind}`}
            data-select-popover="true"
            style={position || { visibility: "hidden" }}
            onKeyDown={keyboard}
            onClick={(e) => e.stopPropagation()}
          >
            {kind === "project" && (
              <div className="select-heading">
                切换项目 <span>{options.length}</span>
              </div>
            )}
            {canSearch && (
              <div className="select-search">
                <Search size={15} />
                <input
                  ref={search}
                  aria-label={`搜索${kind === "project" ? "项目" : "选项"}`}
                  placeholder={
                    kind === "project" ? "搜索项目名称或标识…" : "搜索选项…"
                  }
                  value={query}
                  aria-controls={id}
                  aria-activedescendant={activeId}
                  onChange={(e) => {
                    const text = e.target.value;
                    setQuery(text);
                    setActive(
                      options.find(
                        (option) =>
                          !option.disabled &&
                          `${option.label} ${option.code || ""}`
                            .toLocaleLowerCase()
                            .includes(text.trim().toLocaleLowerCase()),
                      )?.value,
                    );
                  }}
                />
                {query && (
                  <button
                    type="button"
                    aria-label="清空搜索"
                    onClick={() => {
                      setQuery("");
                      setActive(current);
                      search.current?.focus();
                    }}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            )}
            <div
              id={id}
              role="listbox"
              aria-label={label}
              aria-activedescendant={activeId}
              ref={list}
              tabIndex={canSearch ? undefined : -1}
              className="select-options"
            >
              {matches.map((option, index) => (
                <div
                  role="option"
                  aria-selected={option.value === current}
                  aria-disabled={option.disabled || undefined}
                  id={`${id}-option-${index}`}
                  key={option.value}
                  className={`select-option ${active === option.value ? "highlighted" : ""}`}
                  onPointerMove={() => {
                    if (!option.disabled) setActive(option.value);
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(option)}
                >
                  <OptionIcon kind={kind} option={option} />
                  <span className="select-option-label">
                    <span>{option.label}</span>
                    {kind === "project" && (
                      <small>
                        {option.code}
                        {option.description ? ` · ${option.description}` : ""}
                      </small>
                    )}
                  </span>
                  {option.value === current && (
                    <Check
                      size={14}
                      className="select-check"
                      aria-hidden="true"
                    />
                  )}
                </div>
              ))}
              {!matches.length && (
                <div className="select-empty">
                  没有匹配的{kind === "project" ? "项目" : "选项"}
                </div>
              )}
            </div>
            {onCreate && (
              <div className="select-footer">
                <button
                  type="button"
                  onClick={() => {
                    close();
                    onCreate();
                  }}
                >
                  <Plus size={15} />
                  创建新项目
                </button>
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

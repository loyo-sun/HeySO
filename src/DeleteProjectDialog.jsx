import React, { useRef, useState } from "react";
import { Download, Trash2, X } from "lucide-react";

export default function DeleteProjectDialog({
  project,
  data,
  action,
  busy,
  onClose,
  onDeleted,
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const counts = [
    ["items", "需求与任务"],
    ["sprints", "Sprint 冲刺"],
    ["releases", "版本"],
    ["notes", "项目记忆"],
    ["runs", "执行与交付记录"],
    ["events", "活动记录"],
  ].map(([key, label]) => [
    label,
    data[key].filter((x) => x.projectId === project.id).length,
  ]);
  async function submit(e) {
    e.preventDefault();
    if (submitting.current || busy || name !== project.name) return;
    submitting.current = true;
    setError("");
    const result = await action(
      "project.delete",
      { id: project.id, confirmName: name },
      true,
    );
    submitting.current = false;
    if (result) onDeleted(result);
    else setError("删除未完成，项目仍保留。请核对最新信息后重试。");
  }
  return (
    <div
      className="modal-layer"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <section
        className="modal delete-project-modal"
        role="dialog"
        aria-modal="true"
        aria-label="删除项目"
        aria-describedby="delete-project-impact"
      >
        <header>
          <h2>删除项目</h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="关闭删除确认"
            disabled={busy}
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </header>
        <form onSubmit={submit}>
          <div className="modal-body">
            <p id="delete-project-impact">
              将永久删除「<strong>{project.name}</strong>」及以下项目数据。
            </p>
            <div className="deletion-counts">
              {counts.map(([label, count]) => (
                <div key={label}>
                  <span>{label}</span>
                  <b>{count}</b>
                </div>
              ))}
            </div>
            <div className="deletion-warning">
              删除后无法撤销。此操作删除 HeySO 内的记录，交付物对应的外部文件和
              Git 仓库会保留。
            </div>
            <a
              className="text-btn backup-before-delete"
              href="/api/export"
              download
            >
              <Download size={14} />
              导出工作空间备份
            </a>
            <label className="field">
              <span>输入项目名称以确认</span>
              <input
                autoComplete="off"
                spellCheck={false}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={project.name}
                disabled={busy}
                required
              />
            </label>
            {error && (
              <p className="delete-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <footer>
            <button type="button" disabled={busy} onClick={onClose}>
              取消
            </button>
            <button
              type="submit"
              className="danger-button"
              disabled={busy || name !== project.name}
            >
              <Trash2 size={14} />
              {busy ? "正在删除…" : "永久删除项目"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

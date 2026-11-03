import express from "express";
import { cloudWorkspace } from "./cloud.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createStore } from "./store.mjs";
import { validate } from "./model.mjs";
import { migrateState } from "./migrate.mjs";
import { handleMcp, toolDefinitions } from "./mcp.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 4179);
const dataDir = process.env.HEYSO_DATA_DIR || path.join(root, ".data");
const store = createStore(path.join(dataDir, "workspace.json"));
const workspace = cloudWorkspace({store,dataDir});
const tokenPath = path.join(dataDir, "mcp-token");
if (!fs.existsSync(tokenPath))
  fs.writeFileSync(tokenPath, randomBytes(32).toString("hex"), { mode: 0o600 });
const token = fs.readFileSync(tokenPath, "utf8").trim();
const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  const host = req.hostname;
  if (!["localhost", "127.0.0.1", "[::1]"].includes(host))
    return res.status(403).json({ error: "仅允许本地访问" });
  const origin = req.get("origin");
  if (
    origin &&
    !["http://localhost:" + port, "http://127.0.0.1:" + port].includes(origin)
  )
    return res.status(403).json({ error: "来源未授权" });
  next();
});
app.use(express.json({ limit: "10mb" }));
app.get("/api/state", async (_, res) => res.json(await workspace.read()));
app.get("/api/health", (_, res) => res.json({ status: "ok", version: "alpha_0.1", tools: toolDefinitions.length }));
app.get("/api/connection", (_, res) =>
  res.json({
    url: `http://127.0.0.1:${port}/mcp`,
    token,
    tools: toolDefinitions.map(([name, description]) => ({
      name,
      description,
    })),
    version: "alpha_0.1",
  }),
);
app.use("/api", (req, res, next) => {
  if (req.method !== "GET" && req.get("x-heyso-client") !== "local-ui")
    return res.status(403).json({ error: "需要本地客户端标识" });
  next();
});
workspace.install(app);
app.post("/api/action", async (req, res, next) => {
  try {
    res.json(await workspace.dispatch(req.body.action, req.body.revision,req.body.projectId));
  } catch (e) {
    next(e);
  }
});
app.post("/api/restore", async (req, res, next) => {
  try {
    if(workspace.hasCloudProjects()) throw Object.assign(Error("当前存在在线项目，请使用独立工作空间恢复本地备份"),{status:409});
    const current=await workspace.read();
    if(current.revision!==req.body.revision)throw Object.assign(Error("数据已有更新，请重试"),{status:409});
    store.restore(req.body.state,store.read().revision);
    res.json({state:await workspace.read()});
  } catch (e) {
    next(e);
  }
});
app.post("/api/restore/preview", async (req, res, next) => {
  try {
    const input = validate(migrateState(req.body.state));
    const current = await workspace.read();
    const keys = ["projects", "items", "sprints", "releases", "notes", "runs", "events"];
    res.json({
      revision: current.revision,
      counts: Object.fromEntries(keys.map((key) => [key, { current: current[key].length, backup: input[key].length }])),
      projects: input.projects.map((p) => ({ id: p.id, name: p.name })),
    });
  } catch (e) { next(e); }
});
app.get("/api/export", async (_, res) => {
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="HeySO-backup.json"',
  );
  const state=await workspace.read();
  state.projects.forEach(p=>delete p.cloud);
  res.json(state);
});
app.all("/mcp", async (req, res, next) => {
  const auth = (req.get("authorization") || "").replace(/^Bearer /, "");
  const a = Buffer.from(auth),
    b = Buffer.from(token);
  if (a.length !== b.length || !timingSafeEqual(a, b))
    return res.status(401).json({ error: "请在 AI 工具中配置 MCP 访问密钥" });
  try {
    await handleMcp(req, res, workspace);
  } catch (e) {
    next(e);
  }
});
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  res
    .status(err.status || 500)
    .json({ error: err.status ? err.message : "操作失败，请检查本地服务日志" });
  if (!err.status) console.error(err);
});
if (process.argv.includes("--dev")) {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root,
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(root, "dist")));
  app.get("/{*path}", (_, res) =>
    res.sendFile(path.join(root, "dist", "index.html")),
  );
}
app.listen(port, "127.0.0.1", () =>
  console.log(`HeySO alpha_0.1 ready: http://localhost:${port}`),
);

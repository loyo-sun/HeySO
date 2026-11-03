import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const base = "http://127.0.0.1:4179";
const conn = await (await fetch(base + "/api/connection")).json();
const c = new Client({ name: "HeySO verification client", version: "1.0.0" });
await c.connect(
  new StreamableHTTPClientTransport(new URL(conn.url), {
    requestInit: { headers: { Authorization: "Bearer " + conn.token } },
  }),
);
const tools = await c.listTools();
assert.equal(tools.tools.length, 5);
assert.ok(!tools.tools.some((t) => t.name.includes("review")));
async function call(name, args = {}) {
  const res = await c.callTool({ name, arguments: args });
  if (res.isError) throw Error(res.content[0].text);
  return JSON.parse(res.content[0].text);
}
const ps = await call("list_projects");
const p = ps.find((p) => p.name === "验收测试 · 人与 AI 协作");
assert.ok(p, "Create UI verification project first");
const q = await call("query_project", { projectId: p.id });
const story = q.items.find((x) => x.kind === "story");
assert.ok(story);
const ctx = await call("get_story_context", { itemId: story.id });
assert.ok(ctx.project.definitionOfDone);
const denied = await c.callTool({
  name: "submit_result",
  arguments: {
    itemId: story.id,
    storyVersion: story.contentVersion,
    agent: "MCP 协议验证客户端",
    summary: "验证交付",
    verification: "协议调用成功",
    requestId: "protocol-test",
  },
});
assert.ok(denied.isError);
let state = await (await fetch(base + "/api/state")).json();
const resp = await fetch(base + "/api/action", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-HeySO-Client": "local-ui" },
  body: JSON.stringify({
    revision: state.revision,
    action: { type: "item.update", payload: { id: story.id, aiEnabled: true } },
  }),
});
assert.equal(resp.status, 200);
const run = await call("update_progress", {
  itemId: story.id,
  storyVersion: story.contentVersion,
  agent: "MCP 协议验证客户端",
  message: "已通过标准 MCP 读取故事、项目背景与验收标准。",
  status: "active",
});
const payload = {
  itemId: story.id,
  storyVersion: story.contentVersion,
  agent: "MCP 协议验证客户端",
  runId: run.id,
  summary:
    "已完成 MCP 实际通信验证：读取项目、取得上下文、报告进展并回传成果。",
  verification:
    "标准 SDK 客户端调用成功；未授权更新被拒绝；重复交付返回同一执行记录。",
  artifacts: [],
  requestId: "mcp-smoke-delivery-v1",
};
const delivery = await call("submit_result", payload),
  repeat = await call("submit_result", payload);
assert.equal(delivery.id, repeat.id);
const after = await call("get_story_context", { itemId: story.id });
assert.equal(after.story.status, "review");
assert.equal(
  (
    await fetch(base + "/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
  ).status,
  401,
);
assert.equal(
  (
    await fetch(base + "/api/state", {
      headers: { Origin: "https://untrusted.example" },
    })
  ).status,
  403,
);
await c.close();
console.log(
  "PASS: 5 MCP tools, context, permission rejection, progress, delivery, idempotency, pending human review, auth and origin checks.",
);

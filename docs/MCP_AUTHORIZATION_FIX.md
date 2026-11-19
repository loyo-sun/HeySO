# MCP 创建工作项授权修复

## 拒绝原因与证据边界

仓库中唯一发出 `403 HeySO 操作或文件未获授权` 的位置是 `deploy/hs1-56/overlay/src/heyso.mjs` 的 `permitted`。它在调用领域逻辑之前，合并判断：grant 不存在/撤销、token 缺少 scope、grant 缺少 scope、文件不在授权范围、存在不允许的 connection_ids。create_item/update_item 使用 heyso:write；query_project 使用 heyso:read。能读取项目不代表具备写 scope。

该文案不是 aiEnabled 或史诗层级校验发出的。领域创建本来已不要求 AI 开启，也已支持史诗下创建任务，因此没有删除这些授权条件或放宽 canParent。新增真实 MCP 路由回归测试复现“读取成功，写入缺 scope 被拒”，并验证补齐合法授权后在未开启 AI 的史诗下创建任务成功。

本次未访问生产数据库、旧 token/grant 或失败调用的审计记录，无法声称本次 HS1-60 事件具体命中了哪一个授权分支。线上精确分支需由本地 Agent 按升级 Prompt 只读核实；不能把“很可能旧连接缺写 scope”当成已证实事实。

## 行为和改动位置

- `shared/mcp-authorization.mjs`：分别判断插件 scope、文件范围、当前用户项目写入权、文件内项目 ID。范围/文件不存在对外仅报告不可访问，不返回资源名称或所有者。当前云模型仅文件所有者能写项目，项目成员职责标签不是 ACL；若目标云部署有组织 ACL，必须接入其实际实现。
- `deploy/mcp-authorization/overlay/src/heyso.mjs`：云端适配候选补丁；保留原 owner 过滤、transaction、文件锁、配额、revision、requestId 和数据保存路径。在事务锁内再次校验 grant/写入权；拒绝返回明确 code，并为前置授权拒绝补充脱敏审计。旧发布包保持原样。
- `server/model.mjs`、`shared/work-config.mjs`：项目 `aiIntervention` 为 `all`/`manual`，新项目默认 manual，旧项目缺省按 manual 处理。all 在执行时授权全项目；manual 使用当前工作项图标，不再因父级开启而自动授权新子项。切换模式不会批量修改 aiEnabled 或创建 run。新建项始终 aiEnabled=false。内容编辑 MCP schema 仍禁止修改 AI 开关、状态及验收。
- 全部已启用工作类型（含史诗和自定义规划类型）均可使用上下文、进展、交付和人工验收。扩展入口独立于 Sprint/看板的执行层分类，保留工作流节点、合法转换和子任务父级要求。手动启用 AI 仍需工作流具有执行、验收、完成节点；配置不足时先在项目工作流设置补齐，不把工作流错误冒充授权失败。
- `src/SettingsPanel.jsx`：常规设置新增“AI 介入级别：全部／手动”。`src/main.jsx`、列表、看板、菜单及活动记录按相同规则显示有效权限；all 模式不能逐项撤销，需回到项目设置切换 manual。
- 原 canParent 继续要求上层 rank 更高、同项目；子任务只能在标准工作项下。新错误码让非法层级与授权失败可区分。规划项的执行版本检查和项目上下文版本失效同样保留。

## 错误与处理

| code | 用户处理 |
| --- | --- |
| PLUGIN_AUTHORIZATION_REQUIRED | 重新连接有效的 HeySO 授权 |
| PLUGIN_SCOPE_REQUIRED | 正常 OAuth 流程明确授予所需 scope；写入需 heyso:write |
| FILE_ACCESS_DENIED | 检查当前账号和授权文件范围，重新选择可访问项目 |
| PROJECT_WRITE_FORBIDDEN | 使用具备项目写入权限的账号，不以项目成员名册代替 ACL |
| AI_EXECUTION_DISABLED | 项目选全部，或手动点亮该工作项 AI 图标；不阻止内容编辑 |
| INVALID_HIERARCHY | 按项目工作类型层级选择合法父级 |
| VERSION_CONFLICT | 重新 query_project 获取 revision，核对变化后用新 requestId 提交 |
| IDEMPOTENCY_CONFLICT | 不同操作使用不同 requestId；同一操作重试保持原参数和 requestId |

## 验证

- `tests/mcp-authorization.test.mjs`：token/grant 任一缺写 scope、文件范围、撤销、其他用户/app、连接限制、所有者写权限和项目目标隔离。
- `tests/cloud-mcp-authorization.test.mjs`：实际云端路由、MCP SDK、领域模型，隔离基础设施替身。覆盖读取成功但写授权失败、文件范围/不可访问文件/其他项目拒绝、未启用 AI 的史诗下创建、重试不重复保存、版本冲突不覆盖、事务内授权撤销。没有联系生产服务。
- `tests/project-ai-intervention.test.mjs`：项目模式持久化、未启用 AI 的创建编辑/调整父级、非法层级原子拒绝、全类型执行/交付/人工审核、all 不自动执行、manual 子项独立授权。
- 现有子任务、菜单回归样例在需要执行的地方显式开启子项 AI；保留原有目标归属、人工验收、冲突和幂等断言。

云服务需要同步云端适配器和 vendor 领域代码；只部署前端无法改变 /mcp/heyso 的授权错误。升级交接见 `deploy/mcp-authorization/LOCAL_AGENT_PROMPT.md`。候选包生成脚本拒绝覆盖已有输出目录，记录 SHA256；不自动部署、不修改 scope/grant，不包含任何创建业务任务的脚本。

本次本地结果：`npm test` 302/302 通过；`npm run build` 通过（Vite 提示已有较大 chunk）；`git diff --check` 通过；候选包生成和源文件 SHA256 核对通过。没有运行生产数据库集成、线上升级或浏览器交互测试。

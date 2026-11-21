# PR #12 合并前审查与验证

PR：https://github.com/loyo-sun/HeySO/pull/12

## 审查基线

- 原交付提交：`982623bed5333a2a43d505d546705aa9a43be729`。
- 审查时最新公开 main：`bdd25e75ffc534678748d6bca0eb58739c4977e9`，为本分支祖先，无冲突。
- 已包含 PR #11 的 MCP 授权修复 `c763eea215d9ca475f8bd0a2e29d7d8295a631d3`。本轮没有修改其服务端、授权 schema、存储及领域规则。
- 无现存 GitHub review/review thread 待处理；本记录包含本轮代码审查发现及修正。仅操作公开 HeySO，不访问或修改私有 HeySO-SaaS，不执行部署。

## 发现和修复

原交付允许在注册表中隐藏 `integrations`，设置菜单和直接链接已按协议处理，但概览的“转为在线项目”及 AI 交付的“管理 AI 连接”仍直接设置 section，能够重新进入已隐藏的 MCP 设置页。

修复如下：

1. 内置设置导航统一经过注册页集合及受控导航；项目设置入口也复用同一路径。
2. 仅在 MCP 设置页已注册时显示对应快捷入口；不生成误导或指向隐藏页的按钮。
3. 核心弹窗/详情清理在导航真正获准后进行，避免在用户选择继续编辑之前关闭当前内容。
4. 公开宿主示例新增 `?demoHideMcp=1`，浏览器回归检查 AI、概览、设置菜单和旧直链的一致性；默认 MCP 快捷入口继续可用。
5. 协议文档、机器清单及示例说明补充隐藏页与内置快捷入口的约定。

该修复恢复 1.0.0 已声明的行为，不新增或删除扩展位、参数或公开类型，协议最终版本仍为 **1.0.0**；`index.d.ts` 保持兼容。无存储、项目数据或 MCP 协议迁移。

## 最终验证命令与结果

最终待合并分支提交完成后重新执行以下检查；精确分支 SHA 和实际 main 合并 SHA 由 PR 与交付报告记录，不能把 GitHub 预计算的 merge ref 当成已合并提交。

```sh
npm test
npm run build
/tmp/heyso-shell-types/node_modules/.bin/tsc --strict --noEmit --jsx react --module esnext --moduleResolution bundler --target ES2022 --esModuleInterop --typeRoots /tmp/heyso-shell-types/node_modules/@types tests/app-shell-types.fixture.tsx
node --test tests/mcp-authorization.test.mjs tests/cloud-mcp-authorization.test.mjs tests/project-ai-intervention.test.mjs tests/ai-permission.test.mjs tests/mcp-items.test.mjs
PORT=4193 HEYSO_DATA_DIR=/tmp/heyso-pr12-merge-review-data node server/index.mjs
HEYSO_TEST_URL=http://127.0.0.1:4193 HEYSO_PLAYWRIGHT_MODULE=/tmp/heyso-ui-check/node_modules/playwright-core/index.mjs HEYSO_SCREENSHOT_DIR=/tmp/heyso-pr12-review-captures node tests/app-shell-browser.mjs
git diff --check
```

- 全量单元/业务测试：**309 项通过，0 失败**。
- MCP 专项：**10 项通过，0 失败**；包括内容写入不依赖 AI 开启、缺少 scope/文件权限时拒绝、授权在事务内重查、全部/手动模式及新子任务授权、重复请求与冲突。
- 严格类型检查：通过，覆盖公开类型调用及负例；临时类型工具安装方法见 [verification.md](verification.md)，项目依赖未变化。
- 生产构建：独立版及公开宿主示例入口均通过，保留已有大 bundle 提示。
- 浏览器：Chromium 回归全部通过，无运行时异常；包含原交付全部流程及新增的隐藏 MCP 快捷入口检查。数据来自公开 seed 和独立临时目录，不连接真实云端项目或数据库。
- 差异检查：通过。

合并使用 GitHub merge commit，并绑定最终分支 head SHA，避免在 head 变动后误合并。合并后重新拉取 main，核验分支为其祖先、两者代码树一致、工作区干净，并对 main 重跑上述验证。

## 兼容性和交接

本分支已保留 main 中的 MCP 内容授权与 AI 执行授权分离逻辑；UI capability 不成为服务端权限。桌面及手机截图、接口和迁移约定沿用 [app-shell.md](app-shell.md)、[contract.json](contract.json)、[migration.md](migration.md)。

既有限制不变：现代 CSS @scope 浏览器、单文档全页单实例、启动注册；无 SSR/独立 npm 包。宿主仍负责认证、组织/租户、服务端授权、存储连接、部署及遵守样式/弹层约定。没有 SaaS 私有代码或配置进入此提交。

下游仅在上游合并后使用实际 main 完整 SHA，在自己的私有维护任务中适配和发布。本次不代替下游同步或上线。

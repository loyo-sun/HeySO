# 应用外壳 1.0.0 验证与交接记录

## 公开基线与范围

从公开 `https://github.com/loyo-sun/HeySO` 的 main 提交 `bdd25e75ffc534678748d6bca0eb58739c4977e9` 创建 `feat/app-shell-contract-v1`。起点工作区干净。未访问、复制或修改 HeySO-SaaS 私有仓库，未执行任何部署；本分支只提交公开核心、协议和虚构示例。PR 未合并前仅供试接入。

## 实际验证

- `npm test`：309 项通过，0 失败（含 302 项原业务测试及 7 项新增协议测试）。
- `npm run build`：通过，同时产出独立版和公开宿主示例；保留原有大 bundle 提示。
- `git diff --check`：通过。
- TypeScript 严格类型检查：公开 `index.d.ts` 和 `tests/app-shell-types.fixture.tsx` 宿主调用夹具通过；包含错误主版本、未知扩展位、品牌缺失显式模式、读取非公开 token 字段的编译反例。编译器和 @types/react 仅安装于临时目录，未迁移项目或添加运行依赖。
- 真实 Chromium：`tests/app-shell-browser.mjs` 通过，覆盖以下流程，不依赖截图替代断言：
  - 无扩展默认进入项目，顶部没有固定仪表盘/项目菜单，无空白导航占位。
  - 项目选择/切换、浏览器前进后退、旧仪表盘链接及直接工作项链接。
  - 内置常规设置取消离开保留草稿、放弃后导航。
  - 宿主品牌、排序后的菜单及选中态、项目入口、侧栏选择器旁操作、项目标题旁操作、Header 右侧。
  - 新设置页及内置 about 替换，宿主设置页的菜单/品牌/历史导航保护。
  - 核心主题与宿主通用按钮样式隔离，统一 OverlayRoot 下的 Modal + Select 嵌套弹层。
  - 菜单键盘导航、只读 UI 提示、390px 手机布局与手机弹层，无页面横向溢出。
  - 空工作空间仍能打开创建首个项目流程。
- 协议单元测试覆盖缺省、追加/替换/隐藏、when、排序、重复 ID 和控制器冲突、设置页路由及隐藏后的旧链接、项目摘要白名单、机器清单与代码一致性。

复现浏览器验证：

```sh
npm ci
npm test
npm run build
PORT=4192 HEYSO_DATA_DIR=/tmp/heyso-public-shell-data node server/index.mjs
HEYSO_TEST_URL=http://127.0.0.1:4192 \
HEYSO_PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs \
HEYSO_SCREENSHOT_DIR=/tmp/heyso-shell-captures \
node tests/app-shell-browser.mjs
```

脚本默认 Chromium `/usr/bin/chromium`，可通过 `HEYSO_CHROMIUM` 覆盖。浏览器工作空间数据来自公开 seed，使用拦截的本地测试状态，不连接真实云端项目。截图见 [协议中的组件位置说明](app-shell.md#扩展位置与组件) 和 [screenshots/](screenshots/)。

## 已知范围与约束

- 1.0.0 是源代码级 React 接入；需要支持原生 CSS @scope 的现代浏览器，未提供旧浏览器 polyfill。
- 一次挂载拥有整页布局及 URL/history，不支持同文档多个实例、SSR 或任意局部嵌入尺寸。
- 注册在启动时确定；更换配置需重挂载。所有内置设置不能同时隐藏。
- UI readOnly/capabilities 是展示提示，不是新增的服务端权限或完整应用只读机制；服务端鉴权及领域规则保持原样。
- 可信宿主必须遵守样式命名空间及 stacking context 约定；不防御恶意扩展或任意高特异性 !important 规则。
- 本次未验证任何私有 SaaS 适配或上线，未提供 npm 包发布。存储适配、项目数据和 MCP 无变化；数据迁移：无。

## 给下游维护任务的交接

1. 审查并合并上游 PR 后，拉取明确的 main SHA；本分支 SHA 在合并前只能试接入。
2. 在宿主启动入口改用 `mountHeySO` / `HeySOApplication`，集中注册 slots、settingsPages、theme。
3. 用正式扩展位替代品牌/菜单 JSX 替换、选择器旁图标 DOM 注入、Header 账号拼接与设置数组补丁。
4. 保留宿主认证、账号/组织/租户、套餐、平台后台、API 授权、存储连接和部署适配。这些能力不进入开源核心；替换/隐藏 MCP 设置页时，宿主也须承接自己的连接引导。
5. 将宿主自身路由接入 `requestHostNavigation`，自定义表单接入 setDirty，弹层接入 useOverlayContainer。
6. 后续破坏性变化升主版本并提供迁移指南；新增可选位应维持已有注册缺省行为，类型、机器清单、文档和测试同步更新。

严格类型验证（工具可临时安装，不修改项目依赖）：

```sh
npm install --prefix /tmp/heyso-shell-types --cache /tmp/npm-cache --no-audit --no-fund typescript @types/react
/tmp/heyso-shell-types/node_modules/.bin/tsc --strict --noEmit --jsx react --module esnext --moduleResolution bundler --target ES2022 --esModuleInterop --typeRoots /tmp/heyso-shell-types/node_modules/@types tests/app-shell-types.fixture.tsx
```

PR #12 合并前的追加审查、隐藏设置页快捷入口修复及最终验证见 [pr-12-review.md](pr-12-review.md)。

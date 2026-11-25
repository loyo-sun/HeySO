# 顶部项目切换与统一搜索验证

## 交付内容

- 删除核心 Header 右上角“复制当前页面链接”和全局搜索图标，保留帮助中心。
- `ProjectSelector` 移至 Logo 右侧、宿主主菜单左侧；当前项目和下拉列表只展示项目名称，去掉项目徽标、编号和描述。保留切换、搜索、创建项目、键盘及未保存保护。
- `project.selector-actions` 随选择器移动，继续使用原扩展位 ID。`header.project-entry` 仍是独立入口；协议版本仍为 1.0.0，公开参数和模式不变。
- 使用 `src/SearchField.jsx` 统一清单、冲刺、看板、版本、路线图筛选、报告、工作流、仪表盘、帮助、选择器和筛选弹层搜索。共享高度、边框、主题色、字体、内嵌图标和清除按钮；不再依赖隔离范围之外的 `body` 搜索样式。
- 清单工具栏按“搜索、已应用的列筛选、数量与字段操作”排列；清除搜索在输入框内，“清空筛选”只在有列筛选时出现，并保留搜索文字。手机布局自动换行，表格保持自身滚动。

仅修改公开 HeySO；无私有 SaaS 代码、配置、凭据、仓库操作或部署。业务数据、存储、MCP 和路由格式没有变化，无数据迁移。

## 实际执行

```sh
npm test
npm run build
/tmp/heyso-shell-types/node_modules/.bin/tsc --strict --noEmit --jsx react --module esnext --moduleResolution bundler --target ES2022 --esModuleInterop --typeRoots /tmp/heyso-shell-types/node_modules/@types tests/app-shell-types.fixture.tsx
PORT=4196 HEYSO_DATA_DIR=/tmp/heyso-header-data node server/index.mjs
HEYSO_TEST_URL=http://127.0.0.1:4196 HEYSO_PLAYWRIGHT_MODULE=/tmp/heyso-ui-check/node_modules/playwright-core/index.mjs node tests/header-search-browser.mjs
HEYSO_TEST_URL=http://127.0.0.1:4196 HEYSO_PLAYWRIGHT_MODULE=/tmp/heyso-ui-check/node_modules/playwright-core/index.mjs HEYSO_SCREENSHOT_DIR=/tmp/heyso-header-shell node tests/app-shell-browser.mjs
HEYSO_TEST_URL=http://127.0.0.1:4196 HEYSO_PLAYWRIGHT_MODULE=/tmp/heyso-ui-check/node_modules/playwright-core/index.mjs node tests/hs1-57-58-browser.mjs
git diff --check
```

结果：311 项单元/业务测试通过；严格公开类型检查通过；独立版和宿主示例构建通过（既有大分块警告保留）；新增顶部/搜索浏览器回归、原外壳回归和清单分页/过滤回归通过；diff 检查通过。

新增回归验证真实生产组件：Header 顺序和图标移除、项目名展示、项目选择/浏览器后退、设置草稿保护、搜索无结果和恢复、键盘清除及焦点恢复、搜索与列筛选独立清除。实际比对清单、冲刺、版本、报告、工作流、仪表盘和帮助搜索框的计算样式：34px 高、6px 圆角、12px 字体、单层边框和单个搜索图标。宿主示例及 390px 布局无页面横向溢出，选择器旁扩展操作在 Header 内，不覆盖正文。

截图及计算样式位于 [header-search-layout/](header-search-layout/)；协议各扩展位截图同步更新于 [../extensions/screenshots/](../extensions/screenshots/)。

## SaaS 交接注意

维护任务应在上游合并后拉取最终 main 完整 SHA，在私有同步分支适配、验证并单独发布。删除针对旧侧栏项目选择器位置的 CSS/JSX 补丁；继续使用 `project.selector-actions`。检查宿主自己注册的 `header.right`，按产品要求移除旧复制/全局搜索按钮。宿主菜单、账号、组织与认证仍由宿主管理，不覆盖核心搜索样式，也不要重复注入项目选择器。

当前验证使用隔离本地示例数据，不表示 SaaS 已适配或上线。手机宿主主菜单空间不足时保持可横向滚动；宿主仍需控制注入内容的宽度。

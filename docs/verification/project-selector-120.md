# 120px 项目切换器

默认 Header 品牌只保留 Logo 图标。项目切换器紧邻图标右侧、主菜单左侧；控件在桌面和手机均固定为 120px，恢复下拉箭头。选中项显示项目名称，长名称省略并可通过原有 title 查看完整名称；列表显示项目名称及灰色的真实 `project.id`，不显示项目徽标或描述。搜索支持项目名称、编号前缀及真实 ID。

`project.selector-actions` 保持原 ID，位于 120px 控件外，不挤压控件。宿主 `header.brand` 注册方式不变，宿主仍可自定义自己的品牌。协议版本保持 1.0.0，无公开类型、数据或 MCP 变更，无迁移。

实际执行并通过：

```sh
npm test
npm run build
/tmp/heyso-shell-types/node_modules/.bin/tsc --strict --noEmit --jsx react --module esnext --moduleResolution bundler --target ES2022 --esModuleInterop --typeRoots /tmp/heyso-shell-types/node_modules/@types tests/app-shell-types.fixture.tsx
PORT=4197 HEYSO_DATA_DIR=/tmp/heyso-selector-data node server/index.mjs
HEYSO_TEST_URL=http://127.0.0.1:4197 HEYSO_PLAYWRIGHT_MODULE=/tmp/heyso-ui-check/node_modules/playwright-core/index.mjs HEYSO_SCREENSHOT_DIR=/tmp/heyso-selector-check node tests/header-search-browser.mjs
HEYSO_TEST_URL=http://127.0.0.1:4197 HEYSO_PLAYWRIGHT_MODULE=/tmp/heyso-ui-check/node_modules/playwright-core/index.mjs HEYSO_SCREENSHOT_DIR=/tmp/heyso-selector-shell node tests/app-shell-browser.mjs
git diff --check
```

结果：311 项业务/单元测试通过，严格公开类型检查、独立版及宿主构建通过（保留既有分块大小提示）。浏览器验证桌面及 390px 手机均为 120px、箭头可见、ID 内容与灰色计算样式正确、通过 ID 搜索并切换项目；项目切换/历史/未保存保护、宿主插槽、键盘、统一搜索和嵌套弹层回归通过，无运行时页面错误。

截图：[下拉项目名称与 ID](project-selector-120/dropdown-desktop.png)、[桌面](project-selector-120/desktop.png)、[手机宿主](project-selector-120/host-mobile.png)。协议截图同步于 `docs/extensions/screenshots/`。

仅修改公开上游，不访问 SaaS 私有仓库或执行 SaaS 部署。SaaS 需拉取合并后的明确上游 SHA，移除旧的“无箭头/非 120px/仅名称下拉列表”样式覆盖，再完成自己的验证和发布。保留宿主品牌注册，勿用核心默认 Logo 覆盖宿主品牌配置。

# 项目切换器位置更正

`ShellHeader` 将项目切换器放到右上角工具组，默认紧邻 `help-entry` 帮助按钮左侧。品牌恢复 Logo、HeySO 与合序文字。主菜单保持在品牌之后，独立项目入口保持在菜单之后。

项目控件继续保持桌面/手机 120px、下拉箭头、名称与灰色真实 ID 列表、按 ID 搜索。`project.selector-actions` 与选择器一起移动，参数、模式与 ID 不变。选择器在 `header.right` 扩展位之外，因此宿主替换或隐藏右侧内容不会删除项目切换能力。协议仍为 1.0.0，无数据/MCP/存储迁移。

实际执行并通过：

```sh
npm test
npm run build
/tmp/heyso-shell-types/node_modules/.bin/tsc --strict --noEmit --jsx react --module esnext --moduleResolution bundler --target ES2022 --esModuleInterop --typeRoots /tmp/heyso-shell-types/node_modules/@types tests/app-shell-types.fixture.tsx
PORT=4198 HEYSO_DATA_DIR=/tmp/heyso-help-position-data node server/index.mjs
HEYSO_TEST_URL=http://127.0.0.1:4198 HEYSO_PLAYWRIGHT_MODULE=/tmp/heyso-ui-check/node_modules/playwright-core/index.mjs HEYSO_SCREENSHOT_DIR=/tmp/heyso-help-position-check node tests/header-search-browser.mjs
HEYSO_TEST_URL=http://127.0.0.1:4198 HEYSO_PLAYWRIGHT_MODULE=/tmp/heyso-ui-check/node_modules/playwright-core/index.mjs HEYSO_SCREENSHOT_DIR=/tmp/heyso-help-position-shell node tests/app-shell-browser.mjs
git diff --check
```

结果：311 项单元/业务测试、严格类型检查、独立版与宿主示例构建通过。浏览器通过边界坐标确认桌面/390px 手机选择器处于右半区、在帮助按钮左侧且间距不超过 12px；确认 120px、箭头、灰色 ID、ID 搜索、项目切换、历史与未保存保护、宿主插槽/主题/嵌套弹层、键盘和手机布局。无运行时页面错误。构建保留既有分块大小提示。

截图：[桌面](project-selector-before-help/desktop.png)、[手机](project-selector-before-help/mobile.png)、[下拉列表](project-selector-before-help/dropdown.png)。协议截图也已更新。本记录更正之前将切换器放在 Logo 右侧的布局说明。

SaaS 接入应使用最终 main SHA，按“主菜单/项目入口 → 右侧项目切换器 → 右侧帮助等宿主内容”的顺序接入，继续使用正式扩展位，移除旧位置覆盖。无需依赖用户示例中的 Ant Design 生成类名。本次未访问私有 SaaS 仓库、修改其代码或执行 SaaS 部署。

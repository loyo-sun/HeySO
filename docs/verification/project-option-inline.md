# 项目名称与编号单行展示

项目切换列表按「项目名称 - 项目 ID」在同一行展示，例如「HeySO 产品研发 - HS1」。项目 ID 使用客户填写的 `project.code`，保持灰色；不是内部标识。无编号时只显示名称，不显示分隔符。长名称单行省略，完整名称及编号由 title 提供；非项目选择器排版不变。

选中项仍只显示名称。帮助按钮左侧位置、120px、箭头、搜索和导航保护不变。协议 1.0.0，数据/路由/MCP 无迁移。仅公开仓库修改，无 SaaS 私有仓库操作或部署。

实际执行并通过：

```sh
npm test
npm run build
/tmp/heyso-shell-types/node_modules/.bin/tsc --strict --noEmit --jsx react --module esnext --moduleResolution bundler --target ES2022 --esModuleInterop --typeRoots /tmp/heyso-shell-types/node_modules/@types tests/app-shell-types.fixture.tsx
PORT=4201 HEYSO_DATA_DIR=/tmp/heyso-inline-data node server/index.mjs
HEYSO_TEST_URL=http://127.0.0.1:4201 HEYSO_PLAYWRIGHT_MODULE=/tmp/heyso-ui-check/node_modules/playwright-core/index.mjs HEYSO_SCREENSHOT_DIR=/tmp/heyso-inline-check node tests/header-search-browser.mjs
HEYSO_TEST_URL=http://127.0.0.1:4201 HEYSO_PLAYWRIGHT_MODULE=/tmp/heyso-ui-check/node_modules/playwright-core/index.mjs HEYSO_SCREENSHOT_DIR=/tmp/heyso-inline-shell node tests/app-shell-browser.mjs
git diff --check
```

结果：315 项测试、严格公开类型检查、独立版及宿主示例构建、顶部/搜索及完整外壳浏览器回归通过，无运行时页面错误；保留既有大分块提示。浏览器核对精确显示字符串、灰色编号、名称和编号的垂直坐标一致、长名称省略，并验证名称/编号搜索、切换、历史、未保存保护、宿主弹层及 390px 手机布局。

截图：[桌面](project-option-inline/dropdown.png)、[手机](project-option-inline/mobile.png)。本说明更新此前两行展示的截图和约定。

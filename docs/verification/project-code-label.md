# 项目 ID 展示语义更正

项目切换下拉列表中的灰色“项目 ID”使用客户手动填写的 `project.code`（例如 HS1），不使用内部 `project.id`。搜索按名称和客户填写的编号匹配；内部标识继续用于选项值、数据关联及路由。缺少 code 时省略灰色副标题，不回退显示内部标识。帮助按钮左侧的位置、120px 宽度、下拉箭头及其他行为不变。

该说明取代此前验证记录中将列表项目 ID 理解成内部标识的描述。公开扩展协议仍为 1.0.0，无数据、存储、路由或 MCP 迁移。

实际执行并通过：

```sh
npm test
npm run build
/tmp/heyso-shell-types/node_modules/.bin/tsc --strict --noEmit --jsx react --module esnext --moduleResolution bundler --target ES2022 --esModuleInterop --typeRoots /tmp/heyso-shell-types/node_modules/@types tests/app-shell-types.fixture.tsx
PORT=4199 HEYSO_DATA_DIR=/tmp/heyso-code-data node server/index.mjs
HEYSO_TEST_URL=http://127.0.0.1:4199 HEYSO_PLAYWRIGHT_MODULE=/tmp/heyso-ui-check/node_modules/playwright-core/index.mjs HEYSO_SCREENSHOT_DIR=/tmp/heyso-code-check node tests/header-search-browser.mjs
HEYSO_TEST_URL=http://127.0.0.1:4199 HEYSO_PLAYWRIGHT_MODULE=/tmp/heyso-ui-check/node_modules/playwright-core/index.mjs HEYSO_SCREENSHOT_DIR=/tmp/heyso-code-shell node tests/app-shell-browser.mjs
git diff --check
```

结果：311 项业务/单元测试、严格公开类型检查、独立版和宿主示例构建、更新的顶部搜索回归及完整外壳浏览器回归通过，无页面运行时错误。构建保留既有大分块提示。

浏览器特意使用 `id=p_heyso / code=HS1`、`id=second / code=TWO` 的不同值，确认副标题及 title 显示 HS1、颜色为灰色、列表不显示 p_heyso，并在桌面/手机通过小写 two 搜索手动编号后正确切换到内部路由 `project=second`。同时回归 120px、箭头、帮助按钮左侧位置、历史、未保存保护、宿主替换、键盘和手机布局。

截图：[名称与灰色客户项目 ID](project-code-label/dropdown.png)。协议截图同步更新。仅操作公开 HeySO，不访问或修改私有 SaaS 仓库，不执行 SaaS 部署。

# 清单按当前视图导出

移除线路/路线图的导出按钮，在清单数量、字段配置附近增加「导出」。格式延续原入口的 CSV，UTF-8 BOM 兼容中文表格软件。

- 仅导出当前勾选显示的列，按当前列顺序输出。工作项列包含项目编号、工作项序号和标题，不额外增加隐藏列。
- 同时应用搜索文字、各列筛选及当前排序，导出完整匹配集，不使用首批/滚动加载的显示切片。
- 类型、状态、优先级、负责人、父项、冲刺、版本及时间使用页面对应文本，零故事点保持为 0。
- 没有匹配行时禁用导出。手机搜索单独占一行，数量/导出/列配置放在下一行，避免重叠。
- CSV 正确转义逗号、双引号和换行，防止单元格内容被表格软件当作公式执行。

同时保留本批项目 ID 修正：灰色项目 ID 来自客户手动输入的 `project.code`，如 HS1，见 [project-code-label.md](project-code-label.md)。项目选择器位置、120px 及箭头不变。协议仍为 1.0.0，无数据、路由、MCP 或存储迁移。

实际执行：

```sh
npm test
npm run build
/tmp/heyso-shell-types/node_modules/.bin/tsc --strict --noEmit --jsx react --module esnext --moduleResolution bundler --target ES2022 --esModuleInterop --typeRoots /tmp/heyso-shell-types/node_modules/@types tests/app-shell-types.fixture.tsx
PORT=4200 HEYSO_DATA_DIR=/tmp/heyso-export-data node server/index.mjs
HEYSO_TEST_URL=http://127.0.0.1:4200 HEYSO_PLAYWRIGHT_MODULE=/tmp/heyso-ui-check/node_modules/playwright-core/index.mjs node tests/backlog-export-browser.mjs
HEYSO_TEST_URL=http://127.0.0.1:4200 HEYSO_PLAYWRIGHT_MODULE=/tmp/heyso-ui-check/node_modules/playwright-core/index.mjs node tests/header-search-browser.mjs
HEYSO_TEST_URL=http://127.0.0.1:4200 HEYSO_PLAYWRIGHT_MODULE=/tmp/heyso-ui-check/node_modules/playwright-core/index.mjs node tests/app-shell-browser.mjs
HEYSO_TEST_URL=http://127.0.0.1:4200 HEYSO_PLAYWRIGHT_MODULE=/tmp/heyso-ui-check/node_modules/playwright-core/index.mjs node tests/hs1-57-58-browser.mjs
git diff --check
```

结果：315 项业务/单元测试通过，包括新增的完整匹配集、列顺序/显示文本、CSV 转义和空结果测试；公开严格类型检查、独立版及宿主构建通过（保留既有分块体积提示）。四组浏览器回归通过，无页面运行时错误。

下载回归使用隔离的 105 条记录：未加载更多时下载得到 105 行；搜索及负责人筛选后只显示 30 行，但实际文件包含 45 行。隐藏状态/优先级、增加类型并重排列后，文件标题为「工作项、负责人、类型、故事点」，按工作项降序从 HS1-105 到 HS1-61。手机导出内容一致，零结果导出按钮禁用。

截图：[桌面](backlog-export/desktop.png)、[手机](backlog-export/mobile.png)。仅修改公开仓库，不访问私有 SaaS 仓库或执行 SaaS 部署。SaaS 维护方应拉取最终合并 SHA 后自行适配、测试及发布。

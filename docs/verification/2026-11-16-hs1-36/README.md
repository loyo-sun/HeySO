# HS1-36 开发与验证

本次处理 HS1-36 下尚未验收的 HS1-33、34、42、48、51；其余 8 项保留人工已完成状态。

| 工作项 | 交付结果 |
| --- | --- |
| HS1-33 | 复核当前发布列表：单击进入原有完整版本详情；双击取消待触发的单击并打开编辑。Enter 查看、F2 编辑；已发布、归档版本保持查看模式。 |
| HS1-34 | 复核当前发布页固定 180px 状态条，色段按数量占比合计 100%；详情页保留工作项、发布说明与发布/归档操作。 |
| HS1-42 | 工作类型列表只读展示，双击、Enter、F2 或编辑按钮打开编辑草稿；新建一次配置名称、图标、颜色、可用性。取消丢弃弹窗草稿，确认后仍由项目配置保存按钮持久化。重复名称、使用中类型停用与最后一个标准类型保护保留。 |
| HS1-48 | 与显示子任务相邻的「显示版本」复选框，默认开启，同时控制表头标记和里程碑行；复用个人视图偏好持久化。 |
| HS1-51 | 截止日显示今天、明天、昨天、逾期天数等相对时间；展示冲刺状态、完成数及比例；包含继承冲刺的子任务，历史冲刺使用冻结快照。仪表盘原页打开工作项，URL 保留项目及工作项，刷新可恢复。 |

## 验证

- `npm test`：294 项通过，0 失败。
- `npm run build`：生产构建通过；已有大体积 bundle 提示仍存在。
- `tests/release-interactions-dom.mjs`：原详情、间隔 350ms 的双击、单击计时取消、Enter 查看通过。
- `tests/hs1-36-dom.mjs`：历史冲刺完整列表及子任务、只读详情、线路只读保护、筛选后适应、长期项目创建通过。
- `tests/hs1-36-browser.mjs`：真实 Chromium 验证仪表盘原页详情及刷新恢复、版本开关及刷新持久化、发布单击原详情/双击编辑/180px 比例条、工作类型双击编辑/取消/新建/保存/刷新。无浏览器运行时异常。
- 修正两个旧回归夹具对固定日历日期的依赖：层级测试的短任务日期取项目起始日，线路适应断言取目标项开始日期减 7 天。

浏览器回归使用独立的 `/tmp` 数据目录，不修改线上项目内容：

```sh
PORT=4187 HEYSO_DATA_DIR=/tmp/heyso-hs1-36-data node server/index.mjs
HEYSO_PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs node tests/hs1-36-browser.mjs
HEYSO_JSDOM_MODULE=/path/to/jsdom/lib/api.js node tests/release-interactions-dom.mjs
HEYSO_JSDOM_MODULE=/path/to/jsdom/lib/api.js node tests/hs1-36-dom.mjs
```

浏览器脚本默认使用 `/usr/bin/chromium`，可通过 `HEYSO_CHROMIUM` 覆盖。验证工具安装在临时目录，未加入项目运行依赖。本次交付代码和验收记录，按用户要求同步至 GitHub main，未执行部署；MCP 交付将目标项置为待人工验收。

后续 HS1-42、HS1-51 的人工退回意见、修正与截图见 [验收修改记录](../2026-11-16-hs1-36-review/README.md)。仪表盘冲刺范围现已按验收要求限定为进行中。

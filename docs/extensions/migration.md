# 外壳协议 1.0.0 迁移

公开 HeySO 是核心与协议的唯一上游。本次分支只来自公开 main，不含私有代码。宿主适配必须在自己的维护任务中执行。

## 旧接入方式与新接口

| 旧方式 | 新方式 |
| --- | --- |
| 查找顶部仪表盘/项目字符串并替换 JSX | `header.navigation` + `ShellMenu` |
| 替换品牌源码/Logo 字符串 | `header.brand` |
| 查找“项目”按钮改文字/图标 | `header.project-entry`；与顶部项目选择器不是同一位置 |
| 用 CSS 选择器寻找选择器右侧、追加图标 | `project.selector-actions` |
| 向常规设置的项目标题卡片追加按钮 | `project.title-actions` |
| 账号/组织/通知直接拼进 Header | `header.right`；其业务与权限留在宿主 |
| 修改内置 settingsPages 数组和 SettingsPanel 的条件 JSX | `settingsPages` 注册，append 新 ID 或 replace/hide 内置 ID |
| 直接 pushState/window.location 跳页 | `ctx.navigate` 或 `ctx.requestHostNavigation` |
| portal 到 body、依赖核心 CSS 类定位弹层 | `useOverlayContainer()` 与主题注册 |

## 启动接入

1. 拉取明确的上游提交，在宿主专用同步分支完成适配。
2. 从 `src/extensions/index.jsx` 导入 `mountHeySO` 或 `HeySOApplication`，在启动时提供扩展。移除旧字符串替换/源码 patch。
3. 将原菜单改为稳定 ID、明确 order 和 active；所有宿主路由包在受控导航回调中。
4. 自定义设置页接入 `setDirty`，只在实际保存成功后清理。验证取消离开保留草稿。
5. 接入正式 theme 和 OverlayRoot。使用示例测试桌面、手机、嵌套弹层、浏览器历史和权限失败。

默认没有仪表盘/项目顶部菜单；访问 `/` 进入项目线路。`?tab=dashboard`、`?tab=projects`、旧 hierarchy/work/sprints/memory、项目/版本/工作项深链仍支持。顶部选择器保留切换和创建项目，无项目时保留首次创建路径。此界面行为变化不要求数据迁移。

`src/main.jsx` 现在只是独立版启动器，业务主体移至 `src/HeySOApp.jsx`。内部组件、CSS 类名和文件结构不属于宿主协议；公开入口和 slot ID 才是兼容边界。

## 上下游协作

- 审查未合并时，分支 SHA 只可供试接入，不能宣称正式同步。
- PR 合并后，宿主维护任务拉取明确的 main 提交，独立完成适配、测试和发布。
- 本次不向私有仓库推送，不替宿主合并、部署或验证账号/组织/租户能力。
- 认证、组织、租户、套餐、平台后台、服务端权限、存储适配及部署环境仍由宿主维护；本协议只提供 UI 位置、上下文摘要和受控导航。
- 后续破坏性变更提升主版本并提供此类迁移说明；新增可选位或非破坏性能力保持现有位缺省行为。机器清单和类型声明必须与实现同一提交更新。

## 顶部项目切换与统一搜索

项目选择器及 `project.selector-actions` 一起迁至 Header 右上角，位于 `header.right` 前，默认紧邻帮助按钮左侧。宿主继续注册同一扩展位，不要保留针对旧侧栏位置的 CSS 定位。`header.right` 默认只保留帮助中心；如宿主需要复制链接或额外搜索，使用正式扩展注册自行提供。清单搜索在框内清除，列筛选用独立的“清空筛选”，两者互不清除。协议版本仍为 1.0.0，公开类型和数据格式无变更，无数据迁移。

项目切换尺寸更新：帮助入口左侧的控件固定为 120px，桌面和手机均不缩小，恢复下拉箭头。列表显示灰色客户手动输入的项目 ID（`project.code`，如 HS1）并支持编号搜索；不再按旧的“仅项目名称列表/无箭头”样式覆盖。附加扩展操作不包含在控件的 120px 内。无公开类型、数据格式或协议版本变化。

位置更正：品牌保留 Logo 与文字；项目切换不放在 Logo 旁，也不放进可被宿主隐藏/替换的 `header.right` 内容中。`ShellHeader` 的右侧工具组先呈现独立项目选择器，再呈现 `header.right`。宿主替换账号/帮助内容时不影响项目切换能力；继续使用现有扩展位，无需依赖生成的 Ant Design CSS 类名定位。

项目 ID 文案约定：界面所称项目 ID 指客户手动填写的 `project.code`，不是存储/路由使用的内部 `project.id`。下拉列表不展示内部 ID，缺少 code 时省略副标题，不用内部 ID 填充；无需变更已有项目数据和路由。

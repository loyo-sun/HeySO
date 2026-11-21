# 最小公开宿主示例

示例使用虚构菜单与账号，不连接任何私有 SaaS，也没有组织/租户实现。

```sh
npm run dev
# 打开 http://localhost:4179/examples/host-shell/
```

或 `npm run build && npm start` 后访问同一路径。Vite 同时构建独立入口和此示例。入口 `main.jsx` 只调用公开 `mountHeySO`，配置位于 `extensions.jsx`，不替换核心源码或查询 DOM 注入内容。

示例覆盖品牌 Logo、主菜单排序/选中、项目入口文字/图标、侧栏项目图标、常规设置标题图标、账号及嵌套 Select 弹层、新设置页及内置 about 替换。`?demoReadOnly=1&view=settings&section=demo-notes` 演示只读 UI 提示；它不是服务端权限。

备注页的草稿只用于导航保护演示，不会写入服务器。账号内容全部虚构。外部紫色按钮用于证明宿主样式没有被核心全局重置；核心样式也不会继承它的通用按钮颜色。

协议与约定见 `docs/extensions/app-shell.md`；不要将本示例的虚构文案当成正式产品菜单。

`?demoHideMcp=1` 演示隐藏 MCP 设置页：设置菜单、概览与 AI 交付快捷入口一并隐藏，旧直链回退到可见设置页。此开关仅用于公开示例，不改变服务端权限。

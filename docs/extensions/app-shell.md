# 应用外壳扩展协议 1.0.0

HeySO 是项目管理开源核心。宿主从公开上游导入本协议，在启动时注册**编译进宿主的可信 React 扩展**。核心不认识组织、租户、套餐、平台后台或私有产品；本目录及示例只使用公开代码和虚构信息。

公开入口：`src/extensions/index.jsx`；类型：`src/extensions/index.d.ts`；机器清单：[contract.json](contract.json)。扩展位 ID 属于协议，显示文案变化不得改 ID。破坏性变更升主版本并提供迁移说明。1.0.0 目前随源码分发，不承诺独立 npm 包或 SSR。

## 启动注册

```jsx
import React from 'react';
import {mountHeySO, ShellMenu, createShellExtensions} from './HeySO/src/extensions/index.jsx';

const extensions = createShellExtensions({
  contractVersion: '1.0.0',
  slots: [
    {id:'host-menu', slot:'header.navigation', render:() => <ShellMenu items={[
      {id:'delivery', label:'交付空间', order:10,
       active:ctx => ctx.route.page === 'projects',
       onSelect:ctx => ctx.navigate({page:'projects', view:'roadmap'})},
    ]}/>},
    {id:'host-project', slot:'header.project-entry', mode:'replace',
     when:ctx => !!ctx.project,
     render:ctx => <button type="button" onClick={() => ctx.navigate({view:'list'})}>进入研发</button>},
  ],
});
const application = mountHeySO(document.getElementById('root'), {extensions});
// 宿主销毁时：application.unmount()
```

已有 React 根、宿主 Router 或 Context Provider 时可使用 `<HeySOApplication extensions={extensions}/>`，扩展组件可继续读取宿主自己的 React Context。`mountHeySO` 创建独立 React 根，不继承另一个根的 Context。同一实例只在首次挂载读取配置；需要更换注册表时卸载后重挂。`mountHeySO` 拒绝重复挂载；注册非法时在渲染前抛错。不要运行时篡改注册对象。

每条可见注册恰好提供一种内容：`render(context)`、`component: MyComponent` 或 `node: ReactNode`。组件接收展开后的 context 属性；ReactNode 可调用 `useShellContext()`。`hide` 注册不需要内容。所有导航示例应使用 `<button type="button">`，避免误提交祖先表单。

## 扩展位置与组件

| 稳定 ID | 组件 / 精确位置 | 模式 | 缺省行为 |
| --- | --- | --- | --- |
| `header.brand` | `ShellHeader` 左侧品牌 | replace、hide | HeySO Logo、名称，点击通过保护进入项目线路 |
| `header.navigation` | `ShellHeader` 品牌后的主菜单区 | append、replace、hide | 空，不显示写死的仪表盘/项目菜单 |
| `header.project-entry` | `ShellHeader` 主菜单之后、右侧工具之前 | append、replace、hide | 旧仪表盘页面显示“进入项目”；其他页面为空 |
| `project.selector-actions` | `ProjectSelector`，**Header 右侧工具组中、帮助入口前的项目选择器右侧** | append、replace、hide | 空；选择器本身不被替换或隐藏 |
| `project.title-actions` | `ProjectIdentity`，**项目设置 → 常规中的项目标题卡片右侧** | append、replace、hide | 空；不是 Header、也不是顶部项目选择器 |
| `header.right` | `ShellHeader` 最右侧工具区 | append、replace、hide | 帮助中心（复制链接与全局搜索图标已移除） |
| `settings.pages` | 设置侧栏菜单及 `HostSettingsPage` 正文 | append、replace、hide | 保留内置设置页 |

三种项目位置不可互换。`data-heyso-component` / `data-heyso-slot` 用于截图与诊断，**不是让宿主通过 DOM/CSS 选择器注入内容的接口**。

截图对应位置：

- [独立版桌面](screenshots/standalone-desktop.png)：默认无主菜单，右上角帮助入口左侧提供完整项目选择与切换。
- [宿主桌面](screenshots/host-desktop.png)：示例工作台为 `header.brand`；协作台/项目空间为 `header.navigation`；进入研发为 `header.project-entry`；顶部项目选择器旁齿轮为 `project.selector-actions`；账号/帮助为 `header.right`。
- [项目标题操作](screenshots/project-title-actions.png)：常规设置项目卡片右侧“项目说明”按钮为 `project.title-actions`。
- [嵌套弹层](screenshots/nested-popup.png)、[宿主手机](screenshots/host-mobile.png)、[手机弹层](screenshots/host-mobile-popup.png)、[独立版手机](screenshots/standalone-mobile.png)。

## 模式、排序与 ID

注册 ID 使用 `[a-z][a-z0-9._-]*`，在整个注册表（含设置页）内唯一。重复 ID、未知位、非法模式、多个内容提供器或非有限 `order` 立即抛错；不静默覆盖。

- 默认模式为 append。品牌不支持 append，必须显式 replace 或 hide。
- 每个界面位最多一个 replace/hide 控制器；即使两个 `when` 互斥，也不接受多个控制器。
- `when(context)` 为 false 时该注册不参与渲染；不代表服务端授权。无可见注册时回到该位默认行为。若显示条件完全由宿主接管，请用 replace 的 render 返回内容或 null；when=false 本身不会隐藏核心默认内容。
- hide 生效时整个位置隐藏，包括其追加项；replace 生效时替换默认内容，其余 append 项仍追加在替换内容后。
- 追加项按 `order` 升序（缺省 0），同序按 ASCII ID 排序；默认/替换内容先显示。不保留空白占位或无效按钮。
- `ShellMenu` 支持单独的菜单项 ID、order、label、icon、when、active、disabled、onSelect；菜单重复 ID 抛错。左右/Home/End 移动焦点，Enter/Space 激活。选中状态通过 `aria-current="page"` 表达。

## Context 与受控导航

`ShellContext` 的字段由类型声明和机器清单共同定义：

- `projectId`、`project`、`projects`：项目摘要只含 id、name、code、goal、longTerm；无项目时为 null / 空数组。没有存储配置、成员完整记录、连接令牌、云凭证或租户字段。
- `route`：page、projectId、view、settingsSection、selected、tab、releaseId。
- `capabilities`：busy、online、readOnly、canCreateProject。**只用于宿主展示，不作为服务端权限依据**。readOnly 由宿主启动配置或现有项目提示提供；不是新增的存储权限机制，也不替代核心领域校验。
- `navigate(target)`：校验目标项目、视图、设置页、工作项及版本归属后，通过既有未保存保护原子更新路由；进入详情使用 selected，详情页签使用 tab。
- `requestHostNavigation(callback)`：宿主自有路由由此包装；只有允许离开后才执行回调。回调属于可信宿主代码，不是远程脚本或 URL 执行器。
- `openHelp()`：打开核心帮助。

不要直接调用 window.location、history.pushState、setPage 或访问核心内部状态绕过导航保护。不要在 `when` / `active` / `render` 中产生副作用。`navigate` 不承诺返回导航成功状态：有未保存内容时会等待用户继续编辑或放弃。

原有浏览器前进/后退、直接链接继续使用 `useWorkspaceRoute`；宿主新增设置页也参与 section 校验及历史恢复。隐藏/未知设置页链接回退到 general；若 general 隐藏则回退到首个可见设置页。不能隐藏所有内置设置页。隐藏 MCP 设置页时，概览和 AI 交付页的对应快捷入口同时移除；内置设置导航也使用相同的受控导航和已注册页面集合。

## 项目设置页面

```jsx
function Notes({project, capabilities, setDirty}) {
  const [draft, setDraft] = React.useState('');
  return <label>备注<input value={draft} readOnly={capabilities.readOnly}
    onChange={e => {setDraft(e.target.value); setDirty(!!e.target.value);}}/></label>;
}
const extensions = createShellExtensions({settingsPages:[
  {id:'host-notes', label:'宿主备注', order:50, component:Notes},
  {id:'about', mode:'replace', label:'宿主说明', render:ctx => <p>{ctx.project?.name}</p>},
  {id:'data', mode:'hide'},
]});
```

设置页追加不能占用内置 ID；replace/hide 只能指定内置 ID。内置 ID 见 contract 及 `builtinSettingsIds` 源定义。内置顺序为原索引乘 100，新增页缺省 order 1000；替换页缺省保留原位置。设置页不接受 when，启动时确定路由集合。

`SettingsContext` 额外提供 `setDirty(boolean)`。表单变化时立即报告，保存成功后报告 false；组件卸载自动清理。内置设置与扩展设置离开、项目切换、宿主主菜单、品牌、项目入口及历史导航都走同一保护；关闭浏览器仍使用 beforeunload 的浏览器标准提示。不要把未保存保护当成服务器保存成功证据。

## 主题与弹层

- 核心样式通过原生 CSS `@scope (.heyso-root)` 限定；独立 HTML 的 body margin 重置不出现在可复用模块。当前需要支持 CSS @scope 的现代浏览器；不提供旧浏览器 polyfill。
- 启动 `theme` 仅接受 accent/background/text/border/muted 的 `#RRGGBB`。对应公开 CSS 变量为 `--heyso-accent`、`--heyso-background`、`--heyso-text`、`--heyso-border`、`--heyso-muted`；通过注册配置设置，不依赖内部类名。
- 核心 Ant Design theme 使用 `inherit:false`，不会继承外层 ConfigProvider 的主题。宿主内容也应使用命名空间，避免针对核心根使用强制 `!important` 或高特异性全局规则。CSS 作用域不是针对恶意宿主代码的安全沙箱，也不保证抵抗任意宿主高优先级样式。
- `useOverlayContainer()` 返回实例内 `OverlayRoot` 的 getter。核心显式 portal 和 Ant popup 均进入该容器；宿主 Modal 用 `getContainer={container}`，自定义 portal 用 `createPortal(node, container())`。不要把弹层挂在 Header 或 document.body。
- 核心 Header z-index 为 20，实例 OverlayRoot 为 20000。Header 内注入组件不得创建超出此约定的 stacking context；不要给核心挂载祖先添加 transform/filter/contain:paint 或 overflow:hidden，避免 fixed 弹层被裁切。嵌套 Select/Popover 继承实例弹层容器；Modal/Drawer 由组件库负责焦点与 Escape。
- 1.0.0 是单文档全页应用：一次挂载拥有当前 URL/history、布局和弹层。一个文档不支持多个并列实例，也不承诺微前端局部容器内滚动布局。宿主可在独立路由挂载；可配置的外部导航同样走保护。

## 安全与兼容

只接受本地编译的 React 内容，无远程 URL、eval 或脚本下载配置。扩展自身是可信代码，仍必须调用服务端鉴权接口，不能根据 UI flags 判断授权。核心不通过协议传递账号令牌或服务端秘密。

存储适配器、项目数据格式、MCP schema 和领域动作未更改，**数据迁移：无**。默认入口从仪表盘改为项目线路是明确的界面行为变化；旧链接与原业务视图保留。历史 main.jsx 作为内部实现入口不再被宿主改写，迁移见 [migration.md](migration.md)。

### 默认控件的可读品牌色

默认主操作保持白字、同色边框和现有结构；底色统一为 `#c4471b`，悬停 `#ad3c16`，按下 `#92320f`，对应白字对比度约为 4.92、6.11、7.82。选中导航使用 `#b43c15` 文字与 `#fff0e9` 背景；聚焦轮廓使用主操作色。标志图形不作为按钮背景，保持原品牌图形。

宿主可从统一入口导入 `brandPalette`；需要在无 React 的工具或主题适配层读取时，纯模块 `src/theme-tokens.mjs` 也公开该不可变对象。不要向核心 `.primary` 追加全局覆盖。`theme.accent` 等原有显式配置继续保留；自定义色不自动得到默认方案的对比度保证，需由宿主验证。悬停/按下为该自定义色与黑色混合，不再退回默认橙色。

原默认 `#f5642e` 白字对比度约 3.11，更新后的默认样式有意改变该色值以改善正文按钮可读性；不是对所有页面或所有自定义主题的 WCAG 合规声明。数据、权限、存储及协议版本不变。

当前 Header 顺序为品牌 → `header.navigation` → `header.project-entry` → 右侧工具组（项目选择器及 `project.selector-actions` → `header.right`）。默认项目切换器紧邻帮助按钮左侧。选择器不再位于侧栏；原有扩展位 ID、参数、导航保护和模式保持兼容。核心搜索输入统一复用 `src/SearchField.jsx`，宿主无需覆盖核心搜索框的类名或样式。

默认品牌保留 Logo、HeySO 和合序文字，项目切换放在 Header 右上角的帮助入口左侧。切换控件在桌面及手机均固定为 120px，保留下拉箭头；选中项只显示项目名称，下拉选项显示项目名称及灰色的真实项目 ID（`project.id`，不是项目编号前缀 `code`），并支持按名称、编号前缀或 ID 搜索。`project.selector-actions` 是 120px 控件之外的独立操作区，不占用或压缩控件宽度。宿主可继续用 `header.brand` 自定义品牌内容。

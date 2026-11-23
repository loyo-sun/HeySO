# 动态模块加载失败恢复

## 问题及范围

截图显示 MarkdownView 哈希资源返回 `text/html`，动态 import 拒绝后没有错误边界，导致 React 根节点退出渲染。截图同时包含网络切换和休眠导致的 API 请求中断。公开仓库 Netlify 的全路径 SPA 回退可将缺失的旧版本资源改写为首页；这与截图中的 MIME 错误一致，但不能仅凭截图确定具体资源失效的原因。

本修复只修改公开 HeySO。未访问私有 SaaS 仓库、线上账号或数据，未执行 SaaS 部署。

## 行为

- 内容预览、编辑器、报告和路线图使用局部错误边界。预览失败时显示原始文本；编辑器加载失败保留隐藏表单值，避免把已有内容提交为空。
- 重试会重新创建 React.lazy 实例。不会自动重载整个文档，也不会清空外围表单。
- 浏览器可能缓存失败的 ESM URL；若重试仍失败，用户先保存其他编辑内容，再明确确认刷新。刷新保留当前 URL、工作项和详情页签。
- Netlify 缺失 `/assets/*` 返回 404，已存在资源按默认文件优先规则正常服务；其他路径继续 SPA 回退。静态响应要求重新验证缓存。本地生产服务同样对缺失资源返回 404。
- 不修改存储、数据格式、MCP 授权、扩展协议 1.0.0 或服务端业务权限，无数据迁移。

## 实际验证

```sh
npm test
npm run build
/tmp/heyso-shell-types/node_modules/.bin/tsc --strict --noEmit --jsx react --module esnext --moduleResolution bundler --target ES2022 --esModuleInterop --typeRoots /tmp/heyso-shell-types/node_modules/@types tests/app-shell-types.fixture.tsx
PORT=4194 HEYSO_DATA_DIR=/tmp/heyso-recovery-data node server/index.mjs
HEYSO_TEST_URL=http://127.0.0.1:4194 HEYSO_PLAYWRIGHT_MODULE=/tmp/heyso-ui-check/node_modules/playwright-core/index.mjs node tests/lazy-recovery-browser.mjs
HEYSO_TEST_URL=http://127.0.0.1:4194 HEYSO_PLAYWRIGHT_MODULE=/tmp/heyso-ui-check/node_modules/playwright-core/index.mjs HEYSO_SCREENSHOT_DIR=/tmp/heyso-recovery-shell node tests/app-shell-browser.mjs
git diff --check
```

结果：309 项单元/业务测试通过；公开扩展类型严格检查通过；Vite 独立版及宿主示例两入口构建通过（保留既有大分块体积提示）；原有应用外壳浏览器回归通过；diff 检查通过。

新增 Chromium 回归实际拦截生产构建的 MarkdownView 请求，分别返回 HTML 和网络失败，验证没有未捕获页面错误、工作区保留、原文可读、外围编辑保留、重试不跳转、取消刷新不跳转、确认刷新后恢复且保持深链接；另检查 390px 手机布局、三个其他懒加载模块的 404、本地资源 404 与深链接 200，以及可成功重试的瞬时 loader 拒绝和键盘操作。

截图：[桌面](lazy-module-recovery/desktop.png)、[手机](lazy-module-recovery/mobile.png)。只使用隔离本地示例数据。

## 限制及部署注意

本地浏览器验证覆盖生产构建和 Express 资源路由；Netlify 配置已检查，但尚未验证实际 CDN 发布后的行为。宿主应保留哈希资源或使用部署版本一致性机制，降低旧页面请求已删除分块的概率。恢复边界不修复网络本身，也不改变已有 API 断线重连逻辑。入口主脚本加载前的网络故障无法由 React 边界处理。

本次不自动刷新、不引入缓存清除或自动保存策略。宿主如果自行重写资源路径，需要同步遵守“资源缺失返回 404、不能返回 SPA 首页”的约定。

# HeySO alpha_0.1 部署指南

HeySO 支持本机运行，也可部署到 Netlify、Vercel 或 Cloudflare Workers。在线版包含页面、项目接口、备份恢复和远程 MCP；无需在自己的电脑上保持服务运行。

## 选择存储

| 平台 | 持久化方式 | 配置文件 |
| --- | --- | --- |
| Netlify | Upstash Redis REST，带租约和写入校验 | `netlify.toml` |
| Vercel | Upstash Redis REST，带租约和写入校验 | `vercel.json` |
| Cloudflare Workers | SQLite Durable Object，串行处理工作空间请求 | `wrangler.jsonc` |

在线版不在函数临时目录保存数据。每个部署实例对应一个私人工作空间，所有知道访问密码的人使用同一组项目；成员角色用于记录职责，不是独立登录账号或权限分组。

## 必填设置

| 设置 | 用途 |
| --- | --- |
| `HEYSO_PASSWORD` | 至少 16 位的访问密码，用于打开工作空间 |
| `HEYSO_MCP_TOKEN` | 至少 32 位的独立随机密钥，用于外部 AI 的 MCP 连接 |
| `UPSTASH_REDIS_REST_URL` | 仅 Netlify、Vercel：Upstash 数据库的 HTTPS REST 根地址 |
| `UPSTASH_REDIS_REST_TOKEN` | 仅 Netlify、Vercel：同一个数据库的 REST 读写密钥，不能使用只读密钥 |

访问密码和 MCP 密钥必须不同。请在托管平台的环境变量或 Secrets 中填写真实值，不要提交到 GitHub。未配置访问密码或 MCP 密钥时，项目接口会保持关闭，并在页面显示设置提示。

推荐使用 Node.js 22 或更新的受支持版本进行云端构建。

## Netlify

1. 如尚未创建存储，先在 [Upstash Console](https://console.upstash.com/) 创建 Redis 数据库，复制 REST URL 和 REST Token。
2. 点击 README 中的 **Deploy to Netlify**。
3. 连接自己的 GitHub 账号，确认创建的仓库与站点名称，填写上表的四项设置。
4. 保留仓库提供的构建配置：命令 `npm run build`，发布目录 `dist`，函数目录 `netlify/functions`。
5. 部署完成后打开站点，输入 `HEYSO_PASSWORD` 的值。

后续在 Netlify 控制台修改环境变量时，确保作用范围包含 Functions，并重新部署。`dist` 仅包含页面资源；函数入口由 `netlify.toml` 和函数中的路径配置自动部署。

## Vercel

1. 准备 Upstash Redis REST 配置。也可从 Vercel Marketplace 连接 Upstash。
2. 点击 README 中的 **Deploy with Vercel**，创建自己的仓库和项目。
3. 填写访问密码、MCP 密钥、Redis REST URL 和 Redis REST Token。
4. 保留 Vite 框架、`npm run build` 构建命令及 `dist` 输出目录，点击 Deploy。
5. 打开部署生成的网址并输入访问密码。

若集成提供的是 `KV_REST_API_URL` 和 `KV_REST_API_TOKEN`，应用也支持这两个别名。必须成对使用同一数据库的地址与密钥。

`api/heyso.mjs` 是统一函数入口，`vercel.json` 将 `/api/*` 和 `/mcp` 请求转入此函数；页面由静态托管提供。

## Cloudflare Workers

1. 点击 README 中的 **Deploy to Cloudflare** 并登录自己的 Cloudflare 账号。
2. 确认代码仓库和 Worker 名称。平台根据 `wrangler.jsonc` 创建 `HEYSO_WORKSPACE` Durable Object 绑定及 SQLite 存储。
3. 根据 `.dev.vars.example` 的提示填写自己的 `HEYSO_PASSWORD` 与 `HEYSO_MCP_TOKEN` Secrets。
4. 构建命令使用 `npm run build`，部署命令使用 `npm run deploy`。
5. 打开生成的 Worker 地址并输入访问密码。

Cloudflare 方案使用 **Workers + Static Assets + Durable Objects**，不使用 Pages 的纯静态上传。若你的部署界面没有提示填写 Secrets，可在 Worker 的 Settings → Variables and Secrets 中补齐后重新部署。

也可以在本机部署到自己的 Cloudflare 账号：

```sh
npm install
npm run build
npx wrangler login
npx wrangler secret put HEYSO_PASSWORD
npx wrangler secret put HEYSO_MCP_TOKEN
npm run deploy
```

本机预览时，复制 `.dev.vars.example` 为 `.dev.vars`，填写自己的测试密码和密钥，再运行 `npm run dev:cloudflare`。本地预览使用独立的模拟存储。

## 可选设置

| 设置 | 何时使用 |
| --- | --- |
| `HEYSO_PUBLIC_URL` | 需要固定公开网址或使用代理时，填写完整站点来源，例如 `https://heyso.example.com`；默认根据当前请求确定 |
| `HEYSO_STORAGE_KEY` | 仅 Redis：指定工作空间存储键；默认 `heyso:workspace:v1` |
| `HEYSO_CLOUD_URL` | 连接自己部署的 LoyoCloud；默认 `https://cloud.loyo.work` |

同一个 Redis 数据库供多个实例使用时，各实例应使用不同的 `HEYSO_STORAGE_KEY`，并在每次重新部署时保持该值不变。测试预览与正式环境应使用独立的数据库或存储键；修改存储键会打开另一个工作空间。

绑定自定义域名后，若设置了 `HEYSO_PUBLIC_URL`，也需要更新为新域名并重新部署。所有需要使用的页面与接口应通过同一个公开域名访问。

## 连接 AI

登录后进入「项目设置 → AI 与 MCP」，查看连接配置。在线连接地址为：

```text
https://你的域名/mcp
Authorization: Bearer <HEYSO_MCP_TOKEN>
```

MCP 使用官方 SDK 的无会话 Streamable HTTP JSON 响应模式，支持读取上下文、报告执行进展和提交成果。浏览器访问密码与 AI 密钥相互独立；AI 密钥不能打开工作空间页面或读取连接配置。

为工作项启用 AI 后再执行。是否要求人工验收由所绑定的工作流决定。若 Vercel、Netlify 或其他网关另外开启了站点访问保护，还需要允许 AI 客户端访问 `/mcp`，或配置该平台支持的保护绕过方式。

## 继续使用 LoyoCloud

在线版保留 LoyoCloud 登录、打开、转换、导入和导出项目功能。登录凭据、云端项目绑定和待确认操作会随工作空间持久保存，函数重启后仍可继续。

LoyoCloud 服务需要允许你的实际站点来源。出现“来源未授权”时，应在 LoyoCloud 服务配置中增加对应公开域名；部署 HeySO 本身不会修改 LoyoCloud 的来源白名单。

## 数据迁移、备份和更新

- 从本机迁移：先在本机导出工作空间 JSON，再登录在线实例，在项目设置的数据页面检查并恢复备份。
- 恢复会替换整个实例的工作空间；存在 LoyoCloud 绑定时，应使用独立实例恢复。
- 支持通过 `.heyso` 文件导入或导出单个项目；已有标识发生冲突时会阻止导入。
- 在线接口的单次 JSON 请求上限为 **4 MB**。较大的工作空间可以分项目导出迁移；托管平台与存储套餐也可能设置额外容量限制。
- 恢复或导入前，在线实例保留最多最近 3 份内部工作空间快照。日常备份请主动导出，内部快照不会替代外部备份。
- 更新自己仓库中的代码后，由托管平台重新构建部署。保留原来的存储绑定、数据库、密钥和存储键，即可继续使用原数据。
- 修改访问密码会让原有浏览器会话失效，新的会话有效期为 7 天。连续 10 次登录失败后，实例会暂停登录 10 分钟。更换 MCP 密钥后需要同步更新 AI 客户端配置。

## 检查部署

打开 `/api/health` 可查看版本和配置就绪状态，该接口不返回项目、密码或密钥。随后实际登录并完成以下检查：

1. 创建工作项，刷新页面后确认仍存在。
2. 重新部署后确认原项目仍可打开。
3. 检查备份导出和 MCP 连接；无需 AI 时可暂不配置客户端。

若页面提示存储配置错误，先核对 Redis REST 地址与读写权限。若提示“另一个请求正在保存”，稍后重试即可；异常终止请求留下的租约会自动过期。遇到版本冲突时刷新页面，再重新操作。

## 平台文档

- [Netlify 部署按钮与模板](https://docs.netlify.com/deploy/create-deploys/)
- [Netlify Functions 路径配置](https://docs.netlify.com/build/functions/configuration/)
- [Vercel 部署按钮参数](https://vercel.com/docs/deploy-button)
- [Vercel Functions API](https://vercel.com/docs/functions/functions-api-reference)
- [Cloudflare 部署按钮与资源创建](https://developers.cloudflare.com/workers/platform/deploy-buttons/)
- [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [Upstash Redis REST API](https://upstash.com/docs/redis/features/restapi)

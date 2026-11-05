# HeySO alpha_0.1 部署与首次配置

HeySO 将页面托管与项目数据存储分开。页面可以部署到 Netlify、Vercel、Cloudflare Workers，数据可以保存在 LoyoCloud、Upstash Redis、Cloudflare Durable Objects。三种托管平台均提供首次配置向导。

## 支持的组合

| 页面托管 | LoyoCloud | Upstash | Cloudflare |
| --- | --- | --- | --- |
| Netlify | 登录云账号 | REST 数据库连接 | 独立 Cloudflare 存储服务 |
| Vercel | 登录云账号 | REST 数据库连接 | 独立 Cloudflare 存储服务 |
| Cloudflare Workers | 登录云账号 | REST 数据库连接 | 自带存储或独立存储服务 |

选择 LoyoCloud 不依赖 Redis 或 Durable Objects。选择 Upstash 或 Cloudflare 时，工作空间数据持久保存，函数重启后仍然保留。

## 第一步：部署页面

使用 README 中对应平台的一键部署按钮。新部署只需要预先设置一个环境变量或 Secret：

| 名称 | 内容 |
| --- | --- |
| `HEYSO_SETUP_KEY` | 部署者自己生成的至少 32 位随机初始化密钥 |

这个密钥用于确认谁可以配置云端连接，并加密连接信息。保留好它，不要填写到 GitHub 文件或聊天消息中。更换该密钥后，原有连接 Cookie 和由向导签发的 MCP 连接令牌会失效，但云端项目不会删除。

- **Netlify**：保留构建命令 `npm run build`、发布目录 `dist`。函数路径由仓库配置自动处理。环境变量的作用范围需包含 Functions；修改后重新部署。
- **Vercel**：保留 Vite 框架、构建命令 `npm run build` 和输出目录 `dist`。部署按钮会要求填写初始化密钥。
- **Cloudflare Workers**：保留构建命令 `npm run build`、部署命令 `npm run deploy`。平台根据 `wrangler.jsonc` 创建 Durable Object 绑定，按 `.dev.vars.example` 提示设置初始化密钥。

Cloudflare 使用 Workers + Static Assets，不是 Pages 纯静态上传。若控制台没有提示填写 Secret，请在 Worker 的 Settings → Variables and Secrets 中添加 `HEYSO_SETUP_KEY`，然后重新部署。

推荐使用 Node.js 22 或更新的受支持版本进行云端构建。

## 第二步：完成首次配置向导

首次打开网址时，向导依次显示三个步骤：

1. **验证身份**：输入部署时设置的初始化密钥。
2. **连接云端存储**：选择存储服务，填写连接信息或登录账号，点击「检查连接」。检查通过后才可以继续，并显示已有项目数量。
3. **完成设置**：设置至少 16 位的工作空间访问密码，确认后进入工作空间。

配置只建立连接，不会清空或覆盖已有项目。向导失败时可修改信息后重试；未经连接检查或检查后修改了凭据，均不能完成配置。

工作空间顶栏的「云端存储」可重新打开向导。原连接在新配置完成前继续保留；切换存储不意味着迁移数据。

### 选择 LoyoCloud

1. 选择 LoyoCloud，默认地址为 `https://cloud.loyo.work`，也可填写自己部署的服务域名。
2. 点击「登录并授权 LoyoCloud」，在弹窗中完成云账号登录和 HeySO 授权。
3. 返回后检查连接，再完成访问密码设置。

项目直接以 `.heyso` 文件保存在云空间。已存在的项目会显示在工作空间中；新建项目、修改工作项等操作由 LoyoCloud 服务保存并校验版本。此模式无需 Upstash 数据库，也不会将项目写入 Cloudflare 存储。

新版 LoyoCloud 支持任意合法 HTTPS 自部署来源，无需逐个登记域名。登录时会明确展示当前站点地址，由用户确认授权；一次性连接码和后续凭据精确绑定该地址与 HeySO 应用。HTTP 仅支持 localhost/回环地址开发。若云服务仍报“连接来源或 PKCE 参数无效”，请升级 LoyoCloud 的自部署登录支持，不要关闭来源校验或改用通配名单。

此模式使用 LoyoCloud 的文件历史版本恢复项目，支持 `.heyso` 导入和导出；不支持用工作空间 JSON 一次替换整个云账号的数据。删除云项目请在 LoyoCloud 云空间中移至回收站。云账号登录失效时，重新通过向导授权即可。

### 选择 Upstash

1. 在 [Upstash Console](https://console.upstash.com/) 创建 Redis 数据库，或使用已有数据库。
2. 在向导中填写 HTTPS REST 根地址和 REST 读写密钥。只读密钥不能完成连接检查。
3. 如需连接已有工作空间，在高级设置中保持原存储标识。默认标识是 `heyso:workspace:v1`。
4. 检查连接并完成访问密码设置。

数据通过带租约及写入校验的事务适配器保存，防止不同函数实例互相覆盖。多个独立工作空间共用数据库时，应使用不同的存储标识。

如果部署环境已设置 `UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN`，向导可选择使用已有部署设置，无需将密钥显示在页面上。也兼容成对的 `KV_REST_API_URL`、`KV_REST_API_TOKEN`。

### 选择 Cloudflare

**页面也在 Cloudflare 上**：勾选「使用当前 Cloudflare 实例自带的存储」，检查连接即可。Durable Objects 的 SQLite 数据会在重新部署后保留。

**页面在 Netlify、Vercel，或想使用独立存储服务**：

1. 先使用 README 中的 Cloudflare 部署按钮创建一个 Cloudflare 实例，并设置至少 32 位的 `HEYSO_SETUP_KEY`。
2. 把该 Worker 的公开 HTTPS 根地址作为存储服务地址，例如 `https://heyso-storage.example.workers.dev`。
3. 默认存储连接密钥是该 Cloudflare 实例的 `HEYSO_SETUP_KEY`。也可在该实例中单独设置至少 32 位的 `HEYSO_STORAGE_TOKEN`，将存储访问与初始化权限分开。
4. 在 Netlify/Vercel 页面的向导中选择 Cloudflare，填写存储服务地址和上述存储连接密钥，然后检查连接。

存储服务提供 `/storage/v1` 接口，通过独立 Bearer 密钥验证请求，不依赖浏览器 Cookie。租约与持久化写入由 Durable Object 处理；其他托管平台不需要直接访问 Cloudflare 管理 API。

如果页面部署环境已设置 `HEYSO_CLOUDFLARE_URL` 和 `HEYSO_CLOUDFLARE_TOKEN`，向导也可选择使用这些已有连接信息。

## 连接设置如何保存

- 服务地址、必要的存储凭据和访问设置使用 AES-GCM 加密，保存在当前浏览器的 HttpOnly、SameSite Cookie 中；HTTPS 部署还会设置 Secure。
- 连接设置不是项目数据，不会放入 localStorage、`.heyso` 文件或工作空间导出中。
- 配置 Cookie 有效期为 30 天。换浏览器、清除 Cookie 或过期后，需要重新连接同一云端服务。项目数据始终由对应存储服务保留。
- 浏览器访问会话有效期为 7 天。退出工作空间后，再输入当前浏览器配置的访问密码即可进入。
- 初始化验证有效期为 15 分钟，连接检查结果有效期为 10 分钟。超时后重新验证或检查即可。
- 未设置初始化密钥时只显示设置说明，项目接口不会开放。访问公开网址不会自动获得部署者权限。

每个浏览器可以连接自己的云端工作空间。相同地址、凭据和存储标识对应同一份云端数据；浏览器中的访问密码不会创建不同数据库或成员权限。

## AI 与 MCP

登录后进入「项目设置 → AI 与 MCP → 查看连接配置」。

- **LoyoCloud**：使用 `https://你的云服务/mcp/heyso`，在支持 OAuth 的 AI 客户端中登录云账号，并选择允许访问的项目。无需复制网页访问密码或编辑器登录令牌。
- **Upstash / Cloudflare**：使用当前页面站点的 `/mcp` 地址。HeySO 签发加密的 MCP 连接令牌，外部 AI 无需依赖浏览器 Cookie 即可在函数冷启动后继续连接。令牌有效期为 30 天，可在界面重新获取。

MCP 令牌仅适用于 AI 接口，不能作为网页登录凭据。不要将它放入 GitHub 或公开链接。AI 执行进展与成果提交仍要求相应工作项启用 AI，并遵循人工验收规则。创建、编辑工作项无需启用 AI；LoyoCloud 需额外授予 `heyso:write` 权限，已有连接需重新授权并刷新工具列表。

若托管平台另外开启了整站访问保护，还需允许 AI 客户端访问 MCP 入口，或配置平台提供的保护绕过方式。

## 切换后端与数据迁移

切换云端连接不会自动复制或删除数据。

- Upstash 与 Cloudflare 工作空间之间可通过 JSON 备份迁移。
- 迁入 LoyoCloud 时，按项目导出 `.heyso`，再通过项目设置的导入入口上传到云空间；已有名称、编号或标识冲突时会阻止导入。
- LoyoCloud 可导出完整工作空间 JSON，供独立 Upstash/Cloudflare 实例恢复，也可逐项目导出 `.heyso`。
- 云端接口单次 JSON 请求上限为 4 MB。存储服务与托管套餐可能还有容量限制。
- Upstash/Cloudflare 在恢复、导入或绑定云项目前，保留最多最近 3 份内部快照。仍请定期主动导出备份。

如同一云账号包含业务标识相同的项目副本，请先在 LoyoCloud 中整理副本后再连接，避免混淆同一项目的不同文件。

## 旧版本与可选环境变量

已使用 `HEYSO_PASSWORD`、`HEYSO_MCP_TOKEN` 及存储配置的旧部署继续兼容原模式。要启用新向导，添加 `HEYSO_SETUP_KEY` 后重新部署，在向导中连接原数据库或当前 Cloudflare 存储；原数据不会清空。

`HEYSO_PUBLIC_URL` 可固定公开来源；设置后必须与实际访问域名一致。更换域名需要更新该值。Redis 的 `HEYSO_STORAGE_KEY` 可设置默认标识。`HEYSO_CLOUD_URL` 可指定附加 LoyoCloud 连接的默认服务。

## 本机预览与检查

普通本机版本继续使用 `npm start` 和 `.data/`，不要求配置向导。

Cloudflare 本机预览：复制 `.dev.vars.example` 为 `.dev.vars`，填写测试初始化密钥，运行 `npm run dev:cloudflare`。本机模拟存储与线上存储独立。

`/api/health` 返回版本和配置状态，不返回凭据或项目内容。上线后应登录并创建一个测试工作项，刷新和重新部署后确认仍保留，再检查备份和 MCP 连接。

## 平台文档

- [Netlify 部署与模板](https://docs.netlify.com/deploy/create-deploys/)
- [Vercel 部署按钮](https://vercel.com/docs/deploy-button)
- [Cloudflare 部署按钮与资源创建](https://developers.cloudflare.com/workers/platform/deploy-buttons/)
- [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [Upstash Redis REST API](https://upstash.com/docs/redis/features/restapi)

# HeySO 统一入口与部署配置

入口根据部署状态区分 LoyoCloud 账号和独立工作空间。运行本地服务时仍直接进入本地工作空间，云同步按需授权。切换入口不自动迁移项目，云项目仍按当前账号隔离。

## 部署参数

- `HEYSO_SETUP_KEY`：至少 32 位的部署加密密钥。仅管理员初始化独立工作空间时输入，普通云账号登录不需要。保留原值以兼容已加密的配置。
- `HEYSO_AUTH_MODES`：默认同时允许两种入口；设为 `loyocloud` 只开放云账号；设为 `workspace` 只开放独立工作空间。
- `HEYSO_CLOUD_URL`：由部署管理员指定的云服务地址，默认 `https://cloud.loyo.work`，普通用户不能更改授权服务地址。
- `HEYSO_DEPLOYMENT_CONFIG`：管理员向导生成的加密独立存储配置。无可用部署存储时，将其安装到服务端环境变量后重新部署；禁止使用 `VITE_` 前缀或提交真实值到仓库。

Cloudflare 实例自带存储、环境变量配置的 Upstash、环境变量配置的 Cloudflare 存储均可持久保存独立工作空间配置。Upstash 配置保存在独立的 `:deployment` 键。配置与访问密码加密保存；换浏览器只需输入工作空间密码。现有浏览器配置保留兼容，管理员需完成一次保存才能成为共享部署配置。存储或部署密钥变化时应重新检查连接。

LoyoCloud 会话通过现有 PKCE 连接与换码接口建立。无需再设置 HeySO 访问密码。授权过期回到登录页；退出云账号会撤销当前编辑器会话。已有旧版云连接自动按云账号验证，云端 Token 和存储密钥不会返回前端。

## LoyoCloud 自动跳转登录

默认兼容现有 LoyoCloud 弹窗授权。若要实现从云控制台打开后自动验证账号并进入项目，需要先安装本目录配套的 LoyoCloud 后端路由：

1. 将 `deploy/unified-login/overlay/src/heyso-login.mjs` 复制到 LoyoCloud 的 `src/heyso-login.mjs`。
2. 在 LoyoCloud 仓库执行 `git apply --check <HeySO路径>/deploy/unified-login/loyocloud.patch`，检查通过后执行 `git apply` 并部署 LoyoCloud。
3. 验证 `/api/v1/heyso/login-capabilities` 返回 `redirectLogin: true`。
4. 在 HeySO 部署中设置 `HEYSO_CLOUD_REDIRECT_LOGIN=true` 并重新部署。

开启后，独立打开 HeySO 点击登录即跳转云账号验证；从 LoyoCloud 控制台进入且浏览器提供云来源时自动启动验证。已有有效授权来源无需重复确认；新来源首次仍需授权。不提供来源的浏览器可通过同一登录按钮进入。回调仅携带一次性授权码与 state，地址固定为发起来源根路径，校验 PKCE 后恢复原项目路径并清除回调参数。不在 URL 中传递长期 Token。

这是后端配套升级，未安装后端路由前不要开启跳转登录。现有弹窗登录无需升级后端即可工作。此改动未引入组织/团队权限，也不改变项目归属模型。

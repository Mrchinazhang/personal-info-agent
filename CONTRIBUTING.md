# 参与贡献

欢迎提 Issue 和 PR。这是一个**无构建步骤**的纯静态项目，改完刷新页面就能看到效果。

## 本地跑起来

```bash
cp config.example.js config.js     # 填入自己在 WorkBuddy 云服务申请的四个参数
python -m http.server 8080
# 打开 http://127.0.0.1:8080
```

- **不要双击 `index.html`**：`file://` 下 OAuth 回调与 SDK 请求都会失败。
- 微信 / WorkBuddy OAuth 只能在**已发布的 HTTPS 域名**上验证，`localhost` 会被 Relay 拒绝——这是平台限制，不是 bug，别为此加 mock 兜底。
- 线上链接必须带 `?sharecode=...`，裸域名会返回「链接不完整」占位页。

## 提交前自查

- `node --check app.js`
- **不要**为了测试去发真实短信或跑真实 AI 请求（会消耗额度）；用浏览器 DevTools 或本地 mock SDK 验证交互即可
- **绝不提交 `config.js`**（已 gitignore，CI 也会拦截）
- 改过 CSS / JS 就把 `index.html` 里三个 `?v=YYYYMMDDx` 缓存版本号一起递增，否则线上会继续加载旧文件
- 新增登录方式前先确认平台 Provider 白名单：当前只有 `email` / `phone` / `wechat` / `workbuddy`。**不要加一个点了必然报错的按钮**；Provider 开关在管理页，代码改不了。同理不要加 ChatGPT / Google / GitHub 登录，也不要让用户填任何第三方 API Key
- **新增界面文案必须双语**：写 `t('中文原文')` 并在 `i18n.js` 的 `EN` 字典补英文。含 HTML 标签的字符串，英文值要保留完全相同的标签结构。用户数据（笔记 / 标题 / 标签 / AI 回答）一律不经过 `t()`
- 不要为 i18n 引入任何库或 CDN；项目要求断网也能独立打开
- 发新版递增 `?v=` 缓存版本号时，`i18n.js` 也要一起递增
- `node --check i18n.js` 也要过

## PR 约定

- 一个 PR 一件事，说明「改了什么 + 怎么验证的」
- 不引入框架、打包器或运行时 CDN 依赖（断网时页面仍要能独立打开）
- 渲染用户内容一律走 `esc()`，不新增未转义的 `innerHTML` 拼接
- UI 文案不要暴露「该账号是否已注册」这类信息

# 个人信息管家 Agent

把零散的想法、资料、待办丢进一个地方，交给 AI 帮你分类、串联、追问和总结。

一个纯前端（无构建步骤）的个人知识管理单页应用：记录 → 导入拆解 → 检索 → 问答 → 周期回顾，
登录、数据库和 AI 能力全部托管在 WorkBuddy Cloud 上，不需要自己写后端。

---

## 功能

| 视图 | 做什么 |
| --- | --- |
| **记录** | 随手写一条想法 / 资料 / 待办，AI 自动判类、打标签、写摘要 |
| **导入** | 粘贴长文、聊天记录或网页链接，AI 拆成多条结构化条目，勾选后批量入库 |
| **资料库** | 按分类（想法 / 资料 / 待办）、标签、关键词三重筛选，卡片式浏览 |
| **待办** | 只看待办条目，支持截止日期与优先级（高 / 中 / 低） |
| **问答** | 基于自己积累的记录提问，答案带引用来源，对话历史可回溯 |
| **总结** | 生成最近 7 / 30 / 90 天的周期回顾，沉淀成报告 |

几个实现细节：

- **AI 拆解**要求模型输出严格 JSON，前端做长度截断与字段校验，脏数据不会进库
- **导入去重**：拆解结果先预览、逐条勾选，确认后才写入云端
- **条目关联**：`item_links` 记录条目之间的引用关系，问答时一并召回
- 亮 / 暗双主题，深色下对比度单独调过

---

## 技术栈

- 原生 JavaScript（单文件 IIFE，无框架、无打包），HTML + CSS
- [WorkBuddy Cloud SDK](https://cdn.jsdelivr.net/npm/@tencent-ai/workbuddy-cloud-sdk) 提供：
  - 用户认证（手机号验证码 / 微信 OAuth）
  - 云端数据库（按用户隔离的行级权限）
  - 免密钥的大模型调用（流式输出）

没有 `package.json`，没有构建产物，改完刷新即生效。

---

## 目录结构

```
personal-info-agent/
├── index.html         # 页面骨架、登录视图、SDK 引入
├── app.js             # 全部业务逻辑（视图渲染 / 数据读写 / AI 调用）
├── styles.css         # 主题与组件样式
├── config.js          # 本机配置（含云资源参数，已 gitignore，不提交）
├── config.example.js  # 配置模板，提交到仓库
├── LICENSE
└── README.md
```

---

## 快速开始

### 1. 拿到配置

先在 WorkBuddy 云服务里为应用开通资源（数据库 + 认证 + 模型），拿到四个参数：
`resourceId`、`endpoint`、`oauthRelayBaseUrl`、`publishableKey`。

### 2. 填进配置

```bash
cp config.example.js config.js
```

然后编辑 `config.js`，把占位值换成自己的：

```js
window.PUBLIC_CONFIG = {
  resourceId: 'wbcs_xxxxxxxxxxxxxxxxxxxx',
  endpoint: 'https://your-app-id.app.workbuddy.host',
  oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
  publishableKey: 'wbpk_xxxxxxxxxxxxxxxxxxxx'
}
```

### 3. 起本地服务

**不要直接双击 `index.html`**（`file://` 协议下 OAuth 回调与 SDK 请求都会失败），用任意静态服务器：

```bash
python -m http.server 8080
# 或 npx serve .
```

打开 <http://127.0.0.1:8080>。

### 4. 登录

手机号验证码或微信扫码均可。**注意：不同登录方式等于不同账号，数据互不可见**（见下文「数据隔离」）。

---

## 配置字段说明

| 字段 | 含义 | 是否敏感 |
| --- | --- | --- |
| `resourceId` | 云资源唯一标识 | 半敏感（建议不公开） |
| `endpoint` | 应用访问域名 | 否 |
| `oauthRelayBaseUrl` | OAuth 中转地址，平台固定值 | 否 |
| `publishableKey` | 前端可公开密钥，权限受 RLS 约束 | 否（但建议不公开） |

> ⚠️ **只能放 publishable key**。服务端密钥（secret / service_role）放进前端等于把数据库交出去，
> 本项目全程不需要它——所有读写都走带用户身份的 SDK 调用。

`config.js` 已被 `.gitignore` 忽略，仓库里只有 `config.example.js`。
如果曾经把真实配置提交过，光删文件不够，还需要改写历史（`git filter-repo`）或直接轮换密钥。

---

## 云端数据结构

四张表，均由 SDK 按当前登录用户自动做行级隔离，前端不需要手写 `where user_id = ?`。

**`items`** — 条目主表

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid | 主键 |
| `title` | text | 标题，≤ 40 字 |
| `content` | text | 正文，≤ 1200 字 |
| `category` | text | `idea` / `material` / `todo` |
| `tags` | text[] | 2–4 个标签 |
| `summary` | text | 一句话摘要 |
| `key_points` | text[] | 1–4 条要点 |
| `is_todo` | bool | 是否待办 |
| `due_date` | date | 截止日期，可空 |
| `priority` | text | `high` / `medium` / `low` |
| `created_at` | timestamptz | 创建时间 |

**`item_links`** — 条目之间的关联（`from_id` → `to_id` + 关系说明）
**`chats`** — 问答历史（问题、答案、引用到的条目）
**`reports`** — 周期总结（`period_label`、覆盖天数、`item_count`、正文）

---

## 部署

使用 WorkBuddy Sites 发布，构建目录就是项目根目录（纯静态，无需 build 命令）。

发布后**务必保存带 `?sharecode=...` 的完整链接**：

```
https://<your-app-id>.app.workbuddy.host/?sharecode=XXXXXXXXXX
```

裸域名（不带 `sharecode`）会返回「链接不完整」的占位页，而不是应用本身——这是最常见的踩坑点。

---

## 数据隔离与隐私

- 所有数据存于云端，按**登录账号**隔离；换一个登录方式（手机号 ↔ 微信）就是另一个账号，看不到彼此的数据
- 本地不落库，浏览器只保留会话令牌
- AI 调用经平台中转，不在前端暴露模型密钥

### 会收集什么

| 数据 | 用途 | 存放位置 |
| --- | --- | --- |
| 手机号 | 仅用于接收登录验证码，作为账号标识 | 云端认证服务 |
| 你记录的条目 | 提供记录、检索、问答、总结功能 | 云端数据库，按账号隔离 |
| 导入的文本 | 交给模型拆解，只在请求期间传递 | 不落盘、不留存 |

不采集设备信息、不做行为追踪、无第三方统计脚本。需要注销账号或清除全部数据，删除云端用户即可（联系维护者或用云服务控制台）。

### 额度保护（防止短信验证码被刷）

应用的登录是开放注册，任何人拿到链接都能注册，短信会按条消耗资源点。`app.js` 顶部有一段 `GUARD` 配置，默认策略：

```js
var GUARD = {
  registerOpen: true,   // false = 只有 whitelist 里的号码能注册/登录
  whitelist: [],        // 例：['13800138000']
  smsPerPhone: 3,       // 同一手机号每天最多获取 3 次验证码
  smsPerDay: 30,        // 全站每天最多发 30 条（额度保险丝）
  regPerDevice: 3       // 同一浏览器每天最多新建 3 个账号
}
```

要**关闭开放注册**，只需把 `registerOpen` 改成 `false` 并填好 `whitelist`，不用改其它逻辑。

> 这是纯前端护栏，能挡住"链接被转发后被人反复点"的常见情况，但挡不住直接调接口的脚本。真正要锁死，需要把校验放到云函数里。

---

## 常见问题

**打开链接只看到「链接不完整」**
少了 `?sharecode=...`，用完整链接。

**登录页没有微信按钮**
说明打开的是占位页或旧版发布产物。核对完整链接；仍是旧版就重新发布一次。

**之前记录的东西不见了**
九成是登录方式变了（例如原先微信登录，这次用手机号），不是数据被删。换回原来的登录方式即可。

**AI 提问报错 / 一直转圈**
云资源里的模型未开通、额度用尽，或 `config.js` 的四个参数与实际资源不匹配。

**本地打开是白屏**
直接双击了 `index.html`。用 `http://127.0.0.1` 起服务访问。

---

## License

[MIT](./LICENSE) © 2026 Mrchinazhang

# 个人信息管家 Agent

[![static-check](https://github.com/Mrchinazhang/personal-info-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/Mrchinazhang/personal-info-agent/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![支持作者](https://img.shields.io/badge/%E7%88%B1%E5%8F%91%E7%94%B5-%E8%AF%B7%E6%88%91%E5%96%9D%E6%9D%AF%E5%92%96%E5%95%A1-946ce6)](https://ifdian.net/a/Mrchinazhang)

把零散的想法、资料、待办丢进一个地方，交给 AI 帮你分类、串联、追问和总结。

一个纯前端（无构建步骤）的个人知识管理单页应用：记录 → 导入拆解 → 检索 → 问答 → 周期回顾，
登录、数据库和 AI 能力全部托管在 WorkBuddy Cloud 上，不需要自己写后端。

**界面支持中英双语**：按浏览器语言自动选择（中文系统显示中文，其它语言显示英文），右上角可随时切换，英文界面悬停可见中文原文对照。AI 生成的摘要、问答与总结也会跟随当前界面语言。

> **English (short version)** — A no-build, single-page personal knowledge agent: capture scattered notes, import and split long text with AI, search, ask questions with citations, and generate periodic reviews. The UI is **bilingual (中文 / English)**, detected from your browser language and switchable at the top-right; AI answers follow the UI language. Auth, database and LLM calls are hosted by WorkBuddy Cloud. **Sign in with an email code** (Gmail / Outlook work, no phone number needed); ChatGPT / Google / GitHub accounts are *not* supported because the platform does not provide those identity providers — see the section below. Run locally with `cp config.example.js config.js`, fill in your own cloud config, then `python -m http.server 8080`. The rest of this README is in Chinese.

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
- **中英双语**：零依赖的 `i18n.js` + `i18n-dict.js`（中文原文作字典 key）；界面文案、错误提示、toast、title 提示与 AI 输出语言同步切换，英文界面悬停可见中文原文
- 亮 / 暗双主题，深色下对比度单独调过

---

## 技术栈

- 原生 JavaScript（单文件 IIFE，无框架、无打包），HTML + CSS
- [WorkBuddy Cloud SDK](https://cdn.jsdelivr.net/npm/@tencent-ai/workbuddy-cloud-sdk) 提供：
  - 用户认证（手机号 / 邮箱验证码、微信 OAuth、WorkBuddy 账号登录）
  - 云端数据库（按用户隔离的行级权限）
  - 免密钥的大模型调用（流式输出）

没有 `package.json`，没有构建产物，改完刷新即生效。

---

## 目录结构

```
personal-info-agent/
├── index.html              # 页面骨架、登录视图、SDK 引入、语言切换控件
├── app.js                  # 全部业务逻辑（视图渲染 / 数据读写 / AI 调用）
├── i18n-dict.js            # 英文字典（中文原文作 key，手工维护）
├── i18n.js                 # 零依赖双语层：语言检测与切换、静态 DOM 翻译
├── llm-guard.js            # 创建者额度熔断：包住 SDK 的 LLM 调用，app.js 零改动
├── styles.css              # 主题与组件样式
├── config.js               # 本机配置（已 gitignore，不提交）
├── config.example.js       # 配置模板，提交到仓库
├── tests/
│   ├── i18n.test.js        # 字典 / 静态文案 / 语言切换验收（17 项）
│   ├── render.test.js      # 端到端渲染：六个视图英文化、用户数据不变（9 项）
│   └── quota.test.js       # 额度熔断：超限不发请求、quota_ 熔断、usage 累计（22 项）
├── .github/
│   ├── workflows/ci.yml    # 语法 / 三套验收 / 凭证 / 登录页完整性静态检查
│   └── FUNDING.yml         # 赞助入口（需先开通 GitHub Sponsors）
├── CONTRIBUTING.md
├── SECURITY.md
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

登录页提供 5 种入口：

| 入口 | 说明 | 适用 |
| --- | --- | --- |
| 📱 中国大陆手机号 | 11 位号码 + 短信验证码 | 国内用户 |
| 📱 海外手机号 | 带 `+` 区号，如 `+14155550123` + 短信验证码 | 海外用户 |
| ✉️ 邮箱 | Gmail / Outlook 等任意邮箱 + 邮件验证码 | **没有国内手机号、也不用微信的海外用户最省事的方式** |
| 💬 微信 | 网站 OAuth（快捷登录 / 扫码） | 微信用户 |
| 🅦 WorkBuddy 账号 | 平台统一账号 OAuth | 已有 WorkBuddy 账号的用户 |

> **务必固定使用同一种方式登录。** 这些入口在云端是彼此独立的账号，数据不互通；换一种方式会看到空资料库，平台目前不提供账号合并。登录页已放醒目提示。

Provider 开关在 **WorkBuddy 管理页 → 认证** 中；代码里加按钮不会自动开通 Provider。若点击后提示「未打开 XX 登录」，去管理页把对应开关打开即可。邮箱若显示 `degraded`，是邮件投递配置未就绪，同页可查。

#### 关于 ChatGPT / Google / TikTok / GitHub 登录

**本项目没有、也不打算假装支持**这些一键登录，包括「用 GPT / ChatGPT 账号登录」。底层云平台的公开认证能力只有：邮箱验证码、手机号验证码（含密码方式）、微信授权、WorkBuddy 账号登录，对应 4 个 Provider（`email` / `phone` / `wechat` / `workbuddy`）。平台文档明确把 Google 授权流程标注为已退役（retired），ChatGPT / OpenAI、TikTok、GitHub 从未作为身份源提供。

OAuth 登录要求平台侧持有该厂商的应用凭证并登记回调域名白名单，前端写多少按钮都绕不过去。有两条**看起来可行但绝不能做**的捷径，这里一并写清楚：

| 伪方案 | 为什么不行 |
| --- | --- |
| 加一个 ChatGPT 图标按钮，点了提示「暂不支持」 | 假功能，骗用户也骗自己；平台能力不会因按钮出现而存在 |
| 让用户填 OpenAI API Key 当作「登录凭证」 | Key 是调用凭证不是身份；放进前端等于把密钥交给网页，既无账号体系也无法隔离数据，属于凭证泄露 |

同理，平台的**模型目录里也没有 GPT 系列**（当前提供的是混元 / GLM / Kimi / DeepSeek / MiniMax 等及 `Auto`），所以「底层换成 GPT 模型」同样不是前端能决定的事。

如果确实需要第三方账号登录，正确路径是**换一套支持 OAuth 扩展的后端**（如 Auth.js / Supabase Auth），或等平台开放对应 Provider。当前对海外用户最实用的替代是**邮箱验证码**：Gmail / Outlook 直接收码，不需要手机号，英文界面也会默认选中邮箱 Tab。登录页有一段低调说明主动讲清这个边界。

#### 语言切换

右上角 `EN` / `中文` 按钮随时切换，选择记在浏览器 `localStorage`（`pia_lang`），不上传、不影响登录账号。英文界面下，被翻译过的元素悬停会显示中文原文对照——想关掉可在控制台执行 `I18N.setZhHint(false)`。切换语言会重绘当前视图并同步 AI 输出语言；正在输入但尚未保存的草稿、以及已生成的回答 / 总结会自动保留，已保存的数据不变。

---

## 配置字段说明

| 字段 | 含义 | 是否敏感 |
| --- | --- | --- |
| `resourceId` | 云资源唯一标识 | 半敏感（建议不公开） |
| `endpoint` | 应用访问域名 | 否 |
| `oauthRelayBaseUrl` | OAuth 中转地址，平台固定值 | 否 |
| `publishableKey` | 前端可公开密钥，权限受 RLS 约束 | 否（但建议不公开） |
| `llmBudget` | 创建者额度上限与熔断开关，见下方专章 | 否 |

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

### 部署后检查清单（每次发新版都过一遍）

1. **用完整链接打开**，确认不是占位页。
2. **确认加载的是新版**：DevTools → Network 里 `app.js?v=...` / `styles.css?v=...` 的版本号应与 `index.html` 一致。改过 JS / CSS 必须同步递增 `?v=`，否则浏览器会继续用旧缓存。
3. **确认认证 Provider 已开启**：设置 → 数据管理 → 应用 → 认证，检查 `email`（不能是 `degraded`）、`phone`、`wechat`、`workbuddy`。**代码里加按钮不会自动开通 Provider**，开关只在管理页，属于平台侧配置。
4. **每种登录方式各试一次**：邮箱、手机号、微信、WorkBuddy 账号。OAuth 回调只接受已发布的 HTTPS 域名，`localhost` / `127.0.0.1` 必然失败，这是协议要求。
5. **确认账号隔离符合预期**：不同登录方式 = 不同账号，数据不互通（RLS 按 `auth.uid()` 隔离，平台不支持账号合并）。

> **排障提示（分享链接防盗链）**：用 `curl` 或脚本直接请求 `app.js` / `config.js` 会返回 403「链接不完整」占位页。这是平台要求先访问带 `sharecode` 的首页、由服务端种下 `__wb_rsc` cookie 后再放行子资源所致，**不是部署失败**。浏览器正常打开不受影响；写自动化检测时要带 cookie jar 与 Referer，先请求首页再取子资源。

---

## 数据隔离与隐私

- 所有数据存于云端，按**登录账号**隔离；手机号 / 邮箱 / 微信 / WorkBuddy 是四种独立身份，任意两种之间的数据都互不可见
- 同一个大陆手机号写成 `13800138000` 和 `+8613800138000` 在部分认证后端会被当成两个账号，所以登录表单会自动去掉手写的 `+86` 前缀，统一按 11 位交给 SDK 规范化
- 本地不落库，浏览器只保留会话令牌
- AI 调用经平台中转，不在前端暴露模型密钥

### 会收集什么

| 数据 | 用途 | 存放位置 |
| --- | --- | --- |
| 手机号 / 邮箱 | 仅用于接收登录验证码，作为账号标识 | 云端认证服务 |
| 你记录的条目 | 提供记录、检索、问答、总结功能 | 云端数据库，按账号隔离 |
| 导入的文本 | 交给模型拆解，只在请求期间传递 | 不落盘、不留存 |

不采集设备信息、不做行为追踪、无第三方统计脚本。需要注销账号或清除全部数据，删除云端用户即可（联系维护者或用云服务控制台）。

### 额度保护（防止验证码被刷）

应用的登录是开放注册，任何人拿到链接都能注册，验证码会按条消耗资源点。`app.js` 顶部有一段 `GUARD` 配置，默认策略（手机号与邮箱共用同一套额度，按通道分别计数）：

```js
var GUARD = {
  registerOpen: true,   // false = 只有 whitelist 里的账号能注册/登录
  whitelist: [],        // 可放手机号或邮箱，例：['13800138000', 'me@gmail.com']
  smsPerPhone: 3,       // 同一账号每天最多获取 3 次验证码
  smsPerDay: 30,        // 全站每天最多发 30 次（额度保险丝）
  regPerDevice: 3       // 同一浏览器每天最多新建 3 个账号
}
```

要**关闭开放注册**，只需把 `registerOpen` 改成 `false` 并填好 `whitelist`，不用改其它逻辑。

> 这是纯前端护栏，能挡住"链接被转发后被人反复点"的常见情况，但挡不住直接调接口的脚本。真正要锁死，需要把校验放到云函数里。

### LLM 创建者额度熔断（防止 AI 把额度刷光）

**先说清楚一个事实**：这个纯静态站点调用平台 LLM 时，扣的是**应用创建者**的额度，不是访客的。而平台 SDK 明确不暴露余额、总额度、账期、单价或每模型限流数字，所以**应用里查不到「我还剩多少额度」**，只能到 WorkBuddy 控制台查看账户用量。`models.list()` 里的 `credits` 只是展示信息，不是余额；`usage.credit` 是「本次调用消耗」，不是账单或剩余额度。

因此 `llm-guard.js` 采取的是**设上限 + 超限不发请求 + 出错自动熔断**，而不是「查余额」。它包住 `WorkBuddyCloud.createWorkBuddyCloud()` 返回的 `chat.completions.create()`，所以 `app.js` 一行都不用改，本地离线版 / 免费云版也无需加载它。

在 `config.js` 里配置（模板见 `config.example.js`）：

```js
llmBudget: {
  aiEnabled: true,         // false = 该部署所有访客的 AI 全部停用
  maxCallsPerDay: 20,      // 每浏览器每天最多发起多少次 AI 调用
  maxCallsTotal: 200,      // 每浏览器累计上限，跨天不清零
  maxCreditsPerDay: 0,     // >0 时按平台 usage.credit 累计熔断
  maxTokensPerDay: 0,      // >0 时按平台 usage.total_tokens 累计熔断
  stopOnQuotaError: true,  // 平台报 quota_ / 限流后自动熔断，直到手动 reset
  trackUsage: true         // 注入 stream_options.include_usage 记录真实消耗
}
```

`0` 表示该维度不设上限。护栏会注入 `stream_options: { include_usage: true }`，从最后一个 usage chunk 里累计本次真实的 `credit` / `total_tokens`；超限时请求**根本不会发出**，界面显示具体原因（中英双语）。

在浏览器控制台可以查看与重置：

```js
PIA_LLM_BUDGET.status()   // 今日/累计次数、credits、tokens、是否已熔断、当前预算
PIA_LLM_BUDGET.reset()    // 清空计数并解除熔断
```

**必须如实说明的边界**：计数存在浏览器 `localStorage`，是**按浏览器**的客户端闸门。它能挡正常使用、误触连点、以及平台额度耗尽后的持续重试，**挡不住有人拿 publishableKey 直接写脚本调接口**；它也不是平台级硬限。要真正「全局、立刻、对所有访客」止损，只有三条路：

1. 把 `config.js` 的 `aiEnabled` 改成 `false` 后重新发布 —— 线上 AI 对所有访客一次性停用，零消耗；
2. 下线线上站点或撤掉 AI 入口；
3. 改用 **本地离线版**（Flask + SQLite + 可选 Ollama，完全不联网、不扣任何额度）或 **免费云版**（Cloudflare Pages + Supabase + Workers AI，服务端按用户限流，同样不碰 WorkBuddy 额度）。

平台官方文档同样建议：对终端用户能触发的调用做 rate-limit，避免额度被一次刷完。本项目把这个建议落成了上面的默认预算。

---

## 国际化（i18n）

`i18n.js` + `i18n-dict.js` 是一个零依赖的小层，刻意**不引入 i18next 之类的库**：项目约定无构建、无运行时 CDN 依赖、断网也要能独立打开，为此多背一个外部库不划算（供应链面、体积、维护都变差）。这里需要的本质只是一张 map。

| 设计点 | 做法 |
| --- | --- |
| 字典 | `i18n-dict.js` 导出 `window.I18N_EN`，**中文原文作 key**；中文模式直接返回原文，零开销、无 key 命名负担 |
| 翻译函数 | `app.js` 里 UI 文案写 `tr('中文原文')`（`tr` 是 `I18N.t` 的别名，避开源码里已有的局部变量 `t`）；`i18n.js` 只管语言状态与静态 DOM |
| 用户数据 | 只有 UI 文案字符串会走 `tr()`；笔记、标题、标签、AI 回答都是变量，**永不经过翻译函数**，渲染仍统一走 `esc()` |
| 静态文案 | `index.html` 的 `[data-i18n-static]` 区域按「整段 trim 后精确匹配」扫描文本节点与 `placeholder` / `aria-label` / `title`；原文存进内存 `WeakMap`，切回中文可完整还原，且不扫描 `#main` |
| 语言记忆 | 浏览器语言自动判定 → `localStorage`（`pia_lang`），不写进云端、不随账号走 |
| 中文对照 | 英文模式下给翻译过的文本节点所在元素加 `title` 显示中文原文（元素自带 `title` 时改为翻译该提示，不另加对照）；`I18N.setZhHint(false)` 可关 |
| AI 输出 | 内部指令随界面切换，`sys()` 在英文模式追加 `Respond in English.`；JSON 字段名与枚举值（`idea\|material\|todo`、`high\|medium\|low\|null`）始终不翻译 |
| 切换安全 | 重绘 `#main` 前后快照/还原未提交的输入与已生成的结果（`render(true)`），切语言不丢草稿 |

**加新文案**：在 `app.js` 写 `tr('新的中文文案')`，再往 `i18n-dict.js` 补一条英文。三条硬约束，CI 会拦：

1. 含 HTML 标签的字符串，英文值必须保留**完全相同的标签顺序**（`'<h2>共 '` → `'<h2>Total '`），且不能把未转义的 `"` 塞进属性；
2. 英文值里不能残留汉字或中文标点（杜绝「`items记录`」这类半翻译）；
3. 用户数据绝不能进 `tr()`。

本地验证：`node tests/i18n.test.js && node tests/render.test.js`（Node 原生，零依赖、不发网络请求）。

新增语言（如日语）只需再加一张字典并扩展 `setLang`，不用改业务代码。

---

## 常见问题

**打开链接只看到「链接不完整」**
少了 `?sharecode=...`，用完整链接。

**用脚本 / 命令行抓到的不是应用内容**
分享链接有防盗链：必须先访问带 `sharecode` 的首页拿到会话 cookie，之后的子资源请求才会放行。直接 `curl` 某个 `.js` 会被 403 挡回占位页；浏览器正常打开不受影响。

**能用 ChatGPT / Google 账号登录吗**
不能，平台没有这些 Provider，模型目录里也没有 GPT 系列。详见上文「关于 ChatGPT / Google / TikTok / GitHub 登录」。请用邮箱验证码（Gmail / Outlook 均可）。

**英文界面下还能看中文吗 / 怎么切回去**
英文界面下把鼠标悬停在文案上会显示中文原文；点右上角「中文」即可完整切回。语言选择只存在本机浏览器，不影响账号和数据。

**登录页没有微信 / WorkBuddy 按钮**
说明打开的是占位页或旧版发布产物。核对完整链接；仍是旧版就重新发布一次（`index.html` 里 CSS/JS 都带 `?v=` 缓存版本号，发新版时记得同步递增）。

**之前记录的东西不见了**
九成是登录方式变了（例如原先微信登录，这次换成邮箱），不是数据被删。换回原来的登录方式即可。也检查是不是给大陆号加了 `+86` 前缀写成另一种格式。

**海外手机号 / 邮箱收不到验证码**
先确认管理页里 `phone` / `email` Provider 是 `enabled`，邮箱不是 `degraded`；其次检查垃圾邮件箱。海外号码必须带 `+` 区号且不要在中间加括号。其余送达问题在平台侧，应用代码看不到。

**点「使用 WorkBuddy 登录」提示未打开**
管理页 → 认证 → WorkBuddy 登录开关未开启。这是平台侧配置，改代码无效。

**我的额度还剩多少？能不能限制住？**
应用里查不到——平台 SDK 不暴露余额 / 总额度 / 账期 / 单价，请到 WorkBuddy 控制台看账户用量。应用能做的是设上限：`config.js` 的 `llmBudget` 控制每个浏览器每天与累计的调用次数、credits、tokens，超限直接不发请求，平台回 `quota_` 会自动熔断。要看消耗与重置，在控制台执行 `PIA_LLM_BUDGET.status()` / `PIA_LLM_BUDGET.reset()`。**这是按浏览器的客户端闸门，不是平台级硬限**；想对所有访客一刀切停用，把 `aiEnabled` 改成 `false` 重新发布，或直接用本地离线版。详见上方「LLM 创建者额度熔断」。

**提示「线上版 AI 已停用」或「今日 AI 调用次数已达上限」**
这是额度护栏在正常工作，不是故障。前者说明部署方主动关掉了线上 AI；后者是当日预算用完，明天自动恢复。想继续用完整 AI 能力且不消耗任何额度，请改用本地离线版。

**AI 提问报错 / 一直转圈**
云资源里的模型未开通、额度用尽，或 `config.js` 的四个参数与实际资源不匹配。若提示「平台额度已用尽，AI 调用已自动停止」，说明护栏已熔断，按上面两条处理。

**本地打开是白屏**
直接双击了 `index.html`。用 `http://127.0.0.1` 起服务访问。

---

## 参与贡献 / 安全

- 本地开发、PR 约定见 [CONTRIBUTING.md](./CONTRIBUTING.md)
- 漏洞报告与安全边界见 [SECURITY.md](./SECURITY.md)
- 每次 push 会在 GitHub Actions 跑：7 个 JS 文件的语法检查、三套零依赖验收 —— `node tests/i18n.test.js`（字典无中文残留、HTML 标签结构一致、静态文案全覆盖）、`node tests/render.test.js`（六个视图英文化渲染、用户数据不被翻译、切语言不丢草稿）、`node tests/quota.test.js`（额度超限不发请求、`quota_` 自动熔断、usage 累计、跨天计数、双语提示）；外加 `config.js` 未入库、无硬编码凭证、登录页元素与绑定完整

## 支持这个项目

如果这个项目帮你省了时间，欢迎在 **[爱发电](https://ifdian.net/a/Mrchinazhang)** 请我喝杯咖啡。

不想花钱也完全没关系——点个 ⭐、提个 issue、把链接分享给需要的人，同样是支持。

## License

[MIT](./LICENSE) © 2026 Mrchinazhang

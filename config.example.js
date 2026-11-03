/**
 * 应用配置模板
 * ------------------------------------------------------------------
 * 使用方法：
 *   1. 复制本文件为 config.js（cp config.example.js config.js）
 *   2. 把下面四个值替换成你自己云服务的参数
 *   3. config.js 已在 .gitignore 中，不会被提交，也不会泄露你的资源
 *
 * 这四个值来自 WorkBuddy 云服务开通后下发的 publicConfig，
 * 本身不含任何服务端密钥（不要在这里放 secret / service_role key）。
 */
window.PUBLIC_CONFIG = {
  // 云资源 ID，形如 wbcs_xxxxxxxxxxxxxxxxxxxx
  resourceId: 'wbcs_REPLACE_WITH_YOUR_RESOURCE_ID',

  // 应用访问域名，形如 https://your-app-xxxxx.app.workbuddy.host
  endpoint: 'https://your-app-id.app.workbuddy.host',

  // OAuth 中转地址，平台固定值，一般不需要改
  oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',

  // 前端可公开密钥，形如 wbpk_xxxxxxxxxxxxxxxxxxxx
  publishableKey: 'wbpk_REPLACE_WITH_YOUR_PUBLISHABLE_KEY'
}

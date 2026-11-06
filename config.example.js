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
  publishableKey: 'wbpk_REPLACE_WITH_YOUR_PUBLISHABLE_KEY',

  // ------------------------------------------------------------------
  // 创建者额度熔断（可选，由 llm-guard.js 读取，删掉则用内置默认值）
  // 纯静态站点调用平台 LLM 扣的是「创建者」额度，且 SDK 不暴露余额，
  // 所以务必给公开分享的部署设上限。0 = 该维度不限。
  // 注意：计数按浏览器 localStorage，能挡正常使用与误触，挡不住有人
  // 直接拿 publishableKey 写脚本。要全局停用线上 AI，把 aiEnabled 设 false。
  // ------------------------------------------------------------------
  llmBudget: {
    aiEnabled: true,         // false = 该部署所有访客的 AI 全部停用
    maxCallsPerDay: 20,      // 每浏览器每天最多发起多少次 AI 调用
    maxCallsTotal: 200,      // 每浏览器累计上限，跨天不清零
    maxCreditsPerDay: 0,     // >0 时按平台 usage.credit 累计熔断
    maxTokensPerDay: 0,      // >0 时按平台 usage.total_tokens 累计熔断
    stopOnQuotaError: true,  // 平台报 quota_ / 限流后自动熔断，直到手动 reset
    trackUsage: true         // 注入 stream_options.include_usage 记录真实消耗
  }
}

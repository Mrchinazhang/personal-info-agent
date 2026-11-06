/**
 * llm-guard.js —— 创建者额度熔断（只有 WorkBuddy 云端版加载）
 * ------------------------------------------------------------------
 * 背景：纯静态站点调用平台 LLM 时，扣的是「应用创建者」的额度，而不是访客的。
 *       平台 SDK 明确不暴露余额 / 总额度 / 账期 / 单价，所以前端查不到「还剩多少」，
 *       只能在自己的调用入口做预算：按次数、按本次真实 usage 累计，超了就不再发请求。
 *
 * 做法：包住 WorkBuddyCloud.createWorkBuddyCloud() 返回的
 *       client.llm.chat.completions.create()，因此 app.js 一行都不用改。
 *       - 超限直接 reject，请求根本不会发出，界面会显示具体原因
 *       - stream_options.include_usage = true，拿到本次真实 credit / token 消耗
 *       - 平台回 quota_ 时自动「熔断」，后续所有调用一律拦下，直到手动 reset
 *
 * 边界（务必如实告知用户）：这是「按浏览器 localStorage 计数」的客户端闸门，
 *       能挡正常使用、误触连点、以及平台额度耗尽后的持续重试；
 *       挡不住有人拿 publishableKey 直接写脚本调接口。
 *       真正的全局硬闸只有两条：把 config.js 的 aiEnabled 改成 false 后重新发布，
 *       或者下线线上 AI 能力、改用本地离线版。
 *
 * 配置：window.PUBLIC_CONFIG.llmBudget，字段见 config.example.js。
 *       0 表示该维度不设上限。未配置时使用下面的保守默认值。
 */
(function () {
  'use strict'

  var global = window
  var tr = (global.I18N && global.I18N.t) || function (s) { return s }
  var CFG = global.PUBLIC_CONFIG || {}
  var STORE_KEY = 'pia_llm_budget_v1'

  var DEFAULTS = {
    aiEnabled: true,        // false = 该部署全局停用 AI（最硬的止损开关）
    maxCallsPerDay: 20,     // 每个浏览器每天最多发起多少次 AI 调用
    maxCallsTotal: 200,     // 每个浏览器累计上限（跨天不清零）
    maxCreditsPerDay: 0,    // 0 = 不按 credits 限；>0 时按平台 usage.credit 累计
    maxTokensPerDay: 0,     // 0 = 不按 tokens 限
    stopOnQuotaError: true, // 平台报 quota_ / 限流后自动熔断
    trackUsage: true        // 注入 include_usage，记录本次真实消耗
  }

  function num(v, d) {
    var n = Number(v)
    return (typeof v !== 'undefined' && v !== null && isFinite(n) && n >= 0) ? n : d
  }

  function budget() {
    var q = CFG.llmBudget || {}
    return {
      aiEnabled: q.aiEnabled !== false,
      maxCallsPerDay: Math.floor(num(q.maxCallsPerDay, DEFAULTS.maxCallsPerDay)),
      maxCallsTotal: Math.floor(num(q.maxCallsTotal, DEFAULTS.maxCallsTotal)),
      maxCreditsPerDay: num(q.maxCreditsPerDay, DEFAULTS.maxCreditsPerDay),
      maxTokensPerDay: num(q.maxTokensPerDay, DEFAULTS.maxTokensPerDay),
      stopOnQuotaError: q.stopOnQuotaError !== false,
      trackUsage: q.trackUsage !== false
    }
  }

  function dayKey() {
    var d = new Date(), p = function (n) { return n < 10 ? '0' + n : '' + n }
    return String(d.getFullYear()) + p(d.getMonth() + 1) + p(d.getDate())
  }

  function blank() {
    return {
      day: dayKey(), callsDay: 0, callsTotal: 0,
      creditsDay: 0, tokensDay: 0,
      tripped: false, tripReason: ''
    }
  }

  function readRaw() {
    try {
      var s = JSON.parse(global.localStorage.getItem(STORE_KEY) || 'null')
      return (s && typeof s === 'object') ? s : blank()
    } catch (e) { return blank() }
  }

  function save(s) {
    try { global.localStorage.setItem(STORE_KEY, JSON.stringify(s)) } catch (e) {}
  }

  // 跨天只重置「当日」计数；累计次数与熔断标记保留，避免靠改日期绕开总闸
  function load() {
    var s = readRaw()
    if (s.day !== dayKey()) {
      s.day = dayKey()
      s.callsDay = 0
      s.creditsDay = 0
      s.tokensDay = 0
      save(s)
    }
    return s
  }

  function fill(tpl, n) {
    return String(tr(tpl)).replace('%s', String(n))
  }

  // 返回 { code, text } 表示拦截，返回 null 表示放行
  function check(s, b) {
    if (!b.aiEnabled) {
      return { code: 'local_budget_off', text: tr('线上版 AI 已停用，请改用本地离线版') }
    }
    if (s.tripped) {
      return {
        code: 'local_budget_tripped',
        text: tr('平台额度已用尽或触发限流，AI 调用已自动停止；请在浏览器控制台执行 PIA_LLM_BUDGET.reset() 后重试')
      }
    }
    if (b.maxCallsPerDay > 0 && s.callsDay >= b.maxCallsPerDay) {
      return { code: 'local_budget_daily', text: fill('今日 AI 调用次数已达上限（%s 次），请明天再试或改用本地离线版', b.maxCallsPerDay) }
    }
    if (b.maxCallsTotal > 0 && s.callsTotal >= b.maxCallsTotal) {
      return { code: 'local_budget_total', text: fill('累计 AI 调用次数已达上限（%s 次），已自动终止', b.maxCallsTotal) }
    }
    if (b.maxCreditsPerDay > 0 && s.creditsDay >= b.maxCreditsPerDay) {
      return { code: 'local_budget_credits', text: fill('今日 AI 额度消耗已达上限（%s credits），已自动终止', Math.round(s.creditsDay * 100) / 100) }
    }
    if (b.maxTokensPerDay > 0 && s.tokensDay >= b.maxTokensPerDay) {
      return { code: 'local_budget_tokens', text: fill('今日 AI token 消耗已达上限（%s），已自动终止', Math.round(s.tokensDay)) }
    }
    return null
  }

  // code 故意不以 auth_/quota_/gateway_/model_/request_/internal_ 开头，
  // 这样 app.js 的 llmErrorText() 会原样显示上面的具体原因，而不是笼统的「稍后再试」。
  function budgetError(blocked) {
    var e = new Error(blocked.text)
    e.error = { code: blocked.code, message: blocked.text }
    return e
  }

  function isQuotaError(e) {
    var code = String((e && e.error && e.error.code) || (e && e.code) || '')
    var msg = String((e && e.message) || '')
    return code.indexOf('quota_') === 0 || /quota|rate.?limit|额度/i.test(msg)
  }

  function trip(s, reason) {
    s.tripped = true
    s.tripReason = String(reason || 'quota_').slice(0, 80)
    save(s)
  }

  function applyUsage(s, chunk) {
    var u = chunk && chunk.usage
    if (!u || typeof u !== 'object') return
    var c = Number(u.credit)
    if (isFinite(c) && c > 0) s.creditsDay += c
    var t = Number(u.total_tokens)
    if (!isFinite(t) || t <= 0) t = Number(u.prompt_tokens || 0) + Number(u.completion_tokens || 0)
    if (isFinite(t) && t > 0) s.tokensDay += t
    save(s)
  }

  async function* tracked(stream, s, b) {
    try {
      for await (var chunk of stream) {
        applyUsage(s, chunk)
        yield chunk
      }
    } catch (e) {
      if (b.stopOnQuotaError && isQuotaError(e)) trip(s, 'quota_stream')
      throw e
    }
  }

  function status() {
    var s = load(), b = budget()
    return {
      day: s.day,
      callsDay: s.callsDay,
      callsTotal: s.callsTotal,
      creditsDay: Math.round(s.creditsDay * 100) / 100,
      tokensDay: Math.round(s.tokensDay),
      tripped: !!s.tripped,
      tripReason: s.tripReason || '',
      budget: b,
      blocked: check(s, b)
    }
  }

  function reset() {
    save(blank())
    return status()
  }

  global.PIA_LLM_BUDGET = { status: status, reset: reset, trip: function (r) { var s = load(); trip(s, r); return status() } }

  var SDK = global.WorkBuddyCloud
  if (!SDK || typeof SDK.createWorkBuddyCloud !== 'function') return
  var original = SDK.createWorkBuddyCloud

  SDK.createWorkBuddyCloud = function (cfg) {
    var client = original.call(SDK, cfg)
    try {
      var completions = client && client.llm && client.llm.chat && client.llm.chat.completions
      if (!completions || typeof completions.create !== 'function') return client
      var origCreate = completions.create

      completions.create = function (payload) {
        var b = budget()
        var s = load()
        var blocked = check(s, b)
        if (blocked) return Promise.reject(budgetError(blocked))

        s.callsDay += 1
        s.callsTotal += 1
        save(s)

        var p = payload || {}
        if (b.trackUsage && p.stream !== false) {
          p.stream_options = Object.assign({}, p.stream_options || {}, { include_usage: true })
        }

        return Promise.resolve()
          .then(function () { return origCreate.call(completions, p) })
          .then(function (stream) {
            if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') return stream
            return tracked(stream, s, b)
          }, function (e) {
            if (b.stopOnQuotaError && isQuotaError(e)) trip(s, 'quota_create')
            throw e
          })
      }
    } catch (e) {
      // SDK 结构变化时不阻断登录与普通功能，只是失去额度追踪
      try { console.warn('[llm-guard] unable to wrap completions.create:', e) } catch (ignored) {}
    }
    return client
  }
})()

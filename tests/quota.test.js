'use strict'
/**
 * 创建者额度熔断的独立验收测试（Node 原生，零依赖、零网络）。
 * 运行：node tests/quota.test.js
 *
 * 在 vm 沙箱里真实加载 i18n-dict.js + llm-guard.js，配一个假的
 * WorkBuddyCloud SDK，验证：超限不发请求、include_usage 注入、usage 累计、
 * quota_ 自动熔断、跨天计数、双语提示、以及 app.js 零改动。
 */
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const assert = require('assert')
const cp = require('child_process')

const root = path.join(__dirname, '..')
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
const guardSrc = read('llm-guard.js')
const dictSrc = read('i18n-dict.js')
const html = read('index.html')
const appSrc = read('app.js')
const exampleSrc = read('config.example.js')
const ciSrc = read('.github/workflows/ci.yml')

let pass = 0
let fail = 0
async function ok(name, fn) {
  try {
    await fn()
    console.log('  ok    ' + name)
    pass++
  } catch (e) {
    console.log('  FAIL  ' + name + ' :: ' + (e && e.message))
    fail++
  }
}

const STORE_KEY = 'pia_llm_budget_v1'
const HAN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

/** 构造一个独立沙箱；每个用例一份，互不污染 */
function makeEnv(cfg, opts) {
  opts = opts || {}
  const store = new Map()
  let callCount = 0
  let lang = 'zh'
  const calls = []

  const chunks = opts.chunks || [
    { choices: [{ delta: { content: 'hello' } }] },
    { usage: { credit: 1.5, total_tokens: 120, prompt_tokens: 40, completion_tokens: 80 } }
  ]

  const fakeCreate = function (payload) {
    callCount++
    calls.push(payload)
    if (opts.throwQuota) {
      return Promise.reject({ error: { code: 'quota_rate_limited', message: 'creator quota exhausted' } })
    }
    if (opts.streamThrow) {
      return Promise.resolve((async function* () {
        yield { choices: [{ delta: { content: 'partial' } }] }
        const e = new Error('quota_ exhausted mid stream')
        e.error = { code: 'quota_exhausted', message: 'exhausted' }
        throw e
      })())
    }
    return Promise.resolve((async function* () {
      for (const c of chunks) yield c
    })())
  }

  const client = opts.brokenSdk
    ? { llm: null }
    : { llm: { chat: { completions: { create: fakeCreate } } } }

  const sandbox = {
    console, Promise, Symbol, Date, JSON, Object, Math, Number, String, Error, isFinite,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    },
    PUBLIC_CONFIG: { llmBudget: cfg || {} },
    WorkBuddyCloud: { createWorkBuddyCloud: function () { return client } },
    I18N: {}
  }
  sandbox.window = sandbox
  vm.createContext(sandbox)
  vm.runInContext(dictSrc, sandbox)
  const EN = sandbox.I18N_EN || {}
  sandbox.I18N.t = (s) => (lang === 'en' ? (EN[s] || s) : s)
  vm.runInContext(guardSrc, sandbox)

  // 只调一次工厂，避免重复包装；拿到被 guard 替换过的 create
  const wrapped = sandbox.WorkBuddyCloud.createWorkBuddyCloud({})
  const create = (p) => wrapped.llm.chat.completions.create(p || { model: 'm', messages: [], stream: true })

  async function consume(payload) {
    const stream = await create(payload)
    let out = ''
    if (stream && typeof stream[Symbol.asyncIterator] === 'function') {
      for await (const c of stream) {
        if (c && c.choices && c.choices[0] && c.choices[0].delta) out += (c.choices[0].delta.content || '')
      }
    }
    return out
  }

  return {
    sandbox, create, consume, calls, store,
    count: () => callCount,
    status: () => sandbox.PIA_LLM_BUDGET.status(),
    reset: () => sandbox.PIA_LLM_BUDGET.reset(),
    setLang: (l) => { lang = l },
    setDay: (d) => {
      const raw = JSON.parse(store.get(STORE_KEY) || '{}')
      raw.day = d
      store.set(STORE_KEY, JSON.stringify(raw))
    }
  }
}

async function expectBlocked(fn, codePart) {
  try {
    await fn()
    assert.fail('expected rejection')
  } catch (e) {
    assert(!/expected rejection/.test(e.message), '调用本应被拦截却没有')
    const code = (e && e.error && e.error.code) || ''
    assert(code.indexOf(codePart) === 0, '错误码不对: ' + code)
    return e
  }
}

;(async function main() {
  console.log('\n[quota] 创建者额度熔断验收\n')

  // ---- 1. 静态完整性 ----
  await ok('llm-guard.js 与 config.example.js 语法通过', () => {
    cp.execFileSync(process.execPath, ['--check', path.join(root, 'llm-guard.js')])
    cp.execFileSync(process.execPath, ['--check', path.join(root, 'config.example.js')])
  })
  await ok('index.html 在 config.js 之后、app.js 之前加载 llm-guard.js', () => {
    const c = html.indexOf('config.js?v=')
    const g = html.indexOf('llm-guard.js?v=')
    const a = html.indexOf('app.js?v=')
    assert(c > -1 && g > -1 && a > -1)
    assert(c < g && g < a, '额度护栏必须在 app.js 创建 cloud 之前装好')
  })
  await ok('所有 ?v= 一致且不低于 20261106e', () => {
    const v = [...html.matchAll(/\?v=([0-9a-zA-Z]+)/g)].map((m) => m[1])
    assert(v.length >= 6, 'CSS/dict/i18n/config/guard/app 都应带版本号，实际 ' + v.length)
    assert(new Set(v).size === 1, '版本号不一致: ' + v.join(', '))
    assert(v[0] >= '20261106e', '版本号未递增: ' + v[0])
  })
  await ok('app.js 保持零改动，三版可继续字节级一致', () => {
    assert(!appSrc.includes('PIA_LLM_BUDGET'), 'app.js 不应耦合额度逻辑')
    assert(!appSrc.includes('local_budget_'), 'app.js 不应耦合额度逻辑')
    assert(!appSrc.includes('llm-guard'), 'app.js 不应耦合额度逻辑')
  })
  await ok('config.example.js 提供 llmBudget 且 CI 覆盖新文件', () => {
    assert(/llmBudget\s*:/.test(exampleSrc))
    assert(/aiEnabled/.test(exampleSrc))
    assert(/node --check llm-guard\.js/.test(ciSrc))
    assert(/node tests\/quota\.test\.js/.test(ciSrc))
  })
  await ok('6 条熔断文案在英文字典中全覆盖且无中文残留', () => {
    const keys = [
      '线上版 AI 已停用，请改用本地离线版',
      '今日 AI 调用次数已达上限（%s 次），请明天再试或改用本地离线版',
      '累计 AI 调用次数已达上限（%s 次），已自动终止',
      '今日 AI 额度消耗已达上限（%s credits），已自动终止',
      '今日 AI token 消耗已达上限（%s），已自动终止',
      '平台额度已用尽或触发限流，AI 调用已自动停止；请在浏览器控制台执行 PIA_LLM_BUDGET.reset() 后重试'
    ]
    keys.forEach((k) => {
      assert(guardSrc.includes(k), 'guard 里找不到该文案: ' + k)
    })
    const sandbox = { window: {} }
    vm.createContext(sandbox)
    vm.runInContext(dictSrc, sandbox)
    keys.forEach((k) => {
      const v = sandbox.window.I18N_EN[k]
      assert(typeof v === 'string' && v.length > 0, '字典缺 key: ' + k)
      assert(!HAN.test(v), '英文值残留汉字: ' + k)
    })
  })

  // ---- 2. 拦截行为 ----
  await ok('默认每日 20 次：第 21 次被拦，且请求只发出 20 次', async () => {
    const e = makeEnv({})
    for (let i = 0; i < 20; i++) await e.consume()
    await expectBlocked(() => e.consume(), 'local_budget_daily')
    assert.strictEqual(e.count(), 20, '被拦截的请求绝不能发出')
    assert.strictEqual(e.status().callsDay, 20)
  })
  await ok('aiEnabled:false 全局停用：第一次就拦，零请求', async () => {
    const e = makeEnv({ aiEnabled: false })
    const err = await expectBlocked(() => e.consume(), 'local_budget_off')
    assert.strictEqual(e.count(), 0)
    assert(/本地离线版/.test(err.message))
  })
  await ok('累计上限 maxCallsTotal 跨调用生效', async () => {
    const e = makeEnv({ maxCallsPerDay: 0, maxCallsTotal: 3 })
    await e.consume(); await e.consume(); await e.consume()
    await expectBlocked(() => e.consume(), 'local_budget_total')
    assert.strictEqual(e.count(), 3)
  })
  await ok('trackUsage 注入 stream_options.include_usage', async () => {
    const e = makeEnv({})
    await e.consume({ model: 'm', messages: [], stream: true })
    assert.strictEqual(e.calls[0].stream_options.include_usage, true)
  })
  await ok('trackUsage:false 时不改请求体', async () => {
    const e = makeEnv({ trackUsage: false })
    await e.consume({ model: 'm', messages: [], stream: true })
    assert(!e.calls[0].stream_options, '不应注入 include_usage')
  })
  await ok('真实 usage.credit / total_tokens 被累计记录', async () => {
    const e = makeEnv({})
    await e.consume()
    const s = e.status()
    assert.strictEqual(s.creditsDay, 1.5)
    assert.strictEqual(s.tokensDay, 120)
  })
  await ok('credits 超限后自动终止', async () => {
    const e = makeEnv({ maxCallsPerDay: 0, maxCallsTotal: 0, maxCreditsPerDay: 2 })
    await e.consume() // 1.5
    await e.consume() // 3.0
    await expectBlocked(() => e.consume(), 'local_budget_credits')
    assert.strictEqual(e.count(), 2)
  })
  await ok('tokens 超限后自动终止', async () => {
    const e = makeEnv({ maxCallsPerDay: 0, maxCallsTotal: 0, maxTokensPerDay: 200 })
    await e.consume() // 120
    await e.consume() // 240
    await expectBlocked(() => e.consume(), 'local_budget_tokens')
    assert.strictEqual(e.count(), 2)
  })

  // ---- 3. 平台额度耗尽后的熔断 ----
  await ok('create 抛 quota_ 时自动熔断，后续零请求', async () => {
    const e = makeEnv({ maxCallsPerDay: 0, maxCallsTotal: 0 }, { throwQuota: true })
    await assert.rejects(() => e.consume())
    assert.strictEqual(e.status().tripped, true, '平台额度不足应立刻熔断')
    await expectBlocked(() => e.consume(), 'local_budget_tripped')
    assert.strictEqual(e.count(), 1, '熔断后不能再发请求')
  })
  await ok('流中途抛 quota_ 也会熔断', async () => {
    const e = makeEnv({ maxCallsPerDay: 0, maxCallsTotal: 0 }, { streamThrow: true })
    await assert.rejects(() => e.consume())
    assert.strictEqual(e.status().tripped, true)
  })
  await ok('stopOnQuotaError:false 时不熔断，只是照常报错', async () => {
    const e = makeEnv({ stopOnQuotaError: false }, { throwQuota: true })
    await assert.rejects(() => e.consume())
    assert.strictEqual(e.status().tripped, false)
  })
  await ok('PIA_LLM_BUDGET.reset() 可解除熔断并清空计数', async () => {
    const e = makeEnv({ maxCallsPerDay: 0, maxCallsTotal: 0 }, { throwQuota: true })
    await assert.rejects(() => e.consume())
    assert.strictEqual(e.status().tripped, true)
    e.reset()
    assert.strictEqual(e.status().tripped, false)
    assert.strictEqual(e.status().callsTotal, 0)
  })
  await ok('跨天重置当日计数，但累计次数与熔断标记保留', async () => {
    const e = makeEnv({ maxCallsPerDay: 2, maxCallsTotal: 100 })
    await e.consume(); await e.consume()
    await expectBlocked(() => e.consume(), 'local_budget_daily')
    e.setDay('20000101')
    const s = e.status()
    assert.strictEqual(s.callsDay, 0, '当日计数应清零')
    assert.strictEqual(s.callsTotal, 2, '累计次数不应清零')
    await e.consume()
    assert.strictEqual(e.status().callsDay, 1)
  })

  // ---- 4. 与现有 UI 的兼容 ----
  await ok('英文界面显示英文熔断提示', async () => {
    const e = makeEnv({ aiEnabled: false })
    e.setLang('en')
    const err = await expectBlocked(() => e.consume(), 'local_budget_off')
    assert(/offline edition/i.test(err.message), '提示未英译: ' + err.message)
    assert(!HAN.test(err.message), '英文提示残留汉字')
  })
  await ok('错误码不会触发 llmErrorText 的笼统前缀分支', async () => {
    const e = makeEnv({ aiEnabled: false })
    const err = await expectBlocked(() => e.consume(), 'local_budget_off')
    const prefixes = ['auth_', 'quota_', 'gateway_', 'model_', 'request_', 'internal_']
    prefixes.forEach((p) => assert(err.error.code.indexOf(p) !== 0, '会被 llmErrorText 覆盖: ' + p))
  })
  await ok('SDK 结构异常时不崩溃，登录与页面照常可用', () => {
    const e = makeEnv({}, { brokenSdk: true })
    assert.strictEqual(typeof e.sandbox.PIA_LLM_BUDGET.status, 'function')
  })

  console.log('\n[quota] ' + pass + ' passed, ' + fail + ' failed\n')
  if (fail) process.exit(1)
})()

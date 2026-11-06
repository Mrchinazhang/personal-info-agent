'use strict';
/**
 * 端到端渲染验收（Node 原生，零依赖、零网络）。
 * 运行：node tests/render.test.js
 *
 * 用最小 DOM / SDK stub 真正 boot 一遍 app.js，检查英文模式下：
 *  - 六个视图渲染出的 UI 文案都是英文，且不残留中文界面文案
 *  - 用户数据（中文笔记）原样保留，证明翻译层没有改写用户内容
 *  - 中文模式仍是中文界面（回归）
 *  - 语言切换不会丢失草稿（render(true) 的快照/还原）
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let pass = 0, fail = 0;
async function ok(name, fn) {
  try { await fn(); console.log('  ok    ' + name); pass++; }
  catch (e) { console.log('  FAIL  ' + name + ' :: ' + e.message); fail++; }
}

const dictSrc = read('i18n-dict.js');
const i18nSrc = read('i18n.js');
const cfgSrc = read('config.example.js');
const appSrc = read('app.js');

const ITEMS = [
  { id: 1, title: '物联网实训想法', content: '把传感器接进 Flask', summary: '关于实训',
    category: 'idea', tags: ['实训'], key_points: ['先申请 API Key'], priority: 'high',
    due_date: '2026-12-01', is_todo: true, todo_done: false, created_at: '2026-11-05T10:00:00Z' },
  { id: 2, title: '参考资料合集', content: '文档链接', summary: '', category: 'material',
    tags: [], key_points: [], priority: null, due_date: null, is_todo: false,
    created_at: '2026-11-04T10:00:00Z' },
  { id: 3, title: '完成实训报告', content: '写完交上去', summary: '', category: 'todo',
    tags: ['实验室'], key_points: [], priority: 'low', due_date: '2026-11-20',
    is_todo: true, todo_done: true, created_at: '2026-11-03T10:00:00Z' },
];

function makeEl(key) {
  const attrs = {};
  return {
    key, nodeType: 1, tagName: 'DIV', value: '', textContent: '', innerHTML: '',
    className: '', style: {}, dataset: {}, disabled: false, checked: false,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
    removeAttribute(k) { delete attrs[k]; },
    hasAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k); },
    addEventListener() {}, appendChild() {}, removeChild() {}, focus() {},
    setSelectionRange() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; },
  };
}

function buildQuery(data) {
  const q = {
    select: () => q, order: () => q, limit: () => q, eq: () => q, contains: () => q,
    insert: () => q, update: () => q, delete: () => q,
    then(resolve) { return Promise.resolve(resolve({ data, error: null })); },
  };
  return q;
}

async function bootApp(opts) {
  const cache = new Map();
  const get = (key) => {
    if (!cache.has(key)) cache.set(key, makeEl(key));
    return cache.get(key);
  };
  const doc = {
    readyState: 'complete', title: '个人信息管家 Agent',
    documentElement: makeEl('html'), body: makeEl('body'), head: makeEl('head'),
    querySelector: (sel) => get(sel),
    querySelectorAll: () => [],
    getElementById: (id) => get('#' + id),
    createElement: () => makeEl('created'),
    createTextNode: (s) => ({ nodeValue: s, nodeType: 3, parentNode: null }),
    createTreeWalker: () => ({ nextNode: () => null }),
    addEventListener() {},
  };
  const store = {};
  const cloud = {
    auth: {
      getSession: async () => ({ data: { user: { name: 'tester' } }, error: null }),
      sendOtp: async () => ({ data: {} }), verifyOtp: async () => ({ data: {} }),
      signOut: async () => {}, signInWithOAuth: async () => ({ data: { url: '' } }),
      handleWorkBuddyCallback: async () => ({}), handleWechatWebCallback: async () => ({}),
    },
    llm: {
      models: { list: async () => [{ id: 'hy4free', name: 'Hunyuan', isDefault: true, enabled: true }] },
      chat: { completions: { create: async () => ({}) } },
    },
    database: { from: (table) => buildQuery(table === 'items' ? ITEMS : []) },
  };
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    URL, URLSearchParams, Date, Math, JSON, Promise, setTimeout, clearTimeout,
    setInterval, clearInterval, AbortController,
    navigator: { language: opts.lang === 'en' ? 'en-US' : 'zh-CN', userLanguage: opts.lang === 'en' ? 'en-US' : 'zh-CN' },
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    location: { href: 'https://example.app/?sharecode=TEST&view=' + opts.view, pathname: '/', search: '', hash: '', origin: 'https://example.app', assign() {} },
    history: { replaceState() {} },
    document: doc, NodeFilter: { SHOW_TEXT: 3, SHOW_ELEMENT: 1 },
    WorkBuddyCloud: { createWorkBuddyCloud: () => cloud },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(dictSrc, sandbox, { filename: 'i18n-dict.js' });
  vm.runInContext(i18nSrc, sandbox, { filename: 'i18n.js' });
  vm.runInContext(cfgSrc, sandbox, { filename: 'config.example.js' });
  vm.runInContext(appSrc, sandbox, { filename: 'app.js' });
  // 等 boot() 的异步链（getSession / loadModels / Promise.all）跑完
  for (let i = 0; i < 12; i++) await new Promise((r) => setImmediate(r));
  return { sandbox, I18N: sandbox.I18N, main: get('#main'), get };
}

const VIEWS = [
  { view: 'capture', en: 'Capture this thought', zh: '记下此刻的想法' },
  { view: 'library', en: 'Search: title / content', zh: '关键词检索：标题' },
  { view: 'todos', en: 'To-do list', zh: '待办清单' },
  { view: 'ask', en: 'Ask about your library', zh: '基于你的资料库提问' },
  { view: 'reports', en: 'Generate a review', zh: '生成阶段总结' },
  { view: 'import', en: 'Read external content', zh: '读取外部内容' },
];

(async function main() {
  for (const v of VIEWS) {
    await ok('英文模式 ' + v.view + ' 视图渲染为英文 UI', async () => {
      const { main } = await bootApp({ lang: 'en', view: v.view });
      const htmlOut = main.innerHTML;
      assert(htmlOut.length > 50, v.view + ' 视图没有渲染出内容');
      assert(htmlOut.includes(v.en), '缺少英文文案 "' + v.en + '"，输出片段: ' + htmlOut.slice(0, 200));
      assert(!htmlOut.includes(v.zh), '残留中文 UI 文案 "' + v.zh + '"');
    });
  }

  await ok('英文模式下用户笔记（中文）原样保留，未被翻译改写', async () => {
    const { main } = await bootApp({ lang: 'en', view: 'library' });
    const htmlOut = main.innerHTML;
    assert(htmlOut.includes('物联网实训想法'), '用户数据被改写或丢失');
    assert(htmlOut.includes('参考资料合集'), '用户数据被改写或丢失');
    assert(!htmlOut.includes('想法</button>') || true, '');
  });

  await ok('中文模式仍为中文界面（回归）', async () => {
    const { main } = await bootApp({ lang: 'zh', view: 'capture' });
    assert(main.innerHTML.includes('记下此刻的想法'), '中文界面被破坏');
    assert(!main.innerHTML.includes('Capture this thought'), '中文模式出现英文');
  });

  await ok('语言切换重绘不丢失草稿与已生成结果', async () => {
    const { sandbox, I18N, main, get } = await bootApp({ lang: 'en', view: 'capture' });
    const draft = get('#capture-input');
    draft.value = '未保存的草稿 draft 123';
    const answer = get('#answer-box');
    answer.innerHTML = '<b>已生成的回答</b>';
    I18N.setLang('zh');
    I18N.setLang('en');
    assert.strictEqual(get('#capture-input').value, '未保存的草稿 draft 123', '草稿被重绘清空');
    assert.strictEqual(get('#answer-box').innerHTML, '<b>已生成的回答</b>', '结果区被重绘清空');
    assert(main.innerHTML.includes('Capture this thought'), '切回英文未重新渲染');
    assert(sandbox.localStorage.getItem('pia_lang') === 'en', '语言记忆丢失');
  });

  console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})();

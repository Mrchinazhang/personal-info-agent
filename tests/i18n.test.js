'use strict';
/**
 * 双语改造的独立验收测试（Node 原生，零依赖）。
 * 运行：node tests/i18n.test.js
 *
 * 检查六类风险：
 *  1. 文件 / 语法完整性、脚本加载顺序、缓存版本号
 *  2. 用户数据绝不被送进翻译函数
 *  3. 英文字典：无中文残留、HTML 标签结构一致、app.js 的 tr() 全覆盖
 *  4. index.html 静态文案（文本 / placeholder / aria-label / title）全部可翻译
 *  5. 语言检测 / 切换 / localStorage 记忆在 vm 沙箱里可工作
 *  6. 真实 DOM 行为：title 提示被翻译，而「中文原文对照」提示不被覆盖
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const cp = require('child_process');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let pass = 0;
let fail = 0;

function ok(name, fn) {
  try {
    fn();
    console.log('  ok    ' + name);
    pass++;
  } catch (e) {
    console.log('  FAIL  ' + name + ' :: ' + e.message);
    fail++;
  }
}
function info(name, value) {
  console.log('  info  ' + name + ': ' + value);
}

const i18nSrc = read('i18n.js');
const dictSrc = read('i18n-dict.js');
const appSrc = read('app.js');
const html = read('index.html');

// 还原 JS 字符串字面量里的 \n / \" / \uXXXX，否则带换行的 key 永远匹配不上字典
function decodeJsLiteral(raw) {
  try {
    const v = Function('return ' + raw)();
    return typeof v === 'string' ? v : null;
  } catch (e) {
    return null;
  }
}
// 只比较标签名与开闭，忽略属性内容（placeholder 里的中文是必须翻译的）
function tagNames(s) {
  return (String(s).match(/<\/?[a-zA-Z][^>]*>/g) || []).map((t) => {
    const m = t.match(/^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/);
    return m ? m[1] + m[2].toLowerCase() : t;
  });
}
const HAN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const CJK_PUNCT = /[\u3001\u3002\u3008-\u3011\u3014\u3015\uff01\uff08\uff09\uff0c\uff1a\uff1b\uff1f]/;

// ---- 1. 文件、语法、加载顺序、缓存版本号 ----
ok('四个 JS 文件语法均通过', () => {
  ['i18n.js', 'i18n-dict.js', 'app.js', 'config.example.js'].forEach((f) => {
    cp.execFileSync(process.execPath, ['--check', path.join(root, f)]);
  });
});
ok('index.html 脚本顺序为 dict -> i18n -> config -> app', () => {
  const a = html.indexOf('i18n-dict.js');
  const b = html.indexOf('i18n.js');
  const c = html.indexOf('config.js');
  const d = html.indexOf('app.js');
  assert(a > -1 && b > -1 && c > -1 && d > -1, '四个脚本都要引入');
  assert(a < b && b < c && c < d, '加载顺序错误，t() 会未定义');
});
ok('所有 ?v= 缓存版本号一致且已递增', () => {
  const versions = [...html.matchAll(/\?v=([0-9a-zA-Z]+)/g)].map((m) => m[1]);
  assert(versions.length >= 5, 'CSS / dict / i18n / config / app 都应带版本号，实际 ' + versions.length);
  assert(new Set(versions).size === 1, '版本号不一致: ' + versions.join(', '));
  assert(versions[0] >= '20261106b', '版本号未递增，实际 ' + versions[0]);
});
ok('页面存在两处语言切换控件', () => {
  assert(/id="lang-toggle"/.test(html), '登录页缺少 #lang-toggle');
  assert(/id="lang-toggle-app"/.test(html), '应用顶栏缺少 #lang-toggle-app');
});

// ---- 2. 用户数据不进翻译函数 ----
ok('不存在把用户数据送进翻译的调用', () => {
  assert(!/tr\(\s*esc\s*\(/.test(appSrc), '发现 tr(esc(...))');
  assert(!/tr\(\s*String\s*\(/.test(appSrc), '发现 tr(String(...))');
  assert(!/tr\(\s*(it|im|r|row|item|state|u)\./.test(appSrc), '发现把数据字段直接送进 tr()');
});
ok('app.js 使用 tr()，不会与局部变量 t 冲突', () => {
  assert(/\bvar tr = window\.I18N\.t\b/.test(appSrc), '缺少 var tr = window.I18N.t');
  assert(!/(?<![A-Za-z0-9_$])t\(/.test(appSrc), '仍存在裸 t(...) 调用');
});

// ---- 3/5. 在沙箱里加载 i18n.js ----
function baseSandbox(browserLang) {
  const store = {};
  const noop = () => {};
  const el = () => ({
    lang: 'zh-CN', style: {}, dataset: {}, childNodes: [], textContent: '',
    setAttribute: noop, getAttribute: () => null, removeAttribute: noop,
    addEventListener: noop, appendChild: noop, querySelector: () => null,
    querySelectorAll: () => [],
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  });
  const doc = {
    documentElement: el(), body: el(), head: el(), createElement: el,
    createTextNode: (s) => ({ nodeValue: s, nodeType: 3, parentNode: null }),
    createTreeWalker: () => ({ nextNode: () => null }),
    querySelector: () => null, querySelectorAll: () => [],
    getElementById: () => null, addEventListener: noop, readyState: 'complete',
  };
  const sandbox = {
    console: { log: noop, warn: noop, error: noop },
    setTimeout, clearTimeout,
    navigator: { language: browserLang, userLanguage: browserLang },
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    document: doc, NodeFilter: { SHOW_TEXT: 3, SHOW_ELEMENT: 1 },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(dictSrc, sandbox, { filename: 'i18n-dict.js' });
  vm.runInContext(i18nSrc, sandbox, { filename: 'i18n.js' });
  return { sandbox, I18N: sandbox.I18N, store };
}

let zh = null;
ok('i18n.js 可在沙箱中加载并暴露 window.I18N', () => {
  zh = baseSandbox('zh-CN');
  assert(zh.I18N, '未暴露 I18N');
  assert.strictEqual(typeof zh.I18N.t, 'function', '缺少 t()');
  assert.strictEqual(typeof zh.I18N.setLang, 'function', '缺少 setLang()');
  assert(zh.I18N.EN, '未暴露 EN 字典');
});

if (zh && zh.I18N) {
  const dict = zh.I18N.EN;
  info('英文字典条数', Object.keys(dict).length);

  ok('英文字典所有 value 均无汉字 / 中文标点残留', () => {
    const bad = [];
    for (const k of Object.keys(dict)) {
      const v = dict[k];
      if (HAN.test(v) || CJK_PUNCT.test(v)) bad.push(k.slice(0, 40) + ' -> ' + v.slice(0, 50));
    }
    assert.deepStrictEqual(bad, [], '半翻译条目 ' + bad.length + ' 条: ' + bad.slice(0, 4).join(' / '));
  });

  ok('含 HTML 标签的条目，中英两端标签结构一致', () => {
    const bad = [];
    for (const k of Object.keys(dict)) {
      const a = tagNames(k);
      const b = tagNames(dict[k]);
      if (a.length || b.length) {
        if (a.join('|') !== b.join('|')) bad.push(k.slice(0, 50));
      }
    }
    assert.deepStrictEqual(bad, [], '标签结构不一致: ' + bad.join(' / '));
  });

  ok('app.js 里 tr() 的中文文案 100% 被字典覆盖', () => {
    const used = new Set();
    for (const m of appSrc.matchAll(/\btr\(\s*(['"])((?:\\.|(?!\1)[^\\])*?)\1/g)) {
      const lit = m[0].slice(m[0].indexOf(m[1]), m[0].lastIndexOf(m[1]) + 1);
      const v = decodeJsLiteral(lit);
      if (v && HAN.test(v)) used.add(v);
    }
    const missing = [...used].filter((k) => !dict[k]);
    info('app.js 中 tr() 的中文文案', used.size);
    assert(used.size > 250, 'tr() 抽取数量异常，仅 ' + used.size + ' 条');
    assert.deepStrictEqual(missing, [], '字典缺失 ' + missing.length + ' 条: ' + missing.slice(0, 5).join(' / '));
  });

  // ---- 4. index.html 静态文案覆盖 ----
  ok('index.html 静态中文（文本 / placeholder / aria-label / title）全部可翻译', () => {
    let s = html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
      // .intl-note 是 data-i18n-skip 的双语块，自带中英两份，不参与字典检查
      .replace(/<p class="intl-note[^"]*"[^>]*>[\s\S]*?<\/p>/g, '');
    const chunks = [];
    for (const m of s.matchAll(/\b(?:placeholder|aria-label|title)\s*=\s*"([^"]*)"/g)) chunks.push(m[1]);
    s.replace(/<[^>]*>/g, '\n').split('\n').forEach((t) => chunks.push(t));
    const zhChunks = chunks.map((t) => t.trim()).filter((t) => t && t.length <= 160 && HAN.test(t));
    const missing = [...new Set(zhChunks)].filter((k) => !dict[k] || dict[k] === k);
    info('静态中文片段', new Set(zhChunks).size);
    assert.deepStrictEqual(missing, [], '未覆盖的静态文案: ' + missing.slice(0, 6).join(' / '));
  });

  ok('中文模式下 t() 原样返回', () => {
    zh.I18N.setLang('zh');
    assert.strictEqual(zh.I18N.t('获取验证码'), '获取验证码');
  });
  ok('英文模式下 t() 返回英文', () => {
    zh.I18N.setLang('en');
    const v = zh.I18N.t('获取验证码');
    assert(v && v !== '获取验证码', '英文翻译缺失');
  });
  ok('语言选择写入 localStorage 并同步 <html lang>', () => {
    zh.I18N.setLang('en');
    assert.strictEqual(zh.sandbox.localStorage.getItem('pia_lang'), 'en', '未记住语言');
    assert.strictEqual(zh.sandbox.document.documentElement.lang, 'en', '<html lang> 未更新');
  });
  ok('英文浏览器默认英文，中文浏览器默认中文', () => {
    assert.strictEqual(baseSandbox('en-US').I18N.currentLang(), 'en');
    assert.strictEqual(baseSandbox('zh-CN').I18N.currentLang(), 'zh');
  });
  ok('中文对照提示开关可用', () => {
    assert.strictEqual(typeof zh.I18N.setZhHint, 'function', '缺少 setZhHint()');
    zh.I18N.setZhHint(false);
    zh.I18N.setZhHint(true);
  });
}

// ---- 6. 真实 DOM 行为：title 翻译 + 中文提示保护 ----
ok('静态区域 title 被翻译，且「中文原文对照」提示不被覆盖，切回中文可还原', () => {
  function fakeEl(cfg) {
    const attrs = Object.assign({}, cfg.attrs || {});
    return {
      nodeType: 1, tagName: cfg.tagName || 'DIV', attrs,
      hasAttribute: (k) => Object.prototype.hasOwnProperty.call(attrs, k),
      getAttribute: (k) => (Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null),
      setAttribute: (k, v) => { attrs[k] = String(v); },
      removeAttribute: (k) => { delete attrs[k]; },
      querySelectorAll: () => cfg.qsa || [],
      addEventListener: () => {},
    };
  }
  const select = fakeEl({ tagName: 'SELECT', attrs: {
    title: '选择用于整理与问答的大模型', 'aria-label': '选择验证码登录方式',
  } });
  const label = fakeEl({ tagName: 'LABEL', attrs: {} });
  const textNode = { nodeType: 3, nodeValue: '手机号', parentNode: label };
  const zone = fakeEl({ attrs: { 'data-i18n-static': '' }, qsa: [select, label] });
  let served = false;
  const doc = {
    documentElement: fakeEl({}), title: '个人信息管家 Agent', readyState: 'complete',
    querySelectorAll: (sel) => (sel === '[data-i18n-static]' ? [zone] : []),
    getElementById: () => null,
    createTreeWalker: () => ({
      nextNode: () => { if (served) return null; served = true; return textNode; },
    }),
    addEventListener: () => {},
  };
  const store = {};
  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    setTimeout, clearTimeout, navigator: { language: 'en-US', userLanguage: 'en-US' },
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; },
    },
    document: doc, NodeFilter: { SHOW_TEXT: 3, SHOW_ELEMENT: 1 },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(dictSrc, sandbox, { filename: 'i18n-dict.js' });
  vm.runInContext(i18nSrc, sandbox, { filename: 'i18n.js' });
  const I18N = sandbox.I18N;
  assert.strictEqual(I18N.currentLang(), 'en');

  served = false;
  I18N.setLang('en');
  assert.strictEqual(textNode.nodeValue, 'Phone number', '文本节点未翻译');
  assert.strictEqual(select.getAttribute('title'), 'Model used for organizing and Q&A', 'title 未翻译');
  assert.strictEqual(select.getAttribute('aria-label'), 'Choose a sign-in method', 'aria-label 未翻译');
  assert.strictEqual(label.getAttribute('title'), '手机号', '中文原文对照提示被覆盖');

  served = false;
  I18N.setLang('zh');
  assert.strictEqual(textNode.nodeValue, '手机号', '切回中文未还原文本');
  assert.strictEqual(select.getAttribute('title'), '选择用于整理与问答的大模型', '切回中文未还原 title');
  assert.strictEqual(label.getAttribute('title'), null, '中文提示未清理');
});

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);

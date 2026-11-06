'use strict';
/**
 * 双语改造的独立验收测试（Node 原生，零依赖）。
 * 运行：node tests/i18n.test.js
 *
 * 检查四类风险：
 *  1. 文件与语法完整性、脚本加载顺序、缓存版本号一致
 *  2. 用户数据绝不被送进翻译函数
 *  3. 英文字典里含 HTML 标签的条目结构不被破坏
 *  4. 语言检测 / 切换 / localStorage 记忆在 vm 沙箱里可工作
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

// ---- 1. 文件、语法、加载顺序、缓存版本号 ----
const i18nSrc = read('i18n.js');
const dictSrc = read('i18n-dict.js');
const appSrc = read('app.js');
const html = read('index.html');

ok('i18n.js 语法通过', () => {
  cp.execFileSync(process.execPath, ['--check', path.join(root, 'i18n.js')]);
});
ok('i18n-dict.js 语法通过', () => {
  cp.execFileSync(process.execPath, ['--check', path.join(root, 'i18n-dict.js')]);
});
ok('app.js 语法通过', () => {
  cp.execFileSync(process.execPath, ['--check', path.join(root, 'app.js')]);
});
ok('index.html 在 app.js 之前加载 i18n.js', () => {
  const a = html.indexOf('i18n.js');
  const b = html.indexOf('app.js');
  assert(a > -1 && b > -1, '两个脚本都要在 index.html 中引入');
  assert(a < b, 'i18n.js 必须在 app.js 之前，否则 t() 未定义');
});
ok('index.html 里所有 ?v= 缓存版本号一致且已递增', () => {
  const versions = [...html.matchAll(/\?v=([0-9a-zA-Z]+)/g)].map((m) => m[1]);
  assert(versions.length >= 4, 'CSS / i18n.js / config.js / app.js 都应带版本号，实际 ' + versions.length + ' 处');
  assert(new Set(versions).size === 1, '版本号不一致: ' + versions.join(', '));
  assert(versions[0] >= '20261106b', '版本号未递增到 20261106b 及以上，实际 ' + versions[0]);
  assert(html.indexOf('i18n-dict.js') < html.indexOf('i18n.js'), '字典必须先于 i18n.js 加载');
  assert(html.indexOf('i18n.js') < html.indexOf('config.js'), 'i18n.js 必须先于 config.js 加载');
});
ok('页面存在语言切换控件', () => {
  assert(/id="lang-toggle"/.test(html), '登录页缺少 #lang-toggle');
});

// ---- 2. 用户数据不进翻译函数 ----
ok('不存在 tr(esc(...)) / tr(String(...)) 等把用户数据送进翻译的调用', () => {
  assert(!/tr\(\s*esc\s*\(/.test(appSrc), '发现 tr(esc(...))，会改写用户笔记');
  assert(!/tr\(\s*String\s*\(/.test(appSrc), '发现 tr(String(...))，会改写用户数据');
  assert(!/tr\(\s*(it|im|r|row|item|state|u)\./.test(appSrc), '发现把数据对象的字段直接送进 tr()');
});
ok('app.js 使用改名后的 tr()，不会与局部变量 t 冲突', () => {
  assert(/\bvar tr = window\.I18N\.t\b/.test(appSrc), '缺少 var tr = window.I18N.t');
  assert(!/(?<![A-Za-z0-9_$])t\(/.test(appSrc), '仍存在裸 t(...) 调用，会被局部变量遮蔽');
});

// ---- 3/4. 在沙箱里加载 i18n.js ----
function makeSandbox(browserLang) {
  const store = {};
  const noop = () => {};
  const el = () => ({
    lang: 'zh-CN',
    style: {},
    dataset: {},
    childNodes: [],
    textContent: '',
    setAttribute: noop,
    getAttribute: () => null,
    removeAttribute: noop,
    addEventListener: noop,
    appendChild: noop,
    querySelector: () => null,
    querySelectorAll: () => [],
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  });
  const documentEl = el();
  const doc = {
    documentElement: documentEl,
    body: el(),
    head: el(),
    createElement: el,
    createTextNode: (s) => ({ nodeValue: s, nodeType: 3, parentNode: null }),
    createTreeWalker: () => ({ nextNode: () => null }),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener: noop,
    readyState: 'complete',
  };
  const sandbox = {
    console: { log: noop, warn: noop, error: noop },
    setTimeout,
    clearTimeout,
    navigator: { language: browserLang, userLanguage: browserLang },
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    document: doc,
    NodeFilter: { SHOW_TEXT: 3, SHOW_ELEMENT: 1 },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(dictSrc, sandbox, { filename: 'i18n-dict.js' });
  vm.runInContext(i18nSrc, sandbox, { filename: 'i18n.js' });
  return { sandbox, I18N: sandbox.I18N || (sandbox.window && sandbox.window.I18N), store };
}

let zh = null;
let en = null;
ok('i18n.js 可在沙箱中加载并暴露 window.I18N', () => {
  zh = makeSandbox('zh-CN');
  assert(zh.I18N, '未暴露 I18N');
  assert.strictEqual(typeof zh.I18N.t, 'function', '缺少 t()');
  assert.strictEqual(typeof zh.I18N.setLang, 'function', '缺少 setLang()');
  assert(zh.I18N.EN, '未暴露 EN 字典，无法校验覆盖度');
});

if (zh && zh.I18N) {
  const dict = zh.I18N.EN;
  info('英文字典条数', Object.keys(dict).length);

  ok('字典里含 HTML 标签的条目，中英两端标签结构一致', () => {
    const tags = (s) => (String(s).match(/<\/?[a-zA-Z][^>]*>/g) || []).map((t) => t.replace(/\s+/g, ' '));
    const bad = [];
    for (const k of Object.keys(dict)) {
      const a = tags(k);
      const b = tags(dict[k]);
      if (a.length || b.length) {
        if (a.join('|') !== b.join('|')) bad.push(k.slice(0, 50));
      }
    }
    assert.deepStrictEqual(bad, [], '标签结构不一致的条目: ' + bad.join(' / '));
  });

  ok('app.js 里 tr() 用到的中文文案，字典都有英文（或明确回退）', () => {
    const used = new Set();
    for (const m of appSrc.matchAll(/\btr\(\s*(['"])((?:\\.|(?!\1)[^\\])*?)\1/g)) {
      const v = m[2];
      if (/[\u4e00-\u9fff]/.test(v)) used.add(v);
    }
    const missing = [...used].filter((k) => !dict[k]);
    info('app.js 中 tr() 的中文文案', used.size);
    info('字典未覆盖条数', missing.length);
    assert(missing.length <= 3, '字典缺失 ' + missing.length + ' 条，例如: ' + missing.slice(0, 5).join(' / '));
  });

  ok('中文模式下 t() 原样返回', () => {
    zh.I18N.setLang('zh');
    assert.strictEqual(zh.I18N.t('获取验证码'), '获取验证码');
  });

  ok('英文模式下 t() 返回英文，且不是原中文', () => {
    zh.I18N.setLang('en');
    const v = zh.I18N.t('获取验证码');
    assert(v && v !== '获取验证码', '英文翻译缺失');
  });

  ok('语言选择写入 localStorage 并同步 <html lang>', () => {
    zh.I18N.setLang('en');
    assert.strictEqual(zh.sandbox.localStorage.getItem('pia_lang'), 'en', '未记住语言');
    assert.strictEqual(zh.sandbox.document.documentElement.lang, 'en', '<html lang> 未更新');
  });

  ok('英文浏览器默认英文界面，中文浏览器默认中文界面', () => {
    en = makeSandbox('en-US');
    const lang = en.I18N.currentLang();
    assert.strictEqual(lang, 'en', 'en-US 应默认英文，实际 ' + lang);
    const zh2 = makeSandbox('zh-CN');
    assert.strictEqual(zh2.I18N.currentLang(), 'zh', 'zh-CN 应默认中文');
  });

  ok('中文对照提示开关可用', () => {
    assert.strictEqual(typeof zh.I18N.setZhHint, 'function', '缺少 setZhHint()');
    zh.I18N.setZhHint(false);
    zh.I18N.setZhHint(true);
  });
}

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/**
 * GPTGirl 端到端测试：无头 Edge + 注入器（完全不接触 Codex 桌面版）
 *
 * 用例 1：普通页面，标准注入（setBypassCSP + <style>），断言规则生效、
 *         背景 data URI 已应用、UI 层半透明
 * 用例 2：严格 CSP 页面 + GG_NO_BYPASS=1，断言 adoptedStyleSheets 回退生效
 *
 * 用法: node test/run-edge-test.mjs
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cdp, evalIn, listTargets, normalizeWsUrl, pageTargets } from '../adapters/codex-desktop/lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 9231;
const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  process.env.LOCALAPPDATA + '\\Microsoft\\Edge\\Application\\msedge.exe',
];
const EDGE = EDGE_CANDIDATES.find((p) => {
  try { readFileSync(p); return true; } catch { return false; }
});
if (!EDGE) {
  console.error('× 未找到 msedge.exe，无法运行端到端测试');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (p) => 'file:///' + p.replace(/\\/g, '/');

async function waitPort(timeoutMs = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try { await listTargets(PORT); return true; } catch { await sleep(300); }
  }
  return false;
}

async function findPage(urlSuffix) {
  for (let i = 0; i < 30; i++) {
    const ts = pageTargets(await listTargets(PORT));
    const t = ts.find((x) => String(x.url).includes(urlSuffix));
    if (t) return t;
    await sleep(300);
  }
  throw new Error('页面 target 未出现: ' + urlSuffix);
}

async function launchEdge(url, profile) {
  rmSync(profile, { recursive: true, force: true });
  mkdirSync(profile, { recursive: true });
  return spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, url,
  ], { stdio: 'ignore' });
}

function killTree(child) {
  if (!child || child.exitCode != null) return;
  try { spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
}

let passed = 0, failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}${detail ? ' — ' + detail : ''}`); }
  else { failed++; console.log(`  × ${name}${detail ? ' — ' + detail : ''}`); }
}

const css = readFileSync(join(ROOT, 'dist', 'theme.css'), 'utf8');

// ---------- 用例 1 ----------
console.log('\n== 用例 1：标准注入（setBypassCSP + <style>） ==');
{
  const edge = await launchEdge(fileUrl(join(ROOT, 'test', 'test-page.html')), join(ROOT, '.gptgirl', 'edge-test-1'));
  try {
    if (!(await waitPort())) throw new Error('Edge 调试端口未就绪');
    const t = await findPage('test-page.html');
    const { injectAll } = await import('../adapters/codex-desktop/inject.mjs');
    const results = await injectAll(PORT, css);
    for (const r of results) if (r.cdp) r.cdp.close();
    const cdp = new Cdp(normalizeWsUrl(t.webSocketDebuggerUrl, PORT));
    await cdp.connect();
    const v = await evalIn(cdp, `(function () {
      const el = document.getElementById('gptgirl-skin');
      const rules = el && el.sheet && el.sheet.cssRules ? el.sheet.cssRules.length : 0;
      const before = getComputedStyle(document.documentElement, '::before');
      const root = document.getElementById('root');
      return {
        rules: rules,
        bg: before.backgroundImage || '',
        rootOpacity: root ? getComputedStyle(root).opacity : ''
      };
    })()`);
    check('注入过程无错误', results.length > 0 && results.every((r) => !r.error));
    check('样式规则已生效', v.rules > 0, `${v.rules} 条规则`);
    check('背景为 data URI', v.bg.includes('data:image/'), v.bg.slice(0, 40) + '…');
    cdp.close();
  } catch (e) {
    check('用例 1 运行', false, e.message);
  }
  killTree(edge);
  await sleep(1500);
}

// ---------- 用例 2 ----------
console.log('\n== 用例 2：严格 CSP + 回退（GG_NO_BYPASS=1） ==');
{
  const edge = await launchEdge(fileUrl(join(ROOT, 'test', 'test-page-csp.html')), join(ROOT, '.gptgirl', 'edge-test-2'));
  const prev = process.env.GG_NO_BYPASS;
  process.env.GG_NO_BYPASS = '1';
  try {
    if (!(await waitPort())) throw new Error('Edge 调试端口未就绪');
    const t = await findPage('test-page-csp.html');
    const { injectAll } = await import('../adapters/codex-desktop/inject.mjs');
    const results = await injectAll(PORT, css);
    for (const r of results) if (r.cdp) r.cdp.close();
    const cdp = new Cdp(normalizeWsUrl(t.webSocketDebuggerUrl, PORT));
    await cdp.connect();
    const v = await evalIn(cdp, `(function () {
      const el = document.getElementById('gptgirl-skin');
      const elRules = el && el.sheet && el.sheet.cssRules ? el.sheet.cssRules.length : 0;
      const adopted = document.adoptedStyleSheets || [];
      let adoptedRules = 0;
      for (let i = 0; i < adopted.length; i++) adoptedRules += adopted[i].cssRules.length;
      return { elRules: elRules, sheets: adopted.length, adoptedRules: adoptedRules };
    })()`);
    check('回退注入无错误', results.length > 0 && results.every((r) => !r.error));
    check('adoptedStyleSheets 已生效', v.adoptedRules > 0, `${v.sheets} 张构造样式表 / ${v.adoptedRules} 条规则`);
    check('CSP 确实拦截了内联样式', v.elRules === 0, `inline rules=${v.elRules}`);
    cdp.close();
  } catch (e) {
    check('用例 2 运行', false, e.message);
  }
  if (prev === undefined) delete process.env.GG_NO_BYPASS;
  else process.env.GG_NO_BYPASS = prev;
  killTree(edge);
  await sleep(1500);
}

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed ? 1 : 0);

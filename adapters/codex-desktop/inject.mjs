#!/usr/bin/env node
/**
 * GPTGirl — Codex 桌面版 CDP 注入器
 *
 * 用法:
 *   node inject.mjs [--port 9222] [--css dist/theme.css] [--once]  注入（默认守护模式）
 *   node inject.mjs --check    仅检查注入状态
 *   node inject.mjs --remove   移除已注入的样式
 *
 * 环境变量:
 *   GG_NO_BYPASS=1  跳过 Page.setBypassCSP（用于测试 CSP 回退路径）
 *
 * 注入策略（双保险）:
 *   1) Page.setBypassCSP + <style id="gptgirl-skin">（CSS 分块送入页面）
 *   2) 若内联样式仍被拦截 → CSSStyleSheet 构造样式表 + adoptedStyleSheets（不受 CSP 约束）
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cdp, evalIn, listTargets, normalizeWsUrl, pageTargets, describeTarget } from './lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CFG = JSON.parse(readFileSync(join(ROOT, 'gptgirl.config.json'), 'utf8'));
const STYLE_ID = 'gptgirl-skin';
const CHUNK = 512 * 1024;

const log = (...m) => console.log(`[gptgirl ${new Date().toLocaleTimeString('zh-CN')}]`, ...m);

function parseArgs(argv) {
  const a = {
    port: CFG.codexDesktop?.debugPort ?? 9222,
    css: join(ROOT, 'dist', 'theme.css'),
    once: false,
    check: false,
    remove: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--port') a.port = Number(argv[++i]);
    else if (t === '--css') a.css = resolve(process.cwd(), argv[++i]);
    else if (t === '--once') a.once = true;
    else if (t === '--check') a.check = true;
    else if (t === '--remove') a.remove = true;
    else if (t === '--help' || t === '-h') a.help = true;
    else {
      console.error(`未知参数: ${t}`);
      process.exit(2);
    }
  }
  return a;
}

/** 分块把 CSS 送入页面全局缓冲（规避单条 CDP 消息过大），并校验完整性 */
async function deliverCss(cdp, css) {
  await evalIn(cdp, 'window.__ggBuf = ""');
  const n = Math.ceil(css.length / CHUNK);
  for (let i = 0; i < n; i++) {
    await evalIn(
      cdp,
      `window.__ggBuf += ${JSON.stringify(css.slice(i * CHUNK, (i + 1) * CHUNK))}`,
      30000
    );
  }
  const len = await evalIn(cdp, 'window.__ggBuf.length');
  if (len !== css.length) {
    throw new Error(`CSS 分块交付不完整（收到 ${len}/${css.length} 字节）`);
  }
  return n;
}

const PRIMARY_EXPR = `(function () {
  const css = window.__ggBuf || '';
  let el = document.getElementById(${JSON.stringify(STYLE_ID)});
  if (!el) {
    el = document.createElement('style');
    el.id = ${JSON.stringify(STYLE_ID)};
    /* <style> 必须放进 <head>：直接 append 到 <html> 上时 Chromium 不会完整解析其规则 */
    const host = document.head || document.documentElement;
    host.appendChild(el);
  }
  if (el.textContent !== css) el.textContent = css;
  const rules = el.sheet && el.sheet.cssRules ? el.sheet.cssRules.length : 0;
  return { applied: rules > 0, rules: rules };
})()`;

const FALLBACK_EXPR = `(function () {
  const css = window.__ggBuf || '';
  if (!css) return { applied: false, rules: 0 };
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  const sheets = Array.from(document.adoptedStyleSheets || []).filter(function (s) { return s && s !== sheet; });
  document.adoptedStyleSheets = sheets.concat([sheet]);
  window.__gptgirlAlt = true;
  return { applied: sheet.cssRules.length > 0, rules: sheet.cssRules.length };
})()`;

const CHECK_EXPR = `(function () {
  const el = document.getElementById(${JSON.stringify(STYLE_ID)});
  const elRules = el && el.sheet && el.sheet.cssRules ? el.sheet.cssRules.length : 0;
  let adopted = 0;
  const sheets = document.adoptedStyleSheets || [];
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i] && sheets[i].cssRules) adopted += sheets[i].cssRules.length;
  }
  return { present: elRules > 0 || adopted > 0 || !!window.__gptgirlAlt, elRules: elRules, adoptedRules: adopted };
})()`;

const REMOVE_EXPR = `(function () {
  const el = document.getElementById(${JSON.stringify(STYLE_ID)});
  if (el) el.remove();
  try { document.adoptedStyleSheets = []; } catch (e) {}
  delete window.__gptgirlAlt;
  delete window.__ggBuf;
  return { removed: !document.getElementById(${JSON.stringify(STYLE_ID)}) };
})()`;

async function attachAndInject(target, css, port) {
  const cdp = new Cdp(normalizeWsUrl(target.webSocketDebuggerUrl, port));
  await cdp.connect();
  await cdp.send('Page.enable');
  if (!process.env.GG_NO_BYPASS) {
    try {
      await cdp.send('Page.setBypassCSP', { enabled: true });
    } catch (e) {
      log(`  ! setBypassCSP 不可用（${e.message}），继续尝试`);
    }
  }
  await deliverCss(cdp, css);
  const v = await evalIn(cdp, PRIMARY_EXPR);
  if (v && v.applied) {
    log(`  ✓ 已注入并生效: ${describeTarget(target)} (${v.rules} 条规则)`);
    return { cdp, mode: 'style-element' };
  }
  log(`  ! 内联样式未生效（rules=${v ? v.rules : '?'}，可能被 CSP 拦截），改用 constructed stylesheet 回退`);
  const f = await evalIn(cdp, FALLBACK_EXPR);
  if (f && f.applied) {
    log(`  ✓ 已通过 adoptedStyleSheets 注入: ${describeTarget(target)} (${f.rules} 条规则)`);
    return { cdp, mode: 'adopted-stylesheets' };
  }
  throw new Error('两种注入方式均未生效');
}

/** 注入当前所有页面 target（不驻留），供 CLI 与测试共用 */
export async function injectAll(port, css) {
  const pages = pageTargets(await listTargets(port));
  const results = [];
  for (const t of pages) {
    try {
      const r = await attachAndInject(t, css, port);
      results.push({ target: t, ...r });
    } catch (e) {
      log(`× 注入失败 ${describeTarget(t)}: ${e.message}`);
      results.push({ target: t, error: e.message });
    }
  }
  return results;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));

  if (a.help) {
    console.log(`用法: node inject.mjs [--port N] [--css FILE] [--once] [--check] [--remove]`);
    return;
  }

  if (a.check) {
    const pages = pageTargets(await listTargets(a.port));
    log(`调试端口 ${a.port}：页面 target ${pages.length} 个`);
    for (const t of pages) {
      try {
        const cdp = new Cdp(normalizeWsUrl(t.webSocketDebuggerUrl, a.port));
        await cdp.connect();
        const v = await evalIn(cdp, CHECK_EXPR);
        log(`  ${v && v.present ? '✓ 已注入' : '· 未注入'}  ${describeTarget(t)}`);
        cdp.close();
      } catch (e) {
        log(`  × 检查失败: ${e.message}`);
      }
    }
    return;
  }

  if (a.remove) {
    const pages = pageTargets(await listTargets(a.port));
    for (const t of pages) {
      try {
        const cdp = new Cdp(normalizeWsUrl(t.webSocketDebuggerUrl, a.port));
        await cdp.connect();
        const v = await evalIn(cdp, REMOVE_EXPR);
        log(`  ${v && v.removed ? '✓ 已移除' : '· 无需移除'}  ${describeTarget(t)}`);
        cdp.close();
      } catch (e) {
        log(`  × 移除失败: ${e.message}`);
      }
    }
    log('提示：注入是纯运行时的，正常重启 Codex 即完全恢复原样。');
    return;
  }

  const css = readFileSync(a.css, 'utf8');
  log(`皮肤: ${a.css} (${(css.length / 1048576).toFixed(2)} MB)，调试端口 ${a.port}`);

  const results = await injectAll(a.port, css);

  if (a.once) {
    for (const r of results) if (r.cdp) r.cdp.close();
    const ok = results.filter((r) => !r.error).length;
    log(`--once 完成：成功 ${ok}/${results.length}`);
    if (ok === 0) process.exit(1);
    return;
  }

  // —— 守护模式：轮询补注入（页面重载 / 新窗口） ——
  const clients = new Map();
  for (const r of results) if (r.cdp && !r.error) clients.set(r.target.id, r);
  const intervalMs = CFG.codexDesktop?.pollIntervalMs ?? 2000;
  log(`守护模式：每 ${intervalMs} ms 轮询（重载/新窗口自动补注入），Ctrl+C 退出`);

  const interval = setInterval(async () => {
    try {
      const pages = pageTargets(await listTargets(a.port));
      for (const t of pages) {
        const c = clients.get(t.id);
        if (!c) {
          try {
            const r = await attachAndInject(t, css, a.port);
            clients.set(t.id, { ...r, target: t });
          } catch (e) {
            log(`× 注入失败 ${describeTarget(t)}: ${e.message}`);
          }
        } else {
          try {
            const v = await evalIn(c.cdp, CHECK_EXPR);
            if (!v || !v.present) {
              log(`↻ 样式丢失，重新注入: ${describeTarget(t)}`);
              c.cdp.close();
              clients.delete(t.id);
            }
          } catch {
            if (c.cdp) c.cdp.close();
            clients.delete(t.id);
          }
        }
      }
      for (const id of Array.from(clients.keys())) {
        if (!pages.some((p) => p.id === id)) {
          const c = clients.get(id);
          if (c && c.cdp) c.cdp.close();
          clients.delete(id);
        }
      }
    } catch {
      /* 调试端口暂时不可达（App 正在重启等），下一轮重试 */
    }
  }, intervalMs);

  process.on('SIGINT', () => {
    clearInterval(interval);
    for (const c of clients.values()) if (c.cdp) c.cdp.close();
    log('已退出（已注入样式保留至页面下次重载；如需立即清除: .\\gptgirl.ps1 remove）');
    process.exit(0);
  });
}

const isEntry =
  process.argv[1] &&
  resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (isEntry) {
  main().catch((e) => {
    const refused =
      (e && e.cause && e.cause.code === 'ECONNREFUSED') ||
      /ECONNREFUSED|fetch failed|连接/i.test(String(e.message) + ' ' + String((e && e.cause && e.cause.message) || ''));
    console.error('[gptgirl] 错误: ' + e.message);
    if (refused) {
      console.error(
        `[gptgirl] 无法连接 127.0.0.1:${CFG.codexDesktop?.debugPort ?? 9222} —— Codex 桌面版可能没有带调试端口运行。请运行: .\\gptgirl.ps1 start`
      );
    }
    process.exit(1);
  });
}

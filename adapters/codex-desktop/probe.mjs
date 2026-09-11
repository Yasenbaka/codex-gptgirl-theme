#!/usr/bin/env node
/**
 * GPTGirl — DOM 探针
 * 抓取 Codex 桌面版页面 DOM 结构概要（标签/类名/底色/透明度，5 层深度），
 * 输出到 .gptgirl/dom-probe-N.json，用于精修皮肤选择器。
 *
 * 用法: node probe.mjs [--port 9222]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cdp, evalIn, listTargets, normalizeWsUrl, pageTargets, describeTarget } from './lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CFG = JSON.parse(readFileSync(join(ROOT, 'gptgirl.config.json'), 'utf8'));

const port = (() => {
  const i = process.argv.indexOf('--port');
  return i > 0 ? Number(process.argv[i + 1]) : CFG.codexDesktop?.debugPort ?? 9222;
})();

const PROBE_EXPR = `(function () {
  function brief(el, depth) {
    const cs = getComputedStyle(el);
    const node = {
      tag: el.tagName.toLowerCase(),
      id: el.id || undefined,
      cls: typeof el.className === 'string' ? el.className.split(' ').filter(Boolean).slice(0, 12) : undefined,
      bg: cs.backgroundColor,
      opacity: cs.opacity,
      children: []
    };
    if (depth > 0) {
      var kids = Array.prototype.slice.call(el.children, 0, 20);
      for (var i = 0; i < kids.length; i++) node.children.push(brief(kids[i], depth - 1));
    }
    return node;
  }
  return {
    href: location.href,
    time: new Date().toISOString(),
    tree: brief(document.documentElement, 5)
  };
})()`;

const pages = pageTargets(await listTargets(port));
console.log(`[gptgirl] 调试端口 ${port}：页面 target ${pages.length} 个`);

const outDir = join(ROOT, '.gptgirl');
mkdirSync(outDir, { recursive: true });

let n = 0;
for (const t of pages) {
  const cdp = new Cdp(normalizeWsUrl(t.webSocketDebuggerUrl, port));
  await cdp.connect();
  const v = await evalIn(cdp, PROBE_EXPR, 30000);
  const file = join(outDir, `dom-probe-${++n}.json`);
  writeFileSync(file, JSON.stringify(v, null, 2));
  console.log(`[gptgirl] ✓ ${describeTarget(t)} -> ${file}`);
  cdp.close();
}
if (n === 0) console.log('[gptgirl] 未发现可探测的页面 target');

#!/usr/bin/env node
// 验证 Codex 应用上皮肤是否真正生效 + 抓取主界面结构概览
import { Cdp, evalIn, listTargets, normalizeWsUrl, pageTargets, describeTarget } from '../adapters/codex-desktop/lib.mjs';

const PORT = 9222;
const targets = pageTargets(await listTargets(PORT))
  .filter(target => String(target.url || '').startsWith('app://-/'));
console.log('页面 targets:');
for (const t of targets) console.log(`  - ${t.title} | ${String(t.url || '').slice(0, 70)}`);

const main = targets.find((t) => !String(t.url).includes('avatar-overlay')) || targets[0];
const cdp = new Cdp(normalizeWsUrl(main.webSocketDebuggerUrl, PORT));
await cdp.connect();

const info = await evalIn(cdp, `(function () {
  const c = getComputedStyle(document.documentElement, '::before');
  const root = document.body && document.body.firstElementChild;
  const rootCs = root ? getComputedStyle(root) : null;
  return {
    href: location.href,
    bgLen: c.backgroundImage.length,
    bgHead: c.backgroundImage.slice(0, 55),
    bgSize: c.backgroundSize,
    bodyChildren: document.body ? document.body.children.length : 0,
    firstBodyChild: root ? (root.tagName + '#' + (root.id || '') + '.' + String(root.className || '').split(' ').slice(0, 5).join('.')) : null,
    firstBg: rootCs ? rootCs.backgroundColor : null,
    firstOpacity: rootCs ? rootCs.opacity : null,
    skinEls: document.querySelectorAll('#gptgirl-skin').length,
    adoptedRules: (document.adoptedStyleSheets || []).reduce((n, s) => n + s.cssRules.length, 0)
  };
})()`, 30000);

console.log('\n主窗口注入状态:');
console.log(JSON.stringify(info, null, 2));

// 抓取主要容器大纲（用于提示可精修的层）
const outline = await evalIn(cdp, `(function () {
  function brief(el, depth) {
    if (!el || depth < 0) return null;
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || undefined,
      cls: typeof el.className === 'string' ? el.className.split(' ').filter(Boolean).slice(0, 6) : undefined,
      bg: cs.backgroundColor,
      opacity: cs.opacity,
      kids: depth > 0 ? Array.prototype.slice.call(el.children, 0, 8).map(function (k) { return brief(k, depth - 1); }).filter(Boolean) : []
    };
  }
  return brief(document.body, 3);
})()`, 30000);
console.log('\n主界面结构概览（body 起，3 层）:');
console.log(JSON.stringify(outline, null, 2));

// 检查主要内容面板是否半透明
const surface = await evalIn(cdp, `(function () {
  const m = document.querySelector('main[class*="bg-surface"], .bg-surface');
  return m ? { bg: getComputedStyle(m).backgroundColor, opacity: getComputedStyle(m).opacity } : null;
})()`, 30000);
console.log('\n主内容面板 (.bg-surface) 背景:', JSON.stringify(surface));

cdp.close();
process.exit(0);

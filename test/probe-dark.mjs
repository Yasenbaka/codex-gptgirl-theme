#!/usr/bin/env node
// 探测 Codex 深色模式标识
import { Cdp, evalIn, listTargets, normalizeWsUrl, pageTargets } from '../adapters/codex-desktop/lib.mjs';

const PORT = 9222;
const targets = pageTargets(await listTargets(PORT));
const main = targets.find((t) => !String(t.url).includes('avatar-overlay')) || targets[0];
const cdp = new Cdp(normalizeWsUrl(main.webSocketDebuggerUrl, PORT));
await cdp.connect();

const info = await evalIn(cdp, `(function () {
  var de = document.documentElement, b = document.body;
  var cls = function (el) { return el ? String(el.className || '') : ''; };
  var m = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
  var names = (cls(de) + ' ' + cls(b)).split(/\\s+/).filter(function (x) { return /dark|light|theme|electron/i.test(x); });
  return {
    htmlClass: cls(de),
    bodyClass: cls(b),
    colorScheme: getComputedStyle(de).colorScheme,
    prefersDark: m ? m.matches : null,
    dataTheme: de.getAttribute('data-theme'),
    themeClasses: Array.from(new Set(names)).slice(0, 25)
  };
})()`, 30000);

console.log(JSON.stringify(info, null, 2));
cdp.close();
process.exit(0);

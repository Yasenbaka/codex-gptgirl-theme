#!/usr/bin/env node
/**
 * 在已运行的 Codex 上验证插件开关往返和样式隔离。
 * 测试会恢复运行前的 GPTGirl 开关，并清理测试哨兵样式表。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { Cdp, evalIn, listTargets, normalizeWsUrl, pageTargets } from '../adapters/codex-desktop/lib.mjs';
import { buildTheme } from '../adapters/codex-desktop/build-theme.mjs';
import { checkAll, cssHash } from '../adapters/codex-desktop/inject.mjs';
import {
  defaultCodexConfigPath, pluginEnabledFromToml, setPluginEnabledInToml,
} from '../adapters/codex-desktop/plugin-state.mjs';

const port = 9222;
const configPath = defaultCodexConfigPath();
const original = readFileSync(configPath, 'utf8');
const originalEnabled = pluginEnabledFromToml(original);
const expectedHash = cssHash(buildTheme({ quiet: true }).css);
const sentinelName = '__gptgirlIsolationSentinel';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function setEnabled(enabled) {
  const current = readFileSync(configPath, 'utf8');
  writeFileSync(configPath, setPluginEnabledInToml(current, enabled), 'utf8');
}

async function inEveryPage(expression) {
  const pages = pageTargets(await listTargets(port))
    .filter(target => String(target.url || '').startsWith('app://-/'));
  const values = [];
  for (const target of pages) {
    const cdp = new Cdp(normalizeWsUrl(target.webSocketDebuggerUrl, port));
    try {
      await cdp.connect();
      values.push(await evalIn(cdp, expression));
    } finally {
      cdp.close();
    }
  }
  return values;
}

async function waitFor(predicate, label, timeoutMs = 15_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const statuses = await checkAll(port, expectedHash);
    if (statuses.length > 0 && predicate(statuses)) return statuses;
    await sleep(300);
  }
  throw new Error(`${label} 超时`);
}

async function installSentinel() {
  const values = await inEveryPage(`(function () {
    const previous = window.${sentinelName};
    if (previous) {
      document.adoptedStyleSheets = Array.from(document.adoptedStyleSheets || []).filter(s => s !== previous);
    }
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(':root { --gptgirl-isolation-sentinel: kept; }');
    document.adoptedStyleSheets = Array.from(document.adoptedStyleSheets || []).concat([sheet]);
    window.${sentinelName} = sheet;
    return Array.from(document.adoptedStyleSheets || []).includes(sheet);
  })()`);
  if (!values.every(Boolean)) throw new Error('测试哨兵样式表安装失败');
}

async function sentinelPresent() {
  return inEveryPage(`(function () {
    const sheet = window.${sentinelName};
    return !!sheet && Array.from(document.adoptedStyleSheets || []).includes(sheet)
      && getComputedStyle(document.documentElement).getPropertyValue('--gptgirl-isolation-sentinel').trim() === 'kept';
  })()`);
}

async function removeSentinel() {
  await inEveryPage(`(function () {
    const sheet = window.${sentinelName};
    if (sheet) {
      document.adoptedStyleSheets = Array.from(document.adoptedStyleSheets || []).filter(s => s !== sheet);
    }
    delete window.${sentinelName};
    return true;
  })()`);
}

try {
  if (!originalEnabled) setEnabled(true);
  await waitFor(statuses => statuses.every(status => status.current), '等待初始主题');
  await installSentinel();

  setEnabled(false);
  const disabled = await waitFor(statuses => statuses.every(status => !status.present), '等待停用主题');
  const sentinels = await sentinelPresent();
  if (!sentinels.every(Boolean)) throw new Error('停用 GPTGirl 时误删了非 GPTGirl 样式表');
  console.log(`✓ 停用：${disabled.length} 个页面均已移除 GPTGirl，隔离哨兵保留`);

  setEnabled(true);
  const enabled = await waitFor(statuses => statuses.every(status => status.current), '等待重新启用主题');
  console.log(`✓ 启用：${enabled.length} 个页面均恢复当前主题版本 ${expectedHash}`);
} finally {
  try { await removeSentinel(); } catch {}
  setEnabled(originalEnabled);
  if (originalEnabled) {
    try { await waitFor(statuses => statuses.every(status => status.current), '恢复原始启用状态'); } catch {}
  }
}

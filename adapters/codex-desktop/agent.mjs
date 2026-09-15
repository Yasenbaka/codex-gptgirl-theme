#!/usr/bin/env node
/**
 * GPTGirl Codex 插件代理：监听 Codex Plugins 开关，按需注入或移除主题。
 * 代理不会修改 Codex 安装目录；仅在未来启动缺少 CDP 且插件已启用时，
 * 才委托 restart-codex.ps1 做一次自动重启。安装时传入的受保护 PID
 * 在对应 Codex 会话自然退出前禁止这个重启动作。
 */
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { buildTheme } from './build-theme.mjs';
import { checkAll, cssHash, injectAll, isCodexAppTarget, removeAll } from './inject.mjs';
import {
  defaultCodexConfigPath, PLUGIN_ID, readPluginEnabled, readPluginInstalled, writePluginEnabled,
} from './plugin-state.mjs';
import { listTargets } from './lib.mjs';
import { removePluginControl, syncPluginControl } from './ui-control.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RUNTIME_DIR = join(ROOT, '.gptgirl');
const LOCK_PATH = join(RUNTIME_DIR, 'plugin-agent.lock');
const LOG_PATH = join(RUNTIME_DIR, 'plugin-agent.log');
const CONFIG_PATH = join(ROOT, 'gptgirl.config.json');
const CODEX_CONFIG_PATH = defaultCodexConfigPath();
const NO_RESTART = process.argv.includes('--no-restart');
let protectedPids = (() => {
  const argument = process.argv.find(value => value.startsWith('--protect-pids='));
  if (!argument) return [];
  return argument.slice('--protect-pids='.length)
    .split(',')
    .map(value => Number(value))
    .filter(value => Number.isSafeInteger(value) && value > 0);
})();
const INITIAL_DELAY_MS = 250;
const LOOP_DELAY_MS = 1500;
const RESTART_GRACE_MS = 12_000;

let lockFd;
let ownsLock = false;
let stopping = false;
let lastEnabled;
let lastCssSignature = '';
let currentCss = '';
let currentHash = '';
let restartRequested = false;
let codexWithoutPortSince = 0;
let missingInstallPolls = 0;
let absentLogged = false;

function timestamp() {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

function log(message) {
  mkdirSync(RUNTIME_DIR, { recursive: true });
  const line = `[${timestamp()}] ${message}\n`;
  try {
    const previous = existsSync(LOG_PATH) ? readFileSync(LOG_PATH, 'utf8') : '';
    const bounded = previous.length > 512 * 1024 ? previous.slice(-256 * 1024) : previous;
    writeFileSync(LOG_PATH, bounded + line);
  } catch {
    // 日志失败不能影响 Codex 或主题状态。
  }
}

function sleep(ms) {
  return new Promise(resolvePromise => setTimeout(resolvePromise, ms));
}

function acquireLock() {
  mkdirSync(RUNTIME_DIR, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      lockFd = openSync(LOCK_PATH, 'wx');
      writeFileSync(lockFd, String(process.pid));
      ownsLock = true;
      return true;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let owner = 0;
      try { owner = Number(readFileSync(LOCK_PATH, 'utf8').trim()); } catch {}
      if (owner > 0 && processExists(owner)) return false;
      rmSync(LOCK_PATH, { force: true });
    }
  }
  return false;
}

function tasklistContains(filter, expected) {
  const result = spawnSync('tasklist.exe', ['/FI', filter, '/FO', 'CSV', '/NH'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  return result.status === 0 && String(result.stdout).toLowerCase().includes(expected.toLowerCase());
}

function processExists(pid) {
  if (process.platform === 'win32') return tasklistContains(`PID eq ${pid}`, `,"${pid}",`);
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function codexRunning() {
  if (process.platform !== 'win32') return false;
  return tasklistContains('IMAGENAME eq ChatGPT.exe', '"ChatGPT.exe"');
}

function releaseLock() {
  if (!ownsLock) return;
  if (lockFd !== undefined) {
    try { closeSync(lockFd); } catch {}
    lockFd = undefined;
  }
  try { rmSync(LOCK_PATH, { force: true }); } catch {}
  ownsLock = false;
}

function inputSignature() {
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  const images = [config.image, config.imageDark || config.image]
    .map(relative => statSync(resolve(ROOT, relative)).mtimeMs);
  return [statSync(CONFIG_PATH).mtimeMs, statSync(join(ROOT, 'core', 'theme.css.tpl')).mtimeMs, ...images].join(':');
}

function refreshTheme() {
  const signature = inputSignature();
  if (signature === lastCssSignature && currentCss) return false;
  const built = buildTheme({ quiet: true });
  currentCss = built.css;
  currentHash = cssHash(currentCss);
  lastCssSignature = signature;
  log(`主题已编译，版本 ${currentHash}`);
  return true;
}

async function portReady(port) {
  try {
    const targets = await listTargets(port);
    return targets.some(isCodexAppTarget);
  } catch {
    return false;
  }
}

function requestRestart() {
  if (NO_RESTART || restartRequested) return;
  protectedPids = protectedPids.filter(processExists);
  if (protectedPids.length > 0) return;
  restartRequested = true;
  const powershell = process.env.SystemRoot
    ? join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe';
  const script = join(ROOT, 'adapters', 'codex-desktop', 'restart-codex.ps1');
  const child = spawn(powershell, [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script,
  ], {
    cwd: ROOT,
    detached: true,
    windowsHide: true,
    stdio: 'ignore',
  });
  child.unref();
  log('检测到 Codex 缺少本地调试端口，已请求一次带 CDP 参数的重启');
}

async function reconcile() {
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  const port = Number(config.codexDesktop?.debugPort ?? 9222);
  if (!readPluginInstalled(CODEX_CONFIG_PATH)) {
    missingInstallPolls += 1;
    if (missingInstallPolls < 3) return;
    if (await portReady(port)) {
      await removeAll(port);
      await removePluginControl(port);
    }
    stopping = true;
    log(`Codex 插件 ${PLUGIN_ID} 已卸载，已清理运行时内容并退出代理`);
    return;
  }
  missingInstallPolls = 0;
  let enabled = readPluginEnabled(CODEX_CONFIG_PATH);
  if (enabled !== lastEnabled) {
    log(`Codex 插件 ${PLUGIN_ID} 已${enabled ? '启用' : '停用'}`);
    lastEnabled = enabled;
  }

  if (!(await portReady(port))) {
    if (!absentLogged) {
      log(`CDP 端口 ${port} 暂不可用${NO_RESTART ? '；本进程禁止自动重启' : ''}`);
      absentLogged = true;
    }
    if (codexRunning()) {
      if (codexWithoutPortSince === 0) codexWithoutPortSince = Date.now();
      if (Date.now() - codexWithoutPortSince >= RESTART_GRACE_MS) requestRestart();
    } else {
      codexWithoutPortSince = 0;
    }
    return;
  }
  absentLogged = false;
  codexWithoutPortSince = 0;

  const control = await syncPluginControl(port, enabled);
  if (typeof control.request === 'boolean') {
    if (control.request !== enabled) {
      writePluginEnabled(control.request, CODEX_CONFIG_PATH);
      enabled = control.request;
      lastEnabled = enabled;
      log(`GPTGirl 详情页开关请求${enabled ? '启用' : '停用'}主题`);
    }
    await syncPluginControl(port, enabled, true);
  }

  if (!enabled) {
    const statuses = await checkAll(port);
    if (statuses.some(status => status.present)) {
      const removed = await removeAll(port);
      log(`已从 ${removed.filter(result => result.removed).length}/${removed.length} 个页面移除主题`);
    }
    return;
  }

  const changed = refreshTheme();
  const statuses = await checkAll(port, currentHash);
  if (changed || statuses.length === 0 || statuses.some(status => !status.current || status.error)) {
    const results = await injectAll(port, currentCss);
    const succeeded = results.filter(result => !result.error).length;
    for (const result of results) result.cdp?.close();
    log(`主题已同步至 ${succeeded}/${results.length} 个页面`);
  }
}

async function main() {
  if (!acquireLock()) return;
  const protection = protectedPids.length > 0 ? `（保护当前 Codex PID：${protectedPids.join(',')}）` : '';
  log(`插件代理启动${NO_RESTART ? '（禁止自动重启）' : protection}`);
  process.once('SIGINT', () => { stopping = true; });
  process.once('SIGTERM', () => { stopping = true; });
  await sleep(INITIAL_DELAY_MS);
  while (!stopping) {
    try {
      await reconcile();
    } catch (error) {
      log(`同步失败：${error?.message || String(error)}`);
    }
    await sleep(LOOP_DELAY_MS);
  }
  releaseLock();
}

try {
  await main();
} finally {
  releaseLock();
}

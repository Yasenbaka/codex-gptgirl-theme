import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cdp, evalIn, listTargets, normalizeWsUrl, pageTargets } from './lib.mjs';

const CONTROL_ID = 'gptgirl-plugin-toggle';
const DETAIL_MARKER = 'Codex 桌面版背景与透明主题';

function controlExpression(enabled, acknowledge = false) {
  return `(function () {
    const id = ${JSON.stringify(CONTROL_ID)};
    const detailMarker = ${JSON.stringify(DETAIL_MARKER)};
    const main = Array.from(document.querySelectorAll('main')).find(function (element) {
      const text = String(element.innerText || '');
      return text.includes(detailMarker) && text.includes('GPTGirl')
        && text.includes('Yasenbaka') && text.includes('2.0.0');
    });
    const existing = document.getElementById(id);
    const isDetail = !!main;
    if (!isDetail) {
      if (existing) existing.remove();
      return { visible: false, request: null };
    }

    let host = existing;
    let button;
    if (!host) {
      const officialAction = Array.from(main.querySelectorAll('button')).find(function (element) {
        return String(element.innerText || '').trim() === '立即试用';
      });
      host = document.createElement('div');
      host.id = id;
      host.style.cssText = [
        'display:flex', 'align-items:center', 'justify-content:space-between', 'gap:16px',
        'width:100%', 'box-sizing:border-box', 'margin:12px 0', 'padding:12px 14px',
        'border:1px solid color-mix(in srgb,currentColor 16%,transparent)', 'border-radius:12px',
        'background:color-mix(in srgb,var(--color-background-primary,#fff) 82%,transparent)'
      ].join(';');
      const copy = document.createElement('div');
      copy.style.cssText = 'display:flex;flex-direction:column;gap:2px;min-width:0';
      const title = document.createElement('strong');
      title.textContent = 'GPTGirl 主题';
      title.style.cssText = 'font-size:14px;font-weight:600';
      const hint = document.createElement('span');
      hint.textContent = '即时启用或停止背景与透明界面';
      hint.style.cssText = 'font-size:12px;opacity:.68';
      copy.append(title, hint);
      button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'switch');
      button.setAttribute('aria-label', 'GPTGirl 主题');
      button.style.cssText = [
        'min-width:88px', 'padding:7px 12px', 'border:0', 'border-radius:999px',
        'color:white', 'font-size:13px', 'font-weight:600', 'cursor:pointer'
      ].join(';');
      button.addEventListener('click', function () {
        const next = button.getAttribute('aria-checked') !== 'true';
        window.__gptgirlToggleRequest = next;
        button.disabled = true;
        button.textContent = next ? '正在启用…' : '正在停用…';
        button.style.opacity = '.68';
      });
      host.append(copy, button);

      const actionContainer = officialAction && officialAction.parentElement;
      if (actionContainer && actionContainer.parentElement) {
        actionContainer.parentElement.insertBefore(host, actionContainer.nextSibling);
      } else {
        main.insertBefore(host, main.firstChild);
      }
    } else {
      button = host.querySelector('[role="switch"]');
    }

    if (button) {
      button.disabled = false;
      button.style.opacity = '1';
      button.setAttribute('aria-checked', ${enabled ? "'true'" : "'false'"});
      button.textContent = ${enabled ? "'已启用'" : "'已停用'"};
      button.style.background = ${enabled ? "'#8870d8'" : "'#777'"};
    }
    const request = typeof window.__gptgirlToggleRequest === 'boolean'
      ? window.__gptgirlToggleRequest : null;
    if (${acknowledge ? 'true' : 'false'}) delete window.__gptgirlToggleRequest;
    return { visible: true, request: request };
  })()`;
}

const REMOVE_CONTROL_EXPRESSION = `(function () {
  const element = document.getElementById(${JSON.stringify(CONTROL_ID)});
  if (element) element.remove();
  delete window.__gptgirlToggleRequest;
  return true;
})()`;

async function evaluateEveryPage(port, expression) {
  const pages = pageTargets(await listTargets(port))
    .filter(target => String(target.url || '').startsWith('app://-/'));
  const results = [];
  for (const target of pages) {
    const cdp = new Cdp(normalizeWsUrl(target.webSocketDebuggerUrl, port));
    try {
      await cdp.connect();
      results.push({ target, value: await evalIn(cdp, expression) });
    } catch (error) {
      results.push({ target, error: error.message });
    } finally {
      cdp.close();
    }
  }
  return results;
}

/** 同步 GPTGirl 详情页开关，并返回用户最新请求。 */
export async function syncPluginControl(port, enabled, acknowledge = false) {
  const results = await evaluateEveryPage(port, controlExpression(enabled, acknowledge));
  const request = results
    .map(result => result.value?.request)
    .find(value => typeof value === 'boolean');
  return { results, request };
}

/** 从所有 Codex 页面移除 GPTGirl 自己添加的设置控件。 */
export async function removePluginControl(port) {
  return evaluateEveryPage(port, REMOVE_CONTROL_EXPRESSION);
}

const isEntry = process.argv[1]
  && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (isEntry) {
  const action = process.argv[2] || 'sync';
  const portArgument = process.argv.indexOf('--port');
  const port = portArgument >= 0 ? Number(process.argv[portArgument + 1]) : 9222;
  if (action === 'remove') await removePluginControl(port);
  else {
    console.error(`未知操作: ${action}`);
    process.exitCode = 2;
  }
}

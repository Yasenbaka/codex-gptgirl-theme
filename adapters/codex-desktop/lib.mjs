/**
 * GPTGirl — CDP 公共库（零依赖，Node >= 22，使用全局 fetch / WebSocket）
 */

/** 把 CDP 的 webSocketDebuggerUrl 统一改写为 127.0.0.1（规避 DNS / 代理干扰） */
export function normalizeWsUrl(url, port) {
  return String(url).replace(/^ws:\/\/[^/]+/, `ws://127.0.0.1:${port}`);
}

/** 获取调试端口上的全部 target 列表 */
export async function listTargets(port) {
  const r = await fetch(`http://127.0.0.1:${port}/json/list`, {
    signal: AbortSignal.timeout(3000),
  });
  if (!r.ok) throw new Error(`/json/list HTTP ${r.status}`);
  return r.json();
}

/** 过滤出可注入的页面 target */
export function pageTargets(targets) {
  return (targets || []).filter(
    (t) =>
      t.type === 'page' &&
      t.webSocketDebuggerUrl &&
      !String(t.url || '').startsWith('devtools://')
  );
}

export function describeTarget(t) {
  const url = String(t.url || '');
  return `${t.title || '无标题'} <${url.length > 72 ? url.slice(0, 72) + '…' : url}>`;
}

/** 极简 CDP 客户端 */
export class Cdp {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.seq = 0;
    this.pending = new Map();
    this.closed = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      let ws;
      try {
        ws = new WebSocket(this.wsUrl);
      } catch (e) {
        return reject(e);
      }
      this.ws = ws;
      const timer = setTimeout(() => {
        try { ws.close(); } catch {}
        reject(new Error('连接超时'));
      }, 8000);
      ws.onopen = () => {
        clearTimeout(timer);
        resolve(this);
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error('WebSocket 连接失败'));
      };
      ws.onclose = () => {
        this.closed = true;
        for (const p of this.pending.values()) p.reject(new Error('连接已关闭'));
        this.pending.clear();
      };
      ws.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
        } catch {
          return;
        }
        if (msg.id != null && this.pending.has(msg.id)) {
          const p = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) {
            p.reject(new Error(`${msg.error.message || 'CDP 错误'}${msg.error.code ? ' (' + msg.error.code + ')' : ''}`));
          } else {
            p.resolve(msg.result);
          }
        }
      };
    });
  }

  send(method, params = {}, timeoutMs = 20000) {
    if (this.closed || !this.ws || this.ws.readyState !== 1 /* OPEN */) {
      return Promise.reject(new Error(`${method}: 连接不可用`));
    }
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} 超时`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.closed = true;
    try { this.ws && this.ws.close(); } catch {}
  }
}

/** 在页面里执行表达式并取回返回值 */
export async function evalIn(cdp, expression, timeoutMs, awaitPromise = false) {
  const r = await cdp.send(
    'Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise },
    timeoutMs
  );
  if (r.exceptionDetails) {
    const d =
      r.exceptionDetails.exception && r.exceptionDetails.exception.description;
    throw new Error(d || r.exceptionDetails.text || '页面内执行出错');
  }
  return r.result && r.result.value;
}

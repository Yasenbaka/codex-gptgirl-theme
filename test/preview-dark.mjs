#!/usr/bin/env node
// 预览深色模式：临时把 <html> 切到 electron-dark，截图后还原
import { writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cdp, evalIn, listTargets, normalizeWsUrl, pageTargets } from '../adapters/codex-desktop/lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 9222;
const targets = pageTargets(await listTargets(PORT));
const main = targets.find((t) => !String(t.url).includes('avatar-overlay')) || targets[0];
const cdp = new Cdp(normalizeWsUrl(main.webSocketDebuggerUrl, PORT));
await cdp.connect();
await cdp.send('Page.enable');

const before = await evalIn(cdp, `document.documentElement.className`, 30000);
console.log('before class:', before);
await evalIn(cdp, `document.documentElement.className = 'electron-dark'`, 30000);
await new Promise((r) => setTimeout(r, 1200));
const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, 30000);
const out = join(ROOT, 'preview-dark.png');
writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log('深色预览已保存:', out, Buffer.from(shot.data, 'base64').length, 'bytes');
// 还原
await evalIn(cdp, `document.documentElement.className = 'electron-light'`, 30000);
console.log('已还原为 electron-light');
cdp.close();
process.exit(0);

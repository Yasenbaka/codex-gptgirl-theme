#!/usr/bin/env node
// 抓取 Codex 主窗口截图（验证用）
import { writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cdp, listTargets, normalizeWsUrl, pageTargets } from '../adapters/codex-desktop/lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 9222;
const targets = pageTargets(await listTargets(PORT));
const main = targets.find((t) => !String(t.url).includes('avatar-overlay')) || targets[0];
const cdp = new Cdp(normalizeWsUrl(main.webSocketDebuggerUrl, PORT));
await cdp.connect();
await cdp.send('Page.enable');

const brand = await cdp.send('Page.captureScreenshot', { format: 'png' }, 30000);
const brandBuf = Buffer.from(brand.data, 'base64');
const out = join(ROOT, 'preview.png');
writeFileSync(out, brandBuf);
console.log('截图已保存:', out, brandBuf.length, 'bytes');

cdp.close();
process.exit(0);

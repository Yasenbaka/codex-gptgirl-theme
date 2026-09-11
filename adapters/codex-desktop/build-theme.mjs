#!/usr/bin/env node
/**
 * GPTGirl — 主题编译器
 * 读取 gptgirl.config.json + core/theme.css.tpl + 亮/暗两张背景图
 * 产出 dist/theme.css（图片以 data URI 内嵌，规避 CSP / file:// 限制）
 * 支持亮色（html）与深色（html.electron-dark）两套背景与配色。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CFG = JSON.parse(readFileSync(join(ROOT, 'gptgirl.config.json'), 'utf8'));
const s = CFG.style || {};

const tpl = readFileSync(join(ROOT, 'core', 'theme.css.tpl'), 'utf8');

function mimeOf(p) {
  const ext = String(p).toLowerCase().split('.').pop();
  return { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }[ext] || 'image/png';
}
function bgUri(p) {
  const abs = resolve(ROOT, p);
  const b64 = readFileSync(abs).toString('base64');
  return `url("data:${mimeOf(p)};base64,${b64}")`;
}

const css = tpl
  .replaceAll('{{GG_BG_IMAGE}}', bgUri(CFG.image))
  .replaceAll('{{GG_BG_IMAGE_DARK}}', bgUri(CFG.imageDark || CFG.image))
  .replaceAll('{{GG_FIT}}', s.fit ?? 'cover')
  .replaceAll('{{GG_POSITION}}', s.position ?? 'center')
  .replaceAll('{{GG_BG_ALPHA}}', String(s.backgroundAlpha ?? 1))
  .replaceAll('{{GG_BLUR}}', s.blur ?? '0px')
  .replaceAll('{{GG_VEIL}}', s.veil ?? 'rgba(0, 0, 0, 0)')
  .replaceAll('{{GG_DARK_VEIL}}', s.veilDark ?? 'rgba(4, 6, 12, 0.35)')
  .replaceAll('{{GG_UI_OPACITY}}', String(s.uiOpacity ?? 1))
  .replaceAll('{{GG_EXTRA_CSS}}', String(s.extraCss ?? '').trim());

mkdirSync(join(ROOT, 'dist'), { recursive: true });
writeFileSync(join(ROOT, 'dist', 'theme.css'), css);
console.log(
  `[gptgirl] 主题已编译 -> dist/theme.css（${(css.length / 1048576).toFixed(2)} MB；` +
  `亮图 ${CFG.image} + 暗图 ${CFG.imageDark || CFG.image}）`
);

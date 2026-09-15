#!/usr/bin/env node
/**
 * GPTGirl — 主题编译器
 * 读取 gptgirl.config.json + core/theme.css.tpl + 亮/暗两张背景图，
 * 产出 dist/theme.css（图片以 data URI 内嵌，规避 CSP / file:// 限制）。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function mimeOf(path) {
  const ext = String(path).toLowerCase().split('.').pop();
  return { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }[ext] || 'image/png';
}

function backgroundUri(path) {
  const absolute = resolve(ROOT, path);
  const base64 = readFileSync(absolute).toString('base64');
  return `url("data:${mimeOf(path)};base64,${base64}")`;
}

/** 编译当前配置对应的完整主题并返回产物信息。 */
export function buildTheme({ quiet = false } = {}) {
  const config = JSON.parse(readFileSync(join(ROOT, 'gptgirl.config.json'), 'utf8'));
  const style = config.style || {};
  const template = readFileSync(join(ROOT, 'core', 'theme.css.tpl'), 'utf8');
  const darkImage = config.imageDark || config.image;
  const css = template
    .replaceAll('{{GG_BG_IMAGE}}', backgroundUri(config.image))
    .replaceAll('{{GG_BG_IMAGE_DARK}}', backgroundUri(darkImage))
    .replaceAll('{{GG_FIT}}', style.fit ?? 'cover')
    .replaceAll('{{GG_POSITION}}', style.position ?? 'center')
    .replaceAll('{{GG_BG_ALPHA}}', String(style.backgroundAlpha ?? 1))
    .replaceAll('{{GG_BLUR}}', style.blur ?? '0px')
    .replaceAll('{{GG_VEIL}}', style.veil ?? 'rgba(0, 0, 0, 0)')
    .replaceAll('{{GG_DARK_VEIL}}', style.veilDark ?? 'rgba(4, 6, 12, 0.35)')
    .replaceAll('{{GG_UI_OPACITY}}', String(style.uiOpacity ?? 1))
    .replaceAll('{{GG_EXTRA_CSS}}', String(style.extraCss ?? '').trim());

  const outputPath = join(ROOT, 'dist', 'theme.css');
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, css);
  if (!quiet) {
    console.log(
      `[gptgirl] 主题已编译 -> dist/theme.css（${(css.length / 1048576).toFixed(2)} MB；`
      + `亮图 ${config.image} + 暗图 ${darkImage}）`,
    );
  }
  return { css, outputPath, config };
}

const isEntry = process.argv[1]
  && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (isEntry) buildTheme();

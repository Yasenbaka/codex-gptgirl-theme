import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const MARKETPLACE_NAME = 'gptgirl-local';
export const PLUGIN_NAME = 'gptgirl';
export const PLUGIN_ID = `${PLUGIN_NAME}@${MARKETPLACE_NAME}`;

/** Codex 默认配置文件路径。 */
export function defaultCodexConfigPath() {
  return join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'config.toml');
}

/** 转义普通字符串，使其可以安全进入正则表达式。 */
function regexEscape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 从 Codex TOML 中读取一个插件节的 enabled 值。
 * 这里只解释目标节，不重排或重写用户的其余配置。
 */
export function pluginEnabledFromToml(text, pluginId = PLUGIN_ID) {
  const header = new RegExp(`^[ \\t]*\\[plugins\\.${regexEscape(JSON.stringify(pluginId))}\\][ \\t]*(?:#.*)?$`, 'm');
  const match = header.exec(String(text));
  if (!match) return false;
  const after = String(text).slice(match.index + match[0].length);
  const nextHeader = /^\s*\[/m.exec(after);
  const section = nextHeader ? after.slice(0, nextHeader.index) : after;
  const enabled = /^\s*enabled\s*=\s*(true|false)\s*(?:#.*)?$/mi.exec(section);
  return enabled?.[1].toLowerCase() === 'true';
}

/** 判断配置中是否仍登记了指定插件。 */
export function pluginInstalledFromToml(text, pluginId = PLUGIN_ID) {
  const header = new RegExp(`^[ \\t]*\\[plugins\\.${regexEscape(JSON.stringify(pluginId))}\\][ \\t]*(?:#.*)?$`, 'm');
  return header.test(String(text));
}

/** 读取磁盘上的当前 GPTGirl 插件开关；文件暂时不可读时安全地视为停用。 */
export function readPluginEnabled(configPath = defaultCodexConfigPath()) {
  try {
    return pluginEnabledFromToml(readFileSync(configPath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

/** 读取磁盘上的 GPTGirl 安装登记。 */
export function readPluginInstalled(configPath = defaultCodexConfigPath()) {
  try {
    return pluginInstalledFromToml(readFileSync(configPath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

/**
 * 定点新增或更新 GPTGirl 插件节，完整保留配置中的其他内容。
 * @returns 更新后的 TOML 文本。
 */
export function setPluginEnabledInToml(text, enabled, pluginId = PLUGIN_ID) {
  const source = String(text);
  const headerText = `[plugins.${JSON.stringify(pluginId)}]`;
  const header = new RegExp(`^[ \\t]*\\[plugins\\.${regexEscape(JSON.stringify(pluginId))}\\][ \\t]*(?:#.*)?$`, 'm');
  const match = header.exec(source);
  if (!match) {
    const separator = source.length === 0 || source.endsWith('\n\n') ? '' : source.endsWith('\n') ? '\n' : '\n\n';
    return `${source}${separator}${headerText}\nenabled = ${enabled}\n`;
  }

  const bodyStart = match.index + match[0].length;
  const after = source.slice(bodyStart);
  const nextHeader = /^\s*\[/m.exec(after);
  const bodyEnd = bodyStart + (nextHeader ? nextHeader.index : after.length);
  const body = source.slice(bodyStart, bodyEnd);
  const enabledLine = /^(\s*)enabled\s*=\s*(?:true|false)(\s*(?:#.*)?)$/mi;
  const nextBody = enabledLine.test(body)
    ? body.replace(enabledLine, `$1enabled = ${enabled}$2`)
    : `${body.replace(/\s*$/, '')}\nenabled = ${enabled}\n`;
  return source.slice(0, bodyStart) + nextBody + source.slice(bodyEnd);
}

/** 将指定开关写入 Codex 配置文件。 */
export function writePluginEnabled(enabled, configPath = defaultCodexConfigPath()) {
  let source = '';
  try {
    source = readFileSync(configPath, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const next = setPluginEnabledInToml(source, enabled);
  if (next !== source) {
    const temporary = `${configPath}.gptgirl-${process.pid}.tmp`;
    try {
      writeFileSync(temporary, next, { encoding: 'utf8', flag: 'wx' });
      renameSync(temporary, configPath);
    } finally {
      try { rmSync(temporary, { force: true }); } catch {}
    }
  }
  return next;
}

const isEntry = process.argv[1]
  && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (isEntry) {
  const action = process.argv[2] || 'status';
  if (action === 'status') console.log(readPluginEnabled() ? 'enabled' : 'disabled');
  else if (action === 'enable') writePluginEnabled(true);
  else if (action === 'disable') writePluginEnabled(false);
  else {
    console.error(`未知操作: ${action}`);
    process.exitCode = 2;
  }
}

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PLUGIN_ID, pluginEnabledFromToml, pluginInstalledFromToml, setPluginEnabledInToml,
} from '../adapters/codex-desktop/plugin-state.mjs';

test('缺少 GPTGirl 节时视为未安装且停用', () => {
  assert.equal(pluginInstalledFromToml('model = "gpt"\n'), false);
  assert.equal(pluginEnabledFromToml('model = "gpt"\n'), false);
});

test('只读取目标插件节中的 enabled', () => {
  const toml = [
    '[plugins."other@market"]',
    'enabled = false',
    '',
    `[plugins."${PLUGIN_ID}"]`,
    'enabled = true # 用户设置',
    '',
    '[features]',
    'example = false',
    '',
  ].join('\n');
  assert.equal(pluginInstalledFromToml(toml), true);
  assert.equal(pluginEnabledFromToml(toml), true);
});

test('定点更新现有节并保留其他配置', () => {
  const source = [
    'model = "gpt-6"',
    '',
    `[plugins."${PLUGIN_ID}"]`,
    'enabled = false # keep-comment',
    '',
    '[desktop]',
    'appearanceTheme = "light"',
    '',
  ].join('\n');
  const updated = setPluginEnabledInToml(source, true);
  assert.match(updated, /enabled = true # keep-comment/);
  assert.match(updated, /appearanceTheme = "light"/);
  assert.equal(pluginEnabledFromToml(updated), true);
});

test('缺少目标节时追加一个独立插件节', () => {
  const source = 'model = "gpt-6"\n';
  const updated = setPluginEnabledInToml(source, true);
  assert.equal(pluginEnabledFromToml(updated), true);
  assert.ok(updated.includes(`[plugins."${PLUGIN_ID}"]`));
  assert.ok(updated.startsWith(source));
});

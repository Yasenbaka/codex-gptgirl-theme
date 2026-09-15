import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PLUGIN_ID, pluginEnabledFromToml, pluginInstalledFromToml, setMarketplaceSourceInToml,
  setPluginEnabledInToml,
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

test('定点迁移已登记 Marketplace 的 Windows 路径', () => {
  const oldSource = String.raw`\\?\D:\Project_Yasenbaka\codex-plugin-gptgirl`;
  const newSource = String.raw`\\?\D:\Project_Yasenbaka\codex-gptgirl-theme`;
  const source = [
    'model = "gpt-6"',
    '',
    '[marketplaces.gptgirl-local]',
    'source_type = "local"',
    `source = '${oldSource}' # keep-comment`,
    '',
    '[plugins."other@market"]',
    'enabled = true',
    '',
  ].join('\n');
  const updated = setMarketplaceSourceInToml(source, newSource);
  assert.ok(updated.includes(`source = ${JSON.stringify(newSource)} # keep-comment`));
  assert.match(updated, /\[plugins\."other@market"\]\nenabled = true/);
  assert.doesNotMatch(updated, /codex-plugin-gptgirl/);
});

test('迁移 Marketplace 时兼容引号节名和 source 键且不产生重复键', () => {
  for (const [sectionName, sourceKey] of [
    ['"gptgirl-local"', '"source"'],
    ["'gptgirl-local'", "'source'"],
  ]) {
    const source = `[marketplaces.${sectionName}]\n${sourceKey} = 'D:\\old'\n`;
    const updated = setMarketplaceSourceInToml(source, 'D:\\new');
    assert.equal(updated.match(/^[ \\t]*(?:source|"source"|'source')[ \\t]*=/gm)?.length, 1);
    assert.ok(updated.includes(`source = ${JSON.stringify('D:\\new')}`));
  }
});

test('未登记目标 Marketplace 时保持配置不变', () => {
  const source = '[marketplaces.other]\nsource = "C:\\\\other"\n';
  assert.equal(setMarketplaceSourceInToml(source, 'D:\\repo'), source);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { isCodexAppTarget, selectThemeTargets } from '../adapters/codex-desktop/inject.mjs';

function target(url, id) {
  return { id, type: 'page', url, webSocketDebuggerUrl: `ws://127.0.0.1:9222/devtools/page/${id}` };
}

test('只识别 app://-/ Codex 渲染窗口', () => {
  assert.equal(isCodexAppTarget(target('app://-/index.html', 'app')), true);
  assert.equal(isCodexAppTarget(target('https://example.com/', 'web')), false);
});

test('生产模式不会向 Codex 内嵌网页注入主题', () => {
  const selected = selectThemeTargets([
    target('https://example.com/', 'web'),
    target('app://-/index.html', 'app'),
    target('app://-/index.html?initialRoute=%2Favatar-overlay', 'overlay'),
  ]);
  assert.deepEqual(selected.map(item => item.id), ['app', 'overlay']);
  assert.deepEqual(selectThemeTargets([target('https://example.com/', 'only-web')]), []);
});

test('隔离测试可显式放行非 Codex 页面', () => {
  assert.deepEqual(
    selectThemeTargets([target('https://example.com/', 'web')], { allowNonCodex: true }).map(item => item.id),
    ['web'],
  );
});

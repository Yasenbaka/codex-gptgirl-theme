/* ============================================================
 * GPTGirl skin for Codex Desktop
 * 本文件是模板：由 adapters/codex-desktop/build-theme.mjs 编译为 dist/theme.css。
 *
 * 重要：背景相关声明一律使用<b>字面量</b>，绝不派发 CSS 变量——
 * 实测在同一个 background-* 声明里混用 var() 与超大 data URI，
 * Chromium 会丢弃整段背景声明（计算值为 none）。
 * ============================================================ */

/* 亮色背景层：固定铺满、绘制在所有内容之下（canvas 之上） */
html::before {
  content: "" !important;
  position: fixed !important;
  inset: 0 !important;
  z-index: -2147483647 !important;
  /* 第一层是可读性暗纱（字面量），第二层是内嵌的背景图（字面量 data URI） */
  background-image: linear-gradient({{GG_VEIL}}, {{GG_VEIL}}), {{GG_BG_IMAGE}} !important;
  background-size: 100% 100%, {{GG_FIT}} !important;
  background-position: center, {{GG_POSITION}} !important;
  background-repeat: no-repeat, no-repeat !important;
  opacity: {{GG_BG_ALPHA}} !important;
  filter: blur({{GG_BLUR}}) !important;
  pointer-events: none !important;
}

/* 深色模式背景：覆盖背景图为深色（Codex 以 html.electron-dark 标识深色主题） */
html.electron-dark::before {
  background-image: linear-gradient({{GG_DARK_VEIL}}, {{GG_DARK_VEIL}}), {{GG_BG_IMAGE_DARK}} !important;
}

html,
body {
  background-color: transparent !important;
}

/* UI 层整体轻微半透明，透出背景（双透明度模型：背景浓度 + UI 透明度） */
body > * {
  opacity: {{GG_UI_OPACITY}} !important;
}

/* 常见不透明底容器做柔和过渡（匹配不到也无副作用） */
body > [class*="bg-"],
#root,
#app,
#__next {
  transition: background-color 0.3s ease;
}

/*
 * 将左侧栏的毛玻璃延伸进原生标题栏，同时让应用菜单避开侧栏。
 * 侧栏宽度由 Codex 自身维护，拖动调整宽度后菜单仍会跟随。
 */
aside.app-shell-left-panel {
  top: calc(-1 * var(--height-toolbar-sm, 36px)) !important;
  height: calc(100% + var(--height-toolbar-sm, 36px)) !important;
  margin-bottom: calc(-1 * var(--height-toolbar-sm, 36px)) !important;
}

aside.app-shell-left-panel > .max-w-full.overflow-hidden {
  box-sizing: border-box !important;
  padding-top: var(--height-toolbar-sm, 36px) !important;
}

aside.app-shell-left-panel > [class*="group/panel-resizer"] {
  top: 0 !important;
}

[class*="_ApplicationMenuTopBar_"] > [role="menubar"] {
  position: absolute !important;
  inset-inline-start: var(--codex-sidebar-preferred-width, 240px) !important;
  top: 6px !important;
}

/* 最大化时标题栏子容器会继承系统纯色底，需保持主题背景可见。 */
[data-app-shell-header-toolbar] > div {
  background-color: transparent !important;
}

{{GG_EXTRA_CSS}}

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

/*
 * “已编辑文件”卡片采用独立柔光玻璃外观。
 * 必须同时满足卡片背景类和直属 diff 标题结构，避免命中右侧环境信息/来源面板；
 * 后者虽然也使用 bg-surface-elevated-secondary，但没有 group/turn-diff-header 子节点。
 */
[class~="bg-surface-elevated-secondary/50"]:has(> [class~="group/turn-diff-header"]) {
  position: relative !important;
  border: 1px solid rgba(100, 92, 145, 0.22) !important;
  border-radius: 18px !important;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.24), transparent 44%),
    rgba(253, 252, 255, 0.78) !important;
  box-shadow:
    0 18px 54px rgba(49, 45, 86, 0.16),
    0 2px 8px rgba(46, 41, 72, 0.08) !important;
  backdrop-filter: blur(22px) saturate(128%) !important;
  -webkit-backdrop-filter: blur(22px) saturate(128%) !important;
}

[class~="bg-surface-elevated-secondary/50"]:has(> [class~="group/turn-diff-header"])::before {
  content: "" !important;
  position: absolute !important;
  inset: 14px auto 14px 0 !important;
  z-index: 20 !important;
  width: 3px !important;
  border-radius: 0 999px 999px 0 !important;
  background: linear-gradient(180deg, #afa3dd, #786bb8 56%, #c4a64d) !important;
  opacity: 0.88 !important;
  pointer-events: none !important;
}

/* 标题图标收敛尺寸，按钮保留 Codex 原生行为，只调整视觉层级。 */
[class~="bg-surface-elevated-secondary/50"]:has(> [class~="group/turn-diff-header"])
  > [class~="group/turn-diff-header"] > span > [class~="bg-surface-secondary/92"] {
  width: 32px !important;
  height: 32px !important;
  margin-inline: 4px !important;
  border: 1px solid rgba(111, 101, 157, 0.20) !important;
  border-radius: 10px !important;
  color: #6f659e !important;
  background: rgba(255, 255, 255, 0.64) !important;
  box-shadow: inset 0 1px rgba(255, 255, 255, 0.78) !important;
}

[class~="bg-surface-elevated-secondary/50"]:has(> [class~="group/turn-diff-header"])
  > [class~="group/turn-diff-header"] > span > div > button:last-child {
  border-color: rgba(89, 81, 127, 0.16) !important;
  border-radius: 9px !important;
  background: rgba(255, 255, 255, 0.54) !important;
  box-shadow: 0 1px 2px rgba(48, 43, 68, 0.04) !important;
}

/* 文件行不继承通用 bg-surface 毛玻璃阴影，避免每一行都出现独立白块。 */
[class~="bg-surface-elevated-secondary/50"]:has(> [class~="group/turn-diff-header"])
  > [class~="border-t"] {
  border-color: rgba(91, 97, 132, 0.16) !important;
}

[class~="bg-surface-elevated-secondary/50"]:has(> [class~="group/turn-diff-header"])
  [class~="group/turn-diff-file-row"] button,
[class~="bg-surface-elevated-secondary/50"]:has(> [class~="group/turn-diff-header"])
  > [class~="border-t"] > button {
  background: transparent !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

[class~="bg-surface-elevated-secondary/50"]:has(> [class~="group/turn-diff-header"])
  [class~="group/turn-diff-file-row"] button:hover,
[class~="bg-surface-elevated-secondary/50"]:has(> [class~="group/turn-diff-header"])
  > [class~="border-t"] > button:hover {
  background: rgba(111, 101, 158, 0.065) !important;
}

html.electron-dark
  [class~="bg-surface-elevated-secondary/50"]:has(> [class~="group/turn-diff-header"]) {
  border-color: rgba(150, 137, 205, 0.28) !important;
  background:
    linear-gradient(135deg, rgba(103, 92, 151, 0.16), transparent 44%),
    rgba(27, 29, 36, 0.78) !important;
  box-shadow:
    0 18px 54px rgba(0, 0, 0, 0.30),
    0 2px 8px rgba(0, 0, 0, 0.18) !important;
}

html.electron-dark
  [class~="bg-surface-elevated-secondary/50"]:has(> [class~="group/turn-diff-header"])
  > [class~="group/turn-diff-header"] > span > [class~="bg-surface-secondary/92"] {
  border-color: rgba(157, 143, 213, 0.25) !important;
  color: #b7abe5 !important;
  background: rgba(43, 43, 56, 0.68) !important;
  box-shadow: inset 0 1px rgba(255, 255, 255, 0.08) !important;
}

html.electron-dark
  [class~="bg-surface-elevated-secondary/50"]:has(> [class~="group/turn-diff-header"])
  > [class~="group/turn-diff-header"] > span > div > button:last-child {
  border-color: rgba(157, 143, 213, 0.22) !important;
  background: rgba(43, 43, 56, 0.60) !important;
}

html.electron-dark
  [class~="bg-surface-elevated-secondary/50"]:has(> [class~="group/turn-diff-header"])
  [class~="group/turn-diff-file-row"] button:hover,
html.electron-dark
  [class~="bg-surface-elevated-secondary/50"]:has(> [class~="group/turn-diff-header"])
  > [class~="border-t"] > button:hover {
  background: rgba(154, 139, 211, 0.10) !important;
}

{{GG_EXTRA_CSS}}

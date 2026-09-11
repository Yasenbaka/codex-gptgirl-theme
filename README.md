# GPTGirl — Codex 桌面版美化插件

把一张二次元立绘变成 OpenAI **Codex 桌面版**（Windows）的界面背景。
采用**运行时 CSS 注入**：不改 Codex 安装目录、不落盘、随时可完全还原。

> 依赖：Node.js ≥ 22（本机已验证 v24）、Codex 桌面版（Microsoft Store 的 `OpenAI.Codex`）。
> 当前已在本机 Codex 26.901.6511.0 上实测生效。

---

## 原理

```
gptgirl.ps1 start
   │
   ├─ 1. 编译主题   build-theme.mjs：config + 背景图 → dist/theme.css（图片以 data URI 内嵌）
   │
   ├─ 2. 以调试端口重启 Codex：ChatGPT.exe --remote-debugging-port=9222
   │
   └─ 3. 注入守护    inject.mjs：经 Chrome DevTools Protocol (CDP)
        · Page.setBypassCSP 绕过应用 CSP
        · 分块把 CSS 送进页面 → <style id="gptgirl-skin"> 注入 <head>
        · 若内联样式仍被 CSP 拦截，自动回退为构造样式表（adoptedStyleSheets）
        · 轮询补注入：页面重载 / 新窗口自动恢复皮肤
```

**只影响显示，不改变任何行为**：注入的是纯 CSS（背景图、透明度），Codex 的功能、会话、文件全部不受影响。

---

## 目录结构

```
codex-plugin-gptgirl/
├── gptgirl.config.json          # 主题配置（图片/透明度/模糊/面板）
├── core/theme.css.tpl           # CSS 模板（平台无关）
├── adapters/codex-desktop/      # Codex 桌面版适配器（CDP 注入）
│   ├── build-theme.mjs          #   编译主题
│   ├── inject.mjs               #   注入器 / 守护
│   ├── probe.mjs                #   DOM 探针（抓结构精修选择器）
│   └── lib.mjs                  #   CDP 公共库
├── gptgirl.ps1                  # 入口 CLI（start/inject/...）
├── gptgirl.cmd                  # 双击入口
├── assets/background.png        # 你的背景图（已从桌面 Media 复制）
├── dist/theme.css               # 编译产物（gitignore）
└── test/                        # 端到端测试（无头 Edge，不碰 Codex）
```

---

## 使用

```powershell
.\gptgirl.ps1 start       # 一键：编译 + 重启 Codex（调试端口）+ 注入并守护
.\gptgirl.ps1 install     # 创建“GPTGirl · Codex”桌面快捷方式（自装，推荐）
.\gptgirl.ps1 install -Auto   # 再加注册开机自启守护：任意方式开 Codex 都自动注入
.\gptgirl.ps1 inject      # 仅注入（App 已带调试端口时）
.\gptgirl.ps1 check       # 检查注入状态
.\gptgirl.ps1 remove      # 移除注入的样式
.\gptgirl.ps1 build       # 仅编译主题
.\gptgirl.ps1 probe       # 抓取 Codex 页面 DOM（精修选择器用）
.\gptgirl.ps1 doctor      # 环境自检
.\gptgirl.ps1 uninstall   # 删除快捷方式与自启
```

## 自装（不用每次找 AI 启动）

- **A. 用快捷方式（默认）**：`.\gptgirl.ps1 install` 在桌面生成 **「GPTGirl · Codex」** 快捷方式。
  以后想用皮肤，就双击它 = 编译最新主题 → 带调试端口重启 Codex → 注入并守护。
  每次启动都会**重新编译**，所以你改的 `gptgirl.config.json` 会在下次启动自动生效。
- **B. 完全自动（`install -Auto`）**：额外注册一个开机自启守护（`adapters/codex-desktop/watch.ps1`）。
  此后你用**任意方式**打开 Codex，守护都会自动带调试端口重启它并注入最新皮肤。
  注意：这会在你正常打开 Codex 后约 3 秒内自动重启一次（为了注入调试端口）。
- **还原**：`.\gptgirl.ps1 uninstall` 删除快捷方式/自启；皮肤本身是纯运行时的，`remove` 或正常重启 Codex 即恢复。

`start` 会提示关闭并重启 Codex（加 `-Yes` 跳过）、随后前台运行守护（保持窗口开着；Ctrl+C 只退出守护，皮肤保留到下次重载）。

**想恢复原样**：`.\gptgirl.ps1 remove`，或干脆正常退出并重新打开 Codex——注入是纯运行时的，重启即完全还原。

---

## 配置 `gptgirl.config.json`

| 字段 | 说明 | 默认 |
|---|---|---|
| `image` | 背景图路径（相对项目根） | `assets/background.png` |
| `style.fit` | 图片铺法 `cover`/`contain`/`auto` | `cover` |
| `style.position` | 图片位置 `center`/`right center`/... | `center` |
| `style.backgroundAlpha` | 背景浓度 0–1 | `0.5` |
| `style.uiOpacity` | UI 层透明度 0–1（越小越透出背景） | `0.9` |
| `style.blur` | 背景模糊 `0px`/`4px`/... | `0px` |
| `style.veil` | 可读性暗纱颜色 | `rgba(8,10,18,0.25)` |
| `style.extraCss` | 追加 CSS（如面板半透明选择器） | `""` |

改完配置后**重建并重注入**：`.\gptgirl.ps1 build` → `.\gptgirl.ps1 inject`。

---

## 实测结果（本机）

- 无头 Edge 端到端测试：主注入路径 + 严格 CSP 回退路径 **7/7 通过**。
- Codex 26.901.6511.0：主窗口 + avatar-overlay 窗口均注入成功；
  背景 data URI 完整加载、主内容面板 `.bg-surface` 半透明（`color-mix` 0.72）、UI 层 0.9 透明。
- 截图见 `preview.png`。

---

## 排查记录（重要经验）

本插件的难点在于 **Chromium 会丢弃“超大 data URI”与 `var()` 混用的背景声明**：

- 一条 `background-image: linear-gradient(var(--v), var(--v)), url("data:...3MB...")` 会被解析器**整段丢弃**，计算值为 `none`；
- 把 `--v` 换成字面量 `rgba(...)` 后则完整生效（`background-image` 计算值 = 完整 3.1MB url）。
- 结论：背景相关声明一律<b>字面量烘焙</b>，不派发 CSS 变量（见 `core/theme.css.tpl` 注释）。

另外两个实现要点：
- `<style>` 必须放进 `<head>`，直接 append 到 `<html>` 会解析异常。
- 图片以 `data:` URI 内嵌即可绕过 CSP/`file://` 跨源限制；配合 `Page.setBypassCSP` 更稳。

---

## 已知限制与路线图

- `start` 需要重启一次 Codex（首次换背景不可避免）。
- 通用皮肤依赖 Tailwind 语义类；Codex 大版本更新后若界面变化，重新 `probe` 精修即可。
- 路线图：CLI TUI 适配器（官方 `.tmTheme` 主题机制）、官方插件市场包装、终端 pets 立绘适配。

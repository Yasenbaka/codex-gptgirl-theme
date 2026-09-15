# GPTGirl — Codex 桌面版美化插件

把一张二次元立绘变成 OpenAI **Codex 桌面版**（Windows）的界面背景。
第二版采用“**Codex 本地插件外壳 + GPTGirl 后台代理 + 运行时 CSS 注入**”：不改 Codex 安装目录，可在 Codex 的 Plugins 设置中启停，并可随时完全还原。

> 依赖：Node.js ≥ 22（本机已验证 v24）、Codex 桌面版（Microsoft Store 的 `OpenAI.Codex`）。
> 当前已在本机 Codex 26.903.9818.0 上实测生效。

---

## 原理

```text
Codex 插件 → GPTGirl 详情页 → GPTGirl 主题开关
   │
   ├─ agent.mjs 将开关状态定点写入 ~/.codex/config.toml
   │
   └─ 登录后单实例后台代理
        ├─ 启用：编译主题并经本机 CDP 注入 app://-/ Codex 窗口
        ├─ 停用：只移除 GPTGirl 自己拥有的样式
        ├─ 页面重载 / 新窗口：自动补注入
        └─ 新启动的 Codex 缺少 CDP：每个代理生命周期至多修复一次回环调试参数
```

Codex 当前的官方插件接口不提供全局 CSS、Renderer DOM 扩展点或主题设置槽，因此第二版是混合架构：Codex 插件提供原生插件身份和详情页，本地代理只在 GPTGirl 详情页加入主题开关并负责视觉注入。代理通过 `Page.setBypassCSP`、`<style id="gptgirl-skin">` 和 `adoptedStyleSheets` 回退实现主题，且生产模式只接受 `app://-/` 窗口，不会注入 Codex 内嵌网页。

**主题只改变显示**：背景与透明度由纯 CSS 实现；第二版代理还会在 GPTGirl 详情页加入主题开关并定点写入该插件的 `enabled` 状态，不读取或修改 Codex 会话、文件和其他配置。

---

## 目录结构

```
codex-gptgirl-theme/
├── gptgirl.config.json          # 主题配置（图片/透明度/模糊/面板）
├── core/theme.css.tpl           # CSS 模板（平台无关）
├── adapters/codex-desktop/      # Codex 桌面版适配器（CDP 注入）
│   ├── build-theme.mjs          #   编译主题
│   ├── inject.mjs               #   主题注入、检查和隔离移除
│   ├── agent.mjs                #   插件状态轮询与单实例后台代理
│   ├── plugin-state.mjs         #   Codex config.toml 定点读写
│   ├── ui-control.mjs           #   GPTGirl 详情页主题开关
│   ├── probe.mjs                #   DOM 探针（抓结构精修选择器）
│   └── lib.mjs                  #   CDP 公共库
├── plugins/gptgirl/             # Codex 本地插件清单和图标
├── .agents/plugins/             # 本地 Marketplace 清单
├── gptgirl.ps1                  # 入口 CLI（第一版兼容 + 第二版管理）
├── assets/background.light.jpg  # 亮色背景图
├── assets/background.dark.jpg   # 暗色背景图
├── dist/theme.css               # 编译产物（gitignore）
└── test/                        # 单元与无头 Edge 端到端测试
```

---

## 使用

### 第二版：Codex Plugins 集成（推荐）

```powershell
.\gptgirl.ps1 plugin-install    # 一次性注册本地插件并安装登录代理
.\gptgirl.ps1 plugin-status     # 查看插件、代理与 CDP 状态
.\gptgirl.ps1 plugin-enable     # 命令行启用（也可在 Codex Plugins 设置操作）
.\gptgirl.ps1 plugin-disable    # 命令行停用
.\gptgirl.ps1 plugin-uninstall  # 完整移除插件登记、代理与运行时样式
```

安装后照常从原来的入口打开 Codex。主题开关位于 **插件 → GPTGirl 详情页 → GPTGirl 主题**。该开关由本地代理注入到 GPTGirl 自己的详情页，因为 Codex 当前官方插件接口尚未提供全局主题设置槽。安装操作会保护当时正在运行的 Codex 进程，不会为了接管主题而将其关闭；未来你自然退出并重新打开 Codex 后，代理才会在缺少 CDP 时自动修复一次启动参数。

### 第一版：快捷方式兼容命令

```powershell
.\gptgirl.ps1 start       # 编译 + 调试端口重启 + 前台注入守护
.\gptgirl.ps1 install     # 创建“GPTGirl · Codex”桌面快捷方式
.\gptgirl.ps1 install -Auto   # 注册第一版自动守护
.\gptgirl.ps1 inject      # 仅注入（App 已带调试端口时）
.\gptgirl.ps1 check       # 检查注入状态
.\gptgirl.ps1 remove      # 移除注入的样式
.\gptgirl.ps1 build       # 仅编译主题
.\gptgirl.ps1 probe       # 抓取 Codex 页面 DOM（精修选择器用）
.\gptgirl.ps1 doctor      # 环境自检
.\gptgirl.ps1 uninstall   # 删除第一版快捷方式与自启
```

## 自装（不用每次找 AI 启动）

- **A. 用快捷方式（默认）**：`.\gptgirl.ps1 install` 在桌面生成 **「GPTGirl · Codex」** 快捷方式。
  以后想用皮肤，就双击它 = 编译最新主题 → 带调试端口重启 Codex → 注入并守护。
  每次启动都会**重新编译**，所以你改的 `gptgirl.config.json` 会在下次启动自动生效。
- **B. 第一版完全自动（`install -Auto`）**：额外注册一个开机自启守护（`adapters/codex-desktop/watch.ps1`）。第二版 `plugin-install` 会移除该旧启动项，两个守护不可并行。
  此后你用**任意方式**打开 Codex，守护都会自动带调试端口重启它并注入最新皮肤。
  注意：这会在你正常打开 Codex 后约 3 秒内自动重启一次（为了注入调试端口）。
- **还原**：`.\gptgirl.ps1 uninstall` 删除快捷方式/自启；皮肤本身是纯运行时的，`remove` 或正常重启 Codex 即恢复。

`start` 会提示关闭并重启 Codex（加 `-Yes` 跳过）、随后前台运行守护（保持窗口开着；Ctrl+C 只退出守护，皮肤保留到下次重载）。

**想恢复原样**：`.\gptgirl.ps1 remove`，或干脆正常退出并重新打开 Codex——注入是纯运行时的，重启即完全还原。

---

## 配置 `gptgirl.config.json`

| 字段 | 说明 | 默认 |
|---|---|---|
| `image` | 亮色背景图路径（相对项目根） | `assets/background.light.jpg` |
| `imageDark` | 暗色背景图路径（未配置时复用 `image`） | `assets/background.dark.jpg` |
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

- 无头 Edge 端到端测试：主注入路径 + 严格 CSP 回退路径 **6/6 通过**。
- Codex 26.903.9818.0：主窗口 + avatar-overlay 窗口均注入成功；
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

- 第一版 `start` 命令需要重启 Codex；第二版会复用已开放的本地 CDP，并保护安装时正在工作的 Codex PID。
- Codex 官方插件接口暂不提供主题设置槽，所以详情页的“GPTGirl 主题”开关由本地代理添加；Codex 大版本更新详情页结构后可能需要调整定位标记。
- 通用皮肤依赖 Tailwind 语义类；Codex 大版本更新后若界面变化，重新 `probe` 精修即可。
- 路线图：CLI TUI 适配器（官方 `.tmTheme` 主题机制）与终端 pets 立绘适配。

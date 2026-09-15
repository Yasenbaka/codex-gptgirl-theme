# AGENT.md — GPTGirl 工程协作宪法

本文档记录本仓库的工程协作、验证与提交约定。执行任务时还应遵守当前运行环境和用户要求；发现约定存在冲突或歧义时，应明确说明并建议维护者修订本文档。

> 项目：GPTGirl — Windows Codex 桌面版运行时美化插件
> 技术栈：Node.js ESM、PowerShell、Chrome DevTools Protocol（CDP）、Codex Plugin Manifest
> 原则：不修改 Codex 安装包，所有视觉修改可即时撤销

---

## 1. 工作目录与文件边界

- 所有项目命令必须在仓库根目录执行，禁止根据其他项目路径推断当前工作目录。
- 修改前必须先读相关文件；优先定点编辑，禁止无依据地整体重写既有文件。
- `dist/`、`.gptgirl/`、`node_modules/` 和日志属于生成物，必须保持忽略，不得提交。
- 禁止修改 Microsoft Store 的 Codex 安装目录、`app.asar` 或 WindowsApps 中的任何文件。
- 未经用户当前回合明确授权，禁止停止、重启或结束正在运行的 Codex/ChatGPT 进程。
- 只能移除 GPTGirl 自己创建的 DOM 节点或 `CSSStyleSheet`；禁止清空页面全部 `adoptedStyleSheets`。

## 2. 版本与 Git 提交规范

### 2.1 强制提交时机

- 每个可独立回退的逻辑版本必须形成独立提交；禁止把第一版基线和第二版功能混在同一提交。
- 对话结束时若产生代码、配置、脚本或必要文档改动，必须完成本地提交。
- 只提交，不 Push。未经用户明确许可，禁止执行 `git push`。
- 无文件改动时禁止空提交。
- 提交前必须检查 `git status`、`git diff --check` 并完成第 4 节验证。

### 2.2 Commit 标题

格式固定为：

```text
<英文Type>(<中文Scope>): <中文Title>
```

可用 Type：`feat`、`fix`、`docs`、`style`、`refactor`、`perf`、`test`、`build`、`ci`、`chore`。

示例：

```text
feat(插件管理): 增加 Codex 设置启停能力
```

### 2.3 Commit Body

- 必须使用中文。
- 使用中文数字编号：`1、`、`2、`、`3、`。
- 每条独占一行，并以中文分号结尾。
- 每条说明具体改动、原因或影响范围，禁止使用无序列表代替编号。

完整示例：

```text
feat(插件管理): 增加 Codex 设置启停能力

1、添加 Codex 本地插件清单与个人 Marketplace 安装流程；
2、后台代理监听插件启用状态并即时注入或移除主题；
3、补充构建、解析和样式隔离测试；
```

### 2.4 Git 禁令

未经用户明确许可，禁止：

- `git push`、`git push --force`；
- `git reset --hard`、`git checkout --`、`git clean -fd`；
- `--no-verify`、`--no-gpg-sign`；
- amend 已推送提交；
- 删除或覆盖用户未要求处理的改动。

## 3. 实现约束

- 生产脚本保持零第三方运行时依赖，优先使用 Node.js 和 PowerShell 标准能力。
- Node.js 文件使用 ESM；普通源码采用 UTF-8 无 BOM。由 Windows PowerShell 5 直接通过 `-File` 执行且包含中文的 `.ps1` 必须使用 UTF-8 BOM，避免系统代码页误读。
- CDP 只能连接回环地址 `127.0.0.1`，禁止将远程调试端口暴露到局域网或公网。
- 插件停用必须只移除 GPTGirl 拥有的样式，并保留 Codex 和其他插件的样式表。
- 后台代理必须有单实例保护，避免重复轮询和重复注入。
- 所有持久化安装操作必须可卸载，并且只删除由 GPTGirl 创建或明确登记的条目。
- Codex 插件启用状态以 `~/.codex/config.toml` 中对应的 `[plugins."..."]` 节为准；禁止把“已安装”和“已启用”混为一谈。
- 不得宣称 Codex 官方插件 API 支持主界面 CSS 注入；当前实现属于“官方插件外壳 + 本地 CDP 代理”的混合架构。

## 4. 修改后验证

根据改动范围依次执行：

```powershell
node .\adapters\codex-desktop\build-theme.mjs
node --test .\test\*.test.mjs
node .\test\run-edge-test.mjs
```

若当前 Codex 已带调试端口运行，可额外执行不会关闭应用的只读检查：

```powershell
node .\adapters\codex-desktop\inject.mjs --port 9222 --check
```

提交前还必须执行：

```powershell
git diff --check
git status --short
git diff --stat
```

验证未通过前禁止声称完成。因环境原因无法执行的验证必须在最终回复中明确列出。

## 5. 外部工具与额度

- 未经用户明确许可，禁止调用由 DeepSeek 后端提供的 `web_search`，避免消耗用户的 DeepSeek API 额度。
- 优先检查本仓库、本机 Codex 插件规范和已安装文件；本地已有证据时不得重复联网搜索。
- 未经用户明确授权，禁止启动浏览器、上传项目文件或向第三方服务发送代码与数据。

## 6. 安全与隐私

- 禁止提交 Token、Cookie、账号凭证、个人会话内容或 Codex 用户数据。
- 日志只能记录时间、状态、目标数量和错误摘要，不得记录会话正文、页面内容或凭证。
- `~/.codex/config.toml` 的编辑必须做定点节更新，保留所有非 GPTGirl 配置。
- 失败时优先保持 Codex 可用：注入失败不得终止 Codex，后台代理应记录错误并在下一轮重试。

## 7. 协作与完成度

- 多步任务必须维护任务清单，完成一项立即更新一项。
- 回复使用简体中文，结论直接，并附验证证据和提交号。
- 有文件变更时，最终回复必须列出主要改动文件。
- 不得把“代码已写”表述成“功能已验证”；完成声明必须以实际测试结果为依据。

---

## 提交前自检

- [ ] 未修改 Codex 安装目录或 `app.asar`；
- [ ] 未经许可未关闭或重启 Codex；
- [ ] 停用逻辑只移除 GPTGirl 自有样式；
- [ ] 生成物、日志和本地状态未进入 Git；
- [ ] 构建与相关测试通过；
- [ ] `git diff --check` 通过；
- [ ] Commit 标题和中文编号 Body 符合规范；
- [ ] 只 Commit，未 Push；
- [ ] 未经许可未调用 DeepSeek `web_search`。

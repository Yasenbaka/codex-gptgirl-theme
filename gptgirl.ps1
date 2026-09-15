# ============================================================
#  GPTGirl — Codex 桌面版美化插件 · 入口脚本
#  用法:
#    .\gptgirl.ps1 start          一键：编译主题 + 调试模式重启 Codex + 前台注入守护
#    .\gptgirl.ps1 inject         仅注入（Codex 已带调试端口运行时）
#    .\gptgirl.ps1 check          检查注入状态
#    .\gptgirl.ps1 remove         移除已注入样式
#    .\gptgirl.ps1 build          仅编译主题到 dist\theme.css
#    .\gptgirl.ps1 probe          抓取 Codex 页面 DOM 概要（精修选择器）
#    .\gptgirl.ps1 doctor         环境自检
#    .\gptgirl.ps1 install        创建“GPTGirl · Codex”桌面快捷方式（自装）
#    .\gptgirl.ps1 install -Auto  另注册开机自启守护（任意方式开 Codex 都会自动注入）
#    .\gptgirl.ps1 uninstall      删除快捷方式与自启（皮肤本身运行时可随时 remove）
#    .\gptgirl.ps1 watch          前台运行旧版自动守护（可 Ctrl+C 退出）
#    .\gptgirl.ps1 plugin-install 安装第二版 Codex Plugins 集成
#    .\gptgirl.ps1 plugin-status  查看插件、代理和 CDP 状态
# ============================================================
param(
  [Parameter(Position = 0)]
  [ValidateSet('start', 'inject', 'check', 'remove', 'build', 'probe', 'doctor', 'install', 'uninstall', 'watch', 'plugin-install', 'plugin-uninstall', 'plugin-enable', 'plugin-disable', 'plugin-status', 'help')]
  [string]$Action = 'help',
  [switch]$Yes,          # start 时跳过重启确认
  [switch]$Auto,         # install 时同时注册自启；watch 时启用自动重启
  [switch]$RemoveTask    # 预留
)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Cfg = Get-Content (Join-Path $Root 'gptgirl.config.json') -Raw | ConvertFrom-Json
$Port = [int]$Cfg.codexDesktop.debugPort
$InjectMjs = Join-Path $Root 'adapters\codex-desktop\inject.mjs'
$ProbeMjs  = Join-Path $Root 'adapters\codex-desktop\probe.mjs'
$BuildMjs  = Join-Path $Root 'adapters\codex-desktop\build-theme.mjs'
$WatchPs1  = Join-Path $Root 'adapters\codex-desktop\watch.ps1'
$AgentMjs  = Join-Path $Root 'adapters\codex-desktop\agent.mjs'
$PluginStateMjs = Join-Path $Root 'adapters\codex-desktop\plugin-state.mjs'
$UiControlMjs = Join-Path $Root 'adapters\codex-desktop\ui-control.mjs'
$MarketplaceName = 'gptgirl-local'
$PluginId = "gptgirl@$MarketplaceName"
$StartupAgent = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\gptgirl-agent.cmd'
$LegacyStartup = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\gptgirl-watch.cmd'

function Find-CodexExe {
  $pat = $Cfg.codexDesktop.appxNamePattern
  $pkg = Get-AppxPackage -Name $pat -ErrorAction SilentlyContinue |
         Sort-Object -Property Version -Descending | Select-Object -First 1
  if ($pkg) {
    $exe = Join-Path $pkg.InstallLocation $Cfg.codexDesktop.exeRelPath
    if (Test-Path $exe) { return $exe }
  }
  $p = Get-Process -Name 'ChatGPT' -ErrorAction SilentlyContinue |
       Where-Object { $_.Path } | Select-Object -First 1
  if ($p) { return $p.Path }
  throw "未找到 Codex 桌面版（Appx 包 $pat）。可先运行 'codex app' 安装/启动一次。"
}

function Test-DebugPort {
  try { Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/version" -TimeoutSec 2 | Out-Null; return $true }
  catch { return $false }
}

function Find-DesktopCodexCli {
  $configured = [regex]::Match(
    (Get-Content (Join-Path $env:USERPROFILE '.codex\config.toml') -Raw -ErrorAction SilentlyContinue),
    "(?m)^CODEX_CLI_PATH\s*=\s*'([^']+)'"
  )
  if ($configured.Success -and (Test-Path $configured.Groups[1].Value)) {
    return $configured.Groups[1].Value
  }
  $candidates = Get-ChildItem (Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin') -Filter codex.exe -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending
  if ($candidates) { return $candidates[0].FullName }
  $command = Get-Command codex -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  throw '未找到与 Codex 桌面版配套的 codex CLI。'
}

function Write-AgentStartup {
  $startScript = Join-Path $Root 'adapters\codex-desktop\start-agent.ps1'
  $line = '@echo off' + "`r`n" +
    'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $startScript + '"' + "`r`n"
  Set-Content -Path $StartupAgent -Value $line -Encoding ASCII
}

function Stop-GptGirlWorkers {
  $escapedRoot = [regex]::Escape($Root)
  $workers = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.ProcessId -ne $PID -and
      $_.CommandLine -match $escapedRoot -and
      $_.CommandLine -match '(agent\.mjs|inject\.mjs|watch\.ps1)'
    })
  $workers | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  foreach ($i in 1..20) {
    $alive = @($workers | Where-Object { Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue })
    if ($alive.Count -eq 0) { break }
    Start-Sleep -Milliseconds 100
  }
  Remove-Item (Join-Path $Root '.gptgirl\plugin-agent.lock') -Force -ErrorAction SilentlyContinue
}

function Start-GptGirlAgent([switch]$ProtectCurrentCodex) {
  $node = (Get-Command node.exe -ErrorAction Stop).Source
  $arguments = @('"' + $AgentMjs + '"')
  if ($ProtectCurrentCodex) {
    $ids = @(Get-Process -Name 'ChatGPT' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
    if ($ids.Count -gt 0) { $arguments += ('--protect-pids=' + ($ids -join ',')) }
  }
  $process = Start-Process -FilePath $node -ArgumentList $arguments -WorkingDirectory $Root -WindowStyle Hidden -PassThru
  Start-Sleep -Milliseconds 750
  $process.Refresh()
  if ($process.HasExited) { throw "GPTGirl 插件代理启动失败（退出码 $($process.ExitCode)）。" }
  return $process
}

switch ($Action) {

  'build' { node $BuildMjs }

  'inject' {
    if (-not (Test-DebugPort)) {
      Write-Host "× 127.0.0.1:$Port 未开放。Codex 需要以 --remote-debugging-port=$Port 启动（请运行 .\gptgirl.ps1 start）" -ForegroundColor Red
      exit 1
    }
    node $InjectMjs --port $Port
  }

  'start' {
    node $BuildMjs
    $running = Get-Process -Name 'ChatGPT' -ErrorAction SilentlyContinue
    if ($running) {
      if (-not $Yes) {
        $a = Read-Host "Codex 桌面版正在运行（$($running.Count) 个进程）。需要关闭并以调试模式重启，继续? (y/N)"
        if ($a -notmatch '^[yY]') { Write-Host '已取消。'; return }
      }
      Stop-Process -Name 'ChatGPT' -Force -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 2
    }
    if (Test-DebugPort) {
      Write-Host "· 调试端口 $Port 已开放，跳过启动"
    } else {
      $exe = Find-CodexExe
      Write-Host "· 启动 Codex: $exe --remote-debugging-port=$Port"
      try { Start-Process -FilePath $exe -ArgumentList "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=$Port" }
      catch { Write-Host "× 直接启动失败（$($_.Exception.Message)）。" -ForegroundColor Red; exit 1 }
      $ok = $false
      foreach ($i in 1..40) { if (Test-DebugPort) { $ok = $true; break }; Start-Sleep -Milliseconds 500 }
      if (-not $ok) { Write-Host "× 等待调试端口超时。请反馈给维护者。" -ForegroundColor Red; exit 1 }
    }
    node $InjectMjs --port $Port
  }

  'check'  { node $InjectMjs --port $Port --check }
  'remove' { node $InjectMjs --port $Port --remove }

  'plugin-install' {
    node $BuildMjs
    node $PluginStateMjs sync-marketplace $Root | Out-Null
    if ($LASTEXITCODE -ne 0) { throw '迁移 GPTGirl Marketplace 路径失败。' }
    $cli = Find-DesktopCodexCli
    $markets = & $cli plugin marketplace list 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) { throw "读取 Codex Marketplace 失败：$markets" }
    if ($markets -notmatch "(?m)^$([regex]::Escape($MarketplaceName))\s") {
      $added = & $cli plugin marketplace add $Root --json 2>&1 | Out-String
      if ($LASTEXITCODE -ne 0) { throw "注册 GPTGirl Marketplace 失败：$added" }
    }
    $installed = & $cli plugin add $PluginId --json 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0 -and $installed -notmatch 'already installed|已安装') {
      throw "安装 GPTGirl 插件失败：$installed"
    }
    node $PluginStateMjs enable
    if ($LASTEXITCODE -ne 0) { throw '写入 GPTGirl 插件启用状态失败。' }
    Write-AgentStartup
    if (Test-Path $LegacyStartup) { Remove-Item $LegacyStartup -Force }
    Stop-GptGirlWorkers
    $agentProcess = Start-GptGirlAgent -ProtectCurrentCodex
    Write-Host '✓ GPTGirl 第二版已安装并启用。' -ForegroundColor Green
    Write-Host "  插件代理 PID: $($agentProcess.Id)"
    Write-Host '  当前 Codex 不会被关闭或重启；插件代理已接管现有 CDP 连接。'
    Write-Host '  以后可在 Codex 插件 → GPTGirl 详情页中启用或停用主题。'
  }

  'plugin-uninstall' {
    node $PluginStateMjs disable
    if (Test-DebugPort) {
      node $InjectMjs --port $Port --remove | Out-Null
      node $UiControlMjs remove --port $Port | Out-Null
    }
    Stop-GptGirlWorkers
    if (Test-Path $StartupAgent) { Remove-Item $StartupAgent -Force }
    $cli = Find-DesktopCodexCli
    $removed = & $cli plugin remove $PluginId --json 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0 -and $removed -notmatch 'not installed|未安装') {
      Write-Warning "移除 Codex 插件登记失败：$removed"
    }
    $marketRemoved = & $cli plugin marketplace remove $MarketplaceName 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0 -and $marketRemoved -notmatch 'not found|不存在') {
      Write-Warning "移除 Marketplace 登记失败：$marketRemoved"
    }
    Write-Host '✓ GPTGirl 插件登记、后台代理和运行时样式已移除。' -ForegroundColor Green
  }

  'plugin-enable' {
    node $PluginStateMjs enable
    if ($LASTEXITCODE -ne 0) { throw '写入 GPTGirl 启用状态失败。' }
    $agent = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
      Where-Object { $_.CommandLine -match [regex]::Escape($AgentMjs) } | Select-Object -First 1
    if (-not $agent) { $agent = Start-GptGirlAgent -ProtectCurrentCodex }
    Write-Host '✓ 已启用 GPTGirl；后台代理将在下一轮同步主题。' -ForegroundColor Green
  }

  'plugin-disable' {
    node $PluginStateMjs disable
    if ($LASTEXITCODE -ne 0) { throw '写入 GPTGirl 停用状态失败。' }
    $agent = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
      Where-Object { $_.CommandLine -match [regex]::Escape($AgentMjs) } | Select-Object -First 1
    if (-not $agent) { $agent = Start-GptGirlAgent -ProtectCurrentCodex }
    Write-Host '✓ 已停用 GPTGirl；后台代理将在下一轮移除主题。' -ForegroundColor Green
  }

  'plugin-status' {
    $state = node $PluginStateMjs status
    $agent = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
      Where-Object { $_.CommandLine -match [regex]::Escape($AgentMjs) } |
      Select-Object -First 1
    Write-Host ("Codex 插件 : " + $state)
    Write-Host ("后台代理   : " + $(if ($agent) { "running (PID $($agent.ProcessId))" } else { 'stopped' }))
    Write-Host ("CDP 端口   : " + $(if (Test-DebugPort) { "127.0.0.1:$Port ready" } else { "127.0.0.1:$Port unavailable" }))
  }

  'probe' {
    if (-not (Test-DebugPort)) { Write-Host "× 调试端口未开放，请先 .\gptgirl.ps1 start" -ForegroundColor Red; exit 1 }
    node $ProbeMjs --port $Port
  }

  'install' {
    $desktop = [Environment]::GetFolderPath('Desktop')
    $lnk = Join-Path $desktop 'GPTGirl · Codex.lnk'
    $ws = New-Object -ComObject WScript.Shell
    $sc = $ws.CreateShortcut($lnk)
    $sc.TargetPath = 'powershell.exe'
    $sc.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $Root 'gptgirl.ps1') + '" start -Yes'
    $sc.WorkingDirectory = $Root
    $sc.Description = '以 GPTGirl 皮肤启动 Codex'
    $sc.IconLocation = 'shell32.dll,21'
    $sc.Save()
    Write-Host ("✓ 已创建桌面快捷方式: " + $lnk) -ForegroundColor Green
    Write-Host '  以后双击它 = 编译最新主题 + 带调试端口重启 Codex + 注入皮肤'

    if ($Auto) {
      $startup = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'
      $cmdFile = Join-Path $startup 'gptgirl-watch.cmd'
      $cmd = '@echo off' + "`r`n" +
             'powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $WatchPs1 + '" -AutoRestart' + "`r`n"
      Set-Content -Path $cmdFile -Value $cmd -Encoding ASCII
      Write-Host ("✓ 已注册开机自启: " + $cmdFile) -ForegroundColor Green
      Write-Host '  以后任意方式打开 Codex，守护都会自动带调试端口重启并注入最新皮肤'
    } else {
      Write-Host '（如想“随便怎么开 Codex 都自动注入”，用: .\gptgirl.ps1 install -Auto）'
    }
  }

  'uninstall' {
    $lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'GPTGirl · Codex.lnk'
    if (Test-Path $lnk) { Remove-Item $lnk -Force; Write-Host ("✓ 已删除: " + $lnk) }
    $cmdFile = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\gptgirl-watch.cmd'
    if (Test-Path $cmdFile) { Remove-Item $cmdFile -Force; Write-Host ("✓ 已删除自启: " + $cmdFile) }
    Write-Host '提示：皮肤是纯运行时的，关闭并正常重开 Codex 即完全恢复原样。'
  }

  'watch' {
    & $WatchPs1 -AutoRestart:$Auto
  }

  'doctor' {
    Write-Host '=== GPTGirl 环境自检 ==='
    Write-Host ("node      : " + (node --version))
    $img = Join-Path $Root $Cfg.image
    Write-Host ("背景图    : " + $img + "  存在=" + (Test-Path $img))
    $dist = Join-Path $Root 'dist\theme.css'
    if (Test-Path $dist) { Write-Host ("已编译主题: dist\theme.css  大小=" + [math]::Round((Get-Item $dist).Length / 1MB, 2) + "MB") }
    else { Write-Host "已编译主题: 不存在（先运行 .\gptgirl.ps1 build）" }
    try { $exe = Find-CodexExe; Write-Host ("Codex 桌面: " + $exe) }
    catch { Write-Host ("Codex 桌面: 未找到（" + $_.Exception.Message + "）") -ForegroundColor Yellow }
    $running = Get-Process -Name 'ChatGPT' -ErrorAction SilentlyContinue
    if ($running) { Write-Host ("ChatGPT   : " + $running.Count + " 个进程运行中") } else { Write-Host "ChatGPT   : 未运行" }
    if (Test-DebugPort) { Write-Host ("调试端口 " + $Port + " : 已开放") } else { Write-Host ("调试端口 " + $Port + " : 未开放（需要 start）") }
    $lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'GPTGirl · Codex.lnk'
    Write-Host ("桌面快捷方式: " + $(if (Test-Path $lnk) { '已创建' } else { '未创建（可 install）' }))
  }

  'help' {
    Write-Host @'
GPTGirl — Codex 桌面版美化插件
  .\gptgirl.ps1 start      一键：编译主题 + 调试模式重启 Codex + 注入守护
  .\gptgirl.ps1 install    创建“GPTGirl · Codex”桌面快捷方式（自装）
  .\gptgirl.ps1 install -Auto  另注册开机自启守护（任意方式开 Codex 都自动注入）
  .\gptgirl.ps1 inject     仅注入（App 已带调试端口运行）
  .\gptgirl.ps1 check      检查注入状态
  .\gptgirl.ps1 remove     移除注入样式
  .\gptgirl.ps1 build      仅编译主题
  .\gptgirl.ps1 probe      导出 DOM 结构（精修选择器）
  .\gptgirl.ps1 doctor     环境自检
  .\gptgirl.ps1 uninstall  删除旧版快捷方式与自启

第二版 Codex Plugins 集成:
  .\gptgirl.ps1 plugin-install    注册插件并安装后台代理
  .\gptgirl.ps1 plugin-uninstall  移除插件、代理与运行时样式
  .\gptgirl.ps1 plugin-enable     启用插件
  .\gptgirl.ps1 plugin-disable    停用插件
  .\gptgirl.ps1 plugin-status     查看插件状态
'@
  }
}

# GPTGirl 缺少 CDP 时的未来启动修复器。
# 仅由后台插件代理在 GPTGirl 已启用且端口不可用时调用。
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
$Cfg = Get-Content (Join-Path $Root 'gptgirl.config.json') -Raw | ConvertFrom-Json
$Port = [int]$Cfg.codexDesktop.debugPort

function Test-GptGirlPort {
  try {
    Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/version" -TimeoutSec 2 | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Find-CodexExecutable {
  $pkg = Get-AppxPackage -Name $Cfg.codexDesktop.appxNamePattern -ErrorAction SilentlyContinue |
    Sort-Object -Property Version -Descending |
    Select-Object -First 1
  if ($pkg) {
    $candidate = Join-Path $pkg.InstallLocation $Cfg.codexDesktop.exeRelPath
    if (Test-Path $candidate) { return $candidate }
  }
  return $null
}

if (Test-GptGirlPort) { exit 0 }
$running = @(Get-Process -Name 'ChatGPT' -ErrorAction SilentlyContinue)
if ($running.Count -eq 0) { exit 0 }

# 只修复刚启动且尚未开始长期工作的实例。任一进程已运行超过两分钟，立即放弃重启。
$now = Get-Date
foreach ($process in $running) {
  try {
    if (($now - $process.StartTime).TotalMinutes -gt 2) { exit 0 }
  } catch {
    exit 0
  }
}

$exe = Find-CodexExecutable
if (-not $exe) { exit 1 }

# 插件代理已经做过启用状态、保护 PID、宽限期和冷却判断；此处再做年龄兜底。
$running | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Start-Process -FilePath $exe -ArgumentList "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=$Port"

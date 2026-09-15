# 从 Windows 登录启动项静默启动单实例 GPTGirl 插件代理。
$ErrorActionPreference = 'SilentlyContinue'
$Root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
$Agent = Join-Path $Root 'adapters\codex-desktop\agent.mjs'
$escaped = [regex]::Escape($Agent)
$running = Get-CimInstance Win32_Process |
  Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match $escaped } |
  Select-Object -First 1
if ($running) { exit 0 }
Start-Process -FilePath 'node.exe' -ArgumentList ('"' + $Agent + '"') -WorkingDirectory $Root -WindowStyle Hidden

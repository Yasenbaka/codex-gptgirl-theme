# ============================================================
#  GPTGirl 自动守护（后台常驻）
#  · 检测 Codex 桌面版是否在运行
#  · 若运行但未带调试端口，则按 -AutoRestart 决定是否自动重启以注入
#  · 端口就绪后，持续确保最新皮肤已注入（检测丢失则重注入）
#  由 gptgirl.ps1 install -Auto 注册到“启动”文件夹自动运行。
# ============================================================
param([switch]$AutoRestart)
$ErrorActionPreference = 'SilentlyContinue'
$Proj = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Cfg = Get-Content (Join-Path $Proj 'gptgirl.config.json') -Raw | ConvertFrom-Json
$Port = [int]$Cfg.codexDesktop.debugPort
$InjectMjs = Join-Path $Proj 'adapters\codex-desktop\inject.mjs'

function Find-Exe {
  $pkg = Get-AppxPackage -Name $Cfg.codexDesktop.appxNamePattern -ErrorAction SilentlyContinue |
         Sort-Object -Property Version -Descending | Select-Object -First 1
  if ($pkg) {
    $e = Join-Path $pkg.InstallLocation $Cfg.codexDesktop.exeRelPath
    if (Test-Path $e) { return $e }
  }
  $p = Get-Process -Name 'ChatGPT' -ErrorAction SilentlyContinue | Where-Object { $_.Path } | Select-Object -First 1
  if ($p) { return $p.Path }
  return $null
}

function Test-Port {
  try { Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/version" -TimeoutSec 2 | Out-Null; return $true }
  catch { return $false }
}

$exe = Find-Exe
Write-Host "[gptgirl] 守护启动（AutoRestart=$AutoRestart），端口 $Port"

while ($true) {
  $running = Get-Process -Name 'ChatGPT' -ErrorAction SilentlyContinue
  if ($running) {
    $portOk = Test-Port
    if (-not $portOk -and $AutoRestart) {
      Write-Host ("[gptgirl] Codex 无调试端口，自动重启以注入... " + (Get-Date -Format HH:mm:ss))
      Stop-Process -Name 'ChatGPT' -Force -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 2
      if ($exe) {
        Start-Process -FilePath $exe -ArgumentList "--remote-debugging-port=$Port"
        foreach ($i in 1..30) { if (Test-Port) { break }; Start-Sleep -Milliseconds 500 }
      }
    }
    if ($portOk) {
      # 确保最新皮肤在：先轻量 check，未注入才 --once
      $out = & node $InjectMjs --port $Port --check 2>$null | Out-String
      if ($out -notmatch '已注入') {
        & node $InjectMjs --port $Port --once 2>$null | Out-Null
      }
      $now = Get-Date -Format HH:mm:ss
      Write-Host ("[gptgirl] " + $now + " 运行中，皮肤已保持")
    }
  }
  Start-Sleep -Seconds 3
}

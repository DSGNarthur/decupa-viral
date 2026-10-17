# Exercise the generated setup and uninstaller only on a disposable CI runner.
param([Parameter(Mandatory=$true)][string]$Installer,
      [Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or !$env:RUNNER_TEMP) {
    throw 'This installer acceptance script requires a disposable GitHub runner.'
}
$target = [IO.Path]::GetFullPath($Destination)
$temporary = [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\') + '\'
if (!$target.StartsWith($temporary, [StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $target)) {
    throw 'The acceptance destination must be a new folder inside RUNNER_TEMP.'
}
function Test-EnginePort {
    $socket = [Net.Sockets.TcpClient]::new()
    try {
        $connecting = $socket.ConnectAsync('127.0.0.1', 16889)
        return $connecting.Wait(1000) -and $socket.Connected
    } catch { return $false } finally { $socket.Dispose() }
}
if (Test-EnginePort) { throw 'The engine port is already occupied; no existing process will be stopped.' }
$arguments = @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/SP-',
    ('/DIR="' + $target + '"'), '/TASKS="!autostart"',
    ('/LOG="' + $env:RUNNER_TEMP + '\decupa-setup.log"'))
$setup = Start-Process -FilePath (Resolve-Path -LiteralPath $Installer).Path -ArgumentList $arguments -Wait -PassThru -WindowStyle Hidden
if ($setup.ExitCode -ne 0) { throw "Setup failed with exit code $($setup.ExitCode)." }
$ready = $false
for ($attempt = 0; $attempt -lt 60; $attempt++) {
    try {
        $connection = Invoke-RestMethod -Uri 'http://127.0.0.1:16889/api/companion/connect' -Method Post -ContentType 'application/json' -Body '{}' -Headers @{
            Origin='https://decupa-viral.vercel.app'; 'X-Decupa-Connect'='1'
        } -TimeoutSec 2
        if ($connection.app -eq 'Decupa Viral' -and $connection.runtime -eq 'pc' -and $connection.token.Length -ge 32) {
            $ready = $true
            break
        }
    } catch { }
    Start-Sleep -Seconds 1
}
if (!$ready) { throw 'The engine installed by Setup did not become ready.' }
$protocol = (Get-Item -LiteralPath 'HKCU:\Software\Classes\decupaviral\shell\open\command').GetValue('')
if (!$protocol.Contains($target + '\app\desktop\runtime.py')) { throw 'Setup did not register this installation.' }
$uninstaller = Join-Path $target 'unins000.exe'
if (!(Test-Path -LiteralPath $uninstaller)) { throw 'The generated uninstaller is missing.' }
$uninstall = Start-Process -FilePath $uninstaller -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',
    ('/LOG="' + $env:RUNNER_TEMP + '\decupa-uninstall.log"')) -Wait -PassThru -WindowStyle Hidden
if ($uninstall.ExitCode -ne 0) { throw "Uninstall failed with exit code $($uninstall.ExitCode)." }
if ((Test-EnginePort) -or (Test-Path -LiteralPath (Join-Path $target 'python\python.exe'))) {
    throw 'The uninstaller did not remove the interpreter or stop its own engine.'
}
@{ platform='Windows'; installed=$true; paired=$true; protocol_registered=$true;
   uninstalled=$true; engine_stopped=$true; passed=$true } |
    ConvertTo-Json | Set-Content -LiteralPath 'desktop/release/installer-smoke.json' -Encoding utf8

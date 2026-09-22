param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')
$frontendUrl = 'http://127.0.0.1:5173'
$backendUrl = 'http://127.0.0.1:3001/healthz'
$workDirectory = Join-Path $projectRoot 'work'
$pidFile = Join-Path $workDirectory 'local-processes.json'
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$vitePath = Join-Path $projectRoot 'node_modules\vite\bin\vite.js'

if (-not (Test-Path -LiteralPath $vitePath)) {
    throw '依赖尚未安装。请先在本目录运行 npm ci。'
}
New-Item -ItemType Directory -Path $workDirectory -Force | Out-Null

function Test-ProjectProcess([int]$ProcessId, [string]$ExpectedFragment) {
    $record = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
    if (-not $record -or -not $record.CommandLine) { return $false }
    return $record.ExecutablePath -eq $nodePath -and
        $record.CommandLine.IndexOf($projectRoot, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -and
        $record.CommandLine.IndexOf($ExpectedFragment, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
}

function Test-Http([string]$Url, [string]$Pattern) {
    try {
        # Bypass Windows/enterprise proxy discovery for loopback checks. On
        # Windows PowerShell 5.1 Invoke-WebRequest can otherwise time out even
        # after Vite is already listening.
        $request = [System.Net.HttpWebRequest]::Create($Url)
        $request.Proxy = $null
        $request.Timeout = 5000
        $request.ReadWriteTimeout = 5000
        $response = $request.GetResponse()
        try {
            $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
            try { $content = $reader.ReadToEnd() } finally { $reader.Dispose() }
            return [int]$response.StatusCode -eq 200 -and ($Pattern -eq '' -or $content -match $Pattern)
        } finally { $response.Dispose() }
    } catch { return $false }
}

$saved = $null
if (Test-Path -LiteralPath $pidFile) {
    try { $saved = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json } catch {}
}

$savedBackendOk = $saved -and (Test-ProjectProcess ([int]$saved.backendPid) 'server\index.js')
$savedFrontendOk = $saved -and (Test-ProjectProcess ([int]$saved.frontendPid) 'vite.js')
if ($savedBackendOk -and $savedFrontendOk -and
    (Test-Http $backendUrl '') -and (Test-Http $frontendUrl 'electronic-pancake')) {
    if (-not $NoBrowser) { Start-Process $frontendUrl }
    exit 0
}

# Only stop processes whose saved PID and full command line both identify this
# exact checkout. An unrelated process occupying either port is never stopped.
if ($savedBackendOk) { Stop-Process -Id ([int]$saved.backendPid) -ErrorAction SilentlyContinue }
if ($savedFrontendOk) { Stop-Process -Id ([int]$saved.frontendPid) -ErrorAction SilentlyContinue }
Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue

if ((Test-NetConnection 127.0.0.1 -Port 3001 -InformationLevel Quiet -WarningAction SilentlyContinue) -or
    (Test-NetConnection 127.0.0.1 -Port 5173 -InformationLevel Quiet -WarningAction SilentlyContinue)) {
    throw '端口 3001 或 5173 已被其他程序占用；为避免误停进程，本脚本已停止。'
}

$backendScript = Join-Path $projectRoot 'server\index.js'
$backendArgs = @('--env-file-if-exists=.env', ('"' + $backendScript + '"'))
$backend = Start-Process -FilePath $nodePath -ArgumentList $backendArgs -WorkingDirectory $projectRoot `
    -WindowStyle Hidden -RedirectStandardOutput (Join-Path $workDirectory 'backend.log') `
    -RedirectStandardError (Join-Path $workDirectory 'backend-error.log') -PassThru
try {
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        Start-Sleep -Milliseconds 250
        if (Test-Http $backendUrl '') { break }
        if ($backend.HasExited) { throw 'API 启动失败，请查看 work/backend-error.log。' }
    }
    if (-not (Test-Http $backendUrl '')) { throw 'API 未在限定时间内就绪。' }

    $frontendArgs = @(('"' + $vitePath + '"'), '--host', '127.0.0.1', '--port', '5173', '--strictPort')
    $frontend = Start-Process -FilePath $nodePath -ArgumentList $frontendArgs -WorkingDirectory $projectRoot `
        -WindowStyle Hidden -RedirectStandardOutput (Join-Path $workDirectory 'frontend.log') `
        -RedirectStandardError (Join-Path $workDirectory 'frontend-error.log') -PassThru
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        Start-Sleep -Milliseconds 250
        if (Test-Http $frontendUrl 'electronic-pancake') { break }
        if ($frontend.HasExited) { throw '前端启动失败，请查看 work/frontend-error.log。' }
    }
    if (-not (Test-Http $frontendUrl 'electronic-pancake')) { throw '前端未在限定时间内就绪。' }

    @{ backendPid = $backend.Id; frontendPid = $frontend.Id; projectRoot = $projectRoot } |
        ConvertTo-Json | Set-Content -LiteralPath $pidFile -Encoding UTF8
    if (-not $NoBrowser) { Start-Process $frontendUrl }
} catch {
    if ($frontend -and -not $frontend.HasExited -and (Test-ProjectProcess $frontend.Id 'vite.js')) {
        Stop-Process -Id $frontend.Id -ErrorAction SilentlyContinue
    }
    if (-not $backend.HasExited -and (Test-ProjectProcess $backend.Id 'server\index.js')) {
        Stop-Process -Id $backend.Id -ErrorAction SilentlyContinue
    }
    throw
}

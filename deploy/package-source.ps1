param(
    [string]$OutputDirectory = 'C:\Users\24542\Documents\Codex\2026-09-21\google\outputs'
)

$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$outputRoot = [System.IO.Path]::GetFullPath($OutputDirectory)
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$archivePath = Join-Path $outputRoot "electronic-pancake-source-$timestamp.zip"
$stagingRoot = Join-Path $outputRoot ".electronic-pancake-staging-$timestamp"

# Top-level directories are deliberately not copied wholesale. Generated data
# under server/, legacy browser demos, local work files and secrets therefore
# cannot enter the archive by accident.
$files = @(
    '.env.example', '.gitattributes', '.gitignore', 'index.html', 'package.json', 'package-lock.json',
    'vite.config.js', 'README.md', 'SHOP-REVIEW-DESIGN.md', 'PHOTO-CREDITS.md',
    '上线配置清单.md', '服务器开站流程.md', 'start-preview.ps1', '启动本地预览.cmd',
    'src\App.jsx', 'src\data.js', 'src\main.jsx', 'src\Markdown.jsx',
    'src\photo-data.json', 'src\photography.css', 'src\Photos.jsx',
    'src\store.jsx', 'src\styles.css',
    'server\API.md', 'server\app.js', 'server\content-manifest.js', 'server\validate-content.js', 'server\db.js', 'server\index.js',
    'server\init-owner.js', 'server\security.js', 'server\seed\shop-seed.json',
    'server\seed\problems-official.json', 'server\seed\problems-official-files\README.md',
    'scripts\import-national-problems.mjs',
    'public\favicon.svg', 'public\photos\credits.json',
    'public\photos\oscilloscope-1200.webp', 'public\photos\oscilloscope-640.webp',
    'public\photos\pcb-1200.webp', 'public\photos\pcb-640.webp',
    'public\photos\soldering-1200.webp', 'public\photos\soldering-640.webp',
    'public\photos\stm32-1200.webp', 'public\photos\stm32-640.webp',
    'tests\api.mjs', 'tests\auth-mail.mjs', 'tests\production-ui.mjs',
    'tests\production-integration.mjs', 'tests\production-e2e.mjs',
    'deploy\app.env.example', 'deploy\backup.sh',
    'deploy\electronic-pancake-backup.service',
    'deploy\electronic-pancake-backup.timer', 'deploy\electronic-pancake.service',
    'deploy\install-node24.sh', 'deploy\logrotate.conf',
    'deploy\nginx\electronic-pancake.conf', 'deploy\restore.sh',
    'deploy\package-source.ps1'
)

# dist contains only the final Vite output. Its hashed filenames change on each
# build, so the directory is enumerated only after strict path/extension checks.
$allowedDistExtensions = @('.html', '.js', '.css', '.svg', '.json', '.webp', '.woff', '.woff2', '.ttf')
$distFiles = Get-ChildItem -LiteralPath (Join-Path $projectRoot 'dist') -File -Recurse
if (-not ($distFiles | Where-Object Name -EQ 'index.html')) {
    throw 'dist/index.html is missing. Run and verify the final build first.'
}
foreach ($distFile in $distFiles) {
    if ($allowedDistExtensions -notcontains $distFile.Extension.ToLowerInvariant()) {
        throw "Unexpected file in dist: $($distFile.FullName)"
    }
    $relative = $distFile.FullName.Substring($projectRoot.Length).TrimStart('\')
    $files += $relative
}

# Official files are enumerated separately. Only reviewed document/image types
# under the fixed seed directory may enter the release; source archives stay in work/.
$officialRoot = Join-Path $projectRoot 'server\seed\problems-official-files'
$allowedOfficialExtensions = @('.pdf', '.png', '.jpg', '.jpeg', '.svg', '.pptx', '.doc', '.docx', '.md')
$officialFiles = Get-ChildItem -LiteralPath $officialRoot -File -Recurse
foreach ($officialFile in $officialFiles) {
    if ($allowedOfficialExtensions -notcontains $officialFile.Extension.ToLowerInvariant()) {
        throw "Unexpected official content file: $($officialFile.FullName)"
    }
    if ($officialFile.Length -gt 50MB) {
        throw "Official content file exceeds 50 MiB and must remain an external reference: $($officialFile.FullName)"
    }
    $relative = $officialFile.FullName.Substring($projectRoot.Length).TrimStart('\')
    if ($files -notcontains $relative) { $files += $relative }
}

if (Test-Path -LiteralPath $archivePath) { throw "Archive already exists: $archivePath" }
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
New-Item -ItemType Directory -Path $stagingRoot | Out-Null
try {
    foreach ($relative in $files) {
        if ($relative -match '(^|\\)(node_modules|work|logs?|private-uploads|data)(\\|$)' -or
            $relative -match '\.(sqlite(?:-wal|-shm)?|db|log|zip|7z|tar|gz)$' -or
            [System.IO.Path]::GetFileName($relative) -eq '.env') {
            throw "Blocked path in release whitelist: $relative"
        }
        $source = Join-Path $projectRoot $relative
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
            throw "Required release file is missing: $relative"
        }
        $destination = Join-Path $stagingRoot $relative
        New-Item -ItemType Directory -Path ([System.IO.Path]::GetDirectoryName($destination)) -Force | Out-Null
        Copy-Item -LiteralPath $source -Destination $destination
    }

    $textExtensions = @('.js', '.mjs', '.json', '.md', '.ps1', '.sh', '.service', '.timer', '.conf', '.example', '.html', '.css', '.cmd')
    $unexpectedSecrets = Get-ChildItem -LiteralPath $stagingRoot -File -Recurse |
        Where-Object { $textExtensions -contains $_.Extension.ToLowerInvariant() } |
        Select-String -Pattern 'OWNER_PASSWORD[ \t]*=[ \t]*\S+|SMTP_PASS[ \t]*=[ \t]*\S+' -List
    if ($unexpectedSecrets) {
        throw "A credential-like assignment was found in staged source: $($unexpectedSecrets.Path -join ', ')"
    }
    Compress-Archive -Path (Join-Path $stagingRoot '*') -DestinationPath $archivePath -CompressionLevel Optimal
    $archiveHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash.ToLowerInvariant()
    $checksumPath = "$archivePath.sha256"
    $checksumLine = "$archiveHash  $([System.IO.Path]::GetFileName($archivePath))`n"
    [System.IO.File]::WriteAllText($checksumPath, $checksumLine, [System.Text.UTF8Encoding]::new($false))
    Write-Host "Release archive created: $archivePath"
    Write-Host "SHA-256 file created: $checksumPath"
} finally {
    $resolvedOutput = [System.IO.Path]::GetFullPath($outputRoot).TrimEnd('\')
    $resolvedStaging = [System.IO.Path]::GetFullPath($stagingRoot)
    if ($resolvedStaging.StartsWith($resolvedOutput + '\.electronic-pancake-staging-', [System.StringComparison]::OrdinalIgnoreCase) -and
        (Test-Path -LiteralPath $resolvedStaging)) {
        for ($attempt = 1; $attempt -le 5; $attempt++) {
            try {
                Remove-Item -LiteralPath $resolvedStaging -Recurse -Force
                break
            } catch {
                if ($attempt -eq 5) { throw }
                Start-Sleep -Milliseconds 500
            }
        }
    }
}

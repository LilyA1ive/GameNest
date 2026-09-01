# Copies the Node.js game project into the Android app's assets folder.
# Run this from PowerShell whenever you modify server.js, games/, bots/, public/, etc.
#
# Usage:
#   cd .\android
#   .\copy-nodejs-project.ps1

$ErrorActionPreference = "Stop"

# Anchor the source on this script's own location (the android/ folder),
# so it works no matter what the current working directory is.
$src  = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$dest = "$PSScriptRoot\app\src\main\assets\nodejs-project"

Write-Host ""
Write-Host "Source: $src"
Write-Host "Dest:   $dest"
Write-Host ""

# Clean destination first
if (Test-Path $dest) {
    Write-Host "Removing existing nodejs-project..."
    Remove-Item -Recurse -Force $dest
}
New-Item -ItemType Directory -Force $dest | Out-Null

# Files and folders to copy
# NOTE: main.js lives in android/ (nodejs-mobile entry), copy it from there.
$items = @(
    "server.js",
    "startup-port.js",
    "package.json",
    "package-lock.json",
    "lang",
    "games",
    "bots",
    "public",
    "node_modules"
)

foreach ($item in $items) {
    $srcPath = Join-Path $src $item
    if (Test-Path $srcPath) {
        Write-Host "Copying $item..."
        Copy-Item -Recurse -Force $srcPath $dest
    } else {
        Write-Host "  Skipping $item (not found)" -ForegroundColor Yellow
    }
}

# Copy main.js from android/ (its new home)
$mainSrc = Join-Path $PSScriptRoot "main.js"
if (Test-Path $mainSrc) {
    Write-Host "Copying main.js..."
    Copy-Item -Force $mainSrc $dest
} else {
    Write-Host "  Skipping main.js (not found in android/)" -ForegroundColor Yellow
}

# Prune packages that aren't part of the production dependency closure.
# The copy above takes node_modules wholesale, which drags in undeclared dev-only
# packages (puppeteer / chromium-bidi / devtools-protocol / zod ... ~17 MB in the APK).
$destModules = Join-Path $dest "node_modules"
if (Test-Path $destModules) {
    Write-Host ""
    Write-Host "Pruning non-production packages..."

    # $ErrorActionPreference is Stop, so a missing `node` would abort the whole script
    # after the copy but before the size report. Degrade to "skip pruning" instead.
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Host "  node not found on PATH - skipping prune (APK stays larger)" -ForegroundColor Yellow
        $prodRaw = @()
    } else {
        Push-Location $src
        # package-lock.json is the authoritative closure. Do NOT use `npm ls --omit=dev`:
        # it only filters *declared* devDependencies, so undeclared strays like puppeteer
        # are reported as extraneous and still listed (measured: it pruned 0 packages).
        $prodRaw = & node -e @"
const l = require('./package-lock.json');
const keep = new Set();
for (const [k, v] of Object.entries(l.packages || {})) {
  const m = /^node_modules\/(@[^/]+\/[^/]+|[^/]+)$/.exec(k);
  if (!m || v.dev) continue;
  keep.add(m[1]);
}
console.log([...keep].join('\n'));
"@ 2>$null
        Pop-Location
    }

    $keep = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($line in $prodRaw) {
        if (-not [string]::IsNullOrWhiteSpace($line)) { [void]$keep.Add($line.Trim()) }
    }

    # Fail safe: if we couldn't resolve the closure, keep everything rather than wiping deps.
    if ($keep.Count -eq 0) {
        Write-Host "  Could not resolve production closure - skipping prune (APK stays larger)" -ForegroundColor Yellow
    } else {
        $removed = 0
        foreach ($dir in Get-ChildItem -Path $destModules -Directory) {
            if ($dir.Name.StartsWith('.')) { continue }
            if ($dir.Name.StartsWith('@')) {
                foreach ($sub in Get-ChildItem -Path $dir.FullName -Directory) {
                    if (-not $keep.Contains($dir.Name + '/' + $sub.Name)) {
                        Remove-Item -Recurse -Force $sub.FullName
                        $removed++
                    }
                }
                if (-not (Get-ChildItem -Path $dir.FullName)) { Remove-Item -Recurse -Force $dir.FullName }
            } elseif (-not $keep.Contains($dir.Name)) {
                Remove-Item -Recurse -Force $dir.FullName
                $removed++
            }
        }
        Write-Host "  Removed $removed non-production package(s), kept $($keep.Count)." -ForegroundColor Green
    }
}

# Remove dev/test files inside node_modules to shrink APK size
$cleanupPatterns = @(
    "*.md", "*.markdown", "README*", "CHANGELOG*", "HISTORY*",
    "LICENSE*", "*.yml", "*.yaml", ".npmignore", ".eslintrc*",
    ".prettierrc*", ".github", ".vscode", "test", "tests",
    "example", "examples", "docs", "doc", "benchmark", "benchmarks",
    "*.min.js.map", "*.d.ts"
)

$nodeModules = Join-Path $dest "node_modules"
if (Test-Path $nodeModules) {
    Write-Host ""
    Write-Host "Cleaning node_modules to reduce APK size..."
    foreach ($pattern in $cleanupPatterns) {
        Get-ChildItem -Path $nodeModules -Recurse -Filter $pattern -ErrorAction SilentlyContinue | ForEach-Object {
            Remove-Item -Recurse -Force $_.FullName -ErrorAction SilentlyContinue
        }
    }
}

# Report final size
$size = (Get-ChildItem -Path $dest -Recurse | Measure-Object -Property Length -Sum).Sum
$sizeMB = [math]::Round($size / 1MB, 2)
Write-Host ""
Write-Host "Done. nodejs-project size: $sizeMB MB" -ForegroundColor Green
Write-Host ""

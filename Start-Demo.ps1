param([ValidateSet('groq', 'ollama')][string]$Provider = 'ollama')
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
if ($Provider -eq 'ollama') {
$portableOllama = Join-Path $projectRoot '.runtime\ollama\ollama.exe'
$installedOllama = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
$modelName = 'qwen2.5-coder:1.5b'
if (Test-Path -LiteralPath $portableOllama) {
    $ollamaExecutable = $portableOllama
    $env:OLLAMA_MODELS = Join-Path $projectRoot '.runtime\models'
} elseif (Test-Path -LiteralPath $installedOllama) {
    $ollamaExecutable = $installedOllama
} else {
    throw 'Ollama runtime is missing. Install Ollama from https://ollama.com/download/windows, then rerun this script.'
}
$env:OLLAMA_HOST = '127.0.0.1:11434'
$env:OLLAMA_NO_CLOUD = '1'
$env:OLLAMA_NOPRUNE = '1'
try {
    $null = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 3
} catch {
    Start-Process -FilePath $ollamaExecutable -ArgumentList 'serve' -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectRoot 'ollama-server.log') -RedirectStandardError (Join-Path $projectRoot 'ollama-server-error.log')
    $ready = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Seconds 1
        try { $null = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 2; $ready = $true; break } catch {}
    }
    if (-not $ready) { throw 'Ollama did not start. Check ollama-server-error.log.' }
}
$tags = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 5
if ($modelName -notin $tags.models.name) {
    Write-Host 'Downloading the local code model. This is needed only once.'
    & $ollamaExecutable pull $modelName
    if ($LASTEXITCODE -ne 0) { throw 'Model download failed. Check the connection and rerun this script.' }
}
Write-Host 'Warming the local model for the recording...'
$warmupBody = @{ model = $modelName; prompt = ''; stream = $false; keep_alive = '5m' } | ConvertTo-Json
$null = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:11434/api/generate' -ContentType 'application/json' -Body $warmupBody -TimeoutSec 120
}
$settingsFile = Join-Path $projectRoot 'demo\.vscode\settings.json'
$demoSettings = Get-Content -LiteralPath $settingsFile -Raw | ConvertFrom-Json
$demoSettings.'vsHelper.provider' = $Provider
$demoSettings | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $settingsFile -Encoding utf8
$extensionVersion = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
$vsix = Join-Path $projectRoot ('vs-helper-' + $extensionVersion + '.vsix')
if (Test-Path -LiteralPath $vsix) {
    & code --install-extension $vsix --force
    if ($LASTEXITCODE -ne 0) { throw 'Extension installation failed.' }
}
& code --new-window (Join-Path $projectRoot 'demo') (Join-Path $projectRoot 'demo\01_python.py')
if ($LASTEXITCODE -ne 0) { throw 'VS Code could not open. If an update is pending, save your work, close all VS Code windows, let the update finish, and rerun this launcher.' }
if ($Provider -eq 'groq') { Write-Host 'Run VS_helper: Set Groq API Key, then VS_helper: Test Provider Connection. Groq cloud demo sends code context to Groq.' }
else { Write-Host 'Ready. In VS Code run: VS_helper: Test Provider Connection' }
Write-Host 'Place the cursor on the final indented Python line. Click the sparkle icon in the editor toolbar, wait for ghost text, then press Tab.'
Write-Host 'Alternative: F1, then VS_helper: Trigger Inline Suggestion. No global shortcut is required.'

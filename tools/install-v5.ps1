Add-Type -AssemblyName System.Windows.Forms
$ErrorActionPreference = "Stop"
$source = Split-Path -Parent $PSScriptRoot

function Info([string]$message) {
  [System.Windows.Forms.MessageBox]::Show($message, "Ricettario AI v5", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null
}
function Fail([string]$message) {
  [System.Windows.Forms.MessageBox]::Show($message, "Ricettario AI v5 - errore", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
}

$target = "C:\Users\Admin\Desktop\ricettario-ai-v3"
if (-not (Test-Path (Join-Path $target ".git")) -or -not (Test-Path (Join-Path $target "package.json"))) {
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = "Seleziona la cartella principale del Ricettario collegata a GitHub"
  $dialog.ShowNewFolderButton = $false
  if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit }
  $target = $dialog.SelectedPath
}

if (-not (Test-Path (Join-Path $target ".git"))) { Fail "La cartella scelta non contiene .git."; exit 1 }
if (-not (Test-Path (Join-Path $target "package.json"))) { Fail "La cartella scelta non contiene package.json."; exit 1 }

$envPath = Join-Path $target ".env.local"
$envBackup = $null
if (Test-Path $envPath) { $envBackup = Get-Content $envPath -Raw }

try {
  # L'installazione aggiorna soltanto il codice. Supabase non viene toccato.
  $managedDirs = @("app", "components", "lib", "public", "tools", "types")
  foreach ($dir in $managedDirs) {
    $p = Join-Path $target $dir
    if (Test-Path $p) { Remove-Item $p -Recurse -Force }
  }

  $lockPath = Join-Path $target "package-lock.json"
  if (Test-Path $lockPath) { Remove-Item $lockPath -Force }

  $managedFiles = @("package.json", "tsconfig.json", "next-env.d.ts", "README.md", ".gitignore", ".env.example", "update-manifest.json")
  foreach ($file in $managedFiles) {
    $sourceFile = Join-Path $source $file
    if (Test-Path $sourceFile) { Copy-Item $sourceFile (Join-Path $target $file) -Force }
  }
  foreach ($dir in $managedDirs) {
    $sourceDir = Join-Path $source $dir
    if (Test-Path $sourceDir) { Copy-Item $sourceDir (Join-Path $target $dir) -Recurse -Force }
  }

  if ($envBackup -ne $null) { Set-Content -Path $envPath -Value $envBackup -NoNewline }

  $required = @(
    "app\page.tsx",
    "app\api\recipes\route.ts",
    "app\api\backup\status\route.ts",
    "lib\supabase.ts",
    "lib\data-safety.ts",
    "lib\local-cache.ts",
    "lib\recipe-map.ts",
    "components\RecipeCard.tsx",
    "components\RecipeDetail.tsx"
  )
  foreach ($relative in $required) {
    if (-not (Test-Path (Join-Path $target $relative))) { throw "Installazione incompleta: manca $relative" }
  }
  if (Test-Path (Join-Path $target "app\app")) { throw "È rimasta una cartella app\app non valida." }

  Push-Location $target
  try {
    & git add -A
    if ($LASTEXITCODE -ne 0) { throw "git add non riuscito" }

    & git commit -m "Ricettario AI v5 - Fortress"
    $commitExit = $LASTEXITCODE
    if ($commitExit -ne 0) {
      $status = & git status --porcelain
      if ($status) { throw "git commit non riuscito" }
    }

    & git push
    if ($LASTEXITCODE -ne 0) { throw "git push non riuscito" }
  }
  finally { Pop-Location }

  Info "Versione 5 inviata a GitHub. Vercel avvierà il deploy automaticamente. Le ricette su Supabase non sono state toccate. Quando Vercel mostra Ready, apri il sito e attendi qualche secondo: la v5 controllerà e proteggerà i dati automaticamente."
}
catch {
  if ($envBackup -ne $null) { Set-Content -Path $envPath -Value $envBackup -NoNewline }
  Fail $_.Exception.Message
  exit 1
}

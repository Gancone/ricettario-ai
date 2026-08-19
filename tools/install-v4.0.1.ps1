Add-Type -AssemblyName System.Windows.Forms

$ErrorActionPreference = "Stop"

$source = Split-Path -Parent $PSScriptRoot

$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "Seleziona la cartella del progetto Ricettario collegata a GitHub (quella che contiene .git e package.json)"
$dialog.ShowNewFolderButton = $false

if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
  exit
}

$target = $dialog.SelectedPath

function Show-Error([string]$message) {
  [System.Windows.Forms.MessageBox]::Show(
    $message,
    "Ricettario AI - errore",
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Error
  ) | Out-Null
}

function Show-Info([string]$message) {
  [System.Windows.Forms.MessageBox]::Show(
    $message,
    "Ricettario AI",
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Information
  ) | Out-Null
}

if (-not (Test-Path (Join-Path $target ".git"))) {
  Show-Error "La cartella scelta non contiene .git. Devi scegliere la cartella principale del progetto collegato a GitHub."
  exit 1
}

if (-not (Test-Path (Join-Path $target "package.json"))) {
  Show-Error "La cartella scelta non contiene package.json. Scegli la cartella principale del progetto."
  exit 1
}

$envPath = Join-Path $target ".env.local"
$envBackup = $null
if (Test-Path $envPath) {
  $envBackup = Get-Content $envPath -Raw
}

try {
  # Elimina completamente le cartelle gestite dalla nuova versione.
  # Questo evita residui di installazioni precedenti, inclusi percorsi app/app.
  $managedDirs = @(
    "app",
    "components",
    "lib",
    "public",
    "tools",
    "types"
  )

  foreach ($dir in $managedDirs) {
    $p = Join-Path $target $dir
    if (Test-Path $p) {
      Remove-Item $p -Recurse -Force
    }
  }

  # Il vecchio lock può riferirsi alle dipendenze della v3.
  $lockPath = Join-Path $target "package-lock.json"
  if (Test-Path $lockPath) {
    Remove-Item $lockPath -Force
  }

  $managedFiles = @(
    "package.json",
    "tsconfig.json",
    "next-env.d.ts",
    "README.md",
    ".gitignore",
    ".env.example",
    "update-manifest.json"
  )

  foreach ($file in $managedFiles) {
    $sourceFile = Join-Path $source $file
    if (Test-Path $sourceFile) {
      Copy-Item $sourceFile (Join-Path $target $file) -Force
    }
  }

  foreach ($dir in $managedDirs) {
    $sourceDir = Join-Path $source $dir
    if (Test-Path $sourceDir) {
      Copy-Item $sourceDir (Join-Path $target $dir) -Recurse -Force
    }
  }

  # Ripristina le chiavi locali, che non vengono mai copiate nello ZIP.
  if ($envBackup -ne $null) {
    Set-Content -Path $envPath -Value $envBackup -NoNewline
  }

  # Verifiche prima di caricare su GitHub.
  $required = @(
    "app\page.tsx",
    "app\api\recipes\route.ts",
    "lib\supabase.ts",
    "lib\recipe-map.ts",
    "lib\image-storage.ts",
    "types\recipe.ts",
    "components\RecipeDetail.tsx"
  )

  foreach ($relative in $required) {
    if (-not (Test-Path (Join-Path $target $relative))) {
      throw "Installazione incompleta: manca $relative"
    }
  }

  if (Test-Path (Join-Path $target "app\app")) {
    throw "È rimasta una cartella app\app, che non dovrebbe esistere."
  }

  Push-Location $target
  try {
    & git add -A
    if ($LASTEXITCODE -ne 0) { throw "git add non riuscito" }

    & git commit -m "Ripara Ricettario AI v4.0.1"
    $commitExit = $LASTEXITCODE

    if ($commitExit -ne 0) {
      # Se non ci sono modifiche, non è necessariamente un errore.
      $status = & git status --porcelain
      if ($status) {
        throw "git commit non riuscito"
      }
    }

    & git push
    if ($LASTEXITCODE -ne 0) { throw "git push non riuscito" }
  }
  finally {
    Pop-Location
  }

  Show-Info "Riparazione completata. I file corretti sono stati inviati a GitHub. Vercel avvierà automaticamente un nuovo deploy. Attendi che il deployment diventi Ready."
}
catch {
  if ($envBackup -ne $null -and -not (Test-Path $envPath)) {
    Set-Content -Path $envPath -Value $envBackup -NoNewline
  }
  Show-Error $_.Exception.Message
  exit 1
}

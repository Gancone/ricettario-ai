Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName Microsoft.VisualBasic

$source = Split-Path -Parent $PSScriptRoot
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "Seleziona la cartella del tuo progetto Ricettario attuale (quella che contiene .git e package.json)"
$dialog.ShowNewFolderButton = $false

if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit }
$target = $dialog.SelectedPath

if (-not (Test-Path (Join-Path $target ".git"))) {
  [System.Windows.Forms.MessageBox]::Show("La cartella scelta non contiene .git. Seleziona la cartella del progetto collegato a GitHub.", "Ricettario AI")
  exit 1
}

if (-not (Test-Path (Join-Path $target "package.json"))) {
  [System.Windows.Forms.MessageBox]::Show("La cartella scelta non sembra un progetto Next.js.", "Ricettario AI")
  exit 1
}

$preserveEnv = Join-Path $target ".env.local"
$oldLock = Join-Path $target "package-lock.json"
if (Test-Path $oldLock) { Remove-Item $oldLock -Force }
$envBackup = $null
if (Test-Path $preserveEnv) { $envBackup = Get-Content $preserveEnv -Raw }

$excludeDirs = @(".git", "node_modules", ".next")
$excludeFiles = @(".env", ".env.local")

Get-ChildItem -Path $source -Force | ForEach-Object {
  if ($excludeDirs -contains $_.Name -or $excludeFiles -contains $_.Name -or $_.Name -eq "INSTALLA-V4.bat") { return }
  $destination = Join-Path $target $_.Name
  if ($_.PSIsContainer) {
    Copy-Item $_.FullName $destination -Recurse -Force
  } else {
    Copy-Item $_.FullName $destination -Force
  }
}

if ($envBackup -ne $null) { Set-Content -Path $preserveEnv -Value $envBackup -NoNewline }

Push-Location $target
try {
  git add -A | Out-Null
  git commit -m "Aggiornamento Ricettario AI v4.0.0" | Out-Null
  git push | Out-Null
  [System.Windows.Forms.MessageBox]::Show("Aggiornamento caricato su GitHub. Vercel farà il deploy automaticamente. Controlla il sito tra 1-2 minuti.", "Ricettario AI - fatto")
} catch {
  [System.Windows.Forms.MessageBox]::Show("I file sono stati copiati, ma il caricamento GitHub non è riuscito. Errore: $($_.Exception.Message)", "Ricettario AI")
} finally {
  Pop-Location
}

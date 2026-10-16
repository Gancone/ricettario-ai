param([string]$TargetPath)
$ErrorActionPreference='Stop'
if(-not $TargetPath){
 Add-Type -AssemblyName System.Windows.Forms
 $taskDialog=New-Object System.Windows.Forms.FolderBrowserDialog
 $taskDialog.Description='Seleziona il repository Ricettario AI: verrà creata una copia Git isolata per verificare l’aggiornamento.'
 $taskDialog.ShowNewFolderButton=$false
 if($taskDialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK){exit}
 $TargetPath=$taskDialog.SelectedPath
}
& (Join-Path $PSScriptRoot 'prepare-update.ps1') -TargetPath $TargetPath

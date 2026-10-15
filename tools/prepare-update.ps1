param([string]$TargetPath,[string]$PackagePath=(Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference='Stop'
if (-not $TargetPath) { throw 'Indica -TargetPath con la cartella Git del Ricettario.' }
$taskTarget=(Resolve-Path -LiteralPath $TargetPath).Path
$taskPackage=(Resolve-Path -LiteralPath $PackagePath).Path
if (-not (Test-Path -LiteralPath (Join-Path $taskTarget '.git'))) { throw 'Il progetto di destinazione deve essere un repository Git.' }
$taskRequired=@('package.json','package-lock.json','app/page.tsx','lib/data-safety.ts','database/migrations/001_backend_safety.sql','public/icons/ricettario-ai.ico')
foreach($taskRelative in $taskRequired){if(-not (Test-Path -LiteralPath (Join-Path $taskPackage $taskRelative))){throw "Pacchetto incompleto: $taskRelative"}}
$taskBranch='update/review-'+(Get-Date -Format 'yyyyMMdd-HHmmss')
$taskWorktree=Join-Path (Split-Path -Parent $taskTarget) ('ricettario-preview-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
& git -C $taskTarget worktree add -b $taskBranch $taskWorktree HEAD
if($LASTEXITCODE -ne 0){throw 'Impossibile preparare il checkout isolato.'}
$taskFiles=@()
$taskRoots=@('app','components','lib','public','tools','types','database','tests','.github','docs')
$taskRootFiles=@('package.json','package-lock.json','tsconfig.json','next-env.d.ts','next.config.ts','playwright.config.ts','README.md','.gitignore','.gitattributes','.env.example','AGENTS.md','update-manifest.json')
foreach($taskRoot in $taskRoots){$taskDirectory=Join-Path $taskPackage $taskRoot;if(Test-Path -LiteralPath $taskDirectory){foreach($taskFile in Get-ChildItem -LiteralPath $taskDirectory -Recurse -File){if($taskFile.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Link non consentiti nel pacchetto.'};$taskFiles+=($taskFile.FullName.Substring($taskPackage.Length+1))}}}
foreach($taskFile in $taskRootFiles){if(Test-Path -LiteralPath (Join-Path $taskPackage $taskFile)){$taskFiles+=$taskFile}}
$taskHashes=@{}
foreach($taskRelative in $taskFiles){
 if($taskRelative -match '(^|[\\/])\.env(?!\.example$)' -or $taskRelative -match '(^|[\\/])(\.git|node_modules)([\\/]|$)'){throw 'Percorso protetto nel pacchetto.'}
 $taskFrom=Join-Path $taskPackage $taskRelative;$taskTo=Join-Path $taskWorktree $taskRelative
 $taskDestination=[IO.Path]::GetFullPath($taskTo)
 if(-not $taskDestination.StartsWith($taskWorktree+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Percorso fuori dal checkout.'}
 [IO.Directory]::CreateDirectory((Split-Path -Parent $taskTo))|Out-Null
 Copy-Item -LiteralPath $taskFrom -Destination $taskTo -Force
 $taskHashes[$taskRelative]=(Get-FileHash -LiteralPath $taskFrom -Algorithm SHA256).Hash
 if((Get-FileHash -LiteralPath $taskTo -Algorithm SHA256).Hash -ne $taskHashes[$taskRelative]){throw "Copia non verificata: $taskRelative"}
}
$taskHashes|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $taskWorktree 'update-source-checksums.json')
Push-Location $taskWorktree
try{
 & npm ci;if($LASTEXITCODE -ne 0){throw 'npm ci non riuscito.'}
 & npm run typecheck;if($LASTEXITCODE -ne 0){throw 'Typecheck non riuscito.'}
 & npm test;if($LASTEXITCODE -ne 0){throw 'Test non riusciti.'}
 & npm run build;if($LASTEXITCODE -ne 0){throw 'Build non riuscita.'}
 & git add -- $taskFiles 'update-source-checksums.json';if($LASTEXITCODE -ne 0){throw 'Preparazione commit non riuscita.'}
 & git commit -m 'Prepare reviewed Ricettario update';if($LASTEXITCODE -ne 0){throw 'Commit non riuscito o pacchetto gia presente.'}
}finally{Pop-Location}
Write-Host "Anteprima pronta: $taskWorktree"
Write-Host "Ramo: $taskBranch. Controlla il commit e pubblica volontariamente questo ramo per Vercel Preview."
Write-Host 'Il checkout originale, le credenziali e il database sono conservati. Nessun push o deploy automatico.'

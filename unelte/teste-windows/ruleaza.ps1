# Pasii jobului windows din .github/workflows/ci.yml, rulati pe laptopul de teste (Windows 10, prin SSH).
# Fiecare pas isi scrie iesirea in jurnal; la final, rezumat.json are codul si durata fiecarui pas.
# Un pas picat nu opreste restul (vrem toata imaginea dintr-o rulare), cu exceptia lui doctor:
# fara doctor verde, testele de integrare n-au sens.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File unelte\teste-windows\ruleaza.ps1 -Node C:\node22\node.exe -Iesire C:\teste-mg\rulare-1
#
# -PixeliTeme ruleaza si partile grele B-E din pixeli-teme (jobul manual windows-pixeli-teme, ~90 de minute).
# -Pasi alege doar unii pasi, dupa nume (de exemplu -Pasi unitare,integrare).
param(
  [string]$Node = 'node',
  [Parameter(Mandatory = $true)][string]$Iesire,
  [switch]$PixeliTeme,
  [string[]]$Pasi = @()
)

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$radacina = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
# npm si procesele copil iau node din PATH: Node-ul ales trece primul
if (Test-Path $Node) {
  $Node = (Resolve-Path $Node).Path
  $env:PATH = "$(Split-Path $Node);$env:PATH"
}
New-Item -ItemType Directory -Force -Path $Iesire | Out-Null
$jurnal = Join-Path $Iesire 'jurnal.txt'
$rezumat = Join-Path $Iesire 'rezumat.json'
# fara BOM: Set-Content -Encoding UTF8 din PowerShell 5.1 il pune, iar JSON-ul cu BOM se citeste prost de unele unelte
function Scrie-Rezumat($obiect) {
  $json = $obiect | ConvertTo-Json -Depth 4
  [IO.File]::WriteAllText($rezumat, $json, (New-Object System.Text.UTF8Encoding($false)))
}
Set-Content -Path $jurnal -Value "Rulare in $radacina, Node $(& $Node --version)" -Encoding UTF8

$toti = @(
  @{ nume = 'doctor'; argumente = @('nucleu/mg.mjs', 'doctor', '--ci'); env = @{} },
  @{ nume = 'unitare'; argumente = @('--test', 'teste/unitar/*.test.mjs'); env = @{} },
  @{ nume = 'garda'; argumente = @('--test', 'teste/garda/garda.test.mjs'); env = @{} },
  @{ nume = 'configuratie'; argumente = @('--test', 'teste/configuratie/*.test.mjs'); env = @{} },
  @{ nume = 'integrare'; argumente = @('--test', '--test-concurrency=1', 'teste/integrare/*.test.mjs'); env = @{ MG_TESTE_INTEGRARE = '1'; MG_TESTE_PIXELI_TEME = '0' } },
  @{ nume = 'sablon-reel'; argumente = @('--test', 'motoare/hyperframes/sabloane/reel-ilustrat/teste/*.test.mjs'); env = @{} }
)
if (Test-Path (Join-Path $radacina 'motoare/hyperframes/sabloane/text-animat/teste')) {
  $toti += @{ nume = 'sablon-text'; argumente = @('--test', 'motoare/hyperframes/sabloane/text-animat/teste/*.test.mjs'); env = @{} }
}
if (Test-Path (Join-Path $radacina 'teste/acceptare-text/acceptare-text.test.mjs')) {
  $toti += @{ nume = 'acceptare-text'; argumente = @('--test', '--test-concurrency=1', 'teste/acceptare-text/acceptare-text.test.mjs'); env = @{ MG_TESTE_INTEGRARE = '1' } }
}
if (Test-Path (Join-Path $radacina 'motoare/hyperframes/sabloane/overlay-filmare/teste')) {
  # cu MG_TESTE_INTEGRARE=1, motor-real.test.mjs ruleaza si hyperframes check --strict pe exemplele overlay
  $toti += @{ nume = 'sablon-overlay'; argumente = @('--test', '--test-concurrency=1', 'motoare/hyperframes/sabloane/overlay-filmare/teste/*.test.mjs'); env = @{ MG_TESTE_INTEGRARE = '1' } }
}
if (Test-Path (Join-Path $radacina 'teste/acceptare-overlay/acceptare-overlay.test.mjs')) {
  # prima rulare instaleaza Parakeet (~670 MB) in %USERPROFILE%\.cache\hyperframes, prin --instaleaza-transcrierea
  $toti += @{ nume = 'acceptare-overlay'; argumente = @('--test', '--test-concurrency=1', 'teste/acceptare-overlay/acceptare-overlay.test.mjs'); env = @{ MG_TESTE_INTEGRARE = '1' } }
}
if (Test-Path (Join-Path $radacina 'motoare/remotion/sabloane/date-serie/teste')) {
  # cu MG_TESTE_INTEGRARE=1, motor-real.test.mjs face bundle, compositions si schita pe Remotion real
  $toti += @{ nume = 'sablon-date-serie'; argumente = @('--test', '--test-concurrency=1', 'motoare/remotion/sabloane/date-serie/teste/*.test.mjs'); env = @{ MG_TESTE_INTEGRARE = '1' } }
}
if (Test-Path (Join-Path $radacina 'teste/acceptare-grafic/acceptare-grafic.test.mjs')) {
  # cere Remotion instalat in motoare/remotion (o data: mg nou ... --sablon date-serie --instaleaza-motorul, ~340 MB)
  $toti += @{ nume = 'acceptare-grafic'; argumente = @('--test', '--test-concurrency=1', 'teste/acceptare-grafic/acceptare-grafic.test.mjs'); env = @{ MG_TESTE_INTEGRARE = '1' } }
}
if ($PixeliTeme) {
  $toti += @{ nume = 'pixeli-teme'; argumente = @('--test', '--test-concurrency=1', 'teste/integrare/pixeli-teme.test.mjs'); env = @{ MG_TESTE_INTEGRARE = '1'; MG_TESTE_PIXELI_TEME = '1' } }
}
# cu -File, "-Pasi a,b" ajunge ca un singur text: lista se desparte aici
$Pasi = @($Pasi | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })
if ($Pasi.Count -gt 0) {
  $necunoscuti = @($Pasi | Where-Object { $p = $_; -not ($toti | Where-Object { $_.nume -eq $p }) })
  if ($necunoscuti.Count -gt 0) {
    Write-Error "Pasi necunoscuti: $($necunoscuti -join ', '). Pasii sunt: $(($toti | ForEach-Object { $_.nume }) -join ', ')."
    exit 2
  }
  $toti = @($toti | Where-Object { $Pasi -contains $_.nume })
}

$rezultate = @()
Push-Location $radacina
try {
  foreach ($pas in $toti) {
    $vechi = @{}
    foreach ($cheie in $pas.env.Keys) {
      $vechi[$cheie] = [Environment]::GetEnvironmentVariable($cheie)
      [Environment]::SetEnvironmentVariable($cheie, $pas.env[$cheie])
    }
    Add-Content -Path $jurnal -Value "`n===== $($pas.nume): node $($pas.argumente -join ' ')" -Encoding UTF8
    $start = Get-Date
    # *>> scrie UTF-16 in PowerShell 5.1; jurnalul ramane UTF-8 de la cap la coada
    & $Node @($pas.argumente) 2>&1 | ForEach-Object { "$_" } | Add-Content -Path $jurnal -Encoding UTF8
    $cod = $LASTEXITCODE
    $secunde = [math]::Round(((Get-Date) - $start).TotalSeconds)
    foreach ($cheie in $vechi.Keys) { [Environment]::SetEnvironmentVariable($cheie, $vechi[$cheie]) }
    Add-Content -Path $jurnal -Value "===== $($pas.nume): cod $cod, $secunde s" -Encoding UTF8
    $rezultate += [ordered]@{ pas = $pas.nume; cod = $cod; secunde = $secunde }
    # rezumatul se rescrie dupa fiecare pas, ca o rulare intrerupta sa lase ce a apucat
    Scrie-Rezumat @{ gata = $false; pasi = $rezultate }
    if ($pas.nume -eq 'doctor' -and $cod -ne 0) { break }
  }
} finally {
  Pop-Location
}
$ok = ($rezultate.Count -eq $toti.Count) -and -not ($rezultate | Where-Object { $_.cod -ne 0 })
Scrie-Rezumat @{ gata = $true; ok = $ok; pasi = $rezultate }
if ($ok) { exit 0 } else { exit 1 }

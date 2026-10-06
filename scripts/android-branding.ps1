# Aplica la identidad de Peregrinos al proyecto Android (Capacitor) y sincroniza los plugins.
# Uso (desde la raíz del repo):  powershell -ExecutionPolicy Bypass -File scripts\android-branding.ps1
#  - Copia iconos (legacy, redondo, adaptativo) y splash desde resources\android\res (generados desde public\icon.svg).
#  - Nombre visible "Peregrinos"; fondo azul del splash del sistema (Android 12+).
#  - versionCode/versionName: 2 / 1.1 (mismo package com.peregrinos.app: actualiza la instalación existente).
#  - npx cap sync android: registra @capacitor/app (botón Atrás → historial del WebView) y copia la configuración.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$res = Join-Path $root "android\app\src\main\res"
$utf8 = New-Object System.Text.UTF8Encoding $false
function Set-Text($path, $text) { [IO.File]::WriteAllText($path, $text, $utf8) }

if (-not (Test-Path $res)) { throw "No existe $res (¿proyecto Android sin crear?)" }

# 1. Iconos, splash y color de fondo del icono adaptativo.
Copy-Item (Join-Path $root "resources\android\res\*") $res -Recurse -Force
Write-Host "Recursos copiados a $res"

# 2. Nombre visible.
$strings = Join-Path $res "values\strings.xml"
$s = [IO.File]::ReadAllText($strings)
$s = $s -replace '<string name="app_name">[^<]*</string>', '<string name="app_name">Peregrinos</string>'
$s = $s -replace '<string name="title_activity_main">[^<]*</string>', '<string name="title_activity_main">Peregrinos</string>'
Set-Text $strings $s
Write-Host "strings.xml: app_name = Peregrinos"

# 3. Splash del sistema (Android 12+): fondo azul de la marca con el icono adaptativo.
$styles = Join-Path $res "values\styles.xml"
$st = [IO.File]::ReadAllText($styles)
if ($st -notmatch "windowSplashScreenBackground") {
  $st = $st -replace '(<style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">)', "`$1`r`n        <item name=`"windowSplashScreenBackground`">#0B3158</item>"
  Set-Text $styles $st
}
Write-Host "styles.xml: windowSplashScreenBackground = #0B3158"

# 4. Versión (el package y la firma no cambian: instala como actualización).
$gradle = Join-Path $root "android\app\build.gradle"
$g = [IO.File]::ReadAllText($gradle)
$g = $g -replace 'versionCode \d+', 'versionCode 2' -replace 'versionName "[^"]*"', 'versionName "1.1"'
Set-Text $gradle $g
Write-Host "build.gradle: versionCode 2, versionName 1.1"

# 5. webDir de respaldo (la app carga la web publicada; esta página solo se ve sin conexión).
$out = Join-Path $root "apps\web\out"
if (-not (Test-Path (Join-Path $out "index.html"))) {
  New-Item -ItemType Directory -Force $out | Out-Null
  Set-Text (Join-Path $out "index.html") @'
<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Peregrinos</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0B3158;color:#fff;font-family:Roboto,system-ui,sans-serif;text-align:center}p{color:#D6E4F5}</style></head>
<body><main><h1>Peregrinos</h1><p>La Iglesia más cerca de ti</p><p>Sin conexión. Revisa tu red e intenta nuevamente.</p></main></body></html>
'@
}

# 6. Sincroniza Capacitor (plugins + configuración).
Push-Location $root
try { npx.cmd cap sync android } finally { Pop-Location }
Write-Host "Listo. Plugins Android:"
Select-String -Path (Join-Path $root "android\capacitor.settings.gradle") -Pattern "include" | ForEach-Object { "  " + $_.Line.Trim() }

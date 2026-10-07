# Habilita en la APK las descargas de PDF (credenciales, vista previa e informe).
# Uso (desde la raíz del repo):  powershell -ExecutionPolicy Bypass -File scripts\android-pdf-downloads.ps1
#  - Copia MainActivity.java desde resources\android\java (intercepta <a download href="blob:...">, guarda en Descargas
#    y abre el PDF). No cambia el servidor ni la web: funciona con la web ya publicada.
#  - Agrega androidx.webkit (misma versión que ya usa Capacitor) a android\app\build.gradle.
#  - No hace falta `npx cap sync`: no cambian plugins ni configuración.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding $false
function Set-Text($path, $text) { [IO.File]::WriteAllText($path, $text, $utf8) }

$src = Join-Path $root "resources\android\java\com\peregrinos\app\MainActivity.java"
$dst = Join-Path $root "android\app\src\main\java\com\peregrinos\app\MainActivity.java"
if (-not (Test-Path $dst)) { throw "No existe $dst (¿proyecto Android sin crear?)" }

# 1. MainActivity con el manejador de descargas.
Copy-Item $src $dst -Force
Write-Host "MainActivity.java actualizado"

# 2. Dependencia androidx.webkit en el módulo app (Capacitor la declara como implementation y no la expone).
$gradle = Join-Path $root "android\app\build.gradle"
$g = [IO.File]::ReadAllText($gradle)
if ($g -notmatch "androidx\.webkit:webkit") {
  $g = $g -replace '(implementation "androidx\.core:core-splashscreen:\$coreSplashScreenVersion")', "`$1`r`n    implementation `"androidx.webkit:webkit:`$androidxWebkitVersion`""
  if ($g -notmatch "androidx\.webkit:webkit") { throw "No se encontró dónde agregar androidx.webkit en $gradle" }
  Set-Text $gradle $g
}
Write-Host "build.gradle: androidx.webkit:webkit:`$androidxWebkitVersion"
Write-Host "Listo."

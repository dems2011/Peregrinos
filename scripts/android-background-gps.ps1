# Prepara el proyecto Android para la APK 1.2: GPS con la app minimizada o la pantalla apagada («Compartir mi ubicación»).
# Uso (desde la raiz del repo):  powershell -ExecutionPolicy Bypass -File scripts\android-background-gps.ps1
# Prueba sin tocar el proyecto:   ... -File scripts\android-background-gps.ps1 -OutDir <carpeta>  (escribe ahi los resultados)
#  - Plugin @capacitor-community/background-geolocation 1.2.26 (ya en package.json de la raiz): servicio en primer plano de
#    tipo "location" con notificacion fija. Su manifest agrega FOREGROUND_SERVICE, FOREGROUND_SERVICE_LOCATION y
#    POST_NOTIFICATIONS al fusionarse. NO se usa ACCESS_BACKGROUND_LOCATION (el servicio lo inicia el usuario con la app
#    abierta), asi que Play no exige la declaracion de ubicacion en segundo plano.
#  - AndroidManifest.xml: deja el GPS como hardware opcional aunque el plugin lo declare obligatorio (tools:replace) y
#    marca el servicio del plugin como no exportado (otras apps no pueden iniciarlo).
#  - strings.xml: canal, icono (el de los avisos) y color (azul de la marca) de la notificacion fija.
#  - build.gradle: versionCode 3 -> 4 y versionName 1.1 -> 1.2 (solo si siguen en 3 / 1.1).
#  - capacitor.config.ts (raiz): android.useLegacyBridge = true. Despues hace falta: npx cap sync android
#  - Se puede ejecutar mas de una vez: no duplica entradas.
param([string]$OutDir)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$main = Join-Path $root "android\app\src\main"
$manifest = Join-Path $main "AndroidManifest.xml"
$strings = Join-Path $main "res\values\strings.xml"
$gradle = Join-Path $root "android\app\build.gradle"
$utf8 = New-Object System.Text.UTF8Encoding $false
if (-not (Test-Path $manifest)) { throw "No existe el proyecto Android en $root\android" }
if (-not (Test-Path (Join-Path $root "node_modules\@capacitor-community\background-geolocation\android"))) { throw "Falta el plugin: ejecuta npm install en la raiz" }
$changes = @()

# 0. capacitor.config.ts: con el puente nuevo, Android corta los mensajes al WebView a los ~5 min en segundo plano.
$capFile = Join-Path $root "capacitor.config.ts"
$cap = [IO.File]::ReadAllText($capFile)
if ($cap -notmatch "useLegacyBridge") {
  $before = $cap
  $cap = $cap -replace '(cleartext:\s*false\s*\r?\n\s*\})', ('$1,' + "`r`n" + '  android: {' + "`r`n" +
    '    // GPS en segundo plano (background-geolocation): ver docs/GPS-SEGUNDO-PLANO.md.' + "`r`n" + '    useLegacyBridge: true' + "`r`n" + '  }')
  if ($cap -eq $before) { throw "No se pudo agregar android.useLegacyBridge en capacitor.config.ts" }
  $changes += "useLegacyBridge"
}

# 1. Manifest (texto insertado solo en ASCII: PowerShell 5.1 lee este .ps1 sin BOM como ANSI).
$m = [IO.File]::ReadAllText($manifest)
if ($m -notmatch 'xmlns:tools=') {
  $tag = '<manifest xmlns:android="http://schemas.android.com/apk/res/android"' + "`r`n    " + 'xmlns:tools="http://schemas.android.com/tools">'
  $m = $m.Replace('<manifest xmlns:android="http://schemas.android.com/apk/res/android">', $tag)
  if ($m -notmatch 'xmlns:tools=') { throw "No se encontro la etiqueta <manifest>" }
  $changes += "xmlns:tools"
}
if ($m -notmatch 'BackgroundGeolocationService') {
  $svc = '        <!-- GPS en segundo plano: servicio del plugin background-geolocation, solo para esta app. -->' + "`r`n" +
         '        <service android:name="com.equimaps.capacitor_background_geolocation.BackgroundGeolocationService" android:exported="false" tools:replace="android:exported" />' + "`r`n" +
         '    </application>'
  $before = $m
  $m = $m -replace '    </application>', $svc
  if ($m -eq $before) { throw "No se encontro </application>" }
  $changes += "servicio no exportado"
}
$gps = '<uses-feature android:name="android.hardware.location.gps" android:required="false" />'
if ($m.Contains($gps)) {
  $m = $m.Replace($gps, '<uses-feature android:name="android.hardware.location.gps" android:required="false" tools:replace="android:required" />')
  $changes += "GPS opcional (tools:replace)"
}
if ($m -notmatch 'FOREGROUND_SERVICE_LOCATION') {
  $perm = '    <!-- GPS en segundo plano: servicio en primer plano de tipo location con notificacion fija (Android 14+). Sin ACCESS_BACKGROUND_LOCATION. -->' + "`r`n" +
          '    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />' + "`r`n" +
          '    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />' + "`r`n" +
          '$1'
  $before = $m
  $m = $m -replace '(    <!-- Hardware opcional)', $perm
  if ($m -eq $before) { throw "No se encontro el bloque de hardware opcional (ejecuta antes android-camera-location.ps1)" }
  $changes += "FOREGROUND_SERVICE(_LOCATION)"
}
[void][xml]$m

# 2. strings.xml
$s = [IO.File]::ReadAllText($strings)
if ($s -notmatch 'capacitor_background_geolocation_notification_channel_name') {
  $add = '    <!-- Notificacion fija mientras se comparte la ubicacion (plugin background-geolocation). -->' + "`r`n" +
         '    <string name="capacitor_background_geolocation_notification_channel_name">Ubicacion compartida</string>' + "`r`n" +
         '    <string name="capacitor_background_geolocation_notification_icon">drawable/ic_stat_peregrinos</string>' + "`r`n" +
         '    <string name="capacitor_background_geolocation_notification_color">#0B3158</string>' + "`r`n" +
         '</resources>'
  $s = $s -replace '</resources>', $add
  $changes += "strings de la notificacion"
}
[void][xml]$s

# 3. Version de la APK
$g = [IO.File]::ReadAllText($gradle)
if ($g -match 'versionCode 3\b' -and $g -match 'versionName "1\.1"') {
  $g = $g -replace 'versionCode 3\b', 'versionCode 4' -replace 'versionName "1\.1"', 'versionName "1.2"'
  $changes += "versionCode 4 / 1.2"
}

if ($OutDir) {
  New-Item -ItemType Directory -Force $OutDir | Out-Null
  $manifest = Join-Path $OutDir "AndroidManifest.xml"; $strings = Join-Path $OutDir "strings.xml"; $gradle = Join-Path $OutDir "build.gradle"; $capFile = Join-Path $OutDir "capacitor.config.ts"
}
[IO.File]::WriteAllText($capFile, $cap, $utf8)
[IO.File]::WriteAllText($manifest, $m, $utf8)
[IO.File]::WriteAllText($strings, $s, $utf8)
[IO.File]::WriteAllText($gradle, $g, $utf8)
if ($changes.Count) { Write-Host "Cambios: $($changes -join ', ')" } else { Write-Host "Sin cambios: ya estaba todo aplicado." }
if (-not $OutDir) { Write-Host "Siguiente paso: npx cap sync android y compilar la APK (assembleRelease)." }

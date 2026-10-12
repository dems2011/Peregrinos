# Prepara el proyecto Android para la próxima APK: cámara (escáner QR) y ubicación en primer plano.
# Uso (desde la raíz del repo):  powershell -ExecutionPolicy Bypass -File scripts\android-camera-location.ps1
# Prueba sin tocar el proyecto:   ... -File scripts\android-camera-location.ps1 -OutFile <ruta>  (escribe ahí el resultado)
#  - El WebView de Capacitor (BridgeWebChromeClient) ya pide estos permisos en tiempo de ejecución cuando la web los usa:
#    CAMERA al abrir el escáner (getUserMedia en /registrar) y FINE/COARSE al leer la ubicación (watchPosition en
#    /registrar). Android los niega de inmediato si no están declarados en el manifest: eso es lo que se corrige aquí.
#  - Hardware opcional (required="false"): la app se puede instalar en equipos sin cámara o sin GPS.
#  - NO agrega ubicación en segundo plano (ACCESS_BACKGROUND_LOCATION) ni servicios en primer plano.
#  - No cambia versionCode/versionName, package, MainActivity ni la configuración de Capacitor. No hace falta cap sync.
#  - Se puede ejecutar más de una vez: no duplica entradas.
param([string]$OutFile)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$manifest = Join-Path $root "android\app\src\main\AndroidManifest.xml"
$utf8 = New-Object System.Text.UTF8Encoding $false
if (-not (Test-Path $manifest)) { throw "No existe el proyecto Android en $root\android" }

$entries = @(
  # Texto insertado solo en ASCII (PowerShell 5.1 lee este .ps1 sin BOM como ANSI).
  @{ key = 'android.permission.CAMERA"'; text = '<!-- Lector QR de las credenciales en /registrar (getUserMedia del WebView). -->' + "`r`n    " + '<uses-permission android:name="android.permission.CAMERA" />' },
  @{ key = 'android.permission.ACCESS_COARSE_LOCATION"'; text = '<!-- GPS en primer plano: coordenadas de cada llegada registrada en /registrar. Sin segundo plano. -->' + "`r`n    " + '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />' },
  @{ key = 'android.permission.ACCESS_FINE_LOCATION"'; text = '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />' },
  @{ key = 'android.hardware.camera"'; text = '<!-- Hardware opcional (required=false): la app se instala igual en equipos sin camara o sin GPS. -->' + "`r`n    " + '<uses-feature android:name="android.hardware.camera" android:required="false" />' },
  @{ key = 'android.hardware.camera.autofocus"'; text = '<uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />' },
  @{ key = 'android.hardware.location"'; text = '<uses-feature android:name="android.hardware.location" android:required="false" />' },
  @{ key = 'android.hardware.location.gps"'; text = '<uses-feature android:name="android.hardware.location.gps" android:required="false" />' }
)

$m = [IO.File]::ReadAllText($manifest)
$added = @()
foreach ($e in $entries) {
  if ($m.Contains($e.key)) { continue }
  $before = $m
  $m = $m -replace '(\r?\n)(</manifest>)', ("`r`n    " + $e.text.Replace('$', '$$') + '$1$2')
  if ($m -eq $before) { throw "No se encontro </manifest> en el manifest" }
  $added += $e.key.TrimEnd('"')
}

# El resultado debe seguir siendo XML válido antes de guardarlo.
[void][xml]$m

$target = if ($OutFile) { $OutFile } else { $manifest }
[IO.File]::WriteAllText($target, $m, $utf8)
if ($added.Count) { Write-Host "Agregado a $(Split-Path -Leaf $target): $($added -join ', ')" } else { Write-Host "Sin cambios: ya estaba todo declarado." }
Select-String -Path $target -Pattern "uses-permission|uses-feature" | ForEach-Object { "  " + $_.Line.Trim() }
if (-not $OutFile) { Write-Host "Listo. Siguiente paso: compilar la APK (assembleRelease) cuando se indique." }

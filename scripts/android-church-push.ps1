# Prepara el proyecto Android para la próxima APK: identidad de iglesia y notificaciones push.
# Uso (desde la raíz del repo):  powershell -ExecutionPolicy Bypass -File scripts\android-church-push.ps1
#  - Copia resources\android\res (generados con: node scripts\generate-church-icons.cjs): iconos de la app, splash e
#    icono de las notificaciones (drawable/ic_stat_peregrinos.xml). Color de acento: el azul marino de la marca.
#  - AndroidManifest.xml: permiso POST_NOTIFICATIONS (Android 13+) y, para FCM, icono, color y canal por defecto
#    ("avisos", el mismo que crea la app en apps/web/src/lib/pushNotifications.ts).
#  - No cambia versionCode/versionName, package, MainActivity ni la configuración de Capacitor. No hace falta cap sync.
#  - Se puede ejecutar más de una vez: no duplica entradas.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$res = Join-Path $root "android\app\src\main\res"
$manifest = Join-Path $root "android\app\src\main\AndroidManifest.xml"
$utf8 = New-Object System.Text.UTF8Encoding $false
if (-not (Test-Path $res) -or -not (Test-Path $manifest)) { throw "No existe el proyecto Android en $root\android" }

# 1. Recursos (iglesia + notificaciones).
Copy-Item (Join-Path $root "resources\android\res\*") $res -Recurse -Force
Write-Host "Recursos copiados a $res"

# 2. Manifest.
$m = [IO.File]::ReadAllText($manifest)
if ($m -notmatch "android\.permission\.POST_NOTIFICATIONS") {
  $m = $m -replace '(<uses-permission android:name="android\.permission\.INTERNET" />)', "`$1`r`n    <!-- Notificaciones push: Android 13+ pide este permiso al usuario. -->`r`n    <uses-permission android:name=`"android.permission.POST_NOTIFICATIONS`" />"
  if ($m -notmatch "POST_NOTIFICATIONS") { throw "No se encontró dónde agregar POST_NOTIFICATIONS" }
}
if ($m -notmatch "default_notification_icon") {
  $meta = @'
        <!-- Notificaciones push (FCM): icono de la barra de estado, color de acento y canal por defecto. -->
        <meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/ic_stat_peregrinos" />
        <meta-data android:name="com.google.firebase.messaging.default_notification_color" android:resource="@color/ic_launcher_background" />
        <meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="avisos" />
    </application>
'@
  $m = $m -replace '    </application>', $meta.TrimEnd()
  if ($m -notmatch "default_notification_icon") { throw "No se encontró </application> en el manifest" }
}
[IO.File]::WriteAllText($manifest, $m, $utf8)
Write-Host "AndroidManifest.xml: POST_NOTIFICATIONS + icono/color/canal de FCM"

Select-String -Path $manifest -Pattern "POST_NOTIFICATIONS|default_notification" | ForEach-Object { "  " + $_.Line.Trim() }
Write-Host "Listo. Siguiente paso: compilar la APK (assembleDebug) cuando se indique."

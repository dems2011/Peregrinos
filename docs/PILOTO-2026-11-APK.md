# APK de Peregrinos — variantes, instalación y prueba (piloto 2026-11)

La app Android es Capacitor: una vista web que carga la web de Peregrinos (`server.url`) y agrega lo nativo (descargas,
cámara, ubicación, push FCM). **Todas las funciones de la web llegan a la app cuando la web se publica**; la app solo
hace falta reemplazarla por cambios nativos o de configuración.

## Artefactos (2026-10-27, `C:\Proyectos\_salidas\piloto-2026-11\android\`)

| APK | Paquete | Versión | Servidor | Firma | SHA-256 |
|---|---|---|---|---|---|
| `peregrinos-PRUEBA-local-1.1-debug.apk` | `com.peregrinos.app.prueba` («Peregrinos PRUEBA», se instala AL LADO de la real) | 1.1 (3) | `http://localhost:3000` (esta PC por USB: `adb reverse tcp:3000 tcp:3000`) | depuración | `9438dec73d151aedf9315598f86fcfc7d9b274e723194d7341c8b3a9c8cd545d` |
| `peregrinos-1.2-4-candidata.apk` | `com.peregrinos.app` | **1.2 (4)** | `https://peregrinos-1.onrender.com` (producción) | clave de producción EXISTENTE (`peregrinos-release.jks`, certificado SHA-256 `b2eae517…0606`), esquema v2 | `1716f67aa76a9ebf020927665d7f624809012e63fb829f2f67d8ab872d824269` |

Generación: `node scripts/android-prueba.mjs --url <origen de prueba>` y
`node scripts/android-candidata.mjs --version-code 4 --version-name 1.2 --firma <peregrinos-release.properties>`. Ambos
compilan en una COPIA de `android/` (huella antes/después: sin cambios), con el código nativo e íconos versionados en
`resources/android/`. La candidata exige URL HTTPS de producción y `google-services.json`; firma con la clave existente
pasando los secretos solo por variables del proceso hijo (nunca se imprimen ni se escriben).

## Hallazgo sobre la firma (decisión del propietario)

La app 1.1 instalada en el teléfono de pruebas (Samsung SM-A346M) **es una compilación de depuración**: firmada con
`~/.android/debug.keystore` (certificado `1ab0a4fb…5830`, marca `DEBUGGABLE`, instalada fuera de una tienda). La
candidata 1.2 está firmada con la clave de producción (`b2eae517…`). **Android no permite instalar una encima de la
otra**: quien tenga la 1.1 de depuración debe desinstalarla (pierde la sesión y los datos locales de la app) e instalar la
1.2. Si se distribuyeron APK de depuración a otras personas, hay que avisarles. No se generó ninguna clave nueva.

## Prueba en dispositivo FÍSICO realizada (2026-10-26/27)

Samsung **SM-A346M**, **Android 16** (SDK 36), conectado por USB. Servidor local desechable (`bash
.e2e-local/dispositivo.sh`: PostgreSQL 18, API, web compilada con **CSP aplicada**, datos sintéticos).

| # | Prueba | Resultado |
|---|---|---|
| 1 | Instalar «Peregrinos PRUEBA» junto a la app real | OK: la app de producción 1.1 no se tocó |
| 2 | Ingreso del titular (sacerdote) | OK |
| 3 | Permiso de notificaciones (Android 13+) | **DEFECTO encontrado y corregido**: sin Firebase, `register()` cerraba la app («Default FirebaseApp is not initialized») y se perdía la sesión. La variante de prueba ya no registra el plugin de push (`scripts/android-prueba.mjs`). La de producción tiene Firebase y no se ve afectada, pero su push real **no se probó** |
| 4 | Banner «2 turnos para decidir · 2 avisos sin leer» | OK |
| 5 | Aceptar un turno | OK: pasa a «Mi agenda»; en la base: `ACCEPTED`, 1 decisión, `TURN_ACCEPTED` auditado, `seq` 1 |
| 6 | Rechazar con motivo (el botón no se habilita sin motivo) | OK: en la base `REJECTED` con el motivo, 1 decisión, `TURN_REJECTED`, `seq` 2 |
| 7 | Solicitud del fiel, cierre de sesión, reapertura | ver `PILOTO-2026-11-INFORME.md` |

Capturas y la consulta a la base: `C:\Proyectos\_salidas\piloto-2026-11\evidencia\tel-*.png` y `tel-06-base-decisiones.txt`.

## Lo que NO está verificado en dispositivo

- **Push real** (FCM): la variante de prueba no tiene Firebase; el servidor local no tiene la cuenta de servicio de
  FCM (está solo en Render y no se lee ni se copia). Para probarlo hace falta UNA de estas autorizaciones: (a) publicar
  la versión candidata en Render (producción ya tiene `push: fcm`) y enviar un aviso de prueba controlado a una cuenta
  de prueba con la 1.2 instalada; o (b) un proyecto Firebase de prueba registrado para `com.peregrinos.app.prueba`.
- Instalar la 1.2 sobre una 1.1 firmada con la clave de producción (no existe ninguna en el teléfono de pruebas).
- Cámara (QR), ubicación, descargas de archivos y CSP en la app contra el servidor real con HTTPS.
- La candidata 1.2 **no se instaló** en el teléfono: reemplazaría la app real del propietario (y por la firma exigiría
  desinstalarla).

## Instalar una APK (procedimiento)

1. Habilitar «Instalar apps desconocidas» para el navegador o el gestor de archivos (o `adb install` por USB).
2. PRUEBA: `adb install -r peregrinos-PRUEBA-local-1.1-debug.apk`; `adb reverse tcp:3000 tcp:3000` con el servidor local
   en marcha. Quitarla: `adb uninstall com.peregrinos.app.prueba` (la real queda intacta).
3. Producción 1.2: solo con autorización; verificar antes `apksigner verify --print-certs` (certificado `b2eae517…`) y
   `aapt dump badging` (paquete `com.peregrinos.app`, 1.2/4). Si el teléfono tiene una 1.1 de depuración, desinstalarla
   primero. Probar: ingreso, turnos, solicitudes, avisos y push con una cuenta de prueba.

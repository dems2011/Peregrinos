# Android: descargas, variante de prueba y requisitos de validación

**Fecha:** 2026-10-19 · **Estado:** análisis. No se modificó `android/` ni `capacitor.config.ts` (ambos **sin seguimiento
en Git**), ni se compiló ni instaló nada. No hay dispositivo ni emulador disponible (`adb devices` y
`emulator -list-avds` vacíos), así que **nada de esto está validado en un teléfono**.

## 1. Cómo funciona hoy (verificado en el código, solo lectura)

- La app es Capacitor con `server.url = https://peregrinos-1.onrender.com` (producción), tanto en `capacitor.config.ts`
  como en el `capacitor.config.json` empaquetado (`android/app/src/main/assets`, 2026-10-07): la app carga la web de
  producción; sesión por cookies del WebView, igual que el navegador.
- Las descargas de la web pasan por `download()` (`apps/web/src/lib/api.ts`): `fetch` con la sesión → `Blob` →
  `URL.createObjectURL` → `<a download href="blob:…">`. El WebView de Android **ignora** ese enlace.
- `MainActivity.java` lo intercepta (`setDownloadListener` + `addWebMessageListener`, solo desde el origen de `server.url`),
  lee el blob por trozos en base64 y lo guarda en Descargas (MediaStore en Android 10+) para abrirlo con el visor.
  **Solo acepta `application/pdf`**: cualquier otro tipo se descarta en silencio.

| Descarga (web) | Tipo | En la app Android |
|---|---|---|
| Cartel A4/A3 de la parroquia, informe del evento, credenciales | PDF | Manejado (sin validar en dispositivo) |
| Accesos de peregrinos (`acceso-peregrinos.csv`), plantilla de importación | CSV | **No funciona** (se descarta) |
| QR de un participante (`?format=png`) | PNG | **No funciona** |
| Códigos de recuperación del MFA (`peregrinos-codigos-recuperacion.txt`, en `configuracion/seguridad`, con su propio `createObjectURL`) | TXT | **No funciona**: el personal que active MFA desde la app no puede guardar sus códigos (riesgo de perder el acceso) |

## 2. Cambios necesarios (propuesta; requieren decidir antes cómo versionar `android/`)

1. **Nativo:** ampliar la lista blanca de tipos del manejador a `application/pdf`, `text/csv`, `image/png` y `text/plain`
   (nada más), con extensión coherente con el tipo, mismo límite de tamaño y mismo control de origen; abrir con el
   visor del sistema o, si no hay, avisar «Guardado en Descargas».
2. **Web (alternativa o complemento):** para los códigos de recuperación, ofrecer además «Copiar» y mostrarlos en
   pantalla hasta que la persona confirme que los guardó (no depende de descargas).
3. **Pruebas sin dispositivo:** extraer la lista blanca y el armado del nombre a una clase Java pura con pruebas
   unitarias JVM (`app/src/test`, `./gradlew testDebugUnitTest`), y una prueba de la web que verifique que cada descarga
   declara su tipo MIME correcto (es lo que el nativo usa para decidir).
4. **Versionar `android/`:** hoy el código nativo (incluido este manejador) no tiene respaldo en Git. Antes de modificarlo:
   decidir si se versiona (excluyendo `build/`, `.gradle/`, claves y `google-services.json` si contiene datos sensibles)
   o se guarda en un repositorio aparte.

## 3. Variante de prueba que no se confunda con producción

- **Sabor (productFlavor) `prueba`** en `android/app/build.gradle`: `applicationIdSuffix ".prueba"` (se instala junto a
  la de producción, no la reemplaza), nombre visible **«Peregrinos PRUEBA»**, ícono con franja, y un
  `capacitor.config.json` propio del sabor (`src/prueba/assets/`) con `server.url` del **entorno de prueba con HTTPS**.
- El sabor `produccion` conserva exactamente la configuración actual. Ninguna compilación de prueba lleva la URL de
  producción ni credenciales reales; el entorno de prueba usa su propia base (rama de Neon o base aparte) y su proyecto
  de Firebase de prueba (o push deshabilitado).
- No se inventa la URL: el entorno de prueba con HTTPS todavía **no existe** (Railway o Render de prueba: ver
  `PLAN-RAILWAY.md`). Una URL local por `http://` no sirve: `cleartext: false` y las cookies `Secure`.

## 4. Requisitos mínimos para probar en dispositivo o emulador

- **Emulador:** Android Studio con un AVD (Android 13 o 14, imagen con Google Play para FCM), o un **teléfono físico**
  con depuración USB. Hoy el SDK está instalado (`platform-tools`, `emulator`) pero **no hay ningún AVD creado**.
- Entorno de prueba con HTTPS y datos de prueba (organización, personal, peregrinos, evento con inscripción).
- APK del sabor `prueba` firmado con la clave de depuración.
- Recorrido: ingreso del personal y del peregrino, navegación, perfil parroquial, eventos y portadas, avisos (bandeja y
  push de prueba), cada descarga de la tabla del §1, cierre de sesión y recuperación de contraseña.

## 5. Bloqueos reales

| Bloqueo | Tipo |
|---|---|
| Sin dispositivo ni AVD | Recurso externo |
| Sin entorno de prueba con HTTPS | Decisión (y costo) del propietario |
| `android/` sin versionar | Decisión del propietario |
| Descargas CSV/PNG/TXT en la app | **Mitigado** (commit de este ciclo): en la app, `download()` rechaza todo lo que no sea PDF **antes** de llamar al servidor, con un mensaje que remite al navegador (evita reemitir accesos que se perderían); los códigos de recuperación se copian en vez de descargarse; prueba `s4-native-downloads` (6/6, sin dispositivo). Guardar esos archivos en la app sigue **pendiente de desarrollo** (cambio nativo del §2) |

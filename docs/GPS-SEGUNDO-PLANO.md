# GPS en segundo plano — «Compartir mi ubicación»

Actualizado: 2026-10-13. **Código preparado, sin probar en un teléfono.** La API y la web están probadas contra la
base local (envío desde el navegador, intervalo mínimo, vista de la organización y borrado al dejar de compartir). La
parte nativa (pantalla apagada) necesita aplicar el script de Android, compilar la APK 1.2 e instalarla.

## 1. Qué hay

| Pieza | Dónde | Estado |
|---|---|---|
| Activación por evento | `Configuración → Evento` (`EventPublicationCard`, `PUT /api/events/:id/tracking/settings`) | Hecho. Al desactivarlo se borran las ubicaciones. |
| Consentimiento del peregrino | `/p` → `ShareLocation` (`POST /api/pilgrim/tracking/consent`) | Hecho. Opt-in explícito; «Dejar de compartir» borra la última posición. |
| Envío de posiciones | `POST /api/pilgrim/tracking/ping` (máx. 6/min; el cliente envía como mucho cada 30 s) | Hecho. Solo la **última** posición (`LocationShare`), sin historial. |
| Vista de la organización | «Mapa y recorrido» → personas en vivo (`LiveTracking`, `GET /api/events/:id/tracking`) | Hecho. |
| Borrado | Al terminar o cancelar el evento, al apagar el seguimiento o al dejar de compartir | Hecho (`lib/tracking.ts`). |
| Navegador | `navigator.geolocation.watchPosition` | Solo con la pantalla abierta. |
| **App Android, pantalla apagada** | `apps/web/src/lib/backgroundLocation.ts` + plugin nativo | **Preparado, falta APK 1.2.** |

## 2. Solución nativa elegida

Plugin `@capacitor-community/background-geolocation` **1.2.26** (MIT; ya en `package.json` de la raíz).

- Servicio en primer plano de tipo `location` con **notificación fija** («Peregrinos está compartiendo tu ubicación»).
  Lo inicia el usuario con la app abierta, por eso **no** hace falta `ACCESS_BACKGROUND_LOCATION` ni la declaración de
  ubicación en segundo plano de Google Play.
- Las posiciones llegan al WebView aun minimizado o con la pantalla apagada (`android.useLegacyBridge: true`; con el
  puente nuevo Android corta los mensajes a los ~5 min).
- El envío usa `CapacitorHttp` (HTTP nativo): con la app en segundo plano Android frena las peticiones del WebView.
  Capacitor 8 instala `CapacitorCookieManager` como gestor de cookies, que lee las del WebView, así que viaja la misma
  sesión del enlace personal. Si el servidor respondiera 401 por esa vía, la app vuelve a `fetch` (nunca queda peor).
- Distancia mínima entre posiciones: 25 m; además el cliente respeta el intervalo de 30 s del servidor.
- En el navegador, o en una APK sin el plugin, todo sigue como antes (solo con la pantalla abierta) y el texto de la
  pantalla lo dice.

### Cómo aplicarlo (lo ejecuta el usuario; Claude no puede editar `android/` ni ejecutar `npx cap`)

```powershell
npm install                                                     # instala el plugin (ya está en package.json)
powershell -ExecutionPolicy Bypass -File scripts\android-background-gps.ps1
npx cap sync android
# compilar y firmar la APK 1.2 (versionCode 4) como las anteriores
```

El script (se puede ejecutar más de una vez; `-OutDir <carpeta>` para probarlo sin tocar el proyecto):
- `capacitor.config.ts`: `android.useLegacyBridge = true`.
- `AndroidManifest.xml`: `FOREGROUND_SERVICE` y `FOREGROUND_SERVICE_LOCATION`; servicio del plugin **no exportado**
  (`tools:replace`); GPS sigue como hardware opcional aunque el plugin lo declare obligatorio.
- `strings.xml`: canal «Ubicación compartida», icono de los avisos (`ic_stat_peregrinos`) y azul de la marca.
- `build.gradle`: versionCode 3 → 4, versionName 1.1 → 1.2.

## 3. Pruebas pendientes en el teléfono (Galaxy A34)

1. Activar el seguimiento en un evento EN CURSO, abrir `/p` con un participante confirmado y «Compartir mi ubicación».
2. Aceptar el permiso de ubicación («Mientras se usa la app») y el de notificaciones; debe aparecer la notificación fija.
3. Apagar la pantalla 30 min caminando: en «Mapa y recorrido» la hora de la última posición debe seguir avanzando.
4. Modo avión 5 min y volver: se reanuda (no hay cola local; se pierde lo de ese intervalo, solo importa la última).
5. «Dejar de compartir»: desaparece la notificación y la posición en el mapa.
6. Terminar el evento: la app deja de enviar (409) y se borra la posición.
7. Samsung: si el sistema corta el servicio, revisar Ajustes → Batería → «Sin restricciones» para Peregrinos (no se
   pide por código).

## 4. Límites conocidos

- Sin cola local: con mala señal se envía la siguiente posición disponible; no hay recorrido histórico (por diseño).
- Si el usuario cierra la app deslizándola, Android detiene el servicio; al volver a abrir `/p` se retoma solo.
- iOS no está contemplado (no hay app iOS).

# GPS en segundo plano — estado real y plan

Fecha del relevamiento: 2026-10-12. **No está implementado.** Este documento describe qué existe y qué falta; no
hay código de seguimiento en segundo plano en el repositorio.

## 1. Qué existe hoy (solo primer plano)

| Pieza | Dónde | Qué hace |
|---|---|---|
| Lectura de ubicación | `apps/web/src/app/(app)/registrar/page.tsx` | `navigator.geolocation.watchPosition` solo mientras la pantalla «Registrar llegada» está abierta. Sin permiso, la llegada se registra sin coordenadas. |
| Persistencia | `Checkin.latitude/longitude` (`schema.prisma`), `apps/api/src/lib/checkins.ts` | Una coordenada por llegada registrada (opcional). No hay historial de posiciones. |
| Permisos Android | `android/app/src/main/AndroidManifest.xml` (aplicado con `scripts/android-camera-location.ps1`) | `ACCESS_FINE_LOCATION` y `ACCESS_COARSE_LOCATION`, hardware opcional. **Sin** `ACCESS_BACKGROUND_LOCATION` ni servicio en primer plano. |
| Mapas | `MapView.tsx`, `/recorrido` | Puntos de control, origen y destino fijos. No muestra posiciones en vivo. |

Con la app minimizada o la pantalla apagada, el WebView deja de recibir posiciones: hoy **no** hay seguimiento.

## 2. Componentes pendientes

### 2.1 Permisos y consentimiento
- `ACCESS_BACKGROUND_LOCATION` (Android 10+) se pide **aparte** y después del permiso en primer plano; Android 11+
  obliga a concederlo desde Ajustes. Google Play exige una declaración de uso y un video que lo justifique.
- `FOREGROUND_SERVICE` y `FOREGROUND_SERVICE_LOCATION` (Android 14+), con notificación persistente visible.
- `POST_NOTIFICATIONS` (ya declarado) para esa notificación en Android 13+.
- Pantalla propia de consentimiento antes del diálogo del sistema: quién ve la ubicación, durante qué evento, cuánto
  tiempo se conserva y cómo detenerla. El consentimiento debe guardarse (fecha, versión del texto) y poder retirarse.
- Solo para quien lo necesite (p. ej. operadores o voluntarios durante el evento), nunca por defecto a peregrinos.

### 2.2 Servicio en segundo plano
- El WebView no sirve: hace falta código nativo. Opciones: plugin `@capacitor-community/background-geolocation`
  (servicio en primer plano, sin costo) o un servicio propio en `MainActivity`/Java.
- Restricciones del sistema: Doze y App Standby, optimización de batería de cada fabricante (Samsung la aplica fuerte
  — el equipo de pruebas es un Galaxy A34), límites de frecuencia en segundo plano y cierre del servicio al deslizar la
  app. Pedir que se excluya de la optimización de batería solo si es imprescindible.
- Arranque y fin atados al evento: empieza al iniciar la jornada y se detiene solo (estado `FINISHED`/`CANCELLED`
  o hora de fin), además del botón de detener.

### 2.3 Envío, recepción y persistencia
- Endpoint nuevo, p. ej. `POST /api/events/:id/locations`, por lotes (varias posiciones por petición) con
  `timestamp` del dispositivo, `accuracy`, `latitude`, `longitude`, `speed` opcional e id de dispositivo.
- Cola local en el dispositivo cuando no hay señal (en ruta es habitual) y reenvío idempotente (id generado por el
  cliente, como `Checkin`).
- Tabla nueva (p. ej. `LocationPing`) con índice por `(eventId, userId, timestamp)`; o, si solo interesa la última
  posición, una tabla `LastLocation` con upsert. Requiere migración: se aplica en Neon solo con aprobación.
- Retención: borrado automático tras el evento (p. ej. 30 días) por tarea programada.

### 2.4 Seguridad
- Solo el titular envía su propia ubicación; el `eventId` debe ser uno en el que tenga asignación vigente.
- Solo roles autorizados del mismo evento y organización la consultan (permiso nuevo, p. ej. `location:read`).
- Límite de frecuencia por usuario y validación de rangos (lat/lng, precisión, marcas de tiempo futuras).
- Auditoría de consultas a la ubicación de terceros.

### 2.5 Frecuencia, batería y errores
- Propuesta: cada 60 s o 50 m de desplazamiento (lo que ocurra primero), precisión equilibrada; alta precisión solo
  bajo demanda. Envío por lotes cada 2–5 min.
- Errores: GPS apagado, permiso retirado, sin red, servicio detenido por el sistema → estado visible en la app y en
  el panel («sin señal desde hh:mm»).

### 2.6 Visualización y gestión
- Mapa en vivo en `/recorrido` con la última posición de cada persona seguida y su antigüedad.
- Lista de quién comparte, quién no dio permiso y quién dejó de enviar.
- El usuario ve en su app que está compartiendo y puede detenerlo.

## 3. Pruebas necesarias
- API: autorización (solo el titular envía, solo roles del evento leen, aislamiento entre organizaciones),
  idempotencia de lotes, validación de rangos, límite de frecuencia y retención.
- Android en equipo real: permisos en Android 10, 11, 13 y 14; pantalla apagada 30 min; modo avión y reconexión;
  reinicio del teléfono; batería en una jornada completa.
- Web: mapa en vivo, estados «sin señal» y consentimiento.

## 4. Propuesta por etapas
1. **Decisión funcional**: quién comparte ubicación, cuándo y quién la ve. (Bloqueante; lo define el usuario).
2. **Backend**: tabla, migración, endpoint por lotes, permisos, retención y pruebas. Sin cambios en la app.
3. **Primer plano mejorado**: enviar la posición mientras la app está abierta (sin permiso nuevo) y mostrarla en el mapa.
4. **Segundo plano nativo**: plugin o servicio, permisos, notificación persistente y consentimiento. APK nueva con
   versionCode mayor.
5. **Play Store**: declaración de ubicación en segundo plano y video, si se publica allí.

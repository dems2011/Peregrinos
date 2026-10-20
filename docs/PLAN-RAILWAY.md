# Plan de migración de Peregrinos de Render a Railway (propuesta, NO ejecutada)

**Fecha:** 2026-10-19 · **Estado:** análisis y plan. No se creó ningún servicio, no se cambió DNS, no se desplegó ni migró
nada. Cada paso del procedimiento requiere autorización expresa del propietario.

## 0. Datos verificados y supuestos

| Dato | Fuente | Verificado |
|---|---|---|
| Hoy: API y web en Render, base en Neon (PostgreSQL 18.6), despliegue desde `main` configurado en el panel (no hay `render.yaml`, Dockerfile ni CI en el repositorio) | `docs/DESPLIEGUE-A4-A6.md`, inspección del repositorio | Sí (repositorio); el panel de Render no se consultó |
| `origin/main` = `1d70547`; la rama local `sigyp-integracion` lleva 5 commits más, sin publicar (integración SIGyP, CSRF, tarjeta de evento) con 2 migraciones aditivas nuevas (`20261019000000_sigyp_integration`, `20261019000100_sigyp_link_events_notices`) | `git log` / `git diff` locales | Sí |
| Comprobantes, imágenes de contenido y portadas se guardan **en la base** (columnas `data`); `UPLOAD_DIR` solo se lee para comprobantes antiguos | `lib/storage.ts`, `lib/contentImages.ts` | Sí |
| Railway Hobby: 5 USD/mes que **incluyen** 5 USD de consumo; si el consumo supera 5 USD se cobra el **total** del consumo. RAM ≈ 10 USD/GB·mes, vCPU ≈ 20 USD/vCPU·mes, salida de red 0,05 USD/GB, volumen 0,15 USD/GB·mes, volumen máx. 5 GB, 2 dominios propios | railway.com/pricing (consultado 2026-10-19) | Sí, a esa fecha (los precios pueden cambiar) |
| Consumo real de RAM/CPU de API y web en producción | — | **No**: hay que medirlo (Render no se consultó) |

## 1. Arquitectura propuesta (responsabilidades separadas)

```
                 peregrinos.net.ar (y www) ──► [web]  Next.js (público)
                                                 │  /api/* reescrito (mismo origen: cookies httpOnly, sin CORS)
                                                 ▼
                                               [api]  Fastify (red privada de Railway; sin dominio público, ver §5)
                                                 │
                                                 ▼
                                               Neon (PostgreSQL de Peregrinos; se conserva)
App Android (Capacitor) ──► carga peregrinos.net.ar (server.url) ──► mismas rutas /api
SIGyP (PC de la parroquia) ──► https://peregrinos.net.ar/api/integrations/sigyp/v1/*  (saliente, Bearer pgsig_…)
```

- **Peregrinos** (online): web + API en Railway, base en **Neon** (sin cambios de proveedor de base). Ninguna base de SIGyP
  ni comercial vive aquí.
- **SIGyP** (local): no depende de Railway para abrir ni consultar sus datos; solo llama a Peregrinos para la integración
  autorizada (cartelera, perfil, eventos, avisos) y, si se implementan, a los servicios de licencias/actualizaciones.
- **Comercial** (futuro: portal, descargas, licencias): servicio y base **propios**, separados de Peregrinos y de SIGyP
  (ver `GestionParroquial/docs/PLAN-PILOTO-Y-LANZAMIENTO.md`).

## 2. Servicios en Railway

| Servicio | Raíz | Compilación | Inicio | Notas |
|---|---|---|---|---|
| `api` | repositorio, raíz del monorepo | `npm ci && npm run build:shared && npm run db:generate -w @peregrinos/api && npm run build -w @peregrinos/api` | `npm run start -w @peregrinos/api` (`node dist/server.js`) | Escucha `PORT` (lo define Railway). Salud: `GET /api/health`. Migraciones: **paso manual y separado** (§7), nunca en cada arranque |
| `web` | raíz del monorepo | `npm ci && npm run build:shared && npm run build -w @peregrinos/web` con `API_URL` definida **en la compilación** | `npm run start -w @peregrinos/web` (`next start`: usa `PORT` del alojamiento, 3000 si no está; corregido 2026-10-19, antes fijaba `-p 3000`) | `next.config.mjs` fija la reescritura `/api → API_URL` al compilar: sin `API_URL` y fuera de Render apuntaría a `localhost:4000` |

Excluir siempre de la compilación: `apps/web/next.config.ts` (sin seguimiento, `output: "export"`, es para Capacitor),
`android/`, `capacitor.config.ts` (ver `docs/DESPLIEGUE-A4-A6.md`). Railway compila desde Git: lo que no está en el
repositorio no llega, pero conviene verificar que el builder elija `next.config.mjs`.

## 3. Variables (por nombre; los valores secretos nunca en el repositorio ni en documentos)

**api — secretas:** `DATABASE_URL` (Neon), `JWT_SECRET` (≥ 32), `MFA_ENCRYPTION_KEY` (base64 de 32 bytes; sin ella se
deriva de `JWT_SECRET` y rotarlo invalidaría los MFA), `SMTP_URL`, `FIREBASE_SERVICE_ACCOUNT` (base64), `YOUTUBE_API_KEY`
(opcional), `ANTHROPIC_API_KEY` (opcional; informe de evento con IA — **decisión de costo**).
**api — no secretas:** `NODE_ENV=production`, `WEB_ORIGIN=https://peregrinos.net.ar`, `COOKIE_SECURE=true`, `MAIL_FROM`,
`ACCESS_TTL_MIN`, `REFRESH_TTL_DAYS`, `INVITE_TTL_DAYS`, `PILGRIM_SESSION_DAYS`, `PILGRIM_EMAIL_VERIFICATION=required`,
`ANTHROPIC_MODEL`, `UPLOAD_DIR` (solo si hay comprobantes antiguos en disco: ver §6).
**web:** `API_URL` (compilación y ejecución; URL **privada** del servicio `api`), `NODE_ENV=production`, `CSP_MODE`
(CICLO 3, commit `190d2da`: sin la variable la CSP solo **informa**; pasar a `enforce` después de observar la consola sin
violaciones en la web y en la app Android; `off` la desactiva). Desde ese cambio el layout raíz se renderiza en cada
petición (nonce por respuesta): medir CPU de la web en el ensayo, porque las páginas antes estáticas ahora se generan
al pedirlas (impacto esperado bajo; entra en la estimación de §10).
No usar: `SEED_PASSWORD` (solo semilla de desarrollo), `MFA_ENFORCE_SUPERADMIN` (eliminada). Las variables de Render **no
se copian a ciegas**: cada una se revisa contra `apps/api/src/config.ts` (validación zod al iniciar).

## 4. Dominio

- `peregrinos.net.ar` y `www.peregrinos.net.ar` → servicio `web` (Railway emite el certificado). El plan Hobby admite **2
  dominios propios** según la página de precios: con apex + www se agotan; un subdominio adicional (p. ej. `api.` o el
  portal comercial) exigiría otro plan o otro alojamiento. Por eso la API no lleva dominio propio (§5).
- Mientras tanto, la app Android apunta a `peregrinos-1.onrender.com` (`capacitor.config.ts`): cambiar su `server.url` a
  `https://peregrinos.net.ar` exige una **nueva versión de la app** (decisión de publicación) y mantener Render activo
  hasta que los usuarios actualicen.

## 5. Seguridad de la configuración

- **API sin dominio público**: la web la alcanza por la red privada de Railway; el navegador, la app y SIGyP usan
  `https://peregrinos.net.ar/api/...` (mismo origen). Comprobar antes que la red privada de Railway llegue al servidor:
  la API escucha en `0.0.0.0` (IPv4) por código; si la red privada del entorno es solo IPv6, hay que escuchar en `::`
  (cambio pequeño, a probar).
- **`TRUST_PROXY` (corregido en código 2026-10-19, `lib/proxy.ts`, prueba `s2`):** antes `trustProxy: true` creía
  cualquier `X-Forwarded-For` del cliente (límite de intentos por IP eludible; también en Render hoy). Ahora se
  configura: número de saltos de los proxies propios o lista de IP/CIDR. Sin la variable se conserva `true` (para no
  cambiar Render sin medir) y la API **advierte al iniciar en producción**. Valor esperado con la web reenviando `/api`:
  **2** (borde del alojamiento + Next). **Medirlo antes de fijarlo**: en el entorno de prueba, registrar temporalmente
  `X-Forwarded-For` y la IP del socket en `/api/health` (o en el log) desde un cliente con IP conocida, y elegir el
  número que devuelva esa IP; luego verificar que un `X-Forwarded-For` falso no la cambie. Un valor demasiado alto
  vuelve a ser eludible; uno demasiado bajo hace que todos compartan la IP del proxy (bloqueos cruzados).
- `COOKIE_SECURE=true` (HTTPS), `SameSite=Lax` (actual), CORS limitado a `WEB_ORIGIN`, CSRF por encabezado
  `X-PG-Client` (con la excepción por patrón para `/api/integrations/sigyp/v1/*`, commit `8609f18`).
- CSP/HSTS en la web de Peregrinos: hoy no hay una CSP explícita (sí en SIGyP); proponerla con el mismo enfoque de nonce
  antes del despliegue definitivo. HSTS solo cuando el dominio definitivo sirva siempre por HTTPS.
- Tamaño de petición: la API limita a 1 MB (subidas con `multipart`, 10 MB por archivo); verificar que la reescritura de
  Next no recorte cuerpos mayores (portadas e imágenes).

## 6. Persistencia

Imágenes y comprobantes están en Neon: **no hace falta volumen**. Solo si existieran comprobantes antiguos en el disco de
Render (anteriores a la columna `data`), migrarlos a la base **antes** del cambio (consulta: comprobantes con `data` nula);
el disco de Render no es persistente entre despliegues salvo disco pago. Hay que medir el crecimiento de Neon por las
imágenes (límite de almacenamiento del plan de Neon: verificar en su panel).

## 7. Neon, migraciones y orden

- Conservar Neon. Usar la cadena con *pooler* para la aplicación y verificar si `prisma migrate deploy` necesita la
  conexión directa (sin pooler); hoy el esquema tiene una sola `url`: si hace falta, agregar `directUrl` (cambio menor).
- Producción conoce las migraciones de `origin/main`; las 2 de SIGyP son **aditivas** (tablas nuevas, columnas opcionales,
  CHECK). Orden: rama de Neon (punto de restauración) → `prisma migrate deploy` → desplegar el código. Ensayo previo en
  una rama de Neon o en PGlite (como `e2e-sigyp.mjs`).

## 8. Push y correo

- Push: `FIREBASE_SERVICE_ACCOUNT` (FCM) se copia tal cual (mismo proyecto Firebase); sin cambios en la app.
- Correo: `SMTP_URL` del proveedor actual; verificar que Railway permita SMTP saliente al puerto usado (algunos
  proveedores bloquean el 25; usar 587/465).

## 9. Copias, recuperación y reversión

- Base: Neon conserva historial (restauración a un punto en el tiempo según el plan de Neon) + rama previa a cada
  migración. Recomendado además: `pg_dump` periódico cifrado fuera de Neon.
- **Reversión a Render**: mientras dure la transición, Render sigue activo apuntando a la misma Neon; revertir = volver el
  DNS a Render (TTL bajo durante el cambio) o seguir usando `peregrinos-1.onrender.com`. Las migraciones aditivas no
  rompen el código viejo en lectura (a confirmar con el ensayo).
- **No se asume que dos servidores puedan escribir a la vez sin consecuencias** (corrección CICLO 2). Con Render y
  Railway activos contra la misma Neon: los límites de intentos viven en memoria de cada proceso (el límite efectivo se
  duplica), dos versiones de código distintas escriben las mismas tablas, y una petición repetida por el cliente puede
  caer en cada servidor. Por eso: (1) ambos con **el mismo commit** y el mismo esquema; (2) el cambio de DNS es la
  frontera — tras propagarse, Render queda **solo para reversión** (idealmente en modo mantenimiento o con la API
  apagada y la web mostrando un aviso); (3) la app Android apunta a un único origen por versión; (4) la reversión es el
  camino inverso con la misma regla. Peregrinos no tiene tareas periódicas en proceso (verificado: sin `setInterval` ni
  planificadores en `src/`), así que no hay trabajos duplicados que coordinar.

## 10. Recursos y costo (ESTIMACIÓN, a confirmar midiendo)

| Concepto | Supuesto | Costo mensual estimado |
|---|---|---|
| API (Node/Fastify) | ~0,3 GB RAM promedio, CPU ociosa | ~3 USD RAM + < 1 USD CPU |
| Web (Next.js) | ~0,3–0,4 GB RAM promedio | ~3–4 USD RAM + < 1 USD CPU |
| Salida de red | < 20 GB/mes al inicio | < 1 USD |
| **Total Railway** | | **≈ 7–10 USD/mes** (el plan incluye 5 USD; se paga el consumo total si lo supera) |

No incluye: **Neon** (plan actual, sin cambios), **dominio** (ya pagado), **correo** (proveedor SMTP), Firebase (gratuito
para FCM), YouTube API (cuota gratuita), **Anthropic** (por uso, solo si se activa el informe con IA). Un pico de tráfico o
memoria aumenta el costo: configurar en Railway un **límite de gasto** y alertas.

## 11. Procedimiento propuesto (cada paso con autorización)

1. `TRUST_PROXY` y puerto ya corregidos en código (s2); medir y fijar `TRUST_PROXY` en el entorno; si hace falta, host `::`.
2. Crear proyecto y servicios en Railway **sin dominio**; variables según §3; desplegar y probar en el dominio temporal de
   Railway contra una **rama de Neon** (no la principal).
3. Ensayo completo: ingreso, MFA, eventos, inscripción, portadas, push de prueba, correo, integración SIGyP (x1 contra el
   dominio temporal, con una organización de prueba).
4. Rama de Neon de respaldo → migraciones en la base principal → desplegar.
5. DNS de `peregrinos.net.ar` hacia Railway (TTL bajo), Render activo como reversión.
6. Nueva versión de la app con `server.url = https://peregrinos.net.ar` (cuando el dominio esté estable).
7. Tras un período estable, apagar Render.

## 12. Medir `TRUST_PROXY` sin adivinar (procedimiento)

En el dominio temporal de Railway (nunca en producción), con una sola instancia:

1. Desplegar sin `TRUST_PROXY` (se conserva `true` y la API advierte al iniciar).
2. Desde una conexión con IP pública conocida, pedir `/api/health` dos veces: normal y con un encabezado
   `X-Forwarded-For: 203.0.113.7` (dirección de documentación, falsa).
3. Leer en el registro de la petición la IP que Fastify registró (`remoteAddress`) y la cadena completa de
   `X-Forwarded-For` que llegó (registro temporal de diagnóstico, sin cookies ni encabezados de autorización; se quita al
   terminar).
4. Contar cuántos saltos propios hay a la derecha de la IP real (borde de Railway, y Next si reenvía `/api`): ese es el
   valor. Fijar `TRUST_PROXY=<n>` y repetir el paso 2: con y sin el encabezado falso debe registrarse **la misma IP
   real**. Si con el falso aparece 203.0.113.7, el valor es demasiado alto; si aparece una IP interna para todos, es
   demasiado bajo.
5. Anotar el valor y la evidencia (sin IPs personales) en este documento.

## 13. Costos separados (orientativos al 2026-10-19, sin contratar)

| Concepto | Proveedor | Costo | Estado |
|---|---|---|---|
| Cómputo API + web | Railway Hobby | USD 5/mes con USD 5 de consumo incluidos; RAM ≈ USD 10/GB-mes, CPU ≈ USD 20/vCPU-mes, salida USD 0,05/GB; estimado total 7–10 USD/mes (§10) | A medir en el ensayo |
| Volumen | Railway | USD 0,15/GB-mes | **No necesario** (imágenes en Neon, §6) |
| Base | Neon | Plan actual | Sin cambios; vigilar almacenamiento por imágenes |
| Dominio | Registro actual | Ya pagado | Hobby admite 2 dominios propios |
| Correo | Proveedor SMTP actual | Sin cambios | Verificar puerto 587/465 |
| Push | Firebase FCM | Gratuito | Mismo proyecto |
| Copia externa de Neon | A decidir | Pocos USD/mes | Bloqueado por decisión |

## 14. Decisiones del propietario

Autorizar la creación de servicios (costo); límite de gasto; dominio para el portal comercial (2 dominios en Hobby);
activar o no el informe con IA (costo por uso); publicar la nueva versión de la app; fecha de corte y período de
convivencia con Render; versionar la carpeta `android/` (hoy sin seguimiento: el código nativo de descargas de PDF no
está en Git).

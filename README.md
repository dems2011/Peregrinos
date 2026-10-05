# Peregrinos · Control de Recorrido

Monorepo: `apps/api` (Fastify + Zod + Prisma/PostgreSQL), `apps/web` (Next.js PWA), `packages/shared` (roles, permisos y esquemas Zod compartidos).

## Estado: FASE 3B (incluye 1, 2, 3A y pagos/credenciales)
Fase 1: arquitectura, BD, seed, autenticación, roles, eventos, usuarios, asignación de operadores, auditoría, login e inicio.
Fase 2 (API): participantes (CRUD, búsqueda, QR, importación XLSX con resumen previo), puntos de control (CRUD, orden, activar/desactivar, avance), llegadas (registro con duplicados, idempotencia, historial con filtros, correcciones, resolución de conflictos). 
Fase 3A (API): niveles de acceso a medida, invitaciones por correo, acceso del peregrino por enlace/código, contactos del evento y sesión unificada (`/api/session`). Las pantallas llegan en la 3B y 3C.
Fase 3B: **tiempo real** entre teléfonos (SSE) y la **aplicación web** del administrador/operador (Next.js, móvil primero) con el estilo de la imagen de referencia.
Pagos y credenciales (API): inscripción pública del peregrino, envío del comprobante de pago, confirmación por el administrador (asigna número y lo ingresa al listado oficial) y credencial tipo carnet en PDF lista para imprimir.

> **Si ya tenías la base creada:** esta entrega agrega columnas/tablas (Fase 2: `phoneDigits`; Fase 3A: invitaciones, sesiones de peregrino, contactos, permisos extra) y dependencias.
> Ejecuta `npm install` y luego `npm run db:migrate -- --name fase_3a`.
> Para partir de cero (recomendado si solo estás probando): `npm run db:reset` y `npm run db:init`.

## Ejecutar en local
Requisitos: Node 20+, Docker (o un PostgreSQL 16 propio). En Windows, usa Git Bash o WSL (el script `db:init` usa `cat`).

```bash
npm install                          # instala y compila packages/shared
cp .env.example apps/api/.env        # revisa JWT_SECRET
npm run db:up                        # PostgreSQL en Docker
npm run db:init                      # migración + índice parcial + datos demo
npm run dev:api                      # http://localhost:4000/api/health
npm run dev:web                      # http://localhost:3000
```

Usuarios demo (contraseña `Peregrinos2026!`, configurable con `SEED_PASSWORD`):
`superadmin@peregrinos.local`, `admin@peregrinos.local`, `carlos@peregrinos.local` (Punto 1), `maria.operadora@peregrinos.local` (Punto 2), `juan.operador@peregrinos.local` (Punto 3).

> `db:init` crea la migración sin aplicarla, le agrega el índice único parcial de llegadas
> (`prisma/sql/checkin_active_unique.sql`) y recién entonces la aplica. Úsalo solo la primera vez;
> después, `npm run db:migrate`. `npm run db:reset` borra todo y vuelve a empezar.

## Cómo probar la Fase 1
1. Entra a http://localhost:3000 con `superadmin@peregrinos.local`: ves el evento "Peregrinación de Luján 2026" con 5 personas, 4 puntos y 6 llegadas.
2. Cierra sesión y entra como `maria.operadora@peregrinos.local`: aparece "Punto de control actual: Plaza San Martín" y solo ves su evento.
3. API (con la sesión ya iniciada, o con `curl -c/-b cookies.txt`; todo POST/PUT/PATCH/DELETE requiere el encabezado `X-PG-Client: web`):
   - `POST /api/auth/login` · `GET /api/auth/me` · `POST /api/auth/refresh` · `POST /api/auth/logout`
   - `POST /api/auth/bootstrap` (solo si la BD no tiene usuarios: crea organización + SUPERADMIN)
   - `GET/POST /api/events`, `GET/PATCH /api/events/:id` (crear/editar: SUPERADMIN)
   - `GET/POST /api/users`, `PATCH/DELETE /api/users/:id` (SUPERADMIN; DELETE desactiva)
   - `GET/PUT /api/users/:id/assignments` con `{ "checkpointIds": [...] }` (SUPERADMIN y ADMIN)
   - `GET /api/audit-logs?eventId=&userId=&entityType=&page=` (SUPERADMIN)
4. Prueba de permisos: como operador, `POST /api/events` debe responder 403; como admin, también.

```bash
curl -i -c c.txt -H 'Content-Type: application/json' -H 'X-PG-Client: web' \
  -d '{"email":"superadmin@peregrinos.local","password":"Peregrinos2026!"}' http://localhost:4000/api/auth/login
curl -b c.txt http://localhost:4000/api/events
```

## Cómo probar la Fase 2
Con la API en marcha y los datos demo: `bash scripts/smoke-phase2.sh` (requiere `curl` y `jq`; ejecuta ~16 comprobaciones).
Manualmente, todas las rutas cuelgan de `/api/events/:eventId/...`:

| Ruta | Quién | Para qué |
|---|---|---|
| `GET participants?q=&status=&page=` | todos | Buscar por número, nombre, apellido, documento o teléfono |
| `GET participants/lookup?number=2` o `?qr=PG1:...&checkpointId=` | todos | Identificar en el punto; avisa si ya llegó ahí |
| `POST participants` · `PATCH participants/:id` · `GET participants/:id` | admin | Alta (número automático si no se indica), edición/estado, ficha con progreso |
| `GET participants/:id/qr?format=svg\|png&download=1` · `POST .../qr/regenerate` | admin | QR (solo `PG1:<token>`) y reemplazo de QR |
| `GET participants/import/template` · `POST participants/import?mode=preview\|commit` | admin | Plantilla XLSX · importación con resumen previo (multipart, campo `file`) |
| `GET/POST checkpoints` · `PATCH/DELETE checkpoints/:id` · `PUT checkpoints/order` | lectura todos; resto admin | Puntos con llegadas/capacidad/%, orden, activar/desactivar |
| `POST checkins` | operador (solo sus puntos), admin | Registrar llegada; `409 ALREADY_CHECKED_IN` con hora, operador y punto originales |
| `GET checkins?from=&to=&checkpointId=&participantId=&operatorId=&method=&status=` · `GET checkins/recent` | admin | Historial con filtros · últimas llegadas |
| `POST checkins/:id/cancel` · `PATCH checkins/:id` | admin | Anular o corregir hora/punto (motivo obligatorio) |
| `GET checkins/conflicts` · `POST checkins/:id/resolve` | admin | Ver y resolver duplicados offline |

Importación: columnas `Número, Nombre, Apellido, Documento, Teléfono` (Número es opcional; las filas sin número reciben los siguientes libres). La respuesta trae `total`, `valid`, `invalid`, `duplicateDocuments`, `duplicateNumbers` y `issues[]` con fila, campo y mensaje. `mode=commit` guarda solo las filas válidas.

## Cómo probar la Fase 3A
Con la API en marcha y datos demo: `bash scripts/smoke-phase3a.sh` (curl + jq; ~35 comprobaciones). El seed imprime los **enlaces y códigos de los 5 peregrinos demo** (se muestran una sola vez).

| Ruta | Quién | Para qué |
|---|---|---|
| `POST /api/invitations` `{email, role, extraPermissions[], checkpointIds[]}` | Superadmin (cualquier nivel) · Admin (solo operadores) | Invitar por correo con nivel y puntos. Devuelve `inviteUrl` (copiable) y `emailSent` |
| `GET /api/invitations` · `POST /:id/resend` · `DELETE /:id` | ídem | Listar, reenviar (enlace nuevo) y revocar |
| `GET /api/invitations/preview?token=` · `POST /api/invitations/accept` | pública | Ver la invitación y crear la cuenta (elige nombre y clave); inicia sesión |
| `PATCH /api/users/:id` con `extraPermissions` | Superadmin | Cambiar el nivel de una persona ya creada |
| `POST /api/events/:eventId/access/issue?format=json\|csv` `{participantIds?, reissue?}` | admin | Emitir enlaces + códigos (a todos los que faltan, o reemitir). CSV listo para enviar o imprimir |
| `POST .../access/participants/:id/reissue` · `GET .../access/status` | admin | Reemitir a una persona · cuántos tienen acceso |
| `POST /api/pilgrim/login` `{token}` o `{code}` · `GET /api/pilgrim/me` · `GET /api/pilgrim/qr.svg` · `POST /api/pilgrim/logout` | peregrino | Entrar, ver su QR/recorrido/contactos, cerrar sesión |
| `GET/POST/PATCH/DELETE /api/events/:eventId/contacts` | lectura: personal · escritura: admin | Contactos que ve el peregrino |
| `GET /api/session` | todos | Responde `{kind: "staff" \| "pilgrim" \| "none"}` para abrir la interfaz correcta |

Niveles listos para elegir (constante `ACCESS_LEVELS` en `packages/shared`): Operador de punto · Operador con altas · Administrador · Superadministrador.
Correo: sin `SMTP_URL` el enlace de invitación se imprime en la consola de la API y se devuelve en la respuesta; con `SMTP_URL` se envía el correo.

## Aplicación web (Fase 3B)
Abre http://localhost:3000 (la API en :4000; Next reenvía `/api/*`). Menú lateral en computadora y barra inferior en el teléfono.

| Pantalla | Ruta | Quién |
|---|---|---|
| Inicio (personas, puntos, llegadas de hoy, último registro, últimas llegadas en vivo) | `/` | admin |
| **Registrar llegada** (punto fijo arriba, escanear QR / número / buscar, tarjeta con nombre-DNI-teléfono-hora, botón grande, pantalla verde y vuelta automática, aviso naranja si ya llegó) | `/registrar` | operador, admin |
| Personas (búsqueda, alta, importar Excel con resumen previo, ficha con progreso, QR, credencial PDF, acceso del peregrino) | `/personas` | todos leen · alta/gestión según nivel |
| **Pagos por revisar** (cola, visor del comprobante, confirmar → asigna número, rechazar con motivo, enlace de inscripción) | `/pagos` | admin |
| Recorrido (mapa con línea y puntos numerados, avance por punto, reordenar, crear/editar con mapa) | `/recorrido` | lectura todos · gestión admin |
| Historial (Hoy/Ayer/Semana/Todos, filtros, anular con motivo, **resolver conflictos**) | `/historial` | admin |
| Credenciales (vista previa, nuevas/todas, incluir nombre, marcar impresas, PDF por lotes) | `/credenciales` | admin |
| Configuración: evento e inscripción (parroquia, cobro, enlace), usuarios e invitaciones por correo con nivel, contactos, accesos de peregrinos (CSV), auditoría | `/configuracion/*` | según nivel |
| Aceptar invitación | `/invitacion?token=` | pública |

**Tiempo real:** cada teléfono mantiene un canal abierto con el evento (`GET /api/events/:id/stream`, SSE). Cuando un operador confirma una llegada, todos los demás ven el cambio al instante (Historial, Inicio, avance de puntos, ficha de la persona). El indicador «En vivo» arriba muestra si el canal está conectado; si se corta, se reconecta solo. Sin señal no hay canal: ese caso lo cubre el modo offline (Fase 4) y, si dos teléfonos registran a la misma persona sin conexión, queda como *conflicto* para resolver en Historial.
Pruebas: `bash scripts/smoke-live.sh`. Con varias instancias de la API, reemplazar `lib/bus.ts` por PostgreSQL LISTEN/NOTIFY.

**Mapa:** `components/MapView.tsx` es el único archivo que usa Leaflet/OpenStreetMap; cambiar de proveedor es reemplazar ese componente manteniendo sus props.

## Inscripción, comprobantes y credenciales
Flujo: **el peregrino se inscribe** (enlace público) → **paga y sube el comprobante desde la app** → **el administrador lo revisa y confirma** → *automáticamente* queda en el listado oficial con su **número**, su **QR** y su **credencial** → el administrador **exporta el PDF** para imprimir y entregar.

Prueba: `bash scripts/smoke-payments.sh` (~35 comprobaciones). Estados de la inscripción: `PENDING_PROOF` → `IN_REVIEW` → `APPROVED` (o `REJECTED`, que permite reenviar).

| Ruta | Quién | Para qué |
|---|---|---|
| `PATCH /api/events/:id` con `registrationOpen, parishName, registrationFee, paymentInstructions` | Superadmin | Abrir la inscripción (genera el enlace), nombre de la parroquia, monto e instrucciones de pago |
| `GET /api/events/:eventId/registrations/link` | admin | Enlace público para compartir (`/registro/<token>`) |
| `GET /api/registration/info?token=` · `POST /api/registration` | pública | Datos del evento y alta del peregrino; devuelve su enlace/código personal (una sola vez) e inicia su sesión |
| `POST /api/pilgrim/payment-proof` (multipart: `file`, `amount`, `reference`, `paidAt`, `note`) | peregrino | Enviar el comprobante (JPG/PNG/WEBP/PDF, hasta 10 MB). Puede reenviar si lo rechazan |
| `GET /api/events/:eventId/registrations?status=&q=` · `GET .../registrations/:id` | admin | Cola de revisión con contadores por estado, y detalle |
| `GET .../registrations/:id/proofs/:proofId/file` | admin | Ver el comprobante (privado, nunca público) |
| `POST .../registrations/:id/approve` `{number?, withoutProof?}` · `POST .../reject` `{reason}` | admin | Confirmar (asigna número y crea al participante) o rechazar con motivo |
| `GET .../credentials/status` · `GET .../credentials?scope=new\|all\|ids&ids=&mark=true&includeName=true&page=` · `GET .../credentials/participants/:id` | admin | PDF A4 con 10 carnets por hoja (lotes de 500) o credencial individual |

**La credencial** (85,6 × 54 mm): cabecera azul con el **nombre de la parroquia** y el evento, el **número asignado** en grande y el **QR**. Por defecto **no lleva datos personales** (nombre, DNI ni teléfono): estos aparecen en la app del administrador/operador al escanear el QR o ingresar el número, junto con el punto y la hora de la lectura (que se guardan al confirmar la llegada). `includeName=true` imprime además el nombre. `scope=new` + `mark=true` permite imprimir solo lo nuevo y no repetir.

## Decisiones técnicas
- **Eventos como raíz.** Participantes, puntos, asignaciones, llegadas e incidencias llevan `eventId`. Las claves foráneas son compuestas (`participantId+eventId`, `checkpointId+eventId`), así la BD misma impide que una llegada mezcle datos de dos eventos.
- **Duplicados.** Índice único parcial `(eventId, participantId, checkpointId) WHERE status='ACTIVE'`. Los registros `CANCELLED` (correcciones) y `CONFLICT` (duplicados offline) quedan guardados y no chocan.
- **Sesiones.** Access token JWT (15 min) y refresh token opaco (14 días) en cookies `httpOnly` + `SameSite=Lax`. El refresh se guarda hasheado (SHA-256), rota en cada uso y, si se reutiliza uno revocado, se cierran todas las sesiones del usuario. En cada petición se consulta el usuario en BD: desactivarlo o cambiarle el rol surte efecto de inmediato.
- **CSRF.** Las peticiones que modifican datos exigen `X-PG-Client: web`; el navegador solo puede enviarlo desde nuestro origen (preflight CORS).
- **Mismo origen.** Next reenvía `/api/*` al backend (`rewrites`), por eso no hay problemas de cookies entre puertos. Las rutas del API viven bajo `/api` y la cookie de refresh solo viaja a `/api/auth`.
- **Contraseñas.** argon2id. Login con límite de 10 intentos/min por IP y tiempo constante cuando el correo no existe.
- **Usuarios y eventos no se borran.** Se desactivan / cancelan, para conservar trazabilidad.
- **Fuentes.** Inter si está instalada, con Roboto/system-ui como respaldo (sin descargas externas, para que funcione offline).
- **QR.** Contiene `PG1:<token aleatorio de 192 bits>`; sin datos personales. El prefijo permite rechazar de inmediato QR ajenos. Si una credencial se pierde, se regenera el token y el anterior deja de funcionar.
- **Datos mínimos para el operador.** Ve número, nombre y documento (para verificar identidad); nunca teléfono, notas ni QR. Las búsquedas del operador devuelven máximo 10 resultados.
- **Duplicados.** Online: `409` y no se crea nada. El mismo `id` (UUID) reenviado es idempotente (`IDEMPOTENT`). El modo `sync` (Fase 4) conserva el duplicado como `CONFLICT` enlazado al original, que el admin resuelve con `resolve`.
- **Numeración y orden.** Se asignan bajo un bloqueo por evento (`pg_advisory_xact_lock`), así dos altas simultáneas no obtienen el mismo número. Eliminar un punto solo se permite sin llegadas; si tiene historial se desactiva. Al eliminar o reordenar, el orden se recompacta a 1..n.
- **Hora de la llegada.** Se acepta la del dispositivo (necesaria para offline), salvo que esté más de 5 minutos en el futuro; entonces se usa la del servidor.
- **Nivel = rol + permisos extra.** El permiso efectivo es la unión del rol y de `extraPermissions` (`participant:create`, `checkin:read`, `report:read`). Cada petición lee al usuario de la BD, así que cambiar su nivel o desactivarlo surte efecto de inmediato. Nadie puede dar un nivel superior al propio.
- **Invitaciones.** Token aleatorio de 384 bits, solo se guarda su hash; vence a los 7 días y es de un solo uso (el canje es atómico: si dos personas abren el enlace a la vez, solo una entra). Reenviar genera un enlace nuevo e invalida el anterior.
- **Peregrino.** Entra con enlace personal (256 bits) o código de 10 caracteres (~50 bits, límite de 10 intentos/min). Solo se guardan hashes; el enlace se muestra una vez al emitirlo. Su sesión es otra cookie (`pg_pt`, solo viaja a `/api/pilgrim`) y nunca abre rutas de personal. Solo ve sus datos (documento enmascarado, sin teléfono) y los contactos del evento. Reemitir cierra sus sesiones.
- **Inscripción separada del listado oficial.** Una `Registration` no tiene número ni QR; al confirmarla se crea el `Participant` (número = el indicado o el siguiente libre, bajo bloqueo por evento) y el mismo enlace/código y la misma sesión del peregrino pasan a ser los de un participante verificado. Cobros en efectivo: `withoutProof: true` (queda en la auditoría).
- **Comprobantes.** Se guardan en `UPLOAD_DIR` con nombre aleatorio y permisos restringidos, fuera de toda carpeta pública; solo el personal con `payment:review` puede verlos. El tipo se verifica por los primeros bytes del archivo (no por la extensión) y se sirven con `nosniff` y CSP restrictiva. Cada archivo tiene huella SHA-256: si el mismo comprobante aparece en otra inscripción se marca `duplicateOfOther`. **No hay antivirus**; en producción conviene sumar uno o un servicio de almacenamiento con escaneo.
- **Credencial sin datos personales.** Si se pierde el carnet, quien lo encuentre solo tiene un número y un QR opaco. Se puede regenerar el QR de una persona (el anterior deja de funcionar) y reimprimir.
- **Teléfono para el operador.** El operador ve nombre, documento y teléfono al identificar (como en la imagen de referencia y lo pedido); nunca notas, foto ni QR. Es una sola línea en `view()` de `participants.ts` si se quisiera ocultar.
- **Parroquia.** Se toma `Event.parishName`; si está vacío, el nombre de la organización.
- **Operador.** `currentCheckpoint` = punto activo de menor orden en el evento "En curso" (o "Programado" si no hay ninguno en curso).

## Pendiente (plan en `docs/ALCANCE-FASE3.md`)
- **Fase 3C:** app del peregrino: inscripción en `/registro/<token>` (con compresión de la foto del comprobante), estado del pago, entrada por `/p/<token>` o código, Mi QR disponible sin internet, Recorrido y Contactos.
- **Fase 4:** offline (Service Worker + IndexedDB), cola y sincronización idempotente, conflictos, respaldo/restauración.
- **Fase 5:** reportes y gráficos, exportación CSV/XLSX/PDF, incidencias y emergencia, despliegue.
- **Internacionalización:** geografía (países, niveles administrativos, direcciones), idiomas `es/en/pt/it` y países prioritarios iniciales. Diseño aprobado y tareas en [`docs/ARQUITECTURA-INTERNACIONAL.md`](docs/ARQUITECTURA-INTERNACIONAL.md).
- Foto del participante, íconos PNG para instalar en iPhone, instalación PWA (hoy solo hay `manifest` e `icon.svg`).
- Aún no probado en navegador ni con dispositivos reales: ver «Verificación» abajo.

## Verificación sugerida de la Fase 3B
1. `npm install` (compila `packages/shared`), BD lista (`db:init`), `npm run dev:api` y `npm run dev:web`.
2. Si hay errores de TypeScript/compilación, ejecutar `npm run typecheck -w @peregrinos/api` y `npx next build` en `apps/web` y reportarlos.
3. Cámara: el navegador solo la permite en **HTTPS o localhost**. Para probar en un celular real usa un túnel HTTPS (p. ej. `cloudflared`/`ngrok`) apuntando al puerto 3000.

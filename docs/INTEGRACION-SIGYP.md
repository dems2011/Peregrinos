# Integración con SIGyP — Gestión Parroquial (contrato v1)

**Estado:** implementado en la rama local `sigyp-integracion`. **No desplegado ni migrado en ninguna base** (ni local ni
Neon). Contrato canónico: `C:\Proyectos\GestionParroquial\docs\CONTRATO-SIGYP-PEREGRINOS.md` (este documento resume
el lado Peregrinos).

## Qué hace

SIGyP (el sistema de gestión instalado en la parroquia) publica en Peregrinos:
- **Cartelera:** avisos con vigencia. El perfil público (`GET /api/public/parishes/:id`, que usan la web y la app
  Capacitor) devuelve `announcements` solo con los no retirados, ya comenzados y no vencidos. Se muestran en
  `ParishProfileView` (sección «Cartelera»), igual en la página pública y en la vista previa del administrador.
- **Perfil público:** nueve campos (descripción, dirección, teléfono, correo, web, Instagram, Facebook, YouTube y
  horarios). Mientras `Organization.profileSource = "SIGYP"`, el panel no deja editarlos (`409
  PROFILE_MANAGED_BY_SIGYP`); el nombre, el código, el logotipo y la imagen siguen siendo de Peregrinos.

## Seguridad

- Entrada en `/api/integrations/sigyp/v1/*` **sin sesión de usuario**: credencial `pgsig_…` por organización
  (`IntegrationClient`), guardada solo como SHA-256. La organización sale de la credencial, nunca del cuerpo.
- Esquemas estrictos del paquete compartido (`packages/shared/src/sigyp.ts`); campos de más → `400`.
- Escrituras solo con alcance (`announcements:write`, `profile:write`) y organización `APPROVED`.
- Idempotencia: se aplica solo una versión mayor que la guardada (condición en la propia sentencia `updateMany`).
- Auditoría: `SIGYP_ANNOUNCEMENT_APPLIED`, `SIGYP_ANNOUNCEMENT_WITHDRAWN`, `SIGYP_PROFILE_APPLIED`,
  `SIGYP_CLIENT_CREATED`, `SIGYP_CLIENT_REVOKED`, `SIGYP_PROFILE_RELEASED`.
- Límite de frecuencia por ruta (30–120 por minuto).

## Administración (panel de la organización)

«Perfil de la parroquia» → «Conexión con SIGyP»: crear una credencial (máximo 3 activas; se muestra una sola vez),
revocarla (corta de inmediato) y «Volver a editar el perfil aquí» (libera los nueve campos). Requiere `parish:profile`
y segundo factor reciente. API: `GET|POST /api/organization/integrations/sigyp`, `POST …/:id/revoke`,
`POST …/release-profile`.

## Migración

`apps/api/prisma/migrations/20261019000000_sigyp_integration` — **aditiva** (dos tablas, cuatro columnas opcionales o con
valor por defecto, tres CHECK). Validada aplicando las 28 migraciones en un esquema temporal de una base de prueba
**ajena a Peregrinos**, dentro de una transacción revertida. Para desplegarla: `npm run db:deploy -w @peregrinos/api`
(`prisma migrate deploy`) con la base del entorno correspondiente, **solo con autorización expresa**.

## Pruebas

`apps/api/test/s1-sigyp-integration.test.ts` (sin base: esquemas, credenciales, versiones, vigencia y reglas sobre la
fuente). La suite completa sin base: 453/453. Pendiente: e2e con base y verificación visual en web y app.

## Ampliación (2026-10-17): vinculación con código, eventos y avisos multigrupo

Migración aditiva `20261019000100_sigyp_link_events_notices` (validada igual que la anterior: 29 migraciones en un esquema
temporal ajeno a Peregrinos, transacción revertida; 61 tablas y 6 CHECK nuevos). **No aplicada en ninguna base.**

- **Vinculación con código.** El **SUPERADMIN** (autoridad de la parroquia) genera en «Conexión con SIGyP» un código
  `PGV-XXXXX-XXXXX-XXXXX-XXXXX` (≈100 bits, solo SHA-256 en la base) que vence a los **15 minutos** y sirve **una vez**.
  SIGyP llama a `POST /link/preview` (no consume: muestra parroquia, qué se comparte y vencimiento) y, tras la
  confirmación explícita del párroco, a `POST /link/complete`, que consume el código en la misma sentencia
  (`updateMany … usedAt: null, expiresAt > now`) y entrega la credencial una sola vez. `POST /unlink` revoca la propia
  credencial desde SIGyP. Mismo mensaje para código inexistente, vencido, usado o revocado.
- **Eventos.** `PUT /events/:sourceId`, `POST …/withdraw` y `PUT …/cover` crean o actualizan un **`Event` de Peregrinos**
  (no hay un sistema paralelo): `(organización, SIGYP, sourceId)` es único y `sourceVersion` impide duplicar o
  retroceder. Solo capacidades `INFO`/`LOCATION` (sin inscripciones, participantes ni certificados), modalidad
  presencial, virtual o mixta con enlace https. **Publicar desde SIGyP no avisa a los seguidores**
  (`publishedNotifiedAt` se fija al crear). Retirar = `CANCELLED`. El panel no edita eventos de SIGyP ni su portada
  (`409 EVENT_MANAGED_BY_SIGYP`). La portada usa el mismo procesamiento que el panel (variantes WebP sin EXIF/GPS).
- **Avisos multigrupo.** Grupos derivados de datos reales: `FOLLOWERS` (seguidores) y personal **activo** por rol
  (`STAFF:SUPERADMIN`, `STAFF:ADMIN`, `STAFF:OPERATOR`). Una persona en varios grupos recibe **un** aviso
  (`uniqueRecipients`). En el panel («Avisos»): solo se ofrecen los grupos permitidos (seguidores con `notice:send`;
  personal además con `user:manage`), se muestra el total único y hay que confirmarlo (`409 RECIPIENTS_CHANGED` si
  cambió); `PUSH` (bandeja + teléfono) o `INBOX` (solo bandeja); alerta urgente solo del SUPERADMIN, con motivo. Desde
  SIGyP: `GET /notices/audiences` (solo cantidades) y `POST /notices/:sourceId` (una vez por `sourceId`).
- **Limitación:** los grupos pastorales (`PastoralGroup`) no tienen cuentas, por eso no son destinatarios de avisos de
  la aplicación. Los «roles personalizados» existen en SIGyP (sus avisos internos).

Pruebas: `s1` 22/22; suite completa sin base 462/462 (se actualizaron dos pruebas estructurales que cuentan rutas y
llamadas a push; siguen exigiendo push después de confirmar la transacción).

## Corrección (2026-10-19): CSRF y llamadas de servidor a servidor

La primera prueba de extremo a extremo REAL (SIGyP con su cliente HTTP contra esta API sobre una base en memoria,
`.e2e-local/run.sh e2e-sigyp.mjs`) mostró que el gancho CSRF global rechazaba con `403 CSRF` toda escritura de SIGyP:
exigía `X-PG-Client: web`, un encabezado de navegador que un servidor no envía. Las pruebas anteriores no lo
detectaban (simulado y conformidad de esquemas). Ahora `lib/csrf.ts` exceptúa solo las rutas registradas bajo
`/api/integrations/sigyp/v1/`, decidido por el **patrón de ruta** (no por la URL cruda). Es seguro porque esas rutas no
usan cookies ni sesión (Bearer `pgsig_…` o código de un solo uso en el cuerpo); `s1` lo fija por la fuente. Resultado:
e2e real 5/5 en SIGyP + 13/13 verificaciones en esta base; suite de la API 463/463.

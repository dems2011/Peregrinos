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
- Escrituras solo con alcance (`announcements:write`, `profile:write`, `events:write`, `notices:send`, `notices:staff`)
  y organización `APPROVED`.
- Idempotencia: se aplica solo una versión mayor que la guardada (condición en la propia sentencia `updateMany`).
- Auditoría: `SIGYP_ANNOUNCEMENT_APPLIED`, `SIGYP_ANNOUNCEMENT_WITHDRAWN`, `SIGYP_PROFILE_APPLIED`,
  `SIGYP_CLIENT_CREATED`, `SIGYP_CLIENT_REVOKED`, `SIGYP_PROFILE_RELEASED`.
- Límite de frecuencia por ruta (30–120 por minuto).

## Administración (panel de la organización)

«Perfil de la parroquia» → «Conexión con SIGyP». **Actualizado 2026-10-26 (ver «Correcciones de seguridad»):**
- **Conceder** (código de vinculación o credencial directa): **solo el SUPERADMIN**, eligiendo los alcances y escribiendo
  su **contraseña** en la misma operación. Máximo 3 credenciales activas y 3 códigos vigentes; se muestran una sola vez.
- **Liberar el perfil** («Volver a editar el perfil aquí»): `parish:profile` + contraseña.
- **Revocar** (credencial o código): `parish:profile`, sin contraseña (solo quita acceso y debe poder hacerse en el acto).
- Todas: segundo factor reciente **además**, si la cuenta lo tiene activo.

API: `GET|POST /api/organization/integrations/sigyp`, `GET|POST …/link-codes`, `POST …/link-codes/:id/revoke`,
`POST …/:id/revoke`, `POST …/release-profile`.

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

## Correcciones de seguridad (2026-10-26, decisiones D1–D4 del propietario)

Origen: la auditoría del 26/10 encontró que (a) `requireRecentMfa` no exige nada a una cuenta sin segundo factor, y el
SUPERADMIN entra sin él desde `60d9488`; (b) cualquiera con `parish:profile` creaba una credencial con **todos** los
alcances; (c) `notices:send` permitía avisar al personal; (d) los límites se contaban sin bloqueo.

| Decisión | Implementación | Evidencia |
|---|---|---|
| **D1** reautenticación | `lib/reauth.ts`: la contraseña viaja en el cuerpo de la MISMA petición (crear código, crear credencial, liberar perfil) y se verifica contra la cuenta autenticada en ese momento. Vigencia = esa petición: no hay permiso reutilizable que repetir ni trasladar. Nunca se guarda ni se registra; el fallo se audita (`REAUTH_FAILED`, solo el propósito). Límite de frecuencia en las tres rutas. El segundo factor sigue exigiéndose además si la cuenta lo tiene. | `s6` (fuente y esquemas); E2E: incorrecta → 403 sin efectos, la de otra cuenta → 403, auditoría sin la contraseña |
| **D2** solo SUPERADMIN, alcances mínimos | `requireOwner` antes de leer el cuerpo en las DOS rutas que conceden (credencial directa y código); intento rechazado auditado (`SIGYP_GRANT_DENIED`). Los alcances son **obligatorios y explícitos** (nada de «todos por defecto»); al completar una vinculación la credencial recibe exactamente los del código. Solo el SHA-256 en la base. | `s6`; E2E: ADMIN con `parish:profile` → 403 en ambas; credencial de un alcance no puede usar otro; vista previa = alcances del código |
| **D3** avisos al personal | Alcance nuevo de SIGyP `notices:staff` (desmarcado por defecto en la pantalla); `notices:send` = solo seguidores. En el panel, permiso nuevo `notice:staff` (del SUPERADMIN, concedible por él; ya no `user:manage`). Rechazos auditados (`SIGYP_NOTICE_DENIED`, `NOTIFICATION_DENIED`); envíos auditados con la credencial. Los recuentos que ve SIGyP son solo de sus grupos permitidos. | `s1`, `s6`; E2E: aviso al personal sin el alcance → 403 sin crear nada y auditado; con el alcance → llega |
| **D4** límites concurrentes | `lib/integrationLimits.ts`: `SELECT … FOR UPDATE` de la organización y conteo en la misma transacción, en crear credencial, crear código **y completar la vinculación** (antes sin límite). | PostgreSQL 18 real (`run-pg.sh concurrencia-limites.mjs`): control sin bloqueo 10/10 superan el límite; con bloqueo exactamente 3; por HTTP 10 simultáneos → 3×201 + 7×409; completar con cupo 2 → 2×201 + 1×409 sin consumir el código rechazado |

**Compatibilidad con SIGyP:** las respuestas y rutas v1 no cambian, salvo que una credencial ahora puede tener menos
alcances (403 en lo no concedido) y `GET /notices/audiences` agrega `allowed`. El panel de Peregrinos (no SIGyP) es quien
pide la contraseña y los alcances. **SIGyP adaptado y probado juntos (2026-10-26):** GestionParroquial rama
`cierre-piloto-2026-11` (`e328f2e`) pide la contraseña del párroco al pegar una credencial, confirmar y desvincular;
guarda los alcances de la vinculación; exige su permiso propio `staffnotices:issue` para avisar al personal y rechaza
antes de enviar lo que la credencial no permite. Extremo a extremo real (`.e2e-local/run.sh e2e-sigyp.mjs` con la suite
`x1` de SIGyP): **5/5 en SIGyP y 19/19 verificaciones en la base de Peregrinos**, incluidos el aviso al personal
rechazado por los dos sistemas, la contraseña incorrecta auditada en ambos y la revocación.

**Pendiente de decisión (no implementado aquí):** política general de MFA obligatorio para el SUPERADMIN en todos los
accesos. D1 no depende de ella: la contraseña se pide igual.

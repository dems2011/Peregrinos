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

# Migraciones 28 y 29 (SIGyP) en producción — procedimiento

**Estado (2026-10-26):** preparado y ensayado; **NO ejecutado**. Cada paso marcado 🔒 requiere autorización expresa del
propietario en el momento. Claude no ejecuta `db:deploy` ni `git push` (bloqueados en `.claude/settings.json`).

| Migración | Qué hace |
|---|---|
| 28 `20261019000000_sigyp_integration` | Tablas `IntegrationClient` y `ParishAnnouncement`; 4 columnas nuevas en `Organization` (nulas o con valor por defecto); 3 CHECK |
| 29 `20261019000100_sigyp_link_events_notices` | Tabla `IntegrationLinkCode`; 5 columnas en `Event` y 5 en `Notification` (nulas o con valor por defecto); 3 índices únicos; 6 CHECK |

Ninguna borra ni modifica datos. Las correcciones de seguridad D1–D4 (2026-10-26) **no agregan migraciones**.

## Evidencia del ensayo (PostgreSQL 18, contenedor desechable)

`bash .e2e-local/migraciones-actualizacion.sh` (24/24 el 2026-10-26):
1. Esquema de `origin/main` (27 migraciones) + datos sintéticos (3 parroquias, 6 usuarios, 12 eventos, 20 avisos).
2. `migrate deploy` → 29/29, `migrate status` al día, **sin deriva** (`migrate diff --exit-code`), **huella de los datos
   existentes idéntica**, valores por defecto correctos, 9 CHECK **validados** sobre las filas existentes, índices
   presentes, CHECK activos (rechazan valores inválidos).
3. **El código de producción actual** (cliente Prisma de `origin/main`) lee, crea, edita y borra eventos y avisos sobre el
   esquema migrado: la ventana «migrar → publicar» es segura.
4. Reversión con `apps/api/prisma/rollback/20261019_sigyp_rollback.sql`: con datos de SIGyP **se aborta sin cambiar
   nada**; sin ellos vuelve exactamente al esquema de `origin/main` con los datos intactos, y 28/29 se pueden volver a aplicar.

Además, sobre 29 migraciones en PostgreSQL 18: E2E de seguridad 48/48, sesiones 34/34, concurrencia 9/9.

**No ensayado:** con una copia de los datos reales de producción (rama de Neon). Recomendado como paso 2.

## Procedimiento

**Antes (sin cambios en producción)**
1. `git ls-remote origin refs/heads/main` = la base de la rama candidata (hoy `1d70547`). Si avanzó, rehacer la integración.
2. 🔒 Crear en Neon una rama de respaldo desde `main` (p. ej. `pre-migracion-28-29`) y anotar fecha, hora y LSN.
3. (Recomendado) 🔒 Ensayo sobre una rama de Neon creada desde producción: `migrate deploy` contra esa rama y
   `migrate status` + `migrate diff --exit-code`.
4. `prisma migrate status` contra producción (solo lectura): debe decir **27 aplicadas, 2 pendientes** (exactamente
   `20261019000000_sigyp_integration` y `20261019000100_sigyp_link_events_notices`). Cualquier otra cosa: **detenerse**.

**Migrar (el código de producción todavía es el anterior)**
5. 🔒 `npm run db:deploy -w @peregrinos/api` con `DATABASE_URL` de producción (la conexión directa si el pooler la
   rechaza). Lo ejecuta el propietario.
6. `prisma migrate status` → «Database schema is up to date». Comprobar que producción (código anterior) sigue
   respondiendo: `/api/health`, `/api/public/parishes`, ingreso del personal.

**Publicar**
7. 🔒 Push de la rama candidata a `main` (Render despliega solo; Render **no** migra).
8. Verificación de solo lectura en producción: rutas nuevas responden 401/403 sin credencial
   (`/api/integrations/sigyp/v1/whoami`, `/api/organization/integrations/sigyp`), perfil público con `announcements`,
   registros sin 500 ni errores de Prisma.

## Reversión

- **Código:** volver a desplegar el commit anterior en Render. Es compatible con el esquema migrado (paso 3 del ensayo).
- **Esquema** (solo si hiciera falta y ANTES de que existan datos de SIGyP): 🔒 ejecutar
  `apps/api/prisma/rollback/20261019_sigyp_rollback.sql` en una transacción. Se aborta solo si hay datos que se perderían.
- **Datos:** restaurar la rama de Neon del paso 2, con la pérdida de lo escrito después.

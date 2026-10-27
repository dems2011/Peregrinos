# Migraciones 28 y 29 (SIGyP) en producción — procedimiento

**Estado (2026-10-26):** preparado y ensayado; **NO ejecutado**. Cada paso marcado 🔒 requiere autorización expresa del
propietario en el momento. Claude no ejecuta `db:deploy` ni `git push` (bloqueados en `.claude/settings.json`).

| Migración | Qué hace |
|---|---|
| 28 `20261019000000_sigyp_integration` | Tablas `IntegrationClient` y `ParishAnnouncement`; 4 columnas nuevas en `Organization` (nulas o con valor por defecto); 3 CHECK |
| 29 `20261019000100_sigyp_link_events_notices` | Tabla `IntegrationLinkCode`; 5 columnas en `Event` y 5 en `Notification` (nulas o con valor por defecto); 3 índices únicos; 6 CHECK |
| 30 `20261027000000_pastoral_turns` (2026-10-27) | Turnos del sacerdote: tablas `PastoralTurn` y `PastoralTurnDecision`, valor `TURN_REQUEST` en `NotificationKind`, 6 CHECK. Aditiva |
| 31 `20261027000100_pilgrim_requests` (2026-10-27) | Solicitudes de los fieles: tablas `ParishRequestType` y `PilgrimRequest`, valor `REQUEST_STATUS` en `NotificationKind`, 4 CHECK. Aditiva |

**Desde el 2026-10-27 son CUATRO migraciones pendientes (28 a 31).** Donde abajo dice «2 pendientes» o «28/29», léase
«4 pendientes» (las cuatro anteriores) y «28 a 31»; la reversión va en orden inverso: `rollback/20261027_pilgrim_requests_rollback.sql`,
`rollback/20261027_pastoral_turns_rollback.sql` y `rollback/20261019_sigyp_rollback.sql` (cada una se aborta sola si
hay datos que se perderían). Ensayo `migraciones-actualizacion.sh` (PostgreSQL 18 desechable, 2026-10-27): **27 → 31 →
reversión → 31, 31/31**, con el código de producción actual leyendo y escribiendo sobre el esquema migrado.

Ninguna borra ni modifica datos. Las correcciones de seguridad D1–D4 (2026-10-26) **no agregan migraciones** en
Peregrinos. (SIGyP tiene su propia migración `20261026000000_peregrinos_link_scopes_staff_notices` en su propia base
local; no afecta a Neon.)

**Riesgos y su control:** migración fallida a mitad → Prisma la marca como fallida y no sigue; restaurar desde la rama
del paso 2. Código anterior incompatible → descartado por el ensayo (sección 3 de la evidencia). Base equivocada → el
paso 4 imprime el host. Rama de respaldo con datos reales → queda en Neon: borrarla cuando el piloto esté estable
(decisión del propietario; contiene datos personales).

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
1. `git ls-remote origin refs/heads/main` = la base de la rama candidata (2026-10-26: `1d70547`). Si avanzó, rehacer la
   integración y repetir las pruebas.
2. 🔒 **Respaldo de Neon** (lo ejecuta el propietario; crea una copia de los datos reales):
   - Consola de Neon → proyecto de Peregrinos → *Branches* → *Create branch* → padre `main`, nombre
     `pre-migracion-28-29`, «Current data». Anotar fecha, hora y el LSN que muestra la rama.
   - O con la CLI (si se instala `neonctl` y se inicia sesión):
     `neonctl branches create --project-id <id> --name pre-migracion-28-29 --parent main`
   - Además (recomendado), una copia fuera de Neon, cifrada y guardada fuera del repositorio:
     `pg_dump --format=custom --no-owner --dbname "<URL directa de producción>" --file peregrinos-pre-28-29.dump`
     y `pg_restore --list peregrinos-pre-28-29.dump` para comprobar que se puede leer.
3. (Recomendado) 🔒 Ensayo sobre la rama `pre-migracion-28-29` (NO sobre `main`), en PowerShell, sin `.env`:
   ```powershell
   $env:DATABASE_URL = "<URL directa de la rama pre-migracion-28-29>"
   npx prisma migrate status --schema apps/api/prisma/schema.prisma      # debe: 27 aplicadas, 2 pendientes
   npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
   npx prisma migrate diff --from-url $env:DATABASE_URL --to-schema-datamodel apps/api/prisma/schema.prisma --exit-code   # 0 = sin deriva
   Remove-Item Env:DATABASE_URL
   ```
   Si algo falla, se descarta la rama: producción no se tocó.
4. Control de solo lectura contra producción:
   `$env:DATABASE_URL = "<URL directa de producción>"; npx prisma migrate status --schema apps/api/prisma/schema.prisma`
   Debe decir **27 aplicadas y 2 pendientes**, exactamente `20261019000000_sigyp_integration` y
   `20261019000100_sigyp_link_events_notices`. Cualquier otra cosa (otra migración pendiente, una fallida, otro host):
   **detenerse**. Confirmar que el host que imprime es el endpoint de producción.

**Migrar (el código de producción todavía es el anterior)**
5. 🔒 Con la misma variable: `npm run db:deploy -w @peregrinos/api` (= `prisma migrate deploy`). Si el pooler la
   rechaza, usar la URL directa (sin `-pooler`). Lo ejecuta el propietario (bloqueado para Claude en
   `.claude/settings.json`).
6. `npx prisma migrate status --schema apps/api/prisma/schema.prisma` → «Database schema is up to date» y
   `migrate diff … --exit-code` → 0. Comprobar que producción (código anterior) sigue respondiendo:
   `/api/health` (200), `/api/public/parishes` (200), ingreso del personal en la web. Borrar la variable
   (`Remove-Item Env:DATABASE_URL`).

**Publicar**
7. 🔒 Push de la rama candidata a `main` (Render despliega solo; Render **no** migra):
   `git push origin piloto-2026-11:main` (avance rápido desde `1d70547`; si Git lo rechaza por no ser avance rápido,
   **no forzar**: alguien publicó en `main` y hay que integrar primero). Lo ejecuta el propietario.
8. Verificación de solo lectura en producción: rutas nuevas responden 401/403 sin credencial
   (`/api/integrations/sigyp/v1/whoami`, `/api/organization/integrations/sigyp`), perfil público con `announcements`,
   registros sin 500 ni errores de Prisma.

## Reversión

- **Código:** volver a desplegar el commit anterior en Render. Es compatible con el esquema migrado (paso 3 del ensayo).
- **Esquema** (solo si hiciera falta y ANTES de que existan datos de SIGyP): 🔒 ejecutar
  `apps/api/prisma/rollback/20261019_sigyp_rollback.sql` en una transacción. Se aborta solo si hay datos que se perderían.
- **Datos:** restaurar la rama de Neon del paso 2, con la pérdida de lo escrito después.

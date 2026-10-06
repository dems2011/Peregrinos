# Despliegue A1–A6 a producción (Neon + Render)

Auditoría y ensayo: 2026-10-06. Ninguna operación de este documento se ejecutó todavía en producción.

## Estado verificado (solo lectura)

| Comprobación | Resultado |
|---|---|
| Neon | PostgreSQL 18.6, `neondb`, sin otras conexiones activas |
| `_prisma_migrations` | 10 aplicadas; 1 fila fallida de `20261005010059_add_parish_profile` correctamente marcada como *rolled back* (la fila aplicada coincide con el archivo local) |
| Estructura de Neon vs. las 10 migraciones aplicadas | idéntica (`prisma migrate diff` vacío) |
| 21 migraciones vs. `schema.prisma` | idéntica (`prisma migrate diff` vacío) |
| Objetos que crean las 11 pendientes | ninguno existe todavía |
| Precondiciones de datos | 0 participantes `INACTIVE`; 0 duplicados `(eventId, personId)`; 0 STAFF sin organización/rol; 0 nombres nulos; 0 cuentas PILGRIM; 0 inscripciones |
| Datos | 1 organización, 6 usuarios STAFF (1 SUPERADMIN), 3 eventos, 5 participantes, 8 llegadas, 1 trayecto |
| Catálogo geográfico | vacío (el formulario de parroquia usa la entrada manual de país) |

## Ensayo

PostgreSQL 18.6 local con la estructura exacta de Neon, su historial de migraciones y datos sintéticos con los mismos conteos. Las 11 migraciones se aplicaron en ~14 s. Resultado: organización `APPROVED`, una Person por participante (documento vacío → `NULL`), enum sin `INACTIVE`, el evento ROSARY sin trayecto pierde `ROUTE`, llegadas/sesiones intactas, 34 CHECK nuevos.

## Compatibilidad

- El código de `origin/main` (Render) solo conoce la migración `init`. Tras migrar, ese código **no puede dar de alta participantes ni inscripciones** (`Participant.personId` NOT NULL) ni usar `INACTIVE`. Las lecturas siguen funcionando.
- El código nuevo **no funciona** contra el esquema actual de Neon (faltan `Person`, `Organization.status`, etc.).
- Por eso la migración y el deploy del código nuevo van juntos, en este orden: migrar → desplegar.

## Qué debe llegar al repositorio

Incluir: `apps/api/src`, `apps/api/prisma` (schema, seed y las 8 migraciones sin seguimiento), `apps/api/test`, `apps/api/geo` (sin `.downloads/`, ya ignorado), `apps/api/package.json`, `apps/web/src`, `packages/shared/src` y `packages/shared/dist`, `.gitignore`, `docs/`.

Excluir: `apps/web/next.config.ts` (`output: "export"`; manda `next.config.mjs` con el proxy `/api`), `android/`, `capacitor.config.ts`.

## Procedimiento (cada paso requiere autorización)

1. **Punto de restauración**: crear en Neon una rama `pre-a4-a6` desde `main` (consola de Neon → Branches) o anotar la hora para *point-in-time restore*.
2. **Migrar** (desde `apps/api`, con el `DATABASE_URL` de Neon en `.env`; no definir `DATABASE_URL` en el shell):
   ```powershell
   Set-Location C:\Proyectos\Peregrinos\apps\api
   npx.cmd prisma migrate status   # debe listar exactamente las 11 pendientes y el host de Neon
   npx.cmd prisma migrate deploy
   npx.cmd prisma migrate status   # "Database schema is up to date!"
   ```
3. **Publicar el código** inmediatamente después: commit del conjunto de arriba y push a `main` (Render despliega API y web).
4. **Variables de Render (API)**: definir `MFA_ENCRYPTION_KEY` (base64 de 32 bytes) antes de que alguien active MFA; sin ella se deriva de `JWT_SECRET` y rotar ese secreto invalidaría los MFA. `MFA_ENFORCE_SUPERADMIN` queda en `true`.
5. **Verificar**: `/api/health`; ingreso del personal (el SUPERADMIN debe enrolar MFA al entrar); `/solicitud-parroquia`; el enlace de inscripción del evento abierto; `/p` con un código.

## Rollback

- Restaurar la rama/PITR del paso 1 (se pierden las escrituras posteriores a la migración) y volver a desplegar `origin/main`.
- Alternativa manual: cada migración documenta su reversión conceptual en su encabezado.

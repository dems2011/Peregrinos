# Plan de publicación — B5 (herramientas parroquiales) + Fase 6 (fondo)

Preparado: 2026-10-13. Commits locales creados (punto 3). **Sin push ni cambios en Neon o Render**: producción sigue
en `372bec0` y Neon en 26/27 (pendiente solo `20261018000000_parish_tools`, comprobado con `prisma migrate status`
contra el endpoint de producción `ep-patient-dew-…b9zi`).

## 1. Qué se publica
| Parte | Requiere |
|---|---|
| API: agenda, donaciones, boletín, certificados, inventario, grupos, transmisiones, seguimiento GPS, portadas, preferencias | **Migración 27** `20261018000000_parish_tools` en Neon **antes** del push |
| Web: pantallas de los módulos, perfil público, «Mis parroquias», «Compartir mi ubicación», fondo en `/login` e `/invitacion` | Solo el push (Render compila Next) |
| APK 1.2 (GPS con la pantalla apagada) | Aparte, después: `scripts/android-background-gps.ps1` (docs/GPS-SEGUNDO-PLANO.md) |

La migración 27 es **solo aditiva**: tablas y tipos nuevos, columnas nuevas con valor por defecto
(`Event.trackingEnabled`, `Invitation.declinedAt`, `Organization.timezone`, `ParishFollower.bulletinEmail`) y dos valores
nuevos del enum `NotificationKind`. No borra ni reescribe datos y el código actual (`372bec0`) sigue funcionando con
ella aplicada. Al revés no: el código nuevo **sin** la migración da 500 en perfiles, eventos y avisos.

## 2. Verificado en local (2026-10-13)
- `tsc` web y API sin errores; `next build` y build de la API correctos.
- Pruebas automáticas de la API: **426/426** (18 nuevas en `test/b5-modules.test.ts`).
- E2E contra la base aislada (27/27 migraciones, puerto 5433) a través del proxy `/api` del web:
  - Módulos y perfil público: **30/30** (permisos, validaciones, aislamiento de lo interno, certificados, EN VIVO).
  - Preferencia del boletín por correo (interfaz + API + publicación con correo): **18/18**.
  - «Compartir mi ubicación» en el navegador (envío, intervalo, vista de la organización, borrado): **10/10**.
- Prueba visual: 14 pantallas × celular 390, tableta 820 y computadora 1440 → sin errores de JavaScript, sin
  peticiones fallidas y sin desplazamiento horizontal. Fondo: 8 tamaños de pantalla (docs/FONDO.md).
- **No verificado**: GPS con la pantalla apagada (requiere APK 1.2 en el teléfono); envío real del boletín por correo
  (en local no hay SMTP; producción sí lo tiene según `/api/health`); verificación de EN VIVO con YouTube (sin
  `YOUTUBE_API_KEY`).

## 3. Commits propuestos (en este orden; cada uno compila)
1. `feat(api): herramientas parroquiales B5 — agenda, donaciones, boletín, certificados, inventario, grupos, transmisiones y seguimiento GPS`
   `apps/api/**` (incluye la migración 27 y `test/`), `packages/shared/**`.
2. `feat(web): pantallas B5, preferencia del boletín por correo y fondo fotográfico en el acceso`
   `apps/web/src/**`, `apps/web/public/fondo/**`, `assets/original/peregrinos.jpg`, `scripts/generate-background.cjs`, `docs/FONDO.md`.
3. `feat(android): GPS en segundo plano preparado (plugin background-geolocation, script de la APK 1.2)`
   `package.json`, `package-lock.json`, `scripts/android-background-gps.ps1`, `docs/GPS-SEGUNDO-PLANO.md`.
4. `docs: estado del producto y plan de publicación B5`
   `docs/ESTADO-PRODUCTO.md`, `docs/PUBLICACION-B5.md`, `docs/PARROQUIAS-CODIGO-QR.md`.

**No se suben** (como hasta ahora): `android/`, `apps/web/android/`, `apps/web/next.config.ts`, `capacitor.config.ts`,
`.e2e-local/`, `.claude/`.

## 4. Pasos de publicación (los ejecuta el usuario)
1. **Respaldo de Neon**: en la consola de Neon, crear la rama `pre-migracion-27` desde `main` (como `pre-migracion-25-26`).
2. **Migración**: `npm run db:deploy -w @peregrinos/api` con el `.env` de producción. Comprobar «27 migrations found …
   applied» y que `npx prisma migrate status` (en `apps/api`) diga *Database schema is up to date*.
3. **Commits** del punto 3 y **push**: `git push origin main`. Render despliega la API y el web (~2–4 min).
4. **Render (opcional)**: `YOUTUBE_API_KEY` para verificar EN VIVO con YouTube (SMTP ya está configurado).

## 5. Verificación en producción (después del despliegue)
Solo lectura, sin crear datos:
- `GET https://peregrinos.onrender.com/api/health` → `status: ok`; ambos servicios en el commit nuevo en Render.
- `GET /api/public/parishes/<id>` → 200 con `livestream`, `schedule`, `campaigns`, `bulletins`.
- Web: `/login` con la foto (celular y computadora), `/parroquias?codigo=PAR-176818`, `/certificados`,
  `/cuenta/parroquias` con la casilla del boletín, `Configuración` con los módulos para el SUPERADMIN.
Con datos (lo decide el usuario): crear una entrada de agenda y una campaña oculta, verlas y borrarlas.

## 6. Vuelta atrás
- Código: `git revert` de los commits y push (la migración puede quedar: es aditiva y compatible con `372bec0`).
- Base: solo si hiciera falta, restaurar desde la rama `pre-migracion-27` (se perderían los datos cargados después).

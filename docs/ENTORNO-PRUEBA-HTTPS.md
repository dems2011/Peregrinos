# Entorno de pruebas con HTTPS (preparación; NO creado)

**Estado (2026-10-26):** configuración y pasos listos. **No se creó ningún servicio**: hace falta el acceso del
propietario a la cuenta del proveedor (Claude no tiene credenciales de Render, Railway ni Cloudflare) y, si hay costo, su
autorización económica. Precios consultados el 2026-10-26 en las páginas oficiales (pueden cambiar):
[render.com/docs/free](https://render.com/docs/free), [railway.com/pricing](https://railway.com/pricing).

## Para qué

Probar con HTTPS real lo que no se puede en local: la app Android (variante PRUEBA; las cookies `Secure` y
`cleartext: false` exigen HTTPS), la integración SIGyP contra un dominio desplegado, la CSP detrás de un proxy real y la
medición de `TRUST_PROXY` sin tocar producción. **Solo datos sintéticos.**

## Opciones

| Opción | Costo previsto | Ventajas | Riesgos / límites |
|---|---|---|---|
| **A. Railway — prueba gratuita** (recomendada) | **0 USD**: crédito único de 5 USD por 30 días, sin tarjeta. Límites: 2 vCPU / 1 GB por servicio. Pasado el mes: plan Free (0 USD, 1 USD de crédito mensual, 1 vCPU / 0,5 GB) o Hobby (5 USD/mes con 5 USD de consumo incluido) | Es el proveedor elegido para después del piloto: sirve también de ensayo de `PLAN-RAILWAY.md`. Base PostgreSQL propia del entorno (sin Neon ni datos reales) | Si el consumo supera el crédito, los servicios se detienen (no se cobra sin tarjeta). **Pasar a Hobby = gasto: detenerse y pedir autorización** |
| B. Render gratuito (cuenta actual) | 0 USD | Mismo proveedor que producción | **Las 750 horas gratuitas por mes son del espacio de trabajo y se comparten con la producción: si se agotan, Render suspende TODOS los servicios gratuitos hasta el mes siguiente.** Base gratuita: 1 por espacio, vence a los 30 días. **No recomendada** mientras la producción esté en el plan gratuito |
| C. Túnel rápido de Cloudflare desde esta PC | 0 USD, sin cuenta | Inmediato; la pila local (con base desechable y datos sintéticos) queda en una URL `https://…trycloudflare.com` para el teléfono | Expone esta PC a Internet mientras corre (requiere autorización); la URL cambia en cada ejecución (hay que recompilar la APK PRUEBA con la URL nueva); sin garantía de disponibilidad |

## A. Railway (pasos, cuando el propietario dé acceso)

1. 🔒 El propietario crea la cuenta o inicia sesión y activa la prueba gratuita (sin tarjeta). Proyecto nuevo
   «peregrinos-prueba».
2. Servicios (desde el repositorio, rama `piloto-2026-11`; nunca `main` mientras no esté publicada):
   - **PostgreSQL** (plantilla de Railway): base propia del entorno.
   - **api**: compilación `npm ci && npm run build:shared && npm run db:generate -w @peregrinos/api && npm run build -w @peregrinos/api`;
     inicio `npm run start -w @peregrinos/api`; salud `GET /api/health`.
   - **web**: compilación `npm ci && npm run build:shared && npm run build -w @peregrinos/web` con `API_URL` definida en la
     compilación; inicio `npm run start -w @peregrinos/web` (usa `PORT`).
3. Variables (por nombre; valores NUEVOS, nunca los de producción):
   - api: `DATABASE_URL` (la de la base de Railway), `JWT_SECRET` (nuevo, ≥ 32), `MFA_ENCRYPTION_KEY` (nueva),
     `NODE_ENV=production`, `WEB_ORIGIN=https://<dominio de la web de prueba>`, `COOKIE_SECURE=true`,
     `PILGRIM_EMAIL_VERIFICATION=required`; **sin** `SMTP_URL` real (o un buzón de pruebas), **sin**
     `FIREBASE_SERVICE_ACCOUNT` de producción, **sin** `ANTHROPIC_API_KEY`. Para medir `TRUST_PROXY`:
     `PROXY_DIAG_TOKEN` temporal (`docs/MEDICION-TRUST-PROXY.md`).
   - web: `API_URL=<URL interna o pública de la api>`, `CSP_MODE` sin definir (informe) y luego `enforce`.
4. Migraciones: paso manual contra la base de prueba (`npx prisma migrate deploy` con su `DATABASE_URL`), nunca al
   iniciar. Datos: organización, personal y peregrinos sintéticos creados por la API (no copias de producción).
5. Verificación: `/api/health`, ingreso del personal, CSP con navegador
   (`scripts/csp-navegador.mjs` adaptado a la URL), E2E de sesiones y de seguridad apuntando a la URL, integración SIGyP
   (SIGyP local con `baseUrl` = la URL de prueba), APK PRUEBA con `--url https://<web de prueba>`.
6. Al terminar: detener o borrar los servicios para no consumir crédito.

## C. Túnel rápido (para la APK PRUEBA en un teléfono, si se autoriza exponer la PC)

1. Pila local: `bash .e2e-local/run-pg.sh …` deja la API en `127.0.0.1:4555` con PostgreSQL desechable y datos
   sintéticos; la web compilada con `API_URL=http://127.0.0.1:4555` y `next start -p 3000`.
2. 🔒 Instalar `cloudflared` (descarga oficial de Cloudflare) y ejecutar `cloudflared tunnel --url http://localhost:3000`.
   Anotar la URL `https://…trycloudflare.com`.
3. `node scripts/android-prueba.mjs --url https://<url del túnel>` (rechaza dominios de producción).
4. Cerrar el túnel al terminar (la PC deja de ser accesible).

## Lo que NO se hace en ningún caso

Usar datos de producción, copiar variables secretas de producción, registrar el entorno en el Firebase de producción,
apuntar la APK de producción al entorno de prueba, o pasar a un plan pago sin autorización económica explícita.

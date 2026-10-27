# Variables de entorno — Peregrinos en Render (piloto 2026-11)

**Sin valores secretos.** Nombres verificados contra `apps/api/src/config.ts` (validación al iniciar),
`apps/web/next.config.mjs` y `apps/web/src/middleware.ts` en el commit candidato. Producción hoy (solo lectura, 2026-10-27):
API `https://peregrinos.onrender.com` (`/api/health` → `mail: smtp`, `push: fcm`), web `https://peregrinos-1.onrender.com`.
**Ninguna variable de Render se modificó.** Cambiar cualquiera de producción requiere autorización expresa.

## API (servicio `peregrinos`)

| Variable | Finalidad | Obligatoria | Producción | Pruebas |
|---|---|---|---|---|
| `DATABASE_URL` | PostgreSQL (Neon con *pooler*) | Sí | Secreta, la actual | Base propia del entorno, nunca Neon de producción |
| `JWT_SECRET` | Firma de sesiones (≥ 32 caracteres) | Sí | Secreta, la actual (cambiarla cierra todas las sesiones) | Nueva |
| `MFA_ENCRYPTION_KEY` | Cifrado de secretos TOTP (base64 de 32 bytes) | Recomendada | Secreta; sin ella se deriva de `JWT_SECRET` | Nueva |
| `NODE_ENV` | `production` | Sí | `production` | `production` |
| `PORT` | Puerto (lo fija Render) | No | Render | El del alojamiento |
| `WEB_ORIGIN` | Origen permitido por CORS y enlaces de correo | Sí | `https://peregrinos-1.onrender.com` (o el dominio definitivo) | URL de la web de prueba |
| `COOKIE_SECURE` | Cookies `Secure` | Sí en HTTPS | `true` | `true` |
| `SMTP_URL`, `MAIL_FROM` | Correo (verificación, recuperación) | Sí para fieles | Secreta / la actual | Buzón de pruebas o sin correo |
| `FIREBASE_SERVICE_ACCOUNT` | Push FCM (base64 de la cuenta de servicio) | Para push | Secreta, la actual | **Nunca** la de producción |
| `PILGRIM_EMAIL_VERIFICATION` | `required` exige correo verificado | No (por defecto `required`) | `required` | `required` |
| `ACCESS_TTL_MIN`, `REFRESH_TTL_DAYS`, `INVITE_TTL_DAYS`, `PILGRIM_SESSION_DAYS` | Vigencias | No (15 / 14 / 7 / 60) | Por defecto | Por defecto |
| `TRUST_PROXY` | Saltos o lista de IP/CIDR de proxies propios | **No fijar sin medir** | Sin definir hoy (= `true`, advierte al iniciar). Medir con `docs/MEDICION-TRUST-PROXY.md` | Medir allí primero |
| `PROXY_DIAG_TOKEN` | Diagnóstico temporal de proxy (≥ 32) | No | Solo durante la medición, luego quitar | Igual |
| `UPLOAD_DIR` | Comprobantes antiguos en disco | No | Solo si existen | No |
| `YOUTUBE_API_KEY` | Transmisiones | No | Secreta, opcional | No |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Informe de evento con IA | No (costo por uso) | Decisión de costo | No |

No usar en producción: `SEED_PASSWORD` (semilla de desarrollo), `PLATFORM_ADMIN_*` (solo para el script de alta del
administrador de la plataforma, en la máquina de quien lo ejecuta).

## Web (servicio `peregrinos-1`)

| Variable | Finalidad | Obligatoria | Producción | Pruebas |
|---|---|---|---|---|
| `API_URL` | Destino de la reescritura `/api/*` (**en la compilación**) | Sí fuera de Render | Sin definir: con `RENDER=true` usa `https://peregrinos.onrender.com` | URL de la API de prueba |
| `NODE_ENV` | `production` | Sí | `production` | `production` |
| `CSP_MODE` | CSP con nonce: sin definir = solo informe; `enforce` = aplicada; `off` = sin CSP | No | Empezar sin definir; `enforce` tras observar la consola sin violaciones (web y app) | `enforce` (probado localmente en navegador y en el teléfono) |

## Lo que la versión candidata agrega

Ninguna variable nueva. Los turnos y las solicitudes usan las existentes; el push del sacerdote y del fiel usa
`FIREBASE_SERVICE_ACCOUNT`, que producción ya tiene (`push: fcm`).

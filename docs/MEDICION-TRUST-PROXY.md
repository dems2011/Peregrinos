# Medir `TRUST_PROXY` en Render (procedimiento; NO ejecutado)

**Estado (2026-10-26):** preparado. Requiere autorización expresa para cada paso marcado 🔒 (cambian variables de
producción y provocan un redespliegue). Nada de esto se hizo.

## Por qué

Hoy la API corre con `trustProxy: true` (sin `TRUST_PROXY`): cree cualquier `X-Forwarded-For` que mande el cliente, así
que el límite de intentos por IP (login, reautenticación, canjes) se elude cambiando ese encabezado (prueba `s2`). El
valor correcto depende de la topología REAL y no se fija por suposición (D6).

Hechos ya medidos o verificados:
- **Next 15.5.27 no agrega ninguna entrada** a `X-Forwarded-For` en la reescritura `/api` (`scripts/medir-xff-next.mjs`,
  2026-10-26).
- En Render la web llama a la API por su **URL pública** (`next.config.mjs`: `RENDER_API_URL`), así que una petición de
  la web atraviesa el borde de Render dos veces: borde de la web (agrega la IP del cliente) → Next → borde de la API
  (agrega la IP de salida de la web) → API. La API también es alcanzable directamente desde Internet.
- Por eso un **número de saltos es eludible** (llamada directa a la API con un encabezado inventado, `s2`). Lo seguro es
  una **lista de IP/CIDR** de los proxies propios (bordes internos de Render + IP de salida de la web), a confirmar.

## Herramienta (en la candidata, desactivada por defecto)

`GET /api/diag/proxy` (`apps/api/src/lib/proxy.ts`): **solo existe** si la API arranca con `PROXY_DIAG_TOKEN`
(≥ 32 caracteres) y **solo responde** si la petición trae ese mismo valor en `x-diag-token` (si no, 404). Devuelve lo que
vio ESA conexión: `socket` (IP del socket), `xForwardedFor` (cadena recibida), `ip` e `ips` (lo que calcula Fastify con
la configuración vigente). Sin efectos, sin caché, límite de 20 por minuto. Prueba: `s2` (404 sin el token exacto).

## Procedimiento

Requisito: la candidata (`piloto-2026-11`) desplegada en Render (la ruta no existe en el código anterior).

1. Generar el token localmente (no se comparte ni se guarda en el repositorio):
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. 🔒 Render → servicio API «Peregrinos» → Environment → agregar `PROXY_DIAG_TOKEN=<token>` (sin tocar `TRUST_PROXY`).
   Render redespliega solo; esperar «Live» y que `/api/health` responda (arranque en frío ~45–85 s en el plan gratuito).
3. Desde una PC con IP pública conocida (anotar la IP), en PowerShell:
   ```powershell
   $T = "<token>"
   $h = @{ "x-diag-token" = $T }
   $hf = @{ "x-diag-token" = $T; "x-forwarded-for" = "203.0.113.7" }   # dirección de documentación (falsa)
   Invoke-RestMethod https://peregrinos.onrender.com/api/diag/proxy -Headers $h      # A: directo a la API
   Invoke-RestMethod https://peregrinos.onrender.com/api/diag/proxy -Headers $hf     # B: directo, encabezado falso
   Invoke-RestMethod https://peregrinos-1.onrender.com/api/diag/proxy -Headers $h    # C: a través de la web (/api)
   Invoke-RestMethod https://peregrinos-1.onrender.com/api/diag/proxy -Headers $hf   # D: web, encabezado falso
   ```
   Repetir C dos o tres veces (la IP de salida de la web puede variar). Anotar `socket` y `xForwardedFor` de cada uno
   (sin publicar IPs personales).
4. Interpretar (esperado, a CONFIRMAR con lo medido):
   - A: `xForwardedFor` = `<tu IP>`; `socket` = una IP interna de Render.
   - C: `xForwardedFor` = `<tu IP>, <IP de salida de la web>`.
   - B/D: el valor falso aparece a la IZQUIERDA de lo que agregó Render.
   El valor a fijar es la lista de los proxies propios a la DERECHA de tu IP en C: el rango de los `socket` internos
   observados y la(s) IP de salida de la web (Render publica las IP de salida por región en el panel del servicio:
   «Outbound IP addresses»; usar esas, no las observadas una vez).
5. 🔒 Fijar `TRUST_PROXY=<rango interno>,<IP de salida de la web…>` en el servicio API. Redespliega.
6. Verificar repitiendo A–D: en C y D `ip` debe ser **tu IP real**; en B debe ser tu IP real (no `203.0.113.7`); y la
   advertencia «TRUST_PROXY no está fijado» debe desaparecer del registro de arranque.
   Si `ip` sale igual a la IP de salida de la web para C → falta esa IP en la lista (todos compartirían IP: bloqueos
   cruzados). Si sale `203.0.113.7` → la lista incluye algo que no es propio (eludible): corregir.
7. 🔒 Quitar `PROXY_DIAG_TOKEN` (redespliega) y comprobar que `/api/diag/proxy` responde 404 aunque se envíe el token.
8. Anotar en este documento el valor y la evidencia (sin IPs personales) y actualizar `PLAN-RAILWAY.md` §5.

## Riesgos

- Cada cambio de variable redespliega la API (corte breve; en el plan gratuito, arranque en frío).
- Si la lista queda mal, el límite por IP afecta a todos a la vez (falta una IP) o vuelve a ser eludible (sobra una):
  por eso el paso 6 es obligatorio y la reversión es quitar `TRUST_PROXY` (vuelve al comportamiento de hoy).
- El token da acceso solo a la IP de quien lo usa; aun así se elimina al terminar (paso 7).

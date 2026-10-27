# Piloto 2026-11 — informe de salida (2026-10-27)

**Veredicto: el piloto sigue BLOQUEADO.** El código, la integración y las pruebas locales están completos y aprobados;
faltan validaciones que requieren privilegios, dispositivos con push o autorizaciones de producción (ver «Bloqueos»).
Nada se publicó, desplegó, migró en producción ni se cambió en Render o Neon.

## Versiones

| Componente | Rama | Commit | Notas |
|---|---|---|---|
| Peregrinos (API + web + app) | `piloto-2026-11` = `sigyp-integracion` | ver `git log -1` (sobre `d9fef30`) | `origin/main` = `1d70547` (producción, sin cambios) |
| Sitio institucional | `sitio-institucional` (worktree `Peregrinos-sitio`) | rebasado sobre la candidata | **fuera del piloto** |
| SIGyP | `cierre-piloto-2026-11` | ver `git log -1` (sobre `31b188d`) | sin remoto |

## Artefactos (`C:\Proyectos\_salidas\piloto-2026-11\`)

| Componente | Versión / commit | Artefacto | SHA-256 | Pruebas aprobadas | Pendientes | Estado | Siguiente acción |
|---|---|---|---|---|---|---|---|
| SIGyP instalador | `0.1.0+31b188d` | `sigyp\paquete-pruebas\` (perfil pruebas; 19 122 archivos) | manifiesto `ad490f54…336c` | Empaquetado sin red; 16/17 pruebas del instalador sin servicios + arranque real del paquete 7/7; precondiciones del banco 7/8 | Banco V1–V12/V14 con servicios reales; V13 en VM | **BLOQUEADO** (consola de administrador; VM) | Ejecutar el banco en una consola de administrador (comando en `GestionParroquial/docs/PILOTO-2026-11-INSTALACION.md`) |
| APK de prueba | 1.1 (3), `com.peregrinos.app.prueba` | `android\peregrinos-PRUEBA-local-1.1-debug.apk` | `9438dec7…545d` | **Teléfono físico** Samsung SM-A346M Android 16: ingreso del sacerdote, aceptar y rechazar turnos (verificado en la base), solicitud del fiel enviada y respondida, avisos, reapertura con sesión, cierre de sesión, desinstalación sin tocar la app real | Push (sin Firebase en esta variante); HTTPS; cámara/ubicación/descargas | **APROBADO** (local por USB) | — |
| APK candidata de producción | 1.2 (4), `com.peregrinos.app` | `android\peregrinos-1.2-4-candidata.apk` | `1716f67a…4269` | Paquete, versión, URL de producción, firma con la clave existente (`b2eae517…`, v2) verificados con `aapt`/`apksigner` | Instalación en dispositivo; push real; actualización desde una 1.1 firmada en producción | **NO VERIFICADO** | Decidir qué hacer con las 1.1 de depuración instaladas (firma distinta: exige desinstalar); prueba de push autorizada |
| Peregrinos web/API | candidata | compilación `next build` + API `tsc` | — | API 539/539; tsc 0; CSP con navegador 27/27; sesiones PG18 34/34; turnos PG18 33/33; x1 real con SIGyP 7/7 + 29/29 (PGlite y PG18); migraciones 27→31→reversión→31 31/31 | Validación en un entorno HTTPS; despliegue en Render | **NO VERIFICADO en HTTPS** | Autorizar el entorno de prueba HTTPS (Railway prueba gratuita) o el despliegue |
| SIGyP | `31b188d`+ | código + 3 migraciones locales | — | core 77, api 234 (6 omitidas por diseño), web 21; typecheck; ESLint; `next build`; p3 11/11; p4 7/7 | Instalación en PC limpia | **APROBADO localmente** | Banco del instalador |

## Separación pedida

- **Implementado:** turnos del sacerdote (SIGyP → Peregrinos → decisión → SIGyP), «Mi agenda» del sacerdote, bandeja y
  push del personal, solicitudes de los fieles (Peregrinos → SIGyP → estado y mensaje → Peregrinos), avisos dentro de
  SIGyP («Mis avisos» y campana), migraciones con reversión, APK candidata, paquete del instalador.
- **Probado localmente:** todo lo de la tabla (bases PostgreSQL 18 desechables, PGlite, `gp_test`, navegador real).
- **Probado en un entorno HTTPS:** nada (no existe el entorno; ver `ENTORNO-PRUEBA-HTTPS.md`).
- **Probado en un dispositivo físico:** APK de PRUEBA contra el servidor local por USB (HTTP a `localhost`).
- **Desplegado en producción:** nada. Producción sigue en `1d70547` (comprobado solo con lecturas: `/api/health` 200,
  `push: fcm`; las rutas nuevas responden 404).
- **Requiere autorización:** push a `main`, migraciones 28–31 en Neon (con rama de respaldo), despliegue en Render,
  entorno HTTPS de prueba, prueba de push real, distribución de la APK 1.2, banco del instalador con servicios.

## Defectos encontrados y corregidos en este ciclo

1. Cursor de decisiones de turnos: dos decisiones simultáneas podían confirmarse en orden inverso y SIGyP saltarse una
   → altas serializadas por organización (`pg_advisory_xact_lock`), también para las solicitudes.
2. SIGyP: un CHECK aceptaba un rechazo sin autor (lógica de tres valores de SQL) → migración correctiva.
3. SIGyP: «Recibida» quedaba en la bandeja de salida hasta el ciclo siguiente → se entrega en la misma consulta.
4. SIGyP: la entrega inmediata omitía lo recién encolado si el reloj de la base iba adelantado → margen de 30 s.
5. App de PRUEBA (teléfono): sin Firebase, conceder el permiso de notificaciones **cerraba la app** y perdía la sesión →
   la variante de prueba ya no registra el plugin de push.
6. App/web (teléfono): un fiel con sesión vigente debía volver a ingresar cada vez que reabría la app → la pantalla de
   ingreso lo lleva a su cuenta.
7. Aviso de solicitud: enlazaba a la parroquia en vez de a «Mis solicitudes».

## Bloqueos (dependencia concreta)

| Bloqueo | Falta |
|---|---|
| Banco del instalador con servicios reales | Consola de administrador en esta PC (o la PC de prueba) |
| Reinicios de Windows (V13) / PC limpia | Una máquina virtual o una PC de prueba |
| Push real en Android | Publicar la candidata en Render (producción ya tiene FCM) y un envío de prueba controlado, o un proyecto Firebase de prueba para `com.peregrinos.app.prueba` |
| Entorno HTTPS de prueba | Acceso del propietario a Railway (prueba gratuita) o autorización para un túnel que expone esta PC |
| APK 1.2 sobre la 1.1 | Decisión: las 1.1 instaladas son de depuración (otra firma) |
| Producción | Autorización expresa para cada paso de `MIGRACION-PRODUCCION-28-29.md` |

## Lista de inicio del piloto (cuando se autorice)

1. Verificar `git ls-remote origin refs/heads/main` = `1d70547`.
2. Rama de Neon de respaldo + `pg_dump` cifrado → ensayo de las migraciones 28–31 en esa rama → `migrate deploy` en
   producción con el código anterior todavía activo → verificaciones del procedimiento.
3. Push de la candidata a `main` (Render despliega). Verificar `/api/health`, ingreso, rutas nuevas con 401/403 sin
   sesión, `CSP_MODE` sin definir (informe) → observar → `enforce`.
4. Medir `TRUST_PROXY` (`MEDICION-TRUST-PROXY.md`) antes de fijarlo.
5. Vincular SIGyP de la parroquia piloto con un código nuevo que incluya `turns:write` y `requests:sync`.
6. Instalar la APK 1.2 en los teléfonos del piloto (desinstalando la 1.1 de depuración si la tienen) y probar push.
7. Primer día: revisar registros de Render, la bandeja de salida de SIGyP y los avisos.

## Suspensión del piloto

- **Código:** volver a desplegar el commit anterior en Render (compatible con el esquema migrado: ensayo 3b).
- **Integración:** desvincular en SIGyP (revoca la credencial en Peregrinos); SIGyP sigue funcionando solo.
- **Esquema:** solo si hiciera falta y antes de que existan datos: scripts de reversión en orden inverso (se abortan solos
  si hay datos). **Datos:** restaurar la rama de Neon de respaldo (con pérdida de lo escrito después).
- **App:** las 1.2 instaladas apuntan a Render; con el código anterior desplegado siguen funcionando sin turnos ni
  solicitudes.

## Railway (después del piloto)

Sin cambios de criterio: `PLAN-RAILWAY.md` (costos, variables, dominio, `TRUST_PROXY`, reversión) y
`ENTORNO-PRUEBA-HTTPS.md`. No se migró nada. La app 1.2 apunta a `peregrinos-1.onrender.com`: migrar el dominio exige una
versión nueva de la app y mantener Render mientras los usuarios actualizan.

## Documentos de entrega

`PILOTO-2026-11-VARIABLES.md` (variables sin secretos), `PILOTO-2026-11-APK.md` (APK: variantes, prueba, firma),
`MIGRACION-PRODUCCION-28-29.md` (migraciones 28–31 y reversión), `INTEGRACION-SIGYP.md` (integración, turnos),
`GestionParroquial/docs/PILOTO-2026-11-INSTALACION.md` (instalación y actualización de SIGyP),
`GestionParroquial/docs/CONTRATO-SIGYP-PEREGRINOS.md` (contrato). Evidencia: `C:\Proyectos\_salidas\piloto-2026-11\evidencia\`.

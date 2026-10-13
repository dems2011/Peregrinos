# Código institucional, búsqueda, QR y cartel de la parroquia (B4)

Fecha: 2026-10-12. En producción desde `372bec0` (migraciones 25 y 26 aplicadas en Neon el 2026-10-12).

## Código institucional
- Formato `PAR-` + 6 dígitos (p. ej. `PAR-482193`): corto, se dicta como números, ~900.000 combinaciones, sin datos
  de la parroquia. Es público: sirve para buscar y enlazar, **nunca** como contraseña ni para dar permisos.
- Lo asigna la base (`gen_parish_code()`, migración `20261016000000_parish_code`) a toda organización nueva, por
  cualquier camino de alta (bootstrap, solicitud aprobada por la plataforma). A las existentes se les asigna uno al
  migrar, una por una.
- Garantías en la base: índice único `Organization_code_key`, `CHECK` de formato y trigger que impide cambiarlo.
  Las altas simultáneas se serializan con un bloqueo transaccional: el generador nunca devuelve un código en uso.
- Cambiar nombre, logo o dirección no lo altera. Si alguna vez hiciera falta reasignarlo (p. ej. un código ofensivo),
  se haría con una migración revisada que desactive el trigger para esa fila, nunca desde la app.

## Búsqueda y seguimiento
- `GET /api/public/parishes?q=` busca por nombre o dirección; si `q` es un código completo (`PAR-482193`,
  `par 482193`, `482193`) devuelve **solo** esa parroquia. Solo parroquias aprobadas.
- `GET /api/public/parishes/by-code/:code` → `{ parish: { id, code, name } }` o 404.
- Web `/parroquias` («Buscar mi parroquia»): acepta código; muestra dirección y código en cada resultado y, si hay
  nombres parecidos, pide revisar ciudad y código antes de seguirla. `/parroquias?codigo=PAR-482193` abre el perfil.
- El perfil público, la lista «Mis parroquias» de la cuenta y el editor del superadministrador muestran el código.
- Seguir/dejar de seguir ya existía (B1): `ParishFollower` con clave única (parroquia, cuenta) — sin duplicados — y
  sin ningún permiso administrativo.

## QR y cartel
- `GET /api/public/parishes/:id/qr.svg`: QR del perfil (corrección de errores Q). Codifica
  `<WEB_ORIGIN>/parroquias?codigo=<código>`: un enlace legible y estable, que no depende del id interno.
- `GET /api/organization/poster.pdf?size=A4|A3`: cartel vertical listo para imprimir (marca de Peregrinos, logo o
  inicial, nombre, dirección, invitación, QR, código y dirección web). Solo el SUPERADMIN de la parroquia, solo con la
  parroquia aprobada (antes el perfil no es público y el QR quedaría roto), con límite de frecuencia y auditoría
  (`ORGANIZATION_POSTER_EXPORTED`). Logos PNG/JPEG; un logo WEBP se reemplaza por la inicial (pdfkit no dibuja WEBP).
- En la web: «Perfil de la parroquia» → tarjeta «Código y cartel de la parroquia» (código, copiar, QR, Cartel A4/A3).
  En la APK la descarga del PDF usa el mismo mecanismo que las credenciales (MainActivity guarda en Descargas).

## Pendiente
- **QR de descarga de la app**: no hay una publicación oficial (Play Store ni página de descarga), así que el cartel no
  lo incluye para no confundirlo con el QR de la parroquia. Cuando exista, agregarlo como segundo QR rotulado
  «Descargar la app».
- **Continuar hacia la parroquia después de instalar** (enlace diferido): requiere App Links verificados
  (`assetlinks.json` en el dominio definitivo + intent-filter en la APK) y, para el caso «no instalada», Play Install
  Referrer. Depende del dominio definitivo y de publicar en Play.
- **Dominio**: el QR usa `WEB_ORIGIN` (hoy `https://peregrinos-1.onrender.com`). Imprimir carteles en serie después
  de fijar el dominio definitivo: un cambio de dominio posterior dejaría sin destino los QR ya impresos.
- Diócesis: no existe en el modelo. Los horarios de misa están en la agenda pastoral (B5). Ver docs/ESTADO-PRODUCTO.md.
- Preferencias por parroquia: solo «boletín también por correo» (B5); silenciar avisos sin dejar de seguir no existe.

## Pruebas
- `apps/api/test/b4-parish-code.test.ts` (12): normalización, migración, rutas, generación real de PDF A4/A3.
- Base real (PostgreSQL 18 local): códigos para las 4 organizaciones existentes, 305 altas sin duplicados, trigger,
  CHECK e índice único rechazan cambios, formato inválido y repetidos; renombrar no cambia el código.
- API local y en contenedor: 20/20 (búsquedas por código en 3 formas, homónimas, 404, QR, cartel A4/A3, 401/403/400,
  código inmutable desde el perfil). Interfaz con Chrome sin interfaz: 7/7.

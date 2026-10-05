# Arquitectura internacional: geografía, direcciones e idiomas

Estado: **diseño aprobado, sin implementar.** Nada de este documento existe todavía en Prisma, en la base de datos ni en el código.
Última actualización: 2026-10-05.

Peregrinos es una plataforma internacional desde el primer día. Ningún país es un caso especial del modelo: todos usan
el mismo sistema `Country` + niveles administrativos + `AdministrativeArea` + `Address`.

---

## 1. Decisiones aprobadas

1. **Localidad.** `AdministrativeArea` es una sola tabla para divisiones administrativas y localidades (`kind = ADMIN | LOCALITY`).
2. **Direcciones.** Entidad `Address` reutilizable (parroquia, residencia del peregrino y, más adelante, lugar de un evento),
   con tres partes separadas: administrativa (`countryCode` + `areaId`), textual (`localityText`, `line1`, `line2`, `postalCode`)
   y coordenadas (`latitude`, `longitude`, `geoSource`).
3. **Países.** El modelo es internacional; agregar un país nunca requiere cambiar el modelo de datos ni reescribir la aplicación.
4. **Geografía.**
   - Sin columnas rígidas (`provinciaId`, `partidoId`, `municipioId`, `parroquiaId`, …).
   - Jerarquía mediante `parentId`, que es la **fuente de verdad**. Los niveles pueden saltarse (p. ej. una localidad que cuelga del nivel 2).
   - `path` y `depth` son datos derivados de `parentId`, solo para consultas por prefijo; se regeneran en cada importación.
   - La cantidad y los nombres de los niveles varían por país (`CountryAreaLevel`).
   - Códigos externos en `source` + `sourceId`; identificadores internos estables (UUID) que nunca se reutilizan ni se borran
     (si la fuente elimina un área: `isActive = false`; fusiones: `replacedById`).
5. **Peregrino.** `User.organizationId` puede ser NULL para cuentas PILGRIM (obligatorio para STAFF mediante `CHECK`).
   El peregrino no pertenece a una parroquia: se relaciona con parroquias mediante `Registration` / `Participant` / `Event`.
   Su país y su dirección representan **residencia**, no pertenencia parroquial.
6. **Idiomas.** Iniciales: `es` Español, `en` English, `pt` Português, `it` Italiano. Se eligen en el registro del
   superadministrador y del peregrino, y se cambian en Configuración. El idioma es independiente del país.
   Se guardan como código BCP-47 (texto) validado contra `SUPPORTED_LOCALES` en `packages/shared`; **nunca como enum de Prisma**.
   Agregar un idioma = agregar su código a la lista y su archivo de mensajes.

## 2. Países y territorios prioritarios iniciales

Decisión de producto (2026-10-05). Son los **primeros en prepararse y validarse en G1**. **No son un límite de la
arquitectura**: cualquier otro país se agrega después con datos, sin cambiar el modelo.

Los valores de moneda, prefijo y zona horaria son de referencia y **se validan al implementar G1**.
**Los niveles administrativos de TODOS los países (incluidos Argentina y Venezuela) están pendientes de validación de fuente hasta G1.**
Son referencias de diseño que sirven de orientación; en G1 se validan contra las fuentes geográficas oficiales de cada país y pueden cambiar.

| # | País / territorio | ISO-2 | ISO-3 | Moneda | Prefijo | Zonas horarias | Niveles administrativos (referencia ⏳ pendiente de validación de fuente) |
|---|---|---|---|---|---|---|---|
| 1 | Canadá | CA | CAN | CAD | +1 | Varias | Province/Territory → Census division → Municipality |
| 2 | Estados Unidos | US | USA | USD | +1 | Varias | State → County → Locality |
| 3 | México | MX | MEX | MXN | +52 | Varias | Estado → Municipio → Localidad |
| 4 | El Salvador | SV | SLV | USD | +503 | Una | Departamento → Municipio → Distrito (validar reforma territorial 2024) |
| 5 | Nicaragua | NI | NIC | NIO | +505 | Una | Departamento / Región autónoma → Municipio |
| 6 | Guatemala | GT | GTM | GTQ | +502 | Una | Departamento → Municipio |
| 7 | Panamá | PA | PAN | PAB / USD | +507 | Una | Provincia / Comarca → Distrito → Corregimiento |
| 8 | Venezuela | VE | VEN | VES | +58 | Una | Estado → Municipio → Parroquia |
| 9 | Colombia | CO | COL | COP | +57 | Una | Departamento → Municipio |
| 10 | Ecuador | EC | ECU | USD | +593 | Varias (Galápagos) | Provincia → Cantón → Parroquia |
| 11 | Brasil | BR | BRA | BRL | +55 | Varias | Estado → Município → Localidade |
| 12 | Perú | PE | PER | PEN | +51 | Una | Departamento → Provincia → Distrito |
| 13 | Bolivia | BO | BOL | BOB | +591 | Una | Departamento → Provincia → Municipio |
| 14 | Chile | CL | CHL | CLP | +56 | Varias | Región → Provincia → Comuna |
| 15 | Paraguay | PY | PRY | PYG | +595 | Una | Departamento → Distrito |
| 16 | Argentina | AR | ARG | ARS | +54 | Una | Provincia → Partido/Departamento → Localidad |
| 17 | Uruguay | UY | URY | UYU | +598 | Una | Departamento → Localidad |
| 18 | Italia | IT | ITA | EUR | +39 | Una | Regione → Provincia/Città metropolitana → Comune |
| 19 | España | ES | ESP | EUR | +34 | Varias (Canarias) | Comunidad Autónoma → Provincia → Municipio |
| 20 | Portugal | PT | PRT | EUR | +351 | Varias (Azores) | Distrito / Região Autónoma → Município (Concelho) → Freguesia |
| 21 | Ciudad del Vaticano | VA | VAT | EUR | +379 (en la práctica +39 06) | Una | Sin divisiones (solo país + dirección textual) |
| 22 | Cuba | CU | CUB | CUP | +53 | Una | Provincia → Municipio |
| 23 | Puerto Rico | PR | PRI | USD | +1 | Una | Municipio → Barrio |
| 24 | República Dominicana | DO | DOM | DOP | +1 | Una | Provincia → Municipio → Distrito municipal |

Ningún nivel administrativo de esta tabla está confirmado: todos (⏳) quedan pendientes de validación de fuente hasta G1. Cuba figuraba dos veces en la lista original: existe una sola vez.

### Puerto Rico y Vaticano
- Ambos tienen **código propio en ISO 3166-1** (`PR`, `VA`), así que son una fila normal de `Country`, seleccionable de
  forma independiente, **sin lógica especial**.
- Puerto Rico además figura en ISO 3166-2 como subdivisión de Estados Unidos (`US-PR`). Ese dato se conserva solo como
  referencia (p. ej. en un campo de metadatos del país), sin crear dependencia de `US` en el modelo ni en la experiencia de usuario.
- El Vaticano no tiene divisiones administrativas: el país más la dirección textual alcanzan, igual que cualquier país
  sin datos geográficos cargados.

## 3. Qué se debe poder definir por país (sin cambiar el modelo)

| Dato | Dónde vive en el diseño |
|---|---|
| Nombre (traducido) | `Country.names` (`{es, en, pt, it, …}`) |
| Código ISO-2 / ISO-3 | `Country.code` (PK) / `Country.iso3` |
| Idioma(s) disponibles | `Country.locales` (lista de códigos BCP-47) y `Country.defaultLocale` — solo para sugerir; la preferencia del usuario es independiente |
| Moneda | `Country.currencyCode` (ISO 4217) |
| Prefijo telefónico | `Country.phonePrefix` |
| Zona(s) horaria(s) | `Country.defaultTimezone` + `Country.timezones` (lista IANA) + `AdministrativeArea.timezone` opcional (nivel 1) |
| Niveles administrativos y sus etiquetas | `CountryAreaLevel` (`kind`, `level`, `labels` por idioma, `isRequired`) |
| Localidades | `AdministrativeArea` con `kind = LOCALITY` |
| Fuentes de datos geográficos | `AdministrativeArea.source` / `sourceId` + configuración del importador por país |

> Respecto del borrador anterior, se agregan `Country.locales` y `Country.timezones` (listas) para cubrir países con
> varios idiomas y varias zonas horarias. Siguen siendo datos: agregar un país no requiere cambiar el esquema.

## 4. Modelo previsto (borrador, sin aplicar)

```
Country             code PK (ISO-2) · iso3 · names Json · locales String[] · defaultLocale · currencyCode
                    phonePrefix · defaultTimezone · timezones String[] · metadata Json? · isEnabled
CountryAreaLevel    countryCode → Country · kind ADMIN|LOCALITY · level Int? · labels Json · isRequired
AdministrativeArea  id (UUID estable) · countryCode → Country · kind · level? · parentId → AdministrativeArea?
                    path · depth · code? (ISO 3166-2) · source · sourceId · name · nameNormalized · names Json?
                    latitude? · longitude? · timezone? · isActive · replacedById?
                    @@unique([countryCode, source, sourceId]) · índices: parentId, (countryCode, kind, level), path
Address             countryCode → Country · areaId → AdministrativeArea? · localityText? · line1? · line2?
                    postalCode? · latitude? · longitude? · geoSource?
Organization  (+)   countryCode? · addressId? @unique · timezone? · currencyCode? · defaultLocale · slug? @unique
User          (+)   preferredLocale (default "es") · residenceAddressId? @unique · documentCountry? · documentType?
                    organizationId pasa a opcional (CHECK: obligatorio para STAFF)
```

Reglas que se validan en el importador y en la API (no en la BD): el hijo pertenece al mismo país que el padre; el nivel
del hijo es mayor que el del padre; una localidad cuelga de una división; `Address.areaId` pertenece a `Address.countryCode`.

## 5. Fuentes de datos geográficos

Estrategia híbrida: **la aplicación consulta solo tablas propias**, nunca un servicio externo durante una petición.
Importadores idempotentes por fuente (no borran: desactivan), ejecutados con aprobación:

- Nombres de países en es/en/pt/it: paquete de datos abiertos (p. ej. `i18n-iso-countries`, MIT).
- Nivel 1 de todos los países: ISO 3166-2 (`iso-codes` de Debian, con traducciones).
- Argentina: Georef (descarga completa de datos abiertos).
- Resto de países prioritarios: GeoNames (CC BY 4.0, exige atribución) u otras fuentes oficiales por país, a validar
  caso a caso; lo que falte se cubre con `localityText` y altas manuales (`source = MANUAL`).
- Descartadas: GADM (prohíbe uso comercial); Google Places y Nominatim/OSM como fuente en tiempo real.

## 6. Tareas pendientes (orden previsto)

- [ ] Commit de la Fase 1 (arquitectura general de eventos).
- [ ] Infraestructura de idiomas: `SUPPORTED_LOCALES` (`es`, `en`, `pt`, `it`), `resolveLocale`, `formatLocale`, mensajes
      `packages/shared/i18n/{es,en,pt,it}.json`, next-intl sin rutas por idioma, utilidad única de formato con `Intl`
      (eliminar `es-AR` y `America/Argentina/Buenos_Aires` fijos).
- [ ] **G1 `geo_catalog`**: `Country`, `CountryAreaLevel`, `AdministrativeArea`, `Address`, enum `AreaKind`.
- [ ] **G1-datos** (script, no migración): cargar y validar primero los **24 países prioritarios** de la sección 2
      (países, moneda, prefijo, zonas horarias; **validar contra fuentes oficiales los niveles administrativos y sus etiquetas en es/en/pt/it de los 24, incluidos AR y VE**); luego divisiones y localidades
      empezando por **AR** y **VE**. Requiere aprobación para descargar fuentes y escribir en Neon.
- [ ] **G2 `organization_geo_i18n`**: columnas de `Organization` y completar la parroquia existente (AR, Buenos Aires, ARS, `es`, `slug`).
- [ ] **G3 `user_locale_residence`**: `preferredLocale`, `residenceAddressId`, `documentCountry`, `documentType`.
- [ ] **G4 `user_pilgrim_without_org`**: `organizationId` opcional + `CHECK` para STAFF.
- [ ] `AreaPicker` (selección encadenada por hijos reales, con "no encuentro mi localidad") y endpoints `/api/geo/*`.
- [ ] **G5 `user_document_unique_scoped`**: unicidad (`documentCountry`, `documentType`, `documentNumber`). ⚠️ elimina un índice: aprobación explícita.
- [ ] **G6 `money_currency`**: `Event.currency`, `PaymentProof.currency`.
- [ ] **G7**: `Event.addressId` (migrar `Event.address/latitude/longitude` de la Fase 1 y `Organization.address`),
      teléfonos E.164, PostGIS, descubrimiento público de parroquias y eventos.

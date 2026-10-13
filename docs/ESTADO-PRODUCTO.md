# Estado del producto Peregrinos (inventario verificado contra el código)

Fecha: 2026-10-13. «Existe» significa que hay código y pruebas en el repositorio; no implica verificación en
producción salvo que se indique. **B5** = paquete de herramientas parroquiales: probado en local (pruebas automáticas,
e2e contra la base aislada y prueba visual en celular, tableta y computadora), **sin publicar**; necesita la migración 27
`20261018000000_parish_tools` en Neon antes del push.

## Pilares y funciones
| Función | Estado | Dónde / nota |
|---|---|---|
| Perfil institucional de la parroquia (nombre, logo, imagen, dirección, contacto, redes, descripción, eventos) | Existe (B1) | `/parroquias/[id]`, editor en Inicio del SUPERADMIN |
| Diócesis | **No existe** | No hay campo ni modelo; requiere decidir si es un texto o una entidad (red de parroquias) |
| Agenda pastoral (misas, confesiones, adoración, catequesis, reuniones, patronales) | **Nuevo (B5)** | `Configuración → Agenda pastoral`; se ve en el perfil público |
| Código institucional único y permanente | Existe (B4, en producción) | `docs/PARROQUIAS-CODIGO-QR.md` |
| Buscar mi parroquia (nombre, ciudad, código, enlace/QR) | Existe (B4, en producción) | `/parroquias`, `?codigo=` |
| Seguir / dejar de seguir | Existe (B1) | `ParishFollower`, sin permisos administrativos |
| Preferencias por parroquia seguida | **Nuevo (B5)** | «Recibir el boletín también por correo» en `/cuenta/parroquias`. Avisos y push siguen ligados a seguir |
| Transmisiones (YouTube) con estado EN VIVO / FUERA DE LÍNEA | **Nuevo (B5)** | Estado manual; verificado con YouTube solo si hay `YOUTUBE_API_KEY` en el servidor |
| Donaciones con enlace de Mercado Pago | **Nuevo (B5)** | Campañas con finalidad y beneficiario; solo dominios de Mercado Pago; Peregrinos no procesa pagos |
| Boletín parroquial | **Nuevo (B5)** | Aviso + push a seguidores y correo opcional a quien lo pidió (producción tiene SMTP según /api/health; el envío real del boletín no se probó) |
| Certificados sacramentales (pedido y seguimiento) | **Nuevo (B5)** | Pedido público con código CERT-XXXX-XXXX + correo; estados con historial |
| Inventario parroquial | **Nuevo (B5)** | Interno, no es público |
| Grupos pastorales y asistencia | **Nuevo (B5)** | Menores con adulto responsable; interno |
| Portada de eventos | **Nuevo (B5)** | Imagen en la base con variantes |
| Fondo fotográfico en las pantallas de acceso | **Nuevo (Fase 6)** | `docs/FONDO.md` |
| Cartel institucional A4/A3 con QR | **Nuevo (B4)** | Sin QR de descarga de la app (no hay publicación oficial) |
| Enlaces profundos / continuar tras instalar | **No existe** | Requiere dominio definitivo + App Links + Play |
| Avisos parroquiales a seguidores | Existe (B1) | `/avisos`, bandeja `/cuenta/avisos`, push FCM |
| Chat del evento | Existe | «Limpiar mensajes anteriores»: solo en ese dispositivo (`localStorage`), nada se borra en la base |
| Contactos del evento | Existe | `/configuracion/contactos` |
| Eventos: tipos, capacidades, ciclo de vida, cupo | Existe (A4) | Cancelar/finalizar; sin borrado (docs/POLITICA-ELIMINACION-EVENTOS.md) |
| Inscripción pública, comprobante y revisión de pagos | Existe | Comprobantes ahora en la base (antes se perdían con el disco) |
| Credencial digital vertical (CR80) estándar o propia | Existe (B1) | PDF 3×3 en A4 |
| Registro de llegadas (QR/manual), puntos de control, mapa y recorrido | Existe | |
| Compartir mi ubicación (opt-in) y personas en vivo en el mapa | **Nuevo (B5)** | Navegador: con la pantalla abierta (probado). Pantalla apagada: APK 1.2 preparada, sin probar en teléfono (docs/GPS-SEGUNDO-PLANO.md) |
| Voluntariado (equipos, zonas, funciones, turnos, consentimiento) | Existe (A5.1) | |
| Informe del evento con IA | Existe | Necesita `ANTHROPIC_API_KEY` en el servidor |
| Cuentas de peregrino, verificación de correo, recuperación | Existe | |
| Roles SUPERADMIN / ADMIN / OPERATOR + plataforma | Existe | SUPERADMIN entra con usuario y contraseña (sin MFA); MFA opcional para el resto |
| Auditoría de acciones administrativas | Existe | `/configuracion/auditoria` |
| Idiomas es/en/pt/it | **Solo infraestructura** | `packages/shared/src/locale.ts` y catálogo de 19 textos; la interfaz está escrita en español y no hay selector de idioma |
| Campañas solidarias, catequesis, intenciones de oración, encuentros juveniles | **No existe** | Se pueden modelar como tipos de evento + capacidades (A4) antes de crear módulos nuevos |
| Eventos compartidos entre parroquias / actividades diocesanas | **No existe** | Requiere la decisión sobre diócesis y un modelo de co-organización |
| Membresías y cobros | **Solo estructura** | `OrganizationSubscription` (estado/proveedor) sin lógica ni rutas. No hay cobros |
| PWA | Existe (manifest e íconos) | |
| Android (Capacitor, FCM, PDF, cámara, ubicación en primer plano) | Existe | APK 1.1 (versionCode 3) firmada; sin publicar en Play. APK 1.2 (GPS en segundo plano): `scripts/android-background-gps.ps1` |
| iOS | **No existe** | |

## Membresías (propuesta, sin activar)
Precios conceptuales planteados: Superusuario US$ 4/mes; administrador o encargado invitado US$ 3/mes. Antes de cobrar:
1. Definir qué queda limitado sin suscripción (nunca la recepción de avisos de los fieles).
2. Proveedor: Google Play Billing es obligatorio para bienes digitales dentro de la APK de Play; en la web, un
   procesador (p. ej. Mercado Pago o Stripe). El modelo ya tiene `provider`, `productId`, `basePlanId`, `externalRef`.
3. Facturación e impuestos por país (Argentina: facturación electrónica AFIP/ARCA), términos y política de reembolsos.
4. Período de gracia y qué pasa con los datos si se cancela (nunca borrarlos).
No se activa nada sin aprobación explícita.

## Orden sugerido (fase G)
1. Publicar B5 + fondo (plan en `docs/PUBLICACION-B5.md`) — migración 27 en Neon primero. Después, APK 1.2.
2. Estabilizar Render (auditoría de configuración y arranque en frío) y fijar el dominio definitivo antes de imprimir
   carteles en serie. Si se quiere, `YOUTUBE_API_KEY` para verificar EN VIVO con YouTube.
3. Preferencias de avisos más finas por parroquia (hoy solo el correo del boletín es opcional).
4. Diócesis y red de parroquias (requiere decisión de modelo).
5. Idiomas: extraer textos por pantalla al catálogo, selector en registro y en Configuración.
6. App Links y publicación en Play (incluye QR de descarga en el cartel).

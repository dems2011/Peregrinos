# Alcance revisado: accesos, invitaciones, tiempo real y app del peregrino

Documento de análisis previo a la Fase 3. Ordena lo pedido, dice qué ya existe, qué falta y qué decisiones se tomaron.

## 1. Lo que se pidió, en orden
1. **Una sola app, dos modos.** Al entrar, la persona llega al modo *administración/operación* o al modo *peregrino*, según quién es.
2. **Invitar por correo.** Un administrador escribe el correo de otra persona, elige su nivel de acceso y le llega una invitación para crear su clave.
3. **Niveles de acceso a medida.** Por ejemplo: "puede agregar participantes", "solo chequea llegadas en su punto".
4. **Tiempo real en el punto.** Si hay 2 o 3 personas chequeando en el mismo punto, cuando una confirma una llegada, esa persona aparece tildada de inmediato en los otros teléfonos y no se puede repetir.
5. **Interfaz del peregrino.** Mostrar su QR con sus datos y pestañas con información de los administradores/contactos a los que puede recurrir en determinados puntos.

## 2. Qué ya existe y qué falta (estado tras la Fase 2)
| Pedido | Estado | Detalle |
|---|---|---|
| Roles y permisos en el servidor | Hecho | 3 roles fijos: Superadmin, Administrador, Operador. |
| Operador asignado a uno o varios puntos | Hecho | Solo puede registrar en sus puntos. |
| Evitar repetir una llegada | Hecho | El servidor lo impide aunque 3 teléfonos escaneen a la vez (índice único + respuesta `ALREADY_CHECKED_IN`). |
| Crear usuarios | Parcial | Solo el Superadmin los crea y les pone la clave. **No hay invitación por correo.** |
| Niveles a medida | **Falta** | Hoy el nivel es solo el rol; no se puede dar "agregar participantes" a un operador. |
| Tiempo real entre teléfonos | **Falta** | Hoy cada teléfono se entera al volver a consultar. No hay actualización automática. |
| Interfaz del peregrino | **Falta** | Solo se dejó el modelo preparado. No hay forma de que un peregrino entre. |
| Contactos de la organización | **Falta** | No existe la entidad. |
| Un solo login que distingue modos | **Falta** | El login actual es solo para personal. |

No se te pasó por alto: la versión inicial dejaba la interfaz del peregrino para después y el tiempo real no estaba especificado. Se incorporan ahora, dentro de la Fase 3.

## 3. Decisiones (cambian poco o nada lo que describiste)
**A. Niveles de acceso = rol base + permisos extra.** Se mantienen los 3 roles y se agregan permisos que el administrador activa persona por persona:
- *Agregar participantes* · *Ver historial* · *Ver reportes*.
- Niveles listos para elegir al invitar: **Operador de punto** (solo chequea), **Operador con altas** (chequea y agrega participantes), **Administrador** (gestiona personas, puntos, historial, reportes), **Superadministrador** (todo, incluido usuarios).
- Regla de seguridad: nadie puede invitar a un nivel superior al suyo. El Superadmin invita a cualquier nivel; el Administrador solo a niveles de operador.

**B. Invitación por correo.** Se crea una invitación con correo, nivel, evento y puntos asignados. Llega un enlace de un solo uso que vence en 7 días; al abrirlo la persona elige su clave y entra. Se puede reenviar o revocar. Si el correo no llega, el administrador puede copiar el enlace y mandarlo por WhatsApp. Requiere un servidor de correo (SMTP, por ejemplo Resend, Brevo o Gmail empresarial); en desarrollo el enlace se imprime en la consola.

**C. Cómo entra un peregrino.** Sin usuario ni clave: con un **enlace personal** (y un **código corto** de respaldo) que la organización le envía por WhatsApp/SMS/correo o imprime en su credencial. No se usa solo el DNI porque es fácil de adivinar y expondría el QR de otra persona. El administrador puede reemitir el enlace si se pierde. Aviso honesto: quien tenga el QR puede hacerse pasar por esa persona, por eso el operador ve nombre y documento para verificar.

**D. Un solo login, dos destinos.** La pantalla de inicio de la app lleva a: *Personal* (correo + clave) o *Peregrino* (abrir su enlace o ingresar código). Cada modo se abre en su propio espacio y el peregrino nunca ve pantallas ni datos de administración.

**E. Tiempo real con SSE.** El servidor mantiene una conexión abierta con cada teléfono conectado a un evento y le avisa al instante: *llegada registrada*, *llegada anulada*, *conflicto*, *contador de punto*. Es simple, se recupera sola si se corta y no requiere servicios extra. Si algún día hay varios servidores, se agrega PostgreSQL LISTEN/NOTIFY.
- Con señal: lo que confirma un teléfono aparece tildado en los otros en menos de un segundo.
- **Sin señal:** un teléfono no puede enterarse de lo que pasa en otro. Si dos registran a la misma persona sin conexión, al sincronizar queda como *conflicto* y el administrador lo resuelve (ya está construido). Es una limitación física, no de la app.

**F. QR del peregrino disponible sin internet.** Su pantalla "Mi QR" se guarda en el teléfono (PWA) la primera vez que abre el enlace, para que funcione aunque no haya señal en el recorrido.

**G. Pestañas del peregrino.** *Mi QR* (número grande, nombre, QR) · *Recorrido* (puntos, cuáles ya pasó y a qué hora, progreso) · *Contactos* (organizadores y responsables, con botón de llamar y, si aplica, el punto donde están). *Avisos* queda como pestaña futura.

## 4. Cambios al modelo de datos
- `User.extraPermissions` (lista de permisos extra).
- `Invitation` (correo, rol, permisos extra, evento, puntos, hash del token, vencimiento, estado, quién invitó).
- `Participant.accessTokenHash` y `accessCodeHash` (enlace y código del peregrino) + `PilgrimSession` (sesiones de peregrino, separadas del personal).
- `EventContact` (evento, nombre, cargo, teléfono, punto asociado opcional, orden, marca de emergencia).
- Sin tabla nueva para el tiempo real (los eventos viajan por SSE).

## 5. Plan de fases revisado
| Fase | Contenido |
|---|---|
| **3A · Identidad y acceso** (API) — ✅ entregada | Permisos extra, invitaciones por correo (crear, reenviar, revocar, aceptar), acceso del peregrino (enlace/código/sesión), contactos del evento, login que distingue personal/peregrino. |
| **3B · Tiempo real + app del administrador** — ✅ entregada | Canal SSE por evento, pantallas según la imagen (menú, personas, puntos, **registrar llegada**, historial, ficha, recorrido con mapa, configuración) y gestión de usuarios/invitaciones/contactos. |
| **3C · App del peregrino** | Mi QR (disponible sin internet), Recorrido, Contactos. Mismo estilo visual. |
| 4 | Offline y sincronización (cola, idempotencia, conflictos), respaldo/restauración. |
| 5 | Reportes, exportación CSV/XLSX/PDF, incidencias, emergencia, despliegue. |

## 6. Qué necesito de ti al llegar a la 3A (no bloquea el avance)
- Un proveedor de correo para producción (si no tienes, se usa Resend o SMTP de Gmail y se documenta).
- Si prefieres que el peregrino reciba el enlace por WhatsApp/SMS (requiere un proveedor de pago) o que la organización lo reparta, p. ej. impreso en la credencial. Por defecto: enlace copiable y QR de acceso imprimible.

## 7. Adición: pagos, verificación y credencial (API entregada)
**Pedido:** el peregrino paga y envía el comprobante por la app; el administrador lo confirma; solo entonces entra al listado oficial, recibe su número y se genera su credencial (carnet) exportable para imprimir. La credencial muestra el nombre de la parroquia, el número y el QR; al escanearlo en la app del administrador se identifican nombre, apellido, DNI y teléfono, con la ubicación y hora de la lectura.

**Cómo quedó:** ver la sección "Inscripción, comprobantes y credenciales" del README. Decisiones: (1) la inscripción es una entidad aparte del listado oficial y no tiene número hasta ser confirmada; (2) el comprobante es privado y se revisa en una cola; (3) el carnet no imprime datos personales por defecto; (4) "parroquia" = `Event.parishName` (si está vacío, la organización); (5) el operador ve el teléfono al identificar.

**Pantallas pendientes:** 3B (cola de revisión, visor, confirmar/rechazar, exportar credenciales, abrir inscripción y compartir enlace) y 3C (inscripción del peregrino, subir comprobante, estado del pago).

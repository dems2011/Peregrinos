# Política de cancelación, finalización y eliminación de eventos

Fecha del relevamiento: 2026-10-12. Describe el comportamiento **actual** del código y una política propuesta.
No se habilitó ningún borrado: hoy los eventos no se eliminan.

## 1. Comportamiento actual

### Estados y transiciones
`EventStatus` (`schema.prisma`): `DRAFT` → `SCHEDULED` → `IN_PROGRESS` → `FINISHED`, y `CANCELLED` desde cualquiera
de los tres primeros. Tabla única en `packages/shared/src/index.ts` (`EVENT_TRANSITIONS`):

| Desde | Hacia |
|---|---|
| DRAFT | SCHEDULED, CANCELLED |
| SCHEDULED | DRAFT, IN_PROGRESS, CANCELLED |
| IN_PROGRESS | FINISHED, CANCELLED |
| FINISHED | — (terminal) |
| CANCELLED | — (terminal) |

- **Frontend**: `configuracion/evento/page.tsx` ofrece en el selector de estado solo el actual y sus transiciones válidas.
- **API**: `PATCH /api/events/:id` valida la transición (`assertEventTransition`), la aplica de forma condicional
  (`where: { id, status: before.status }` → 409 `EVENT_STATUS_CHANGED` si otro cambio se adelantó) y la audita
  (`EVENT_STATUS_CHANGED` en `AuditLog`, con estado anterior y nuevo).
- **No hay `DELETE`** de eventos (`apps/api/src/routes/events.ts`, comentario final). Tampoco hay estado «archivado».

### Efectos de FINISHED y CANCELLED
| Área | FINISHED | CANCELLED | Dónde |
|---|---|---|---|
| Registrar llegadas | Bloqueado | Bloqueado | `lib/access.ts` `assertEventOpen`; web `registrar/page.tsx` |
| Aprobar inscripciones / alta de participantes | Bloqueado (`EVENT_CLOSED`) | Bloqueado | `routes/registrations.ts` |
| Comprobante de pago del peregrino | Bloqueado | Bloqueado | `routes/pilgrim.ts` |
| Voluntariado (altas, consentimientos) | Bloqueado | Bloqueado | `routes/volunteers.ts`, `lib/volunteerConsent.ts` |
| Chat del evento | Sigue abierto | Solo lectura (`EVENT_CANCELLED`) | `lib/chat.ts` |
| Asistencia derivada | ACTIVE sin llegada → `NO_SHOW` | Sin cambio | `packages/shared` (estado derivado) |
| Participantes, llegadas, avisos, mensajes, auditoría | Se conservan | Se conservan | — |
| Push / avisos a seguidores | No se envía nada al cambiar de estado | Igual | `notifyEventPublishedIfDue` solo en la 1.ª publicación |

«Limpiar mensajes anteriores» del chat y de Avisos (commit 5084746) **no borra nada en la base**: es un corte por
dispositivo en `localStorage`.

### Integridad referencial
Si alguien borrara un `Event` directamente en la base:
- `EventRoute` se borra en cascada.
- Participantes, grupos, llegadas, puntos de control, asignaciones, incidentes, cola de sincronización, contactos e
  inscripciones usan la acción por defecto de Prisma (sin `onDelete`, equivale a **RESTRICT/NO ACTION**): el borrado
  falla mientras existan.
- Voluntariado, `MediaAsset`, `Notification` y `EventChatMessage` tienen `onDelete: Restrict` explícito.
- Es decir: hoy la base **impide** perder datos de un evento con actividad; solo un evento vacío se podría borrar.

## 2. Diferencias entre las operaciones
| Operación | Significado | Datos | Reversible | Existe |
|---|---|---|---|---|
| Cancelar | El evento no se hará o se suspendió | Se conservan; operación bloqueada | No (estado terminal) | Sí |
| Finalizar | El evento se realizó | Se conservan; se calculan ausencias | No | Sí |
| Archivar | Ocultarlo de listados sin cambiar su historia | Se conservan | Sí | **No** |
| Eliminar definitivamente | Quitarlo de la base | Se pierden | No | **No** |

## 3. Riesgos de un borrado definitivo
- Pérdida del historial de los peregrinos (`/cuenta/historial`), certificados y credenciales emitidas.
- Pérdida de evidencia: comprobantes de pago (`PaymentProof`), llegadas y su auditoría, incidentes.
- `AuditLog.eventId` quedaría apuntando a un evento inexistente (no tiene FK): auditoría huérfana.
- Archivos en el almacenamiento (`MediaAsset`) sin dueño si no se borran en la misma operación.
- Obligaciones legales de conservación de datos personales y pagos (a definir por la organización).

## 4. Política propuesta
1. **No ofrecer borrado definitivo** de eventos con cualquier actividad (participantes, inscripciones, llegadas,
   mensajes, avisos, voluntariado, archivos). Se mantiene CANCELLED/FINISHED.
2. **Borrar solo borradores vacíos**: `DELETE /api/events/:id` permitido únicamente si `status = DRAFT` y no hay
   ninguna fila dependiente (salvo `EventRoute`). Solo SUPERADMIN, con confirmación escribiendo el nombre y registro
   en `AuditLog` (`EVENT_DELETED`, con copia de los datos básicos). La FK RESTRICT actual es la red de seguridad.
3. **Archivar** (nuevo, reversible): columna `archivedAt` que solo oculta el evento de listados y del selector de
   eventos; permitido en FINISHED y CANCELLED. Requiere migración (se aplica en Neon solo con aprobación).
4. **Cancelación con aviso opcional**: al cancelar, ofrecer enviar un aviso a inscriptos y participantes (hoy no se
   avisa). Requiere decisión funcional.
5. **Datos personales**: la supresión de datos de una persona se resuelve por persona (anonimización), no borrando eventos.

## 5. Pruebas requeridas
- Transiciones: todas las válidas e inválidas de `EVENT_TRANSITIONS` (ya cubiertas por las pruebas A4), y la
  condición de carrera (409 `EVENT_STATUS_CHANGED`).
- Borrado de borrador vacío: OK; con cualquier dependiente: 409 sin cambios; otro rol: 403; otra organización: 404.
- Archivar/desarchivar: visibilidad en listados, que no altere estados ni datos, auditoría.
- Bloqueos por estado: llegadas, inscripciones, comprobantes, voluntariado y chat en FINISHED y CANCELLED.
- Integridad: ninguna fila huérfana tras un borrado permitido; archivos de `MediaAsset` eliminados del almacenamiento.

# Eliminación de cuenta de Peregrinos — diseño (no implementado)

**Estado:** Pendiente de desarrollo. Hoy **no existe** la eliminación de cuenta (verificado en el código, 2026-10-19); solo
se puede dejar de seguir una parroquia. Google Play exige poder pedirla **dentro de la app y desde una página web**. Este
documento es diseño técnico: **no** afirma cumplimiento legal; textos, plazos y retenciones los define el asesor del
propietario. No se ejecutó ningún borrado real.

## Qué hay en la base (esquema actual)

| Relación con `User` | Tablas | Efecto de borrar la fila `User` |
|---|---|---|
| Cascada | `DeviceToken`, `RefreshToken`, `MfaRecoveryCode`, `EmailVerificationToken`, `PasswordResetToken`, `ParishFollower`, `NotificationRecipient`, `OperatorAssignment`, `VolunteerConsentCode` (dueño) | Se borran |
| `SetNull` | Inscripciones y participaciones de peregrino, contenidos creados (`createdById`) | Quedan sin autor |
| Restricción | `PersonClaim`, autor de chat del personal, `Person` vinculada (`personId`), `AuditLog` | **El borrado falla** |

Además la persona (`Person`) puede tener inscripciones, participaciones, voluntariados y mensajes de chat en eventos de
**otras organizaciones**, que son registros de esas parroquias. Y SIGyP puede tener una cuenta de trabajo con ese
`peregrinosUserId`.

## Diseño propuesto: baja con anonimización (no borrado físico de la fila)

1. **Pedido:** desde la app/web con sesión (contraseña + MFA si está activo) o desde una página pública que envía un
   enlace de confirmación al correo de la cuenta (para quien ya no tiene la app). Sin confirmación no pasa nada.
2. **Período de arrepentimiento** (p. ej. 14 días, a decidir): la cuenta queda bloqueada para ingresar; ingresar y
   confirmar cancela el pedido. Se informa por correo el inicio y el fin.
3. **Ejecución (una transacción):**
   - Borrar credenciales y canales: sesiones, tokens de dispositivo, códigos MFA y de recuperación, tokens de correo y
     contraseña, seguimientos de parroquias, destinatarios de notificaciones (cascadas existentes).
   - En `User`: `isActive=false`, `sessionVersion+1`, correo reemplazado por `eliminado+<id>@invalid` (libera el correo
     real, sigue siendo único), `name="Cuenta eliminada"`, `passwordHash` inutilizable, teléfono, foto, documento, MFA y
     términos en nulo, marca `deletedAt`.
   - En la `Person` propia (no en las personas que administra una parroquia): nombre, documento, teléfono, correo y
     fecha de nacimiento reemplazados o en nulo; los registros de eventos de otras parroquias quedan con «Persona
     eliminada» (no se borra la historia de la parroquia, que no le pertenece al usuario).
   - Mensajes de chat propios: texto reemplazado por «Mensaje eliminado».
   - Auditoría: se conserva el evento `account.deleted` sin datos personales (la auditoría no guarda valores).
4. **Personal de una organización** (`accountType=STAFF` con rol): la baja exige que no sea el último administrador de
   la organización; si lo es, se pide transferir antes.
5. **SIGyP:** si la cuenta está vinculada, Peregrinos deja de responder por ese `peregrinosUserId` (perfil y avisos) y
   SIGyP lo muestra como «vínculo con Peregrinos eliminado» sin borrar nada en SIGyP. Requiere un caso nuevo en el
   contrato de integración (a diseñar; hoy no existe).
6. **Copias:** las copias de Neon y los `pg_dump` conservan datos hasta que vencen por su retención; la política de
   privacidad debe decirlo (a cargo del asesor).

## Pruebas sintéticas (especificación; con base de pruebas efímera, nunca contra Neon)

| # | Caso | Resultado esperado |
|---|---|---|
| D1 | Pedido sin sesión ni confirmación por correo | Nada cambia |
| D2 | Pedido con sesión, sin MFA cuando está activo | Rechazado |
| D3 | Pedido confirmado, ingreso durante el arrepentimiento | Se ofrece cancelar; cancelar restaura el acceso |
| D4 | Ejecución | Sin sesiones, tokens, dispositivos ni seguimientos; refresh y push rechazados; el correo real queda libre |
| D5 | Registros de otra parroquia | La inscripción existe, sin datos personales; los totales del evento no cambian |
| D6 | Último administrador de una organización | Rechazado con mensaje de transferir |
| D7 | Cuenta vinculada a SIGyP | La consulta de perfil por integración responde «eliminada»; SIGyP no pierde datos |
| D8 | Auditoría | Un evento `account.deleted` sin correo, nombre ni documento |
| D9 | Nuevo registro con el mismo correo | Permitido, cuenta nueva sin relación con la anterior |
| D10 | Ejecutar dos veces | Idempotente |

Las pruebas usan datos inventados y una base local efímera (como `.e2e-local`); no se borran cuentas reales.

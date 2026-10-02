-- Impide dos llegadas ACTIVAS de la misma persona en el mismo punto y evento.
-- Los registros CANCELLED y CONFLICT no cuentan (permiten correcciones y trazabilidad).
CREATE UNIQUE INDEX "Checkin_active_unique"
  ON "Checkin" ("eventId", "participantId", "checkpointId")
  WHERE "status" = 'ACTIVE';

-- Impide dos llegadas ACTIVAS de la misma persona en el mismo punto y evento.
-- Los registros CANCELLED y CONFLICT no cuentan (permiten correcciones y trazabilidad).
-- Prisma no puede expresar índices parciales en schema.prisma: este índice vive solo en SQL.
-- Al crear migraciones futuras, revisar que Prisma no agregue un DROP INDEX "Checkin_active_unique".
CREATE UNIQUE INDEX "Checkin_active_unique"
  ON "Checkin" ("eventId", "participantId", "checkpointId")
  WHERE "status" = 'ACTIVE';

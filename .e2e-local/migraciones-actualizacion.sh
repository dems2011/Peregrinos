#!/usr/bin/env bash
# Prueba de actualización de la base: el esquema de PRODUCCIÓN (origin/main, 27 migraciones) con datos sintéticos →
# migraciones 28 a 31 → verificación de integridad y de deriva → reversión con sus scripts → nueva aplicación.
# PostgreSQL 18 en un contenedor DESECHABLE (127.0.0.1:5443). Nunca usa apps/api/.env ni toca otra base.
# Uso: bash .e2e-local/migraciones-actualizacion.sh [ref-de-produccion=origin/main]
set -u
REF="${1:-origin/main}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
NAME="peregrinos-migraciones-desechable"
PASS="m-$(date +%s)-$RANDOM"
export DATABASE_URL="postgresql://postgres:${PASS}@127.0.0.1:5443/peregrinos?sslmode=disable"
case "$DATABASE_URL" in *127.0.0.1:5443*) ;; *) echo "DATABASE_URL no es local: abortado"; exit 2;; esac
# Dentro de node_modules/.cache (ignorado por Git) para que el cliente generado resuelva @prisma/client del repositorio.
OLD="$ROOT/node_modules/.cache/peregrinos-migraciones-$$"
mkdir -p "$OLD"
ok=0; fail=0
check() { if [ "$2" = "0" ]; then ok=$((ok+1)); echo "  ok  $1"; else fail=$((fail+1)); echo "  FAIL $1 ${3:-}"; fi; }
psqlq() { docker exec -i "$NAME" psql -X -q -t -A -v ON_ERROR_STOP=1 -U postgres -d peregrinos "$@"; }

docker rm -f "$NAME" >/dev/null 2>&1
docker run -d --name "$NAME" --label peregrinos.purpose=e2e-desechable -e POSTGRES_PASSWORD="$PASS" -e POSTGRES_DB=peregrinos \
  -p 127.0.0.1:5443:5432 postgres:18-alpine >/dev/null || { echo "DOCKER FAILED"; exit 1; }
trap 'docker rm -f "$NAME" >/dev/null 2>&1; rm -rf "$OLD"' EXIT
for i in $(seq 1 60); do docker exec "$NAME" pg_isready -U postgres -d peregrinos >/dev/null 2>&1 && break; sleep 1; done
sleep 2

git -C "$ROOT" archive "$REF" apps/api/prisma | tar -x -C "$OLD"
OLD_SCHEMA="$OLD/apps/api/prisma/schema.prisma"
NEW_SCHEMA="$ROOT/apps/api/prisma/schema.prisma"
cd "$ROOT/apps/api"
echo "— 1. Esquema de producción ($REF)"
npx.cmd prisma migrate deploy --schema "$OLD_SCHEMA" 2>&1 | grep -E "migrations? found|applied|Error" ; check "migraciones de $REF aplicadas" "${PIPESTATUS[0]}"
check "27 migraciones registradas" "$([ "$(psqlq -c 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')" = 27 ]; echo $?)"

echo "— 2. Datos sintéticos (como los que ya tiene producción)"
psqlq <<'SQL'
INSERT INTO "Organization" (id, name, status, "updatedAt") SELECT 'org-' || g, 'Parroquia sintética ' || g, 'APPROVED', now() FROM generate_series(1, 3) g;
INSERT INTO "User" (id, email, name, "passwordHash", role, "organizationId", "updatedAt") SELECT 'usr-' || g, 'staff' || g || '@sintetico.local', 'Staff ' || g, 'x', 'ADMIN', 'org-' || ((g % 3) + 1), now() FROM generate_series(1, 6) g;
INSERT INTO "Event" (id, "organizationId", name, "startsAt", "updatedAt") SELECT 'evt-' || g, 'org-' || ((g % 3) + 1), 'Evento sintético ' || g, now() + (g || ' days')::interval, now() FROM generate_series(1, 12) g;
INSERT INTO "Notification" (id, "organizationId", "eventId", kind, title, body, "createdById", "recipientCount") SELECT 'ntf-' || g, 'org-' || ((g % 3) + 1), CASE WHEN g % 2 = 0 AND g <= 12 THEN 'evt-' || g ELSE NULL END, CASE WHEN g % 2 = 0 AND g <= 12 THEN 'EVENT_PUBLISHED' ELSE 'MANUAL' END::"NotificationKind", 'Aviso ' || g, 'Texto ' || g, 'usr-1', 2 FROM generate_series(1, 20) g;
INSERT INTO "NotificationRecipient" ("notificationId", "userId") SELECT 'ntf-' || n, 'usr-' || u FROM generate_series(1, 20) n, generate_series(1, 2) u;
SQL
check "datos sintéticos cargados" "$?"
check "3 parroquias, 6 usuarios, 12 eventos, 20 avisos, 40 destinatarios" "$([ "$(psqlq -c 'SELECT concat((SELECT count(*) FROM "Organization"), (SELECT count(*) FROM "User"), (SELECT count(*) FROM "Event"), (SELECT count(*) FROM "Notification"), (SELECT count(*) FROM "NotificationRecipient"))')" = 36122040 ]; echo $?)"
# Huella de las columnas ORIGINALES (las que existen en producción hoy).
fp() { psqlq -c "SELECT md5(string_agg(x, '|' ORDER BY x)) FROM (
  SELECT 'o' || id || name || status || code AS x FROM \"Organization\" UNION ALL
  SELECT 'e' || id || \"organizationId\" || name || status || array_to_string(capabilities, ',') FROM \"Event\" UNION ALL
  SELECT 'n' || id || \"organizationId\" || coalesce(\"eventId\", '-') || kind || title || body || \"recipientCount\" FROM \"Notification\" UNION ALL
  SELECT 'r' || \"notificationId\" || \"userId\" FROM \"NotificationRecipient\" UNION ALL
  SELECT 'u' || id || email || coalesce(role::text, '-') FROM \"User\") t"; }
BEFORE="$(fp)"
echo "    huella antes: $BEFORE"

echo "— 3. Migraciones 28 a 31"
npx.cmd prisma migrate deploy --schema "$NEW_SCHEMA" 2>&1 | grep -E "migrations? found|Applying|applied|Error"; check "migrate deploy sin errores" "${PIPESTATUS[0]}"
check "31 migraciones registradas, ninguna fallida" "$([ "$(psqlq -c 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL')" = 31 ] && [ "$(psqlq -c 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL')" = 0 ]; echo $?)"
npx.cmd prisma migrate status --schema "$NEW_SCHEMA" 2>&1 | grep -q "Database schema is up to date"; check "migrate status: al día" "$?"
npx.cmd prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel "$NEW_SCHEMA" --exit-code >/dev/null 2>&1; check "sin deriva entre la base y schema.prisma" "$?"
AFTER="$(fp)"
check "datos existentes intactos (misma huella)" "$([ "$BEFORE" = "$AFTER" ]; echo $?)" "$BEFORE != $AFTER"
check "valores por defecto en filas existentes (delivery PUSH, urgent false, sourceVersion 0, profileSyncedVersion 0)" "$([ "$(psqlq -c "SELECT (SELECT count(*) FROM \"Notification\" WHERE delivery <> 'PUSH' OR urgent) + (SELECT count(*) FROM \"Event\" WHERE \"sourceVersion\" <> 0 OR \"sourceSystem\" IS NOT NULL) + (SELECT count(*) FROM \"Organization\" WHERE \"profileSyncedVersion\" <> 0 OR \"profileSource\" IS NOT NULL)")" = 0 ]; echo $?)"
check "restricciones CHECK nuevas presentes y VALIDADAS sobre las filas existentes" "$([ "$(psqlq -c "SELECT count(*) FROM pg_constraint WHERE conname IN ('Event_source_check','Event_attendanceMode_check','Event_onlineUrl_check','Notification_delivery_check','Notification_source_check','IntegrationLinkCode_expiry_check','ParishAnnouncement_version_check','ParishAnnouncement_dates_check','Organization_profileSource_check') AND convalidated")" = 9 ]; echo $?)"
check "índices únicos por origen presentes" "$([ "$(psqlq -c "SELECT count(*) FROM pg_indexes WHERE indexname IN ('Event_organizationId_sourceSystem_sourceId_key','Notification_organizationId_sourceSystem_sourceId_key','ParishAnnouncement_organizationId_sourceSystem_sourceId_key','IntegrationClient_tokenHash_key','IntegrationLinkCode_codeHash_key')")" = 5 ]; echo $?)"
psqlq -c "INSERT INTO \"Event\" (id, \"organizationId\", name, \"startsAt\", \"updatedAt\", \"sourceSystem\") VALUES ('x', 'org-1', 'x', now(), now(), 'SIGYP')" >/dev/null 2>&1; check "la base rechaza un evento con origen sin sourceId (CHECK activo)" "$([ $? -ne 0 ]; echo $?)"
psqlq -c "UPDATE \"Notification\" SET delivery = 'EMAIL' WHERE id = 'ntf-1'" >/dev/null 2>&1; check "la base rechaza una entrega desconocida (CHECK activo)" "$([ $? -ne 0 ]; echo $?)"
check "turnos (30): CHECK presentes y validados" "$([ "$(psqlq -c "SELECT count(*) FROM pg_constraint WHERE conname IN ('PastoralTurn_status_check','PastoralTurn_source_check','PastoralTurn_dates_check','PastoralTurn_decision_check','PastoralTurn_push_check','PastoralTurnDecision_check') AND convalidated")" = 6 ]; echo $?)"
psqlq -c "INSERT INTO \"PastoralTurn\" (id, \"organizationId\", \"sourceId\", version, title, \"startsAt\", \"endsAt\", status, \"updatedAt\") VALUES ('t', 'org-1', 's', 1, 'x', now(), now() + interval '1 hour', 'REJECTED', now())" >/dev/null 2>&1; check "turnos (30): la base rechaza un rechazo sin quién ni motivo" "$([ $? -ne 0 ]; echo $?)"
check "solicitudes (31): CHECK presentes y validados" "$([ "$(psqlq -c "SELECT count(*) FROM pg_constraint WHERE conname IN ('ParishRequestType_source_check','PilgrimRequest_status_check','PilgrimRequest_version_check','PilgrimRequest_text_check') AND convalidated")" = 4 ]; echo $?)"

echo "— 3b. El código de producción ($REF) sigue funcionando con el esquema ya migrado (ventana migrar → publicar)"
# Cliente Prisma de $REF generado APARTE (no toca el del repositorio): lee y escribe con las columnas que conoce.
OLDW="$(cygpath -m "$OLD")"
sed -i 's#provider = "prisma-client-js"#provider = "prisma-client-js"\n  output   = "'"$OLDW"'/client"#' "$OLD_SCHEMA"
PRISMA_GENERATE_SKIP_AUTOINSTALL=true npx.cmd prisma generate --schema "$OLD_SCHEMA" > "$OLD/generate.log" 2>&1; GEN=$?; [ $GEN = 0 ] || tail -5 "$OLD/generate.log"; check "cliente Prisma de $REF generado aparte" "$GEN"
cat > "$OLD/compat.cjs" <<'JS'
const { PrismaClient } = require(process.argv[2]);
const p = new PrismaClient();
(async () => {
  const [o, e, n] = await Promise.all([p.organization.findMany(), p.event.findMany({ include: { organization: true } }), p.notification.findMany({ include: { recipients: true } })]);
  const org = o[0];
  const ev = await p.event.create({ data: { organizationId: org.id, name: "Creado por el código anterior", startsAt: new Date() } });
  const nt = await p.notification.create({ data: { organizationId: org.id, eventId: ev.id, kind: "EVENT_PUBLISHED", title: "t", body: "b", recipientCount: 0 } });
  await p.event.update({ where: { id: ev.id }, data: { name: "Editado por el código anterior" } });
  await p.notification.delete({ where: { id: nt.id } });
  await p.event.delete({ where: { id: ev.id } });
  console.log(`lecturas ${o.length}/${e.length}/${n.length}; alta, edición y baja de evento y aviso OK`);
  await p.$disconnect();
})().catch((err) => { console.error(String(err).slice(0, 500)); process.exit(1); });
JS
node "$OLD/compat.cjs" "$OLDW/client"; check "lecturas y escrituras del código anterior sobre el esquema nuevo" "$?"
check "las filas creadas por el código anterior respetan los CHECK nuevos (y no quedan)" "$([ "$(psqlq -c "SELECT count(*) FROM \"Event\" WHERE name LIKE '%código anterior%'")" = 0 ]; echo $?)"

echo "— 4. Reversión (scripts de producción: 31, 30 y 28/29, en ese orden) y nueva aplicación"
psqlq -c "INSERT INTO \"ParishRequestType\" (id, \"organizationId\", \"sourceId\", version, name, \"updatedAt\") VALUES ('rt1', 'org-1', 's1', 1, 'Bautismo', now())" >/dev/null
psqlq < "$ROOT/apps/api/prisma/rollback/20261027_pilgrim_requests_rollback.sql" >/dev/null 2>&1
check "con solicitudes la reversión de 31 se ABORTA sin cambiar nada" "$([ $? -ne 0 ] && [ "$(psqlq -c 'SELECT count(*) FROM "ParishRequestType"')" = 1 ] && [ "$(psqlq -c 'SELECT count(*) FROM "_prisma_migrations"')" = 31 ]; echo $?)"
psqlq -c "DELETE FROM \"ParishRequestType\"" >/dev/null
psqlq < "$ROOT/apps/api/prisma/rollback/20261027_pilgrim_requests_rollback.sql" >/dev/null; check "sin solicitudes la reversión de 31 se aplica" "$?"
psqlq -c "INSERT INTO \"PastoralTurn\" (id, \"organizationId\", \"sourceId\", version, title, \"startsAt\", \"endsAt\", \"updatedAt\") VALUES ('t1', 'org-1', 's1', 1, 'Turno', now(), now() + interval '1 hour', now())" >/dev/null
psqlq < "$ROOT/apps/api/prisma/rollback/20261027_pastoral_turns_rollback.sql" >/dev/null 2>&1
check "con turnos la reversión de 30 se ABORTA sin cambiar nada" "$([ $? -ne 0 ] && [ "$(psqlq -c 'SELECT count(*) FROM "PastoralTurn"')" = 1 ] && [ "$(psqlq -c 'SELECT count(*) FROM "_prisma_migrations"')" = 30 ]; echo $?)"
psqlq -c "DELETE FROM \"PastoralTurn\"" >/dev/null
psqlq < "$ROOT/apps/api/prisma/rollback/20261027_pastoral_turns_rollback.sql" >/dev/null; check "sin turnos la reversión de 30 se aplica" "$?"
psqlq -c "INSERT INTO \"IntegrationClient\" (id, \"organizationId\", label, \"tokenHash\", \"tokenHint\", scopes) VALUES ('c1', 'org-1', 'x', 'h', 'hint', '{profile:write}')" >/dev/null
psqlq < "$ROOT/apps/api/prisma/rollback/20261019_sigyp_rollback.sql" >/dev/null 2>&1
check "con datos de SIGyP la reversión se ABORTA sin cambiar nada" "$([ $? -ne 0 ] && [ "$(psqlq -c 'SELECT count(*) FROM "IntegrationClient"')" = 1 ] && [ "$(psqlq -c 'SELECT count(*) FROM "_prisma_migrations"')" = 29 ]; echo $?)"
psqlq -c "DELETE FROM \"IntegrationClient\"" >/dev/null
psqlq < "$ROOT/apps/api/prisma/rollback/20261019_sigyp_rollback.sql" >/dev/null; check "sin datos de SIGyP la reversión se aplica" "$?"
npx.cmd prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel "$OLD_SCHEMA" --exit-code >/dev/null 2>&1; check "tras revertir, la base coincide exactamente con el esquema de $REF" "$?"
check "tras revertir, datos intactos (misma huella)" "$([ "$BEFORE" = "$(fp)" ]; echo $?)"
npx.cmd prisma migrate deploy --schema "$NEW_SCHEMA" >/dev/null 2>&1; check "se pueden volver a aplicar 28 a 31" "$?"
npx.cmd prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel "$NEW_SCHEMA" --exit-code >/dev/null 2>&1; check "y la base vuelve a coincidir con schema.prisma" "$?"
check "datos intactos después del ciclo completo" "$([ "$BEFORE" = "$(fp)" ]; echo $?)"

echo; echo "Migraciones 27 → 31 → reversión → 31: $ok OK, $fail FAIL"
[ "$fail" = 0 ]

#!/usr/bin/env bash
# Prueba rápida de la Fase 2 contra el API en marcha (requiere seed y curl + jq).
# Uso: bash scripts/smoke-phase2.sh   (API_URL opcional, por defecto http://localhost:4000)
set -u
API="${API_URL:-http://localhost:4000}/api"
PASS="${SEED_PASSWORD:-Peregrinos2026!}"
H=(-H 'Content-Type: application/json' -H 'X-PG-Client: web')
ok=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "  OK   $1"; ok=$((ok+1)); else echo "  FAIL $1 (esperado $3, obtuve $2)"; fail=$((fail+1)); fi; }
login() { curl -s -o /dev/null -c "$1" "${H[@]}" -d "{\"email\":\"$2\",\"password\":\"$PASS\"}" "$API/auth/login"; }

login /tmp/pg_admin.txt superadmin@peregrinos.local
login /tmp/pg_maria.txt maria.operadora@peregrinos.local

EV=$(curl -s -b /tmp/pg_admin.txt "$API/events" | jq -r '.items[0].id')
CPS=$(curl -s -b /tmp/pg_admin.txt "$API/events/$EV/checkpoints")
CP1=$(echo "$CPS" | jq -r '.items[0].id'); CP2=$(echo "$CPS" | jq -r '.items[1].id'); CP3=$(echo "$CPS" | jq -r '.items[2].id')
echo "Evento $EV"

echo "1. Búsqueda y lookup"
check "buscar 'gonz' devuelve 1" "$(curl -s -b /tmp/pg_admin.txt "$API/events/$EV/participants?q=gonz" | jq '.total')" 1
check "buscar por documento" "$(curl -s -b /tmp/pg_admin.txt "$API/events/$EV/participants?q=28765432" | jq '.total')" 1
check "lookup por número 5" "$(curl -s -b /tmp/pg_admin.txt "$API/events/$EV/participants/lookup?number=5" | jq -r '.participant.firstName')" Diego

echo "2. Operador: datos para identificar (sin notas)"
check "operador ve nombre, documento y teléfono" "$(curl -s -b /tmp/pg_maria.txt "$API/events/$EV/participants/lookup?number=5" | jq '.participant | [has("firstName"), has("documentNumber"), has("phone")] | all')" true
check "operador no ve notas" "$(curl -s -b /tmp/pg_maria.txt "$API/events/$EV/participants/lookup?number=5" | jq '.participant | has("notes")')" false

echo "3. Registrar llegada (Diego #5 en Plaza San Martín, punto de María)"
P5=$(curl -s -b /tmp/pg_admin.txt "$API/events/$EV/participants/lookup?number=5" | jq -r '.participant.id')
BODY="{\"participantId\":\"$P5\",\"checkpointId\":\"$CP2\",\"method\":\"NUMBER\"}"
check "primera vez -> 201" "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/pg_maria.txt "${H[@]}" -d "$BODY" "$API/events/$EV/checkins")" 201
R=$(curl -s -b /tmp/pg_maria.txt "${H[@]}" -d "$BODY" "$API/events/$EV/checkins")
check "segunda vez -> ALREADY_CHECKED_IN" "$(echo "$R" | jq -r '.error')" ALREADY_CHECKED_IN
check "otro punto sin permiso -> 403" "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/pg_maria.txt "${H[@]}" -d "{\"participantId\":\"$P5\",\"checkpointId\":\"$CP3\",\"method\":\"NUMBER\"}" "$API/events/$EV/checkins")" 403
UID1=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid)
B2="{\"id\":\"$UID1\",\"participantId\":\"$P5\",\"checkpointId\":\"$CP1\",\"method\":\"QR\"}"
check "admin registra en otro punto -> 201" "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/pg_admin.txt "${H[@]}" -d "$B2" "$API/events/$EV/checkins")" 201
check "mismo UUID reenviado -> IDEMPOTENT" "$(curl -s -b /tmp/pg_admin.txt "${H[@]}" -d "$B2" "$API/events/$EV/checkins" | jq -r '.result')" IDEMPOTENT

echo "4. Corrección"
CID=$(curl -s -b /tmp/pg_admin.txt "$API/events/$EV/checkins?participantId=$P5&checkpointId=$CP1" | jq -r '.items[0].id')
check "anular sin motivo -> 400" "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/pg_admin.txt "${H[@]}" -d '{}' "$API/events/$EV/checkins/$CID/cancel")" 400
check "anular con motivo -> CANCELLED" "$(curl -s -b /tmp/pg_admin.txt "${H[@]}" -d '{"reason":"Registro por error"}' "$API/events/$EV/checkins/$CID/cancel" | jq -r '.status')" CANCELLED
check "tras anular se puede volver a registrar" "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/pg_admin.txt "${H[@]}" -d "{\"participantId\":\"$P5\",\"checkpointId\":\"$CP1\",\"method\":\"SEARCH\"}" "$API/events/$EV/checkins")" 201

echo "5. QR"
check "QR svg" "$(curl -s -b /tmp/pg_admin.txt "$API/events/$EV/participants/$P5/qr" | head -c 4)" "<svg"

echo "6. Importación XLSX (plantilla)"
curl -s -b /tmp/pg_admin.txt "$API/events/$EV/participants/import/template" -o /tmp/plantilla.xlsx
check "preview sin guardar" "$(curl -s -b /tmp/pg_admin.txt -H 'X-PG-Client: web' -F file=@/tmp/plantilla.xlsx "$API/events/$EV/participants/import?mode=preview" | jq '.valid')" 1

echo; echo "Resultado: $ok OK, $fail FAIL"; [ "$fail" -eq 0 ]

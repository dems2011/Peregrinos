#!/usr/bin/env bash
# Prueba del tiempo real: un "teléfono" escucha el canal y otro registra una llegada. Requiere seed, curl y jq.
set -u
API="${API_URL:-http://localhost:4000}/api"
PASS="${SEED_PASSWORD:-Peregrinos2026!}"
H=(-H 'Content-Type: application/json' -H 'X-PG-Client: web')
ok=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "  OK   $1"; ok=$((ok+1)); else echo "  FAIL $1 (esperado $3, obtuve $2)"; fail=$((fail+1)); fi; }
login() { curl -s -o /dev/null -c "$1" "${H[@]}" -d "{\"email\":\"$2\",\"password\":\"$PASS\"}" "$API/auth/login"; }
T=/tmp/pg_live; mkdir -p $T
login $T/carlos.txt carlos@peregrinos.local      # punto 1
login $T/laura.txt laura.altas@peregrinos.local  # otro teléfono, mismo evento
login $T/ad.txt admin@peregrinos.local
EV=$(curl -s -b $T/ad.txt "$API/events" | jq -r '.items[0].id')
CP1=$(curl -s -b $T/ad.txt "$API/events/$EV/checkpoints" | jq -r '.items[0].id')
P=$(curl -s -b $T/ad.txt "$API/events/$EV/participants/lookup?number=4" | jq -r '.participant.id')

echo "Tiempo real"
: > $T/stream.txt
curl -sN --max-time 6 -b $T/laura.txt "$API/events/$EV/stream" > $T/stream.txt &
SP=$!
sleep 1.5
curl -s -o /dev/null -b $T/carlos.txt "${H[@]}" -d "{\"participantId\":\"$P\",\"checkpointId\":\"$CP1\",\"method\":\"QR\"}" "$API/events/$EV/checkins"
wait $SP 2>/dev/null
check "el otro teléfono recibe 'hello'" "$(grep -c '"type":"hello"' $T/stream.txt)" 1
check "el otro teléfono recibe la llegada al instante" "$(grep -c '"type":"checkin.created"' $T/stream.txt)" 1
check "el aviso trae número y punto" "$(grep 'checkin.created' $T/stream.txt | sed 's/^data: //' | jq -r '[.data.number, .data.checkpointName] | join("|")')" "4|Parroquia"
check "sin sesión no se puede escuchar" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$API/events/$EV/stream")" 401
echo; echo "Resultado: $ok OK, $fail FAIL"; [ "$fail" -eq 0 ]

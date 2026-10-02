#!/usr/bin/env bash
# Prueba del flujo: inscripción -> comprobante -> confirmación -> credencial. Requiere seed, curl y jq.
set -u
API="${API_URL:-http://localhost:4000}/api"
PASS="${SEED_PASSWORD:-Peregrinos2026!}"
H=(-H 'Content-Type: application/json' -H 'X-PG-Client: web')
X=(-H 'X-PG-Client: web')
ok=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "  OK   $1"; ok=$((ok+1)); else echo "  FAIL $1 (esperado $3, obtuve $2)"; fail=$((fail+1)); fi; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
login() { curl -s -o /dev/null -c "$1" "${H[@]}" -d "{\"email\":\"$2\",\"password\":\"$PASS\"}" "$API/auth/login"; }
STAMP=$(date +%s)
T=/tmp/pg_pay; mkdir -p $T

# Dos "comprobantes" distintos (PNG mínimo válido; el segundo lleva un byte extra)
echo 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' | base64 -d > $T/p1.png
cp $T/p1.png $T/p2.png; printf '\0' >> $T/p2.png
echo 'no soy una imagen' > $T/falso.png

login $T/sa.txt superadmin@peregrinos.local
login $T/ad.txt admin@peregrinos.local
login $T/op.txt maria.operadora@peregrinos.local
EV=$(curl -s -b $T/sa.txt "$API/events" | jq -r '.items[0].id')

echo "1. Inscripción abierta y enlace"
check "el evento no expone el token" "$(curl -s -b $T/sa.txt "$API/events/$EV" | jq 'has("registrationToken")')" false
check "operador no ve el enlace" "$(code -b $T/op.txt "$API/events/$EV/registrations/link")" 403
LINK=$(curl -s -b $T/ad.txt "$API/events/$EV/registrations/link" | jq -r '.url'); TOKEN="${LINK##*/registro/}"
check "admin obtiene el enlace" "$([ -n "$TOKEN" ] && [ "$TOKEN" != "null" ] && echo si)" si
INFO=$(curl -s "$API/registration/info?token=$TOKEN")
check "info pública muestra la parroquia" "$(echo "$INFO" | jq -r '.event.parishName')" "Parroquia Nuestra Señora de Luján"
check "token inválido -> 404" "$(code "$API/registration/info?token=xxxxxxxxxxxxxxxxxxxxxxxxxxxx")" 404

echo "2. El peregrino se inscribe"
DOC="7$STAMP"
R=$(curl -s -c $T/pil.txt "${H[@]}" -d "{\"token\":\"$TOKEN\",\"firstName\":\"Pedro\",\"lastName\":\"Prueba\",\"documentNumber\":\"$DOC\",\"phone\":\"+54 9 11 6000 1234\"}" "$API/registration")
check "inscripción creada con acceso personal" "$(echo "$R" | jq -r '.access.link' | grep -c '/p/')" 1
check "estado inicial: sin comprobante" "$(echo "$R" | jq -r '.me.registration.status')" PENDING_PROOF
check "mismo documento -> 409" "$(code "${H[@]}" -d "{\"token\":\"$TOKEN\",\"firstName\":\"Otro\",\"lastName\":\"Nombre\",\"documentNumber\":\"$DOC\",\"phone\":\"+54 9 11 6000 1235\"}" "$API/registration")" 409
check "documento de un oficial -> 409" "$(code "${H[@]}" -d "{\"token\":\"$TOKEN\",\"firstName\":\"Otro\",\"lastName\":\"Nombre\",\"documentNumber\":\"28765432\",\"phone\":\"+54 9 11 6000 1236\"}" "$API/registration")" 409
check "aún sin QR (no verificado)" "$(code -b $T/pil.txt "$API/pilgrim/qr.svg")" 409
check "aún sin número" "$(curl -s -b $T/pil.txt "$API/pilgrim/me" | jq 'has("participant")')" false

echo "3. Comprobante"
check "archivo falso -> 400" "$(code -b $T/pil.txt "${X[@]}" -F amount=15000 -F file=@$T/falso.png "$API/pilgrim/payment-proof")" 400
check "comprobante válido -> 201" "$(code -b $T/pil.txt "${X[@]}" -F amount=15000 -F reference=OP12345 -F file=@$T/p1.png "$API/pilgrim/payment-proof")" 201
check "el mismo archivo -> 409" "$(code -b $T/pil.txt "${X[@]}" -F file=@$T/p1.png "$API/pilgrim/payment-proof")" 409
check "estado: en revisión" "$(curl -s -b $T/pil.txt "$API/pilgrim/me" | jq -r '.registration.status')" IN_REVIEW

echo "4. Revisión del administrador"
check "operador no revisa pagos" "$(code -b $T/op.txt "$API/events/$EV/registrations")" 403
LIST=$(curl -s -b $T/ad.txt "$API/events/$EV/registrations?status=IN_REVIEW")
RID=$(echo "$LIST" | jq -r --arg d "$DOC" '.items[] | select(.documentNumber==$d) | .id')
check "aparece en la lista en revisión" "$([ -n "$RID" ] && echo si)" si
PID=$(curl -s -b $T/ad.txt "$API/events/$EV/registrations/$RID" | jq -r '.proofs[0].id')
check "admin ve el comprobante (image/png)" "$(curl -s -o /dev/null -w '%{content_type}' -b $T/ad.txt "$API/events/$EV/registrations/$RID/proofs/$PID/file")" image/png
check "rechazar sin motivo -> 400" "$(code -b $T/ad.txt "${H[@]}" -d '{}' "$API/events/$EV/registrations/$RID/reject")" 400
check "rechazar con motivo -> 200" "$(code -b $T/ad.txt "${H[@]}" -d '{"reason":"El monto no coincide"}' "$API/events/$EV/registrations/$RID/reject")" 200
PM=$(curl -s -b $T/pil.txt "$API/pilgrim/me")
check "el peregrino ve el motivo" "$(echo "$PM" | jq -r '.registration.rejectionReason')" "El monto no coincide"
check "reenvía otro comprobante -> 201" "$(code -b $T/pil.txt "${X[@]}" -F amount=15000 -F file=@$T/p2.png "$API/pilgrim/payment-proof")" 201

echo "5. Confirmación -> listado oficial -> credencial"
check "operador no confirma" "$(code -b $T/op.txt "${H[@]}" -d '{}' "$API/events/$EV/registrations/$RID/approve")" 403
A=$(curl -s -b $T/ad.txt "${H[@]}" -d '{}' "$API/events/$EV/registrations/$RID/approve")
NUM=$(echo "$A" | jq -r '.number'); PART=$(echo "$A" | jq -r '.participantId')
check "recibe número asignado" "$([ "$NUM" -ge 6 ] 2>/dev/null && echo si)" si
check "credencial lista" "$(echo "$A" | jq -r '.credentialReady')" true
check "no se confirma dos veces" "$(code -b $T/ad.txt "${H[@]}" -d '{}' "$API/events/$EV/registrations/$RID/approve")" 409
ME=$(curl -s -b $T/pil.txt "$API/pilgrim/me")
check "la misma sesión pasa a ser oficial" "$(echo "$ME" | jq -r '.stage')" OFFICIAL
check "el peregrino ya tiene su número" "$(echo "$ME" | jq -r '.participant.number')" "$NUM"
check "el peregrino ya tiene QR" "$(code -b $T/pil.txt "$API/pilgrim/qr.svg")" 200
check "credencial PDF individual" "$(curl -s -b $T/ad.txt "$API/events/$EV/credentials/participants/$PART" | head -c 4)" "%PDF"
check "operador no exporta credenciales" "$(code -b $T/op.txt "$API/events/$EV/credentials/participants/$PART")" 403
check "lote por ids marcando impresas" "$(curl -s -b $T/ad.txt "$API/events/$EV/credentials?scope=ids&ids=$PART&mark=true&includeName=true" | head -c 4)" "%PDF"
check "ids inválidos -> 400" "$(code -b $T/ad.txt "$API/events/$EV/credentials?scope=ids&ids=nada")" 400
check "estado de credenciales" "$(curl -s -b $T/ad.txt "$API/events/$EV/credentials/status" | jq '.printed >= 1')" true

echo "6. Escaneo en el punto de control"
L=$(curl -s -b $T/op.txt "$API/events/$EV/participants/lookup?number=$NUM")
check "el operador identifica al peregrino nuevo" "$(echo "$L" | jq -r '.participant.lastName')" Prueba
check "con teléfono y hora del servidor" "$(echo "$L" | jq '[.participant.phone != null, .serverTime != null] | all')" true

echo "7. Pago en efectivo (sin comprobante)"
DOC2="8$STAMP"
curl -s -o /dev/null -c $T/pil2.txt "${H[@]}" -d "{\"token\":\"$TOKEN\",\"firstName\":\"Ana\",\"lastName\":\"Efectivo\",\"documentNumber\":\"$DOC2\",\"phone\":\"+54 9 11 6000 4321\"}" "$API/registration"
RID2=$(curl -s -b $T/ad.txt "$API/events/$EV/registrations?q=Efectivo" | jq -r '.items[0].id')
check "sin comprobante no se confirma" "$(code -b $T/ad.txt "${H[@]}" -d '{}' "$API/events/$EV/registrations/$RID2/approve")" 409
check "con 'sin comprobante' sí" "$(code -b $T/ad.txt "${H[@]}" -d '{"withoutProof":true}' "$API/events/$EV/registrations/$RID2/approve")" 200

echo; echo "Resultado: $ok OK, $fail FAIL"; [ "$fail" -eq 0 ]

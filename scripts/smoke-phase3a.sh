#!/usr/bin/env bash
# Prueba de la Fase 3A (invitaciones, niveles, acceso del peregrino, contactos). Requiere seed, curl y jq.
set -u
API="${API_URL:-http://localhost:4000}/api"
PASS="${SEED_PASSWORD:-Peregrinos2026!}"
H=(-H 'Content-Type: application/json' -H 'X-PG-Client: web')
ok=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "  OK   $1"; ok=$((ok+1)); else echo "  FAIL $1 (esperado $3, obtuve $2)"; fail=$((fail+1)); fi; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
login() { curl -s -o /dev/null -c "$1" "${H[@]}" -d "{\"email\":\"$2\",\"password\":\"$PASS\"}" "$API/auth/login"; }
STAMP=$(date +%s)

login /tmp/pg_sa.txt superadmin@peregrinos.local
login /tmp/pg_ad.txt admin@peregrinos.local
login /tmp/pg_op.txt maria.operadora@peregrinos.local
EV=$(curl -s -b /tmp/pg_sa.txt "$API/events" | jq -r '.items[0].id')
CP4=$(curl -s -b /tmp/pg_sa.txt "$API/events/$EV/checkpoints" | jq -r '.items[3].id')

echo "1. Invitaciones y niveles"
check "operador no puede invitar" "$(code -b /tmp/pg_op.txt "${H[@]}" -d '{"email":"x@y.com","role":"OPERATOR"}' "$API/invitations")" 403
check "admin no puede invitar a ADMIN" "$(code -b /tmp/pg_ad.txt "${H[@]}" -d "{\"email\":\"a$STAMP@y.com\",\"role\":\"ADMIN\"}" "$API/invitations")" 403
R=$(curl -s -b /tmp/pg_ad.txt "${H[@]}" -d "{\"email\":\"nuevo$STAMP@demo.com\",\"role\":\"OPERATOR\",\"extraPermissions\":[\"participant:create\"],\"checkpointIds\":[\"$CP4\"]}" "$API/invitations")
URL=$(echo "$R" | jq -r '.inviteUrl'); TOKEN="${URL##*token=}"
check "admin invita a operador con altas" "$(echo "$R" | jq -r '.invitation.status')" PENDING
check "invitación repetida -> 409" "$(code -b /tmp/pg_ad.txt "${H[@]}" -d "{\"email\":\"nuevo$STAMP@demo.com\",\"role\":\"OPERATOR\"}" "$API/invitations")" 409
check "vista previa muestra el correo" "$(curl -s "$API/invitations/preview?token=$TOKEN" | jq -r '.email')" "nuevo$STAMP@demo.com"
check "reenviar invalida el enlace anterior" "$(code -b /tmp/pg_ad.txt "${H[@]}" -X POST "$API/invitations/$(echo "$R" | jq -r '.invitation.id')/resend")" 200
check "enlace viejo ya no sirve" "$(code "$API/invitations/preview?token=$TOKEN")" 404
IID=$(echo "$R" | jq -r '.invitation.id')
R2=$(curl -s -b /tmp/pg_ad.txt "${H[@]}" -X POST "$API/invitations/$IID/resend"); TOKEN2="${R2##*token=}"; TOKEN2=$(echo "$R2" | jq -r '.inviteUrl'); TOKEN2="${TOKEN2##*token=}"
check "aceptar con clave corta -> 400" "$(code "${H[@]}" -d "{\"token\":\"$TOKEN2\",\"name\":\"Nuevo Operador\",\"password\":\"corta\"}" "$API/invitations/accept")" 400
check "aceptar invitación -> 201" "$(code -c /tmp/pg_new.txt "${H[@]}" -d "{\"token\":\"$TOKEN2\",\"name\":\"Nuevo Operador\",\"password\":\"ClaveSegura2026\"}" "$API/invitations/accept")" 201
check "el enlace es de un solo uso" "$(code "${H[@]}" -d "{\"token\":\"$TOKEN2\",\"name\":\"Otro\",\"password\":\"ClaveSegura2026\"}" "$API/invitations/accept")" 410
ME=$(curl -s -b /tmp/pg_new.txt "$API/auth/me")
check "tiene el permiso de altas" "$(echo "$ME" | jq '.permissions | index("participant:create") != null')" true
check "tiene su punto asignado" "$(echo "$ME" | jq -r '.currentCheckpoint.checkpointName')" Santuario
check "puede agregar participantes" "$(code -b /tmp/pg_new.txt "${H[@]}" -d "{\"firstName\":\"Prueba\",\"lastName\":\"Alta\",\"documentNumber\":\"9$STAMP\",\"phone\":\"+54 9 11 7000 0000\"}" "$API/events/$EV/participants")" 201
check "pero no editar participantes ni ver historial" "$(code -b /tmp/pg_new.txt "$API/events/$EV/checkins")" 403
check "maria (sin altas) no puede agregar" "$(code -b /tmp/pg_op.txt "${H[@]}" -d '{"firstName":"A","lastName":"B","documentNumber":"12345678","phone":"1234567"}' "$API/events/$EV/participants")" 403

echo "2. Acceso del peregrino"
check "operador no emite accesos" "$(code -b /tmp/pg_op.txt "${H[@]}" -d '{}' "$API/events/$EV/access/issue")" 403
P2=$(curl -s -b /tmp/pg_sa.txt "$API/events/$EV/participants/lookup?number=2" | jq -r '.participant.id')
A=$(curl -s -b /tmp/pg_ad.txt "${H[@]}" -X POST "$API/events/$EV/access/participants/$P2/reissue")
LINK=$(echo "$A" | jq -r '.link'); PTOKEN="${LINK##*/p/}"; PCODE=$(echo "$A" | jq -r '.code')
check "código inválido -> 401" "$(code "${H[@]}" -d '{"code":"AAAAA-BBBBB"}' "$API/pilgrim/login")" 401
check "login con código -> 200" "$(code -c /tmp/pg_p1.txt "${H[@]}" -d "{\"code\":\"$PCODE\"}" "$API/pilgrim/login")" 200
check "login con enlace -> 200" "$(code -c /tmp/pg_p2.txt "${H[@]}" -d "{\"token\":\"$PTOKEN\"}" "$API/pilgrim/login")" 200
PM=$(curl -s -b /tmp/pg_p2.txt "$API/pilgrim/me")
check "peregrino ve su nombre" "$(echo "$PM" | jq -r '.participant.firstName')" "María"
check "el QR empieza con PG1:" "$(echo "$PM" | jq -r '.qrContent' | head -c 4)" "PG1:"
check "documento enmascarado" "$(echo "$PM" | jq -r '.participant.documentMasked' | tail -c 4)" "432"
check "no expone teléfono ni otros participantes" "$(echo "$PM" | jq '[.participant|has("phone"), has("participants")] | any')" false
check "QR svg" "$(curl -s -b /tmp/pg_p2.txt "$API/pilgrim/qr.svg" | head -c 4)" "<svg"
check "peregrino no accede a rutas de personal" "$(code -b /tmp/pg_p2.txt "$API/events")" 401
check "sesión del personal no sirve en /pilgrim" "$(code -b /tmp/pg_sa.txt "$API/pilgrim/me")" 401
check "/session distingue peregrino" "$(curl -s -b /tmp/pg_p2.txt "$API/session" | jq -r '.kind')" pilgrim
check "/session distingue personal" "$(curl -s -b /tmp/pg_sa.txt "$API/session" | jq -r '.kind')" staff
check "/session sin cookies" "$(curl -s "$API/session" | jq -r '.kind')" none
A2=$(curl -s -b /tmp/pg_ad.txt "${H[@]}" -X POST "$API/events/$EV/access/participants/$P2/reissue")
check "tras reemitir, la sesión anterior se cierra" "$(code -b /tmp/pg_p2.txt "$API/pilgrim/me")" 401
check "el enlace anterior ya no funciona" "$(code "${H[@]}" -d "{\"token\":\"$PTOKEN\"}" "$API/pilgrim/login")" 401
check "emisión masiva a quienes faltan" "$(code -b /tmp/pg_ad.txt "${H[@]}" -d '{}' "$API/events/$EV/access/issue")" 200

echo "3. Contactos"
check "admin crea contacto" "$(code -b /tmp/pg_ad.txt "${H[@]}" -d '{"name":"Cruz Roja local","roleLabel":"Emergencias","phone":"+54 9 11 5000 0009","isEmergency":true}' "$API/events/$EV/contacts")" 201
check "operador no crea contactos" "$(code -b /tmp/pg_op.txt "${H[@]}" -d '{"name":"X Y","phone":"1234567"}' "$API/events/$EV/contacts")" 403
PCODE2=$(echo "$A2" | jq -r '.code')
curl -s -o /dev/null -c /tmp/pg_p3.txt "${H[@]}" -d "{\"code\":\"$PCODE2\"}" "$API/pilgrim/login"
check "el peregrino ve los contactos" "$(curl -s -b /tmp/pg_p3.txt "$API/pilgrim/me" | jq '.contacts | map(.name) | index("Cruz Roja local") != null')" true

echo; echo "Resultado: $ok OK, $fail FAIL"; [ "$fail" -eq 0 ]

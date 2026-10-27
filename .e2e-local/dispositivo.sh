#!/usr/bin/env bash
# Servidor LOCAL para probar la app Android de PRUEBA en un teléfono por USB (adb reverse tcp:3000 tcp:3000):
# PostgreSQL 18 desechable (127.0.0.1:5444), API (4555) y web compilada (3000, CSP aplicada) con datos sintéticos.
# Sigue en marcha hasta que exista el archivo .e2e-local/dispositivo.detener; entonces lo borra todo.
# Uso: bash .e2e-local/dispositivo.sh      (nunca usa apps/api/.env ni producción)
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
NAME="peregrinos-dispositivo-desechable"
PASS="disp-$(date +%s)-$RANDOM"
export DATABASE_URL="postgresql://postgres:${PASS}@127.0.0.1:5444/peregrinos?sslmode=disable&connection_limit=20"
case "$DATABASE_URL" in *127.0.0.1:5444*) ;; *) echo "DATABASE_URL no es local: abortado"; exit 2;; esac
export NODE_ENV=development PORT=4555 WEB_ORIGIN=http://localhost:3000 COOKIE_SECURE=false
export JWT_SECRET="dispositivo-local-secret-0123456789-abcdefghijklmnop"
export SEED_PASSWORD="Peregrinos2026!" INVITE_TTL_DAYS=7 PILGRIM_SESSION_DAYS=60
unset SMTP_URL FIREBASE_SERVICE_ACCOUNT ANTHROPIC_API_KEY YOUTUBE_API_KEY
STOP="$HERE/dispositivo.detener"; rm -f "$STOP"
LOG="$HERE/api-dispositivo.log"; WEBLOG="$HERE/web-dispositivo.log"

docker rm -f "$NAME" >/dev/null 2>&1
docker run -d --name "$NAME" --label peregrinos.purpose=e2e-desechable -e POSTGRES_PASSWORD="$PASS" -e POSTGRES_DB=peregrinos \
  -p 127.0.0.1:5444:5432 postgres:18-alpine >/dev/null || { echo "DOCKER FAILED"; exit 1; }
API=""; WEB=""
cleanup() { [ -n "$WEB" ] && kill $WEB 2>/dev/null; [ -n "$API" ] && kill $API 2>/dev/null; sleep 1; docker rm -f "$NAME" >/dev/null 2>&1; echo "DETENIDO"; }
trap cleanup EXIT
for i in $(seq 1 60); do docker exec "$NAME" pg_isready -U postgres -d peregrinos >/dev/null 2>&1 && break; sleep 1; done
sleep 2
cd "$ROOT/apps/api"
npx.cmd prisma migrate deploy > "$HERE/migrate-disp.log" 2>&1 || { echo "MIGRATE FAILED"; exit 1; }
npx.cmd tsx prisma/seed.ts > "$HERE/seed-disp.log" 2>&1 || { echo "SEED FAILED"; exit 1; }
node "$HERE/setup.mjs" >> "$HERE/seed-disp.log" 2>&1 || { echo "SETUP FAILED"; exit 1; }
node --import tsx src/server.ts > "$LOG" 2>&1 &
API=$!
for i in $(seq 1 120); do curl -sf http://127.0.0.1:4555/api/health >/dev/null 2>&1 && break; sleep 0.5; done
cd "$HERE"; API_LOG="$LOG" node dispositivo-datos.mjs || { echo "DATOS FAILED"; exit 1; }
cd "$ROOT/apps/web"
# La API corre con NODE_ENV=development (correo en el registro); la web se compila y sirve como producción.
NODE_ENV=production API_URL=http://127.0.0.1:4555 npx.cmd next build > "$HERE/web-build-disp.log" 2>&1 || { echo "WEB BUILD FAILED"; exit 1; }
CSP_MODE=enforce NODE_ENV=production npx.cmd next start -p 3000 -H 127.0.0.1 > "$WEBLOG" 2>&1 &
WEB=$!
for i in $(seq 1 120); do curl -sf http://127.0.0.1:3000/login >/dev/null 2>&1 && break; sleep 0.5; done
echo "LISTO web=http://127.0.0.1:3000 api=http://127.0.0.1:4555"
while [ ! -f "$STOP" ]; do sleep 2; done
rm -f "$STOP"

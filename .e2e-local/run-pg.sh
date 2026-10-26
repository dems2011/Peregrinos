#!/usr/bin/env bash
# Uso: bash .e2e-local/run-pg.sh <e2e.mjs> <log>
# Igual que run.sh pero contra PostgreSQL 18 REAL en un contenedor DESECHABLE (varias conexiones simultáneas: necesario
# para probar concurrencia). Crea el contenedor, migra, siembra, levanta la API, ejecuta el escenario y lo destruye.
# Solo 127.0.0.1:5442; nunca usa apps/api/.env.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
E2E="$HERE/$1"; LOG="$HERE/$2"
NAME="peregrinos-e2e-pg-desechable"
PASS="e2e-$(date +%s)-$RANDOM"
export DATABASE_URL="postgresql://postgres:${PASS}@127.0.0.1:5442/peregrinos?sslmode=disable&connection_limit=20"
case "$DATABASE_URL" in *127.0.0.1:5442*) ;; *) echo "DATABASE_URL no es local: abortado"; exit 2;; esac
export NODE_ENV=development PORT=4555 WEB_ORIGIN=http://localhost:3000 COOKIE_SECURE=false
export JWT_SECRET="e2e-local-secret-0123456789-abcdefghijklmnopqrstuvwxyz"
export SEED_PASSWORD="Peregrinos2026!" INVITE_TTL_DAYS=7 PILGRIM_SESSION_DAYS=60
unset SMTP_URL FIREBASE_SERVICE_ACCOUNT ANTHROPIC_API_KEY YOUTUBE_API_KEY

docker rm -f "$NAME" >/dev/null 2>&1
docker run -d --name "$NAME" --label peregrinos.purpose=e2e-desechable -e POSTGRES_PASSWORD="$PASS" -e POSTGRES_DB=peregrinos \
  -p 127.0.0.1:5442:5432 postgres:18-alpine >/dev/null || { echo "DOCKER FAILED"; exit 1; }
cleanup() { [ -n "${API:-}" ] && kill $API 2>/dev/null; sleep 1; docker rm -f "$NAME" >/dev/null 2>&1; }
API=""
trap cleanup EXIT
for i in $(seq 1 60); do docker exec "$NAME" pg_isready -U postgres -d peregrinos >/dev/null 2>&1 && break; sleep 1; done
sleep 2

cd "$ROOT/apps/api"
npx.cmd prisma migrate deploy > "$HERE/migrate-pg.log" 2>&1 || { echo "MIGRATE FAILED"; tail -20 "$HERE/migrate-pg.log"; exit 1; }
grep -E "migrations? (found|have been applied)|All migrations" "$HERE/migrate-pg.log"
npx.cmd tsx prisma/seed.ts > "$HERE/seed-pg.log" 2>&1 || { echo "SEED FAILED"; tail -20 "$HERE/seed-pg.log"; exit 1; }
node "$HERE/setup.mjs" >> "$HERE/seed-pg.log" 2>&1 || { echo "SETUP FAILED"; tail -20 "$HERE/seed-pg.log"; exit 1; }
node --import tsx src/server.ts > "$LOG" 2>&1 &
API=$!
for i in $(seq 1 120); do curl -sf http://127.0.0.1:4555/api/health >/dev/null 2>&1 && break; sleep 0.5; done
cd "$HERE"
API_LOG="$LOG" node "$E2E" 2>&1 | cut -c1-600; RC=${PIPESTATUS[0]}

echo "E2E rc=$RC"
exit $RC

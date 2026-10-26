#!/usr/bin/env bash
# Uso: bash .e2e-local/run.sh <e2e.mjs> <log>
# Base nueva en memoria → migraciones locales → seed → API → E2E → apaga todo. Solo 127.0.0.1:5441.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
E2E="$HERE/$1"; LOG="$HERE/$2"
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5441/postgres?sslmode=disable&connection_limit=1&pool_timeout=60&pgbouncer=true"
case "$DATABASE_URL" in *127.0.0.1:5441*) ;; *) echo "DATABASE_URL no es local: abortado"; exit 2;; esac
export NODE_ENV=development PORT=4555 WEB_ORIGIN=http://localhost:3000 COOKIE_SECURE=false
export JWT_SECRET="e2e-local-secret-0123456789-abcdefghijklmnopqrstuvwxyz"
export SEED_PASSWORD="Peregrinos2026!" INVITE_TTL_DAYS=7 PILGRIM_SESSION_DAYS=60
unset SMTP_URL

node "$HERE/server.mjs" > "$HERE/pglite.log" 2>&1 &
PG=$!
for i in $(seq 1 60); do grep -q PGLITE_READY "$HERE/pglite.log" 2>/dev/null && break; sleep 0.5; done
cleanup() { kill $API 2>/dev/null; sleep 1; kill $PG 2>/dev/null; wait 2>/dev/null; }
API=""
trap cleanup EXIT

cd "$ROOT/apps/api"
npx.cmd prisma migrate deploy > "$HERE/migrate.log" 2>&1 || { echo "MIGRATE FAILED"; tail -20 "$HERE/migrate.log"; exit 1; }
npx.cmd tsx prisma/seed.ts > "$HERE/seed.log" 2>&1 || { echo "SEED FAILED"; tail -20 "$HERE/seed.log"; exit 1; }
node "$HERE/setup.mjs" >> "$HERE/seed.log" 2>&1 || { echo "SETUP FAILED"; tail -20 "$HERE/seed.log"; exit 1; }
node --import tsx src/server.ts > "$LOG" 2>&1 &
API=$!
for i in $(seq 1 120); do curl -sf http://127.0.0.1:4555/api/health >/dev/null 2>&1 && break; sleep 0.5; done
cd "$HERE"
API_LOG="$LOG" node "$E2E" 2>&1 | cut -c1-600; RC=${PIPESTATUS[0]}

echo "E2E rc=$RC"
exit $RC

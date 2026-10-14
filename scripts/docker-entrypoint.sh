#!/bin/sh
# Startet PocketBase (intern) und Next.js in einem Container.
# Beim ersten Start werden Collections, Regeln und Demo-Daten angelegt (idempotent).
set -eu

PB_DIR="${PB_DATA_DIR:-/data/pb_data}"
PB_ADMIN_EMAIL="${PB_ADMIN_EMAIL:?PB_ADMIN_EMAIL muss gesetzt sein}"
PB_ADMIN_PASSWORD="${PB_ADMIN_PASSWORD:?PB_ADMIN_PASSWORD muss gesetzt sein}"
export PB_ADMIN_EMAIL PB_ADMIN_PASSWORD

# 1. Superuser anlegen bzw. aktualisieren (Passwort aus der Umgebung)
pocketbase superuser upsert "$PB_ADMIN_EMAIL" "$PB_ADMIN_PASSWORD" --dir="$PB_DIR" >/dev/null

# 2. PocketBase starten, nur im Container erreichbar
pocketbase serve --http=127.0.0.1:8090 --dir="$PB_DIR" --automigrate=false &
PB_PID=$!

cleanup() { kill "$PB_PID" "${NEXT_PID:-}" 2>/dev/null || true; }
trap cleanup TERM INT

# 3. Auf PocketBase warten
i=0
until wget -q -O /dev/null http://127.0.0.1:8090/api/health; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then echo "PocketBase wurde nicht rechtzeitig bereit" >&2; exit 1; fi
  sleep 1
done

# 4. Initialisieren (legt nur an, was fehlt; vorhandene Daten bleiben unberuehrt)
NEXT_PUBLIC_PB_URL="http://127.0.0.1:8090" node /app/scripts/seed.mjs

# 5. Next.js starten
node /app/server.js &
NEXT_PID=$!

# Beendet sich einer der Prozesse, faehrt der Container herunter
while kill -0 "$PB_PID" 2>/dev/null && kill -0 "$NEXT_PID" 2>/dev/null; do
  sleep 2
done
cleanup
exit 1

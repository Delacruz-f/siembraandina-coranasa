#!/bin/sh
# Punto de entrada del contenedor: espera a la base, aplica migraciones y
# arranca el proceso. Si las migraciones fallan, el contenedor no arranca
# (mejor fallar rápido que servir con un esquema incompleto).
set -eu

HOST="${DB_HOST:-postgres}"
PUERTO="${DB_PORT:-5432}"
ESPERA_MAXIMA="${DB_WAIT_SECONDS:-60}"

echo "Esperando a la base de datos en ${HOST}:${PUERTO} (máximo ${ESPERA_MAXIMA}s)..."
intentos=0
until node -e "
  const net = require('net');
  const socket = net.connect(${PUERTO}, '${HOST}');
  socket.on('connect', () => { socket.end(); process.exit(0); });
  socket.on('error', () => process.exit(1));
" 2>/dev/null; do
  intentos=$((intentos + 1))
  if [ "${intentos}" -ge "${ESPERA_MAXIMA}" ]; then
    echo "La base de datos no respondió a tiempo." >&2
    exit 1
  fi
  sleep 1
done

if [ "${MIGRATE_ON_START:-true}" = "true" ]; then
  echo "Aplicando migraciones..."
  npx knex migrate:latest --knexfile knexfile.js

  if [ "${SEED_ON_START:-false}" = "true" ]; then
    echo "Cargando catálogos base (seed)..."
    npx knex seed:run --knexfile knexfile.js
  fi
fi

echo "Arrancando: $*"
exec "$@"

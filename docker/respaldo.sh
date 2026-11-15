#!/bin/sh
# Respaldo automático de PostgreSQL.
#  - Modo "vigilante": ejecuta pg_dump cada RESPALDO_HORAS (por defecto 24 h).
#  - Modo "una vez":    ejecuta un respaldo inmediato y termina.
# Los archivos quedan en /respaldos como <base>-<fecha>.sql.gz y se eliminan
# los más antiguos que RESPALDO_RETENCION_DIAS.
set -eu

HORAS="${RESPALDO_HORAS:-24}"
RETENCION="${RESPALDO_RETENCION_DIAS:-14}"
DESTINO="${RESPALDO_DIR:-/respaldos}"
HOST="${RESPALDO_HOST:-postgres}"

respaldar() {
  marca="$(date +%Y%m%d-%H%M%S)"
  archivo="${DESTINO}/${DB_NAME}-${marca}.sql.gz"
  echo "[$(date -Iseconds)] Respaldo de ${DB_NAME} -> ${archivo}"
  if pg_dump -h "${HOST}" -U "${DB_USER}" -d "${DB_NAME}" --no-owner --clean --if-exists \
    | gzip -9 > "${archivo}.tmp"; then
    mv "${archivo}.tmp" "${archivo}"
    echo "[$(date -Iseconds)] Respaldo completado ($(du -h "${archivo}" | cut -f1))"
  else
    rm -f "${archivo}.tmp"
    echo "[$(date -Iseconds)] ERROR: el respaldo falló" >&2
    return 1
  fi
  find "${DESTINO}" -name "${DB_NAME}-*.sql.gz" -mtime "+${RETENCION}" -delete 2>/dev/null || true
}

mkdir -p "${DESTINO}"

if [ "${1:-}" = "una-vez" ]; then
  respaldar
  exit $?
fi

# Modo vigilante: primer respaldo al arrancar y luego cada N horas.
respaldar || true
while :; do
  sleep $((HORAS * 3600))
  respaldar || true
done

# Siembra Andina — imagen de producción.
# Multi-etapa: las dependencias de compilación (sharp, toolchain) no llegan a
# la imagen final. Usuario sin privilegios y healthcheck contra /salud.
FROM node:20-bookworm-slim AS dependencias
WORKDIR /app
COPY package.json package-lock.json* ./
# `npm ci` respeta el lockfile; se omite la preparación de husky en el contenedor.
RUN npm ci --omit=dev --ignore-scripts && npm rebuild sharp

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    TZ=America/Lima

# Curl se usa solo para el healthcheck y la espera de la base.
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl tini ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=dependencias /app/node_modules ./node_modules
COPY package.json ./
COPY knexfile.js ./
COPY src ./src
COPY views ./views
COPY public ./public
COPY migrations ./migrations
COPY seeds ./seeds
COPY scripts ./scripts
COPY docker ./docker

# Carpeta de binarios subidos (fuera de public/) y su dueño.
RUN mkdir -p /app/storage/uploads && chown -R node:node /app/storage /app

USER node
EXPOSE 3000

# Migraciones + arranque (ver docker/entrada.sh).
ENTRYPOINT ["/usr/bin/tini", "--", "/app/docker/entrada.sh"]
CMD ["node", "src/server.js"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/salud/vivo" || exit 1

# Guía de despliegue — Siembra Andina

Tres caminos, del más controlado al más rápido. Recomendado: **VPS con Docker + Nginx + Let's
Encrypt**, porque deja los respaldos y los binarios subidos bajo tu control.

---

## 0. Antes de cualquier cosa

```bash
cp .env.example .env
# Genera el secreto de sesión (obligatorio, mínimo 32 caracteres):
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Variables que **debes** cambiar en producción:

| Variable                  | Valor en producción                             |
| ------------------------- | ----------------------------------------------- |
| `NODE_ENV`                | `production`                                    |
| `APP_BASE_URL`            | `https://tu-dominio.pe` (obligatorio y HTTPS)   |
| `SESSION_SECRET`          | 48 bytes aleatorios (nunca el de ejemplo)       |
| `SESSION_COOKIE_SECURE`   | `1`                                             |
| `TRUST_PROXY`             | `1`                                             |
| `DB_PASSWORD`             | contraseña larga y distinta de la de desarrollo |
| `SMTP_HOST` / `SMTP_FROM` | cuenta real (obligatorio en producción)         |
| `SEED_ON_START`           | `true` solo la primera vez                      |
| `RESPALDO_RETENCION_DIAS` | según tu política (por defecto 14)              |

---

## 1. VPS con Docker, Nginx y HTTPS gratis (recomendado)

Requisitos: un servidor Ubuntu 22.04/24.04 con 2 GB de RAM, el dominio apuntando a su IP
(registros `A` para el dominio y `www`).

```bash
# 1) Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER" && newgrp docker

# 2) Código
sudo mkdir -p /opt/siembra && sudo chown "$USER" /opt/siembra
git clone <url-del-repositorio> /opt/siembra && cd /opt/siembra
cp .env.example .env && nano .env      # completa la tabla de arriba

# 3) Arranque (construye la imagen, migra y siembra catálogos)
docker compose up -d --build
docker compose logs -f app              # espera "escuchando en ..."
curl -fsS http://127.0.0.1:3000/salud   # {"ok":true,...}
```

### Nginx como proxy inverso

`/etc/nginx/sites-available/siembra`:

```nginx
server {
  listen 80;
  server_name tu-dominio.pe www.tu-dominio.pe;

  client_max_body_size 12m;          # igual o mayor que UPLOADS_MAX_BYTES (10 MB)

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade           $http_upgrade;
    proxy_set_header Connection        "upgrade";
  }

  # Los estáticos propios se sirven directo desde disco.
  location /css/  { alias /opt/siembra/public/css/;  expires 7d; access_log off; }
  location /js/   { alias /opt/siembra/public/js/;   expires 7d; access_log off; }
  location /img/  { alias /opt/siembra/public/img/;  expires 7d; access_log off; }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/siembra /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# HTTPS gratuito con Let's Encrypt
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d tu-dominio.pe -d www.tu-dominio.pe --redirect
sudo certbot renew --dry-run      # renovación automática (systemd timer)
```

### Actualizar

```bash
cd /opt/siembra
git pull
docker compose up -d --build      # las migraciones se aplican al arrancar el contenedor
```

Sin ventana de caída: el `ENTRYPOINT` espera la base, ejecuta `knex migrate:latest` y solo después
arranca Node; si una migración falla el contenedor no se levanta (falla rápido).

### Respaldos

El servicio `respaldo` de `docker-compose.yml` ejecuta `pg_dump` al arrancar y luego cada
`RESPALDO_HORAS` (24 por defecto), guardando `.sql.gz` en el volumen `respaldos` y borrando los más
antiguos que `RESPALDO_RETENCION_DIAS`.

```bash
# Respaldo inmediato
docker compose exec respaldo /bin/sh /usr/local/bin/respaldo.sh una-vez

# Copiar los respaldos fuera del servidor (obligatorio)
docker run --rm -v siembra_respaldos:/datos -v "$PWD":/salida alpine \
  tar czf /salida/respaldos-$(date +%F).tgz -C /datos .

# Restaurar
gunzip -c siembra_andina-20261113-030000.sql.gz | \
  docker compose exec -T postgres psql -U postgres -d siembra_andina
```

Además, respalda el volumen `subidas` (fotos y documentos) con la misma frecuencia.

---

## 2. Render

1. **New → Blueprint** y apunta al repositorio (usa el `Dockerfile` directamente).
2. Crea un **PostgreSQL** gestionado y copia su _Internal Database URL_.
3. Variables: las de la tabla, con `DB_CLIENT=pg`, `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME`
   sacados de la URL gestionada, `MIGRATE_ON_START=true` y `SEED_ON_START=true` la primera vez.
4. **Disk**: añade un disco persistente de 1 GB montado en `/app/storage/uploads` (sin él, las
   imágenes se pierden en cada despliegue).
5. Health check: `/salud`. Render pone HTTPS y el proxy automáticamente.
6. Los respaldos gestionados de Render sustituyen al servicio `respaldo`; activa el plan con
   _Point-in-Time Recovery_ si está disponible.

## 3. Railway

1. **Deploy from repo** (detecta el `Dockerfile`) y añade el plugin **PostgreSQL**.
2. Railway expone `DATABASE_URL`; o bien la desglosas en `DB_HOST`, `DB_PORT`…, o añades
   `DB_URL` a tu gestor de configuración. Mantén `DB_CLIENT=pg`.
3. Añade un volumen en `/app/storage/uploads`.
4. `SEED_ON_START=true` solo en el primer despliegue; después vuelve a `false`.

### Nota sobre PaaS y binarios subidos

En Render/Railway **el disco es imprescindible** con `STORAGE_DRIVER=local`. Si no quieres depender
del disco, implementa el adaptador S3 de la Fase 10 y usa `STORAGE_DRIVER=s3` (ver
`docs/informe-fase-11.md`, deuda técnica).

---

## 4. Comprobaciones tras desplegar

```bash
curl -fsS https://tu-dominio.pe/salud          # base de datos OK
curl -fsS https://tu-dominio.pe/api/v1         # API v1
curl -fsS https://tu-dominio.pe/manifest.webmanifest
curl -I https://tu-dominio.pe                  # HSTS, CSP, X-Frame-Options
curl -fsS https://tu-dominio.pe/sin-conexion
```

- Abre `https://tu-dominio.pe/api/docs` y comprueba que la especificación carga.
- En Android Chrome: menú → **Instalar aplicación**; debe aparecer el ícono y abrir en modo
  _standalone_.
- Envía un formulario de contacto para verificar SMTP.

## 5. Operación

- **Logs**: `docker compose logs -f app` (pino en JSON; `LOG_LEVEL=info` en producción).
- **Trabajos programados**: se ejecutan dentro del contenedor cada día (zona `America/Lima`); el
  histórico está en `/admin/trabajos`.
- **Escalado**: una sola instancia es suficiente; si se levantan varias, `node-cron` ejecutaría los
  trabajos varias veces. Para escalar, mueve los trabajos a un proceso aparte (`node src/jobs/cron.js`).

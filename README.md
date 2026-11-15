# Siembra Andina

Plataforma web para comunidades agrícolas de la sierra peruana. Recomienda cuándo sembrar
**papa, maíz y quinua** combinando el calendario agrícola tradicional con la humedad y la
temperatura del suelo.

**Stack:** Node.js 20 · Express 4 · EJS · Knex (MySQL 8 / PostgreSQL 15) · express-session +
connect-session-knex · bcryptjs · Nodemailer (SMTP) · express-validator · helmet · csrf-csrf · express-rate-limit ·
multer + sharp · Chart.js · Leaflet · node-cron · pino · Jest + Supertest.

> Estado actual: **Fase 9** — sincronización de datos NASA POWER y pronósticos Open-Meteo,
> con ejecución de trabajos controlada desde Administración.

---

## Requisitos

- **Node.js 20 LTS** o superior (`node -v`). Descarga: https://nodejs.org/es/download
- **MySQL 8 / MariaDB** (viene con XAMPP) **o** **PostgreSQL 15**.
- Windows con `cmd` (los comandos de abajo funcionan en cmd y también en PowerShell).

## Instalación paso a paso (Windows / cmd)

### 1. Descargar dependencias

```cmd
cd /d E:\siembra-andina
npm install
```

### 2. Crear el archivo de configuración

```cmd
copy .env.example .env
```

Abre `.env` con el Bloc de notas y edita, como mínimo, estas líneas:

```ini
DB_CLIENT=mysql2
DB_USER=root
DB_PASSWORD=
DB_NAME=siembra_andina
SESSION_SECRET=<genera uno abajo>
```

Genera un `SESSION_SECRET` largo y aleatorio:

```cmd
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Si falta alguna variable obligatoria o tiene un valor inválido, al arrancar verás un mensaje
claro indicando exactamente qué corregir (el proceso no arranca a medias).

### 3. Crear la base de datos

#### Opción A — MySQL 8 con XAMPP

1. Abre el **Panel de control de XAMPP** y pulsa **Start** en _Apache_ y en _MySQL_.
2. Entra a http://localhost/phpmyadmin
3. Pestaña **Bases de datos** → nombre `siembra_andina` → cotejamiento `utf8mb4_general_ci` → **Crear**.
4. En `.env` deja:

   ```ini
   DB_CLIENT=mysql2
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=
   DB_NAME=siembra_andina
   ```

   (En XAMPP el usuario `root` suele no tener contraseña. Si le pusiste una, escríbela.)

#### Opción B — PostgreSQL 15

1. Abre **SQL Shell (psql)** (o `psql -U postgres`).
2. Crea la base de datos:

   ```cmd
   CREATE DATABASE siembra_andina;
   ```

   O desde la terminal de Windows:

   ```cmd
   "C:\Program Files\PostgreSQL\15\bin\psql.exe" -U postgres -c "CREATE DATABASE siembra_andina;"
   ```

3. En `.env` cambia **solo** estas líneas:

   ```ini
   DB_CLIENT=pg
   DB_PORT=5432
   DB_USER=postgres
   DB_PASSWORD=la_clave_que_pusiste_al_instalar
   DB_NAME=siembra_andina
   ```

### 4. Crear las tablas y cargar datos iniciales

El diseño ER, las relaciones y la justificación de 3FN están en
[docs/modelo.md](./docs/modelo.md).

Para crear un administrador durante el seed, configura `ADMIN_EMAIL`,
`ADMIN_NOMBRE` y `ADMIN_PASSWORD` en `.env`. Si las dejas vacías, el seed omite
esa cuenta; si completas solo algunas, informa un error.

```cmd
npm run migrate
npm run seed
```

### 5. Crear el primer administrador (alternativa)

Si no configuraste las variables de administrador antes del seed, puedes crear
la cuenta con el script:

```cmd
npm run admin:crear -- admin@tucorreo.pe "Nombre del administrador" "UnaClaveSegura2026"
```

El script es idempotente: si el correo ya existe, solo le asigna el rol de administrador
(sin cambiar su contraseña). Las cuentas nuevas quedan verificadas; una cuenta existente que
aún no verificó su correo debe completar la verificación antes de iniciar sesión.

### 6. Arrancar

```cmd
npm start
```

Abre http://localhost:3000. Comprueba el estado del sistema en http://localhost:3000/salud:

```json
{
  "ok": true,
  "estado": "ok",
  "servicio": "siembra-andina",
  "motor": "mysql2",
  "baseDeDatos": { "estado": "conectada", "latenciaMs": 1.2 }
}
```

Si la base de datos no responde, `/salud` devuelve **503** con `"estado": "sin_conexion"`, pero el
servidor sigue en pie (útil para monitores y balanceadores).

---

## Cambiar de MySQL a PostgreSQL (o al revés)

Cambia únicamente el `.env` (`DB_CLIENT`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`), crea la
base vacía en el otro motor y vuelve a ejecutar `npm run migrate` y `npm run seed`. El código no
cambia: todas las migraciones usan el constructor de esquemas de Knex, sin SQL de un solo motor.

## Comandos

| Comando                       | Qué hace                                    |
| ----------------------------- | ------------------------------------------- |
| `npm start`                   | Arranca el servidor (`src/server.js`).      |
| `npm run dev`                 | Arranca y reinicia solo al cambiar código.  |
| `npm run migrate`             | Aplica las migraciones pendientes.          |
| `npm run migrate:make nombre` | Crea una migración vacía con fecha.         |
| `npm run rollback`            | Deshace la última migración.                |
| `npm run seed`                | Carga roles, catálogos, UBIGEO y comunidades demo (idempotente). |
| `npm run demo`                | Carga cuentas, parcelas y lecturas históricas demo (solo desarrollo). |
| `npm run demo -- --limpiar`   | Elimina los datos de demostración creados por ese comando. |
| `npm run admin:crear -- correo "Nombre" "Clave"` | Crea o promueve un administrador. |
| `npm run correo:probar -- destino@correo.com` | Verifica la conexión SMTP y envía un correo de prueba. |
| `npm test`                    | Pruebas con Jest + Supertest.               |
| `npm run lint`                | Revisión de estilo con ESLint.              |

## Estructura del proyecto

```
src/
  config/        env.js (validación), db.js (Knex), logger.js (pino)
  middlewares/   sesion, csrf, vistas, errores, limitePeticiones
  modules/       un módulo por dominio: routes → controller → service → repository
    auth/ usuarios/ parcelas/ lecturas/ cultivos/ campanias/ comunidad/ alertas/ notificaciones/
    panel/ tecnico/ editor/ admin/ inicio/ salud/
  services/      servicios transversales compartidos entre módulos
  utils/         helpers (errores, asyncHandler, baseDatos)
  jobs/          tareas programadas con node-cron
  app.js         crea la app Express (se prueba con Supertest)
  server.js      arranca el servidor y apaga de forma ordenada
views/
  layouts/       público, panel y auth (estructura EJS reutilizable)
  partials/      head.ejs / foot.ejs (atajos del layout)
  iconos/        parciales SVG locales basados en Lucide
  publico/ panel/ tecnico/ editor/ admin/ errores/
public/          css, js, img
  css/           tokens, base, componentes y utilidades
  fonts/         Manrope variable y licencia OFL
storage/uploads/ documentos privados fuera de la raíz pública (por defecto)
scripts/         crear-admin.js (primer administrador)
migrations/ seeds/ tests/ docs/
```

Reglas de arquitectura que se respetan en todo el proyecto:

- `routes → controllers → services → repositories`; **solo los repositories** importan `config/db`.
- Tablas y columnas en español, `snake_case`, tablas en plural.
- Toda entrada se valida (`express-validator`) y toda salida en vistas se escapa (`<%= %>`).
- SQL solo mediante el constructor de consultas de Knex (nunca concatenado).
- Configuración solo por variables de entorno; `.env.example` siempre actualizado.

## Roles, permisos y autenticación (Fase 3)

- Roles de origen: **agricultor**, **tecnico**, **editor**, **administrador**.
- Los permisos viven en las tablas `permisos` y `rol_permisos` y se editan desde
  **Administración → Permisos por rol** (el rol administrador conserva todos).
- Todo registro público crea un **agricultor**. Para ser técnico se envía una solicitud
  (`solicitudes_rol`) con institución, colegiatura opcional y documento de respaldo; el
  administrador la aprueba o rechaza y la decisión queda en `auditoria`.
- El **editor** lo asigna directamente el administrador, sin solicitud.
- Los permisos se cargan desde la base de datos y se actualizan en la sesión en cada petición
  autenticada; los cambios de rol o permisos se aplican sin esperar a un nuevo ingreso.
- El registro público siempre crea un agricultor pendiente de verificación. Los usuarios existentes
  quedaron verificados al migrar y conservan sus contraseñas; al ingresar, sus hashes se actualizan
  transparentemente a bcrypt con costo 12.
- Recuperación usa tokens hasheados, de un solo uso, que vencen en una hora. Cinco ingresos fallidos
  bloquean temporalmente la cuenta por 15 minutos. Los enlaces de verificación vencen en 24 horas.
- El editor cuenta con un panel propio; un usuario con varios roles ve los paneles de cada rol.

## Lecturas y accesos de técnicos

- El agricultor registra lecturas en sus parcelas (`registrado_por` = su id, `fuente_id` = manual).
- Las lecturas automáticas (NASA POWER, Open-Meteo, sensor) tendrán `registrado_por` nulo.
- El técnico **no ve ni escribe** lecturas por defecto. El agricultor concede acceso en
  `accesos_parcela`; con «puede escribir» el técnico registra lecturas y queda identificado en
  `registrado_por`. El acceso se puede revocar en cualquier momento.

## Seguridad incluida

- **helmet** con Content-Security-Policy estricta (todo se sirve localmente) y sin `x-powered-by`.
- **compresión** gzip y **archivos estáticos con caché** (7 días en producción).
- **Sesiones** en base de datos (`tabla sesiones`), cookie `httpOnly` + `SameSite=Lax`,
  `Secure` obligatorio en producción.
- **CSRF** con `csrf-csrf` (double-submit): los formularios incluyen
  `<input type="hidden" name="_csrf" value="<%= csrfToken %>">`. En formularios con archivos
  (multipart) el token viaja además en la cabecera `x-csrf-token`.
- **Contraseñas** con bcryptjs (costo 12), bloqueo temporal tras intentos fallidos y sesión
  regenerada al iniciar sesión.
- **Autorización** por permiso (`requierePermiso`) y por rol (`requiereRol`).
- **Límite de peticiones** por IP en ingreso, registro y recuperación.
- **Correo SMTP** para verificación y recuperación. Configura `APP_BASE_URL`, `SMTP_HOST`,
  `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM` y, si el servidor exige autenticación, `SMTP_USER` y
  `SMTP_PASSWORD` en `.env`. `MAIL_MODE=smtp` (por defecto) envía correos reales; en desarrollo
  puedes usar `MAIL_MODE=consola` para imprimir en la terminal los enlaces de verificación y
  recuperación sin enviar nada (`MAIL_MODE=consola` está prohibido en producción). En producción
  también son obligatorios `APP_BASE_URL`, `SMTP_HOST` y `SMTP_FROM`; `APP_BASE_URL` debe usar HTTPS
  y `SMTP_FROM` debe ser un remitente autorizado por tu proveedor. Prueba la configuración con
  `npm run correo:probar -- tucorreo@gmail.com`. Si falla el envío durante el registro, la cuenta se
  crea igualmente y el usuario puede solicitar un nuevo enlace; un administrador puede reenviar la
  verificación o marcar el correo como verificado desde `/admin/usuarios` (permiso
  `usuarios.verificar`). No subas credenciales ni tokens al repositorio ni a los registros.
- **Archivos privados** descargables solo con sesión y autorización; `/uploads` no expone archivos.
- **pino** registra peticiones y errores ocultando cookies y contraseñas.
- Páginas de error **404, 403 y 500 en español**; JSON automático para rutas `/api`.

## Sistema de diseño (Fase 4)

- Estilo neumórfico suave y minimalista con paleta andina, tema oscuro con sombras propias y
  preferencia guardada en el navegador.
- CSS propio y mobile-first en `public/css/tokens.css`, `base.css`, `components.css` y
  `utilities.css`; sin frameworks externos.
- Manrope se sirve localmente desde `public/fonts/` bajo SIL Open Font License 1.1.
- Las vistas comparten layouts público, panel y autenticación; los iconos SVG se incluyen como
  parciales EJS locales con la licencia de Lucide en `public/icons/LICENSE.txt`.
- La guía de componentes está en `/guia-estilo` y solo la puede abrir el rol administrador.

## Sitio público (Fase 5)

- Rutas públicas: `/`, `/calendario`, `/cultivos`, `/cultivos/:slug`, `/saberes`,
  `/saberes/:slug`, `/comunidades`, `/sobre`, `/contacto`, `/sitemap.xml` y `/robots.txt`.
- El calendario distingue ventanas tradicionales validadas y referenciales. NASA POWER se usa
  como orientación y su error no interrumpe la página; humedad y temperatura son estimaciones,
  no mediciones directas del suelo.
- El mapa carga Leaflet desde `node_modules` servido localmente. Las teselas se solicitan a
  OpenStreetMap al abrir `/comunidades`; se requiere conexión a Internet para mostrarlas.
- `mensajes_contacto` guarda los mensajes del formulario y `CONTACT_RATE_LIMIT_WINDOW_MS` /
  `CONTACT_RATE_LIMIT_MAX` limitan los envíos.
- Los datos geográficos se cargan desde UBIGEO (INEI 2019), con licencia MIT documentada en
  `seeds/data/LICENCIA-UBIGEO-MIT.txt`. La fotografía de andenes tiene atribución CC BY-SA 2.0
  en `public/img/ATRIBUCION.txt`.

## Panel agricultor (Fase 6)

- `/panel` presenta las parcelas con recomendación semaforizada, próximas alertas y pronóstico
  Open-Meteo de siete días. El pronóstico describe clima, no mediciones del suelo; el semáforo usa
  las lecturas registradas y rangos de `cultivo_requerimientos`.
- Desde `/panel/parcelas` se pueden crear, editar y archivar parcelas, elegir ubicación con
  selectores dependientes, ubicarla en el mapa y sugerir una zona según los límites altitudinales
  del catálogo.
- Las campañas registran cultivo, variedad, fechas y estado; las siembras y cosechas reales quedan
  como eventos y se comparan con la ventana de calendario tradicional.
- Cada parcela admite lecturas manuales y CSV UTF-8 (`fecha,humedad,temperatura`, `observacion`
  opcional), con vista previa y errores por fila. El panel incluye historial paginado y gráficos
  Chart.js locales con los rangos ideales.
- Las imágenes JPG, PNG y WEBP pasan por el servicio único de imágenes (Fase 10): se valida el
  tipo real por contenido con sharp, se corrige la orientación, se eliminan EXIF y GPS, se generan
  variantes de 400, 800 y 1600 px en WebP con respaldo JPG y se guardan fuera de `public` con UUID.
  Se exigen textos alternativos y se limita cada archivo a 10 MB. Acceso y operaciones verifican la
  propiedad de la parcela. El perfil permite actualizar datos, foto, contraseña y preferencias de notificación.
- Variables relevantes: `OPEN_METEO_TIMEOUT_MS` y `UPLOADS_MAX_BYTES` en `.env`; el valor
  predeterminado para cada imagen es 10 MB. Open-Meteo no requiere credenciales.

## Imágenes centralizadas (Fase 10)

- **Servicio único** (`src/modules/imagenes`): valida el tipo real por contenido, limita el tamaño,
  renombra con UUID y guarda fuera de `public/` mediante `src/services/almacenamiento`.
- **Variantes**: 400, 800 y 1600 px en WebP con respaldo JPG (`imagen_variantes`), sin EXIF ni GPS.
- **Presentación**: `<picture>` con `srcset`, `sizes`, proporción reservada y marcador de baja
  resolución (`views/partials/imagen.ejs`); galería con lightbox accesible por teclado, Escape y foco
  atrapado (`views/partials/galeria.ejs` + `public/js/galeria.js`).
- **Acceso**: artículos publicados y catálogo de cultivos en `/media/imagenes/:id/:ancho`; parcelas,
  consultas y perfil en `/media/privadas/:id/:ancho` solo para el autor, administrador con permiso o
  técnico con acceso. `/archivos/:id/vista` redirige a la ruta controlada.
- **Obligatorio**: texto alternativo, autor y licencia para imágenes públicas (editor y catálogo).
- **Limpieza**: tarea `limpieza_imagenes` (03:30 diaria, ejecutable desde `/admin/trabajos`) borra
  binarios huérfanos.
- **Almacenamiento intercambiable**: `STORAGE_DRIVER=local|s3|cloudinary`. Los adaptadores remotos
  son esqueletos con el mismo contrato; para activarlos implementa `guardar`, `leer`, `existe`,
  `eliminar`, `listar` y `urlPublica`.

## Comunidad, consultas y alertas (Fase 7)

- Los artículos permiten comentarios con una sola profundidad de respuesta, edición durante
  15 minutos, borrado lógico y reporte para moderación editorial. Las reacciones y favoritos de
  artículos y cultivos se guardan por usuario; sus contadores se consultan y no se duplican.
- Los agricultores pueden enviar consultas a técnicos de los distritos que atienden, adjuntar
  hasta tres imágenes y calificar una respuesta. La consulta y sus archivos se verifican por
  propiedad o cobertura antes de mostrarse o descargarse.
- El técnico configura su cobertura en `/tecnico/zonas`. El trabajo diario revisa reglas activas:
  humedad del suelo bajo el mínimo del cultivo durante los días configurados y riesgo de helada
  según el pronóstico horario de Open-Meteo. Las reglas y umbrales viven en la base de datos.
- El centro `/notificaciones` conserva avisos paginados y permite marcarlos como leídos.
  Server-Sent Events actualiza la campana sin recargar; cada usuario admite hasta tres conexiones
  simultáneas. El correo de alertas críticas es opcional y respeta `preferencias_notificacion`.
- La cola `/editor/moderacion/comentarios` está disponible para editores y administradores.
  La migración `20261112000000_interaccion_usuarios` y el seed
  `10_interacciones_alertas.js` agregan las relaciones y reglas predeterminadas.
- La evaluación se programa a las 06:00, hora de Lima. No requiere variables SMTP nuevas; la
  configuración SMTP existente se documenta en `.env.example`.

## Paneles por rol (Fase 8)

- **Técnico (`/tecnico`)**: bandeja de consultas y cobertura, historial de permisos de lectura
  otorgados por agricultores, y avisos de helada/sequía por distrito con notificaciones a usuarios
  con parcelas activas en la zona.
- **Editor (`/editor`)**: artículos con borrador, publicación y programación, categorías/etiquetas,
  editor visual con controles de formato, biblioteca de imágenes con recorte de proporción/posición
  y texto alternativo, y cola de moderación. El contenido se filtra mediante `sanitize-html`;
  la tarea programada revisa publicaciones cada minuto.
- **Administrador (`/admin`)**: indicadores, usuarios y asignación de varios roles; roles
  personalizados con permisos seleccionables; catálogos, auditoría y mensajes de contacto con
  búsqueda/orden/paginación en el servidor; auditoría exportable como CSV.
- Las operaciones sensibles muestran confirmación y registran auditoría. El sistema impide retirar
  el rol del único administrador activo; las tablas se consultan en servidor con paginación.
- La migración `20261113000000_paneles_roles.js` agrega tipos/avisos zonales y referencias de
  notificación, además del seguimiento de mensajes de contacto. No requiere variables nuevas en
  `.env.example`.

## Fuentes de clima y suelo (Fase 9)

- `FuenteDatos.obtener(latitud, longitud, fechaInicio, fechaFin)` es el contrato compartido por los
  adaptadores NASA POWER, Open-Meteo y SMAP. La caché en memoria agrupa coordenadas redondeadas a
  dos decimales y comparte solicitudes concurrentes. Los fallos de red, timeout y HTTP 5xx/429
  se reintentan. El orquestador limita las consultas de sincronización a 8 segundos por intento y
  un reintento.
- NASA POWER proporciona `GWETROOT` (índice de humedad de zona radicular, unidad adimensional) y
  `TS` (temperatura superficial estimada en °C). Conversión guardada:
  `humedad_indice_pct = GWETROOT × 100`. Es un índice porcentual, **no** porcentaje volumétrico
  medido en el suelo; `TS` tampoco es una sonda a profundidad. Las recomendaciones basadas en estos
  datos son orientativas y deben validarse localmente.
- Open-Meteo entrega siete días de precipitación y temperaturas mínimas/máximas, y el evaluador de
  heladas conserva el pronóstico horario de 48 horas. Para lecturas de suelo solicita humedad
  horaria a 3–9 cm y 9–27 cm y temperatura a 6 cm. Promedia las capas de humedad y convierte
  m³/m³ a porcentaje volumétrico; ignora horas nulas y separa datos observados del pronóstico.
  Ninguno de estos servicios requiere clave.
- La sincronización diaria procesa parcelas activas y consulta fuentes por prioridad: Open-Meteo
  suelo (1) y NASA POWER (3). Si una falla, continúa con las demás; guarda cada lectura con su
  fuente y conserva las lecturas previas cuando no hay datos nuevos. Una restricción única por
  parcela, fuente y fecha impide duplicados. Estados y ejecuciones de los jobs quedan en
  `/admin/trabajos`, donde un administrador puede ejecutarlos manualmente.
- Los jobs de sincronización, evaluación de alertas, limpieza de tokens vencidos y publicaciones
  programadas registran inicio, resultado, estado, origen y errores; una falla de proveedor en una
  parcela no impide continuar con las demás. `sincronizaciones_parcela` guarda disponibilidad por
  parcela y fuente.
- SMAP implementa el contrato, pero queda desactivado hasta elegir el producto NASA Earthdata
  apropiado para la resolución de las parcelas. Para preparar acceso, crea una cuenta en
  [NASA Earthdata Login](https://urs.earthdata.nasa.gov/) y configura `EARTHDATA_USER` y
  `EARTHDATA_TOKEN` en `.env`; genera el token desde **Applications → Generate Token** en el perfil
  de Earthdata. No se registra ni se muestra el token. El adaptador informa explícitamente que falta
  definir producto/endpoint antes de usarlo.
- Parámetros opcionales nuevos en `.env.example`: `EXTERNAL_API_RETRIES`,
  `WEATHER_CACHE_TTL_MS`, `EARTHDATA_USER` y `EARTHDATA_TOKEN`. La configuración privada de `.env`
  no se modifica ni se versiona.
- Migraciones relacionadas: `20261114000000_datos_reales_jobs.js` y
  `20261117000000_fuentes_datos_prioridad.js`; la segunda agrega la prioridad y registra
  `open_meteo_suelo`. Seed: `11_estados_jobs.js`; permiso: `trabajos.gestionar`.

Las APIs públicas documentan [NASA POWER Daily API](https://power.larc.nasa.gov/docs/services/api/temporal/daily/),
el [diccionario de parámetros de NASA POWER](https://power.larc.nasa.gov/parameters/) y la
[API Forecast de Open-Meteo](https://open-meteo.com/en/docs).

## Pruebas

```cmd
npm test
npm run lint
```

Las pruebas focalizadas de Fase 8 y Fase 9 incluyen sanitización editorial, roles personalizados,
protección del último administrador, adaptadores con `fetch` simulado, caché/reintentos,
sincronización idempotente y matriz RBAC.

Las pruebas de integración usan `siembra_andina_pruebas` por defecto, no la base de desarrollo.
Créala y prepara sus tablas/seeds antes de ejecutarlas (ajusta `DB_CLIENT`, host y credenciales
según el motor). La suite incluye casos de propiedad/ventana de edición de comentarios, reglas de
persistencia de alertas y límite/liberación de conexiones SSE:

```powershell
$env:DB_NAME = "siembra_andina_pruebas"
npm run migrate
npm run seed
npm test
npm run lint
```

Los comandos de migración y seed usan `DB_NAME` del entorno del proceso, por lo que no alteran la
base configurada para desarrollo en `.env`.

## Problemas frecuentes

- **`EADDRINUSE`**: el puerto 3000 está ocupado. Cambia `PORT=3001` en `.env`.
- **`ECONNREFUSED` / /salud con 503**: la base de datos está apagada. En XAMPP pulsa _Start_ en
  MySQL; en PostgreSQL revisa el servicio _postgresql-x64-15_ en `services.msc`.
- **Error de autenticación**: revisa `DB_USER` y `DB_PASSWORD`. En PostgreSQL la clave es la que
  elegiste al instalar (no va vacía).
- **`Table 'sesiones' doesn't exist`**: falta `npm run migrate`.

Para PostgreSQL, define en la misma terminal `$env:DB_CLIENT = "pg"`, `$env:DB_PORT = "5432"` y las
variables de conexión antes de migrar y probar.

## Validación y siguientes fases

Validado: migraciones y seeds idempotentes, pruebas, lint y Lighthouse móvil del sitio público en
la base MySQL aislada de pruebas. Pendiente comprobar migraciones, seeds y rollback en PostgreSQL
15, además de volver a medir Lighthouse con datos representativos de producción.

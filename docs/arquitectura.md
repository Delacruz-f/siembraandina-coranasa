# Arquitectura de Siembra Andina

Documento vivo. Se actualiza al final de cada fase.

## Capas

```
petición HTTP
   │
routes (src/modules/<dominio>/*.routes.js)      define URLs y middlewares de validación/permisos
   │
controllers                                      lee req/res, llama al service, elige la vista
   │
services                                         reglas de negocio, no conoce Express ni SQL
   │
repositories                                     única capa que usa Knex/config/db
   │
base de datos (MySQL 8 o PostgreSQL 15)
```

Reglas:

1. Un controller **nunca** importa `config/db` ni Knex.
2. Un service **nunca** recibe `req`/`res`; recibe datos planos y devuelve datos planos.
3. Un repository **nunca** valida reglas de negocio; solo consulta y escribe.
4. Los errores de negocio se lanzan con `utils/errores.js` (`ErrorHttp`).

## Módulos

| Módulo           | Estado  | Rutas principales                                                                                                                                                            |
| ---------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inicio`         | Fase 1  | `GET /`                                                                                                                                                                      |
| `salud`          | Fase 1  | `GET /salud`, `GET /salud/vivo`                                                                                                                                              |
| `auth`           | Fase 2  | `GET/POST /registro`, `GET/POST /ingresar`, `POST /salir`                                                                                                                    |
| `panel`          | Fase 2  | `GET /panel`                                                                                                                                                                 |
| `usuarios`       | Fase 2  | `GET/POST /perfil`, `/perfil/password`, `/perfil/solicitud-tecnico`                                                                                                          |
| `parcelas`       | Fase 2  | `/panel/parcelas...`, `GET /tecnicos/buscar`                                                                                                                                 |
| `lecturas`       | Fase 2  | `POST /parcelas/:id/lecturas`, `.../eliminar`                                                                                                                                |
| `cultivos`       | Fase 2  | requerimientos y calendario (servicio compartido)                                                                                                                            |
| `tecnico`        | Fase 2  | `GET /tecnico`, `/tecnico/parcelas/:id`, `POST /tecnico/requerimientos/:id`, `/tecnico/calendario/:id`                                                                       |
| `admin`          | Fase 2  | `/admin`, `/admin/solicitudes`, `/admin/usuarios`, `/admin/permisos`, `/admin/auditoria`, `/admin/catalogos`, `/admin/configuraciones`, `/admin/trabajos`, `/admin/contacto` |
| `comunidad`      | Fase 7  | `/saberes/:slug/comentarios`, `/comentarios/:id/...`, `/panel/consultas`, `/tecnico/consultas`                                                                               |
| `editor`         | Fase 8  | `/editor`, `/editor/articulos...`, `/editor/biblioteca`, `/editor/moderacion/comentarios`                                                                                    |
| `imagenes`       | Fase 10 | `/media/imagenes/:id/:ancho`, `/media/privadas/:id/:ancho`, `/admin/cultivos/:id/imagenes`                                                                                   |
| `alertas`        | Fase 9  | reglas y avisos (servicio usado por `jobs` y `tecnico`)                                                                                                                      |
| `notificaciones` | Fase 9  | `/notificaciones`, `/api/notificaciones/no-leidas`                                                                                                                           |
| `campanias`      | Fase 6  | campañas, siembras y cosechas de una parcela                                                                                                                                 |
| `lecturas`       | Fase 6  | `POST /parcelas/:id/lecturas`, importación CSV                                                                                                                               |
| `publico`        | Público | `GET /monitor`, `/siembras` y sus consultas agregadas                                                                                                                        |

Para añadir un módulo: crear la carpeta en `src/modules/<dominio>` con
`<dominio>.routes.js`, `<dominio>.controller.js`, `<dominio>.service.js` y
`<dominio>.repository.js`, y montarlo en `src/modules/index.js`.

## Monitor público y siembras

- `/monitor` reutiliza `GET /api/v1/comunidades` para ubicar marcadores. Las lecturas públicas se leen por comunidad desde `lecturas.service`; las lecturas automáticas las mantiene el trabajo `sincronizacion_datos`, que delega en `services/fuentesDatos/orquestador.js`. Se prioriza la lectura manual de un técnico de hasta 30 días, después NASA POWER y luego Open-Meteo. Si no hay lecturas guardadas, el monitor consulta esas fuentes para la comunidad y conserva su caché HTTP; el historial por comunidad se sirve desde `/api/publico/monitor/:comunidadId/lecturas` (1 a 12 meses), con NASA POWER como respaldo histórico.
- `/siembras` consume `/api/publico/siembras` y reutiliza `campanias.repository`. Se agrupan las fechas por distrito y cultivo; solo se publican grupos con tres o más registros. No se consultan ni devuelven nombres o coordenadas de parcelas. El mapa usa coordenadas comunitarias promediadas por distrito y redondeadas a dos decimales.
- Los datos de demostración se mantienen separados de los reales y llevan una insignia visible. Aparecen cuando hay menos de tres grupos reales y se pueden ocultar con `SIEMBRAS_DEMO_PUBLICAS=false`; si no existen campañas registradas no se presentan datos de demostración como reales.
- Ambas páginas usan Leaflet y Chart.js locales donde corresponde; los endpoints públicos de datos no se agregan a la caché del service worker.

## Vistas

Layout reutilizable con dos capas:

- `views/layouts/base.ejs` abre el HTML (cabecera, `<main>`), `views/layouts/pie.ejs` lo cierra.
- `views/partials/head.ejs` y `views/partials/foot.ejs` son los atajos que usan las vistas:

```ejs
<%- include('../partials/head', { titulo: 'Mi título' }) %>
  ...contenido...
<%- include('../partials/foot') %>
```

Variables siempre disponibles en las vistas (`res.locals`): `usuario`, `mensajes`, `rutaActual`,
`csrfToken`, `anio`, `MESES`, `MESES_LARGOS`, `fecha()`, `fechaHora()`, `entorno`.

### Imágenes

`views/partials/imagen.ejs` renderiza `<picture>` con `srcset`/`sizes` y proporción reservada;
`views/partials/galeria.ejs` monta la galería y su lightbox accesible (`public/js/galeria.js`).
Ninguna vista construye URLs de imágenes a mano: usan `imagenes.service.describe()` o los
repositories que devuelven variantes ya agrupadas.

## Subsistema de imágenes (Fase 10)

```
controller  →  imagenes.acceso (permisos)  →  imagenes.service (sharp)  →  almacenamiento (adaptador)
                                                     ↓
                                              imagenes.repository (metadatos)
```

- `src/services/almacenamiento` define un contrato único (`guardar`, `leer`, `existe`, `eliminar`,
  `listar`, `urlPublica`) con adaptadores: `local` (implementado), `s3` y `cloudinary` (esqueletos).
  Se elige con `STORAGE_DRIVER`.
- `src/modules/imagenes/imagenes.service.js` valida el tipo por contenido, aplica la orientación,
  descarta EXIF/GPS y genera 400/800/1600 px en WebP y JPG.
- Los binarios viven fuera de `public/` (por defecto `storage/uploads/publicas|privadas/<uuid>/`).
- Las rutas `/media/*` aplican permisos y cabeceras de caché; las privadas responden 404 a terceros.

## Tareas programadas

`src/jobs/trabajos.service.js` registra los trabajos en `node-cron` (zona `America/Lima`) y guarda
cada ejecución en `ejecuciones_jobs`. Se pueden lanzar manualmente desde `/admin/trabajos`.

| Clave                       | Horario     | Función                                                        |
| --------------------------- | ----------- | -------------------------------------------------------------- |
| `sincronizacion_datos`      | 05:00       | lecturas de suelo desde Open-Meteo y NASA POWER, por prioridad |
| `evaluacion_alertas`        | 06:00       | reglas de humedad y heladas                                    |
| `limpieza_tokens`           | 03:15       | tokens de sesión/verificación vencidos                         |
| `publicaciones_programadas` | cada minuto | publica artículos programados                                  |
| `limpieza_imagenes`         | 03:30       | borra binarios huérfanos                                       |

## Seguridad

- `helmet` con CSP estricta (`script-src 'self'`, `object-src 'none'`, `base-uri 'none'`,
  `frame-ancestors 'none'`), `Permissions-Policy` y HSTS solo en producción.
- CSRF con `csrf-csrf` (double submit cookie atado a la sesión). En multipart se comprueba dos veces:
  cabecera `x-csrf-token` antes de multer y campo `_csrf` después.
- Validación de toda entrada con `express-validator` en las rutas.
- Escapado en EJS con `<%= %>`; el HTML editorial pasa por `sanitize-html` con lista blanca.
- Consultas siempre con Knex y parámetros enlazados (nunca SQL concatenado).

## Pruebas

- Jest + Supertest. `tests/fase*.test.js` agrupa las pruebas por fase.
- Cobertura obligatoria del 70 % en services/repositories (`npm run test:cobertura`).
- Base de pruebas independiente: `DB_NAME=siembra_andina_pruebas`.

## Autorización

- `requiereSesion`: exige usuario autenticado (guarda el destino para volver tras el login).
- `requierePermiso('clave')`: exige un permiso de la tabla `rol_permisos`.
- `requiereRol('clave')`: exige un rol concreto.
- Los permisos se cargan en la sesión al iniciar sesión (`usuarios.service.cargarSesion`).
- Reglas de negocio que dependen del recurso (dueño de la parcela, acceso de técnico) se
  comprueban en el service, no en el middleware.

## Configuración

Toda la configuración pasa por `src/config/env.js`, que valida y tipa las variables del `.env`.
Si falta algo, el arranque falla con una lista de errores en español. `knexfile.js` reutiliza la
misma configuración para la CLI de Knex.

## Base de datos

- Nombres de tablas y columnas en español, `snake_case` y plural. El modelo normalizado está
  documentado en [modelo.md](./modelo.md), con diagrama ER y justificación de 3FN por tabla.
- Las migraciones actualizan el esquema previo preservando cuentas, perfiles, roles, cultivos,
  parcelas y lecturas. El cultivo de cada parcela se conserva como una campaña inicial.
- Migraciones con el constructor de esquemas de Knex para que funcionen igual en MySQL y PostgreSQL.
- Tabla de control de migraciones: `migraciones`.
- Las tablas de dominio usan PK enteras autoincrementables y `created_at`/`updated_at`. `sid`
  es único en `sesiones`, con PK entera para respetar el modelo que requiere la aplicación.
- El borrado lógico se limita a `usuarios`, `parcelas`, `publicaciones`, `comentarios` y `archivos`
  (este último con `eliminado_en`, que la limpieza de imágenes consume).
- **Compatibilidad de motores**: MySQL no soporta `returning` en INSERT; los repositories usan
  `utils/baseDatos.insertarYDevolverId`. Los booleanos se normalizan con `Boolean(...)` porque
  MySQL los devuelve como 0/1.

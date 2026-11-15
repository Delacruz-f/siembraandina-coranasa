# API de Siembra Andina

Siembra Andina es principalmente una aplicación renderizada en el servidor (EJS). Además expone
la **API REST v1** (`/api/v1`, ver más abajo), unos pocos endpoints JSON y todos los flujos de
formulario. Este documento describe el contrato de esa superficie HTTP: rutas, formato, permisos y
códigos de error.

## API REST v1 (Fase 12)

- **Documentación interactiva:** `/api/docs` (Swagger UI, servido localmente).
- **Especificación OpenAPI 3.0:** `/api/v1/openapi.json`.
- **Formato:** `{ "ok": true, "datos": ... }` y, en errores,
  `{ "ok": false, "error": { "codigo", "mensaje" } }`.
- **Autenticación:** tokens personales con `Authorization: Bearer saa_...`. Se crean en
  **Mi perfil → Acceso a la API** y solo se muestran una vez (la base guarda el hash SHA-256).
- **Límite:** 120 peticiones por minuto y por IP.

| Método | Ruta                                                             | Autenticación | Descripción                                       |
| ------ | ---------------------------------------------------------------- | ------------- | ------------------------------------------------- |
| GET    | `/api/v1`                                                        | —             | Versión y enlace a la documentación               |
| GET    | `/api/v1/cultivos`                                               | —             | Cultivos activos del catálogo                     |
| GET    | `/api/v1/cultivos/:slug`                                         | —             | Variedades, requerimientos, calendario e imágenes |
| GET    | `/api/v1/calendario?cultivo=&departamento=&provincia=&distrito=` | —             | Ventanas y recomendaciones                        |
| GET    | `/api/v1/articulos?pagina=&categoria=&etiqueta=&q=`              | —             | Artículos publicados                              |
| GET    | `/api/v1/articulos/:slug`                                        | —             | Detalle de un artículo                            |
| GET    | `/api/v1/comunidades`                                            | —             | Comunidades con coordenadas                       |
| GET    | `/api/v1/parcelas/:id/recomendacion`                             | Bearer        | Recomendación de siembra de una parcela propia    |

Ejemplo con token:

```bash
curl "https://tu-dominio.pe/api/v1/parcelas/12/recomendacion" \
  -H "Authorization: Bearer saa_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

````json
{
  "ok": true,
  "datos": {
    "parcela": { "id": 12, "nombre": "Pumaorqo", "cultivo": "Papa" },
    "lectura": { "fecha": "2026-11-12", "humedad": 26, "temperatura": 13 },
    "requerimiento": { "humedad_min": 22, "humedad_max": 32, "temperatura_min": 9, "temperatura_max": 15 },
    "recomendacion": { "codigo": "ok", "titulo": "Siembra ahora", "motivos": ["..."] }
  }
}

## Convenciones

- **Formato**: los endpoints `/api/*` responden JSON; los demás responden HTML y, cuando guardan,
  redirigen con `302` a la página de resultado.
- **Autorización**: basada en sesión (cookie `siembra.sid`) y permisos de `rol_permisos`.
  - **Quien no ha iniciado sesión** recibe `401` (`no_autorizado`).
  - **Quien la tiene pero no el permiso** recibe `403` (`prohibido`).
  - **Recursos ajenos** responden `404` a propósito, para no revelar que existen.
- **CSRF**: cualquier `POST`/`PUT`/`DELETE` exige el token.
  - Formularios normales: campo oculto `_csrf`.
  - Formularios `multipart/form-data`: cabecera `x-csrf-token` (y, si se envía, también `_csrf`).
  - Integración en plantillas: `res.locals.csrfToken`.
- **Validación**: `express-validator`. Un fallo devuelve `400` con el detalle.
- **Errores** (JSON): `{ "ok": false, "error": { "codigo", "mensaje", "detalles?" } }`.
- **Errores** (HTML): plantilla `errores/404`, `errores/403`, `errores/410`, `errores/429`,
  `errores/500`.
- **Límites**: `express-rate-limit` en login, registro, contacto, consultas, comentarios y
  reportes. Las subidas admiten 10 MB por archivo (`UPLOADS_MAX_BYTES`).

### Códigos de error habituales

| HTTP | `codigo`                                | Cuándo                                            |
| ---- | --------------------------------------- | ------------------------------------------------- |
| 400  | `solicitud_invalida`                    | Datos del formulario o del cuerpo JSON no válidos |
| 401  | `no_autorizado`                         | Falta sesión                                      |
| 403  | `prohibido` / `csrf_invalido`           | Falta permiso o token CSRF inválido               |
| 404  | `no_encontrado`                         | El recurso no existe o no pertenece al usuario    |
| 409  | `solicitud_pendiente` / `rol_existente` | Conflicto de estado de negocio                    |
| 413  | `imagen_demasiado_grande`               | Archivo por encima del límite                     |
| 429  | `demasiadas_peticiones`                 | Se superó un límite de peticiones                 |

## Endpoints JSON

### Health checks

| Método | Ruta          | Auth    | Descripción                                      |
| ------ | ------------- | ------- | ------------------------------------------------ |
| `GET`  | `/salud`      | pública | Comprueba proceso y base de datos                |
| `GET`  | `/salud/vivo` | pública | Liveness: solo confirma que el proceso está vivo |

### Ubicaciones públicas

| Método | Ruta                                       | Auth           | Respuesta                          |
| ------ | ------------------------------------------ | -------------- | ---------------------------------- |
| `GET`  | `/api/publico/provincias?departamento_id=` | pública        | `{ provincias: [{ id, nombre }] }` |
| `GET`  | `/api/publico/distritos?provincia_id=`     | pública        | `{ distritos: [{ id, nombre }] }`  |
| `GET`  | `/api/parcelas/altitud?latitud=&longitud=` | `parcelas.ver` | `{ altitud_m }` (Open-Meteo)       |
| `POST` | `/api/publico/consulta`                    | pública + CSRF | Ventanas recomendadas para una ubicación y cultivo |

#### Consulta pública de siembra

`POST /api/publico/consulta` no requiere iniciar sesión. Abre primero `GET /consulta` para
obtener la cookie y el token CSRF; envía `_csrf` en el cuerpo.

```text
_csrf=token-obtenido-al-cargar-la-pagina&latitud=-13.52&longitud=-71.97&distrito_id=12&cultivo=papa
```

El cuerpo se envía como `application/x-www-form-urlencoded`. Se puede elegir un punto con
`latitud` y `longitud`, o enviar `distrito_id`; se usan las coordenadas de una comunidad
registrada y, si no hay, se busca un punto aproximado del distrito. Si no se encuentra,
la respuesta pide elegir un punto en el mapa o usar la ubicación del dispositivo.
`cultivo` acepta el slug de cualquier cultivo activo con requerimientos agronómicos
registrados o `no-se`, que compara todos los cultivos configurados. Las coordenadas se
redondean a dos decimales antes de consultar NASA POWER y Open-Meteo.

El servidor calcula hasta tres ventanas por cultivo con cinco años de NASA POWER,
pronóstico de suelo/temperatura de 16 días de Open-Meteo y el calendario tradicional. La
IA es opcional, solo redacta el resumen y nunca recibe coordenadas. Sin clave o si la
respuesta de IA no pasa la validación de fechas, se muestra una plantilla fija. Se limita
a 30 solicitudes cada 15 minutos por IP; al superar el límite el endpoint responde HTTP
429 con el código `limite_consultas`.

La tabla `consulta_publica` solo conserva distrito, cultivo, ventanas y fecha; no almacena
IP ni coordenadas. La página puede mostrar el último resultado guardado localmente cuando
no hay conexión.

### Notificaciones y técnicos

| Método | Ruta                            | Auth                | Respuesta                               |
| ------ | ------------------------------- | ------------------- | --------------------------------------- |
| `GET`  | `/api/notificaciones/no-leidas` | sesión              | No leídas del usuario                   |
| `GET`  | `/tecnicos/buscar?q=`           | `accesos.gestionar` | `{ tecnicos: [{ id, nombre, email }] }` |

## Rutas principales (HTML)

### Autenticación

| Método     | Ruta                       | Notas                                       |
| ---------- | -------------------------- | ------------------------------------------- |
| `GET/POST` | `/registro`                | Alta pública; requiere verificar correo     |
| `GET/POST` | `/ingresar`                | Bloqueo tras 5 fallos (`AUTH_LOCK_MINUTES`) |
| `POST`     | `/salir`                   | Cierra sesión                               |
| `GET/POST` | `/recuperar`               | Solicita enlace de recuperación             |
| `GET/POST` | `/restablecer/:token`      | Cambia la contraseña                        |
| `GET/POST` | `/verificar-correo/:token` | Verifica el correo                          |

### Perfil y usuarios

| Método     | Ruta                        | Permiso                    |
| ---------- | --------------------------- | -------------------------- |
| `GET`      | `/perfil`                   | sesión                     |
| `POST`     | `/perfil`                   | sesión                     |
| `POST`     | `/perfil/foto`              | sesión (multipart, `foto`) |
| `POST`     | `/perfil/password`          | sesión                     |
| `POST`     | `/perfil/preferencias`      | sesión                     |
| `GET/POST` | `/perfil/solicitud-tecnico` | `solicitudes.crear`        |

### Parcelas, campañas y lecturas

| Método     | Ruta                                                | Permiso                                                               |
| ---------- | --------------------------------------------------- | --------------------------------------------------------------------- |
| `GET`      | `/panel/parcelas`                                   | `parcelas.ver`                                                        |
| `GET/POST` | `/panel/parcelas/nueva`, `/panel/parcelas`          | `parcelas.crear`                                                      |
| `GET`      | `/panel/parcelas/:id`                               | `parcelas.ver`                                                        |
| `GET/POST` | `/panel/parcelas/:id/editar`, `/panel/parcelas/:id` | `parcelas.editar`                                                     |
| `POST`     | `/panel/parcelas/:id/imagenes`                      | `parcelas.editar` (multipart, `imagenes[]` + `textos_alternativos[]`) |
| `POST`     | `/panel/parcelas/:id/eliminar`                      | `parcelas.eliminar`                                                   |
| `POST`     | `/panel/parcelas/:id/accesos`                       | `accesos.gestionar`                                                   |
| `POST`     | `/parcelas/:id/lecturas`                            | `lecturas.crear`                                                      |
| `GET/POST` | `/panel/parcelas/:id/lecturas/importar`             | `lecturas.crear` (CSV UTF-8)                                          |

### Comunidad y consultas

| Método     | Ruta                                                | Permiso                                           |
| ---------- | --------------------------------------------------- | ------------------------------------------------- |
| `POST`     | `/saberes/:slug/comentarios`                        | sesión                                            |
| `POST`     | `/comentarios/:id/editar`, `/eliminar`, `/reportar` | sesión                                            |
| `POST`     | `/saberes/:slug/reacciones`, `/favoritos`           | sesión                                            |
| `POST`     | `/cultivos/:slug/reacciones`, `/favoritos`          | sesión                                            |
| `GET`      | `/panel/consultas`, `/panel/consultas/:id`          | `consultas.crear`                                 |
| `GET/POST` | `/panel/consultas/nueva`, `/panel/consultas`        | `consultas.crear` (multipart opcional, `fotos[]`) |
| `GET`      | `/tecnico/consultas`, `/tecnico/consultas/:id`      | `consultas.responder`                             |
| `POST`     | `/tecnico/consultas/:id/responder`                  | `consultas.responder`                             |
| `GET`      | `/editor/moderacion/comentarios`                    | `publicaciones.moderar`                           |

### Panel técnico

| Método     | Ruta                          | Permiso               |
| ---------- | ----------------------------- | --------------------- |
| `GET`      | `/tecnico`                    | `cultivos.validar`    |
| `POST`     | `/tecnico/requerimientos/:id` | `cultivos.validar`    |
| `POST`     | `/tecnico/calendario/:id`     | `cultivos.validar`    |
| `GET/POST` | `/tecnico/avisos`             | `avisos.crear`        |
| `GET/POST` | `/tecnico/zonas`              | `consultas.responder` |

### Editor

| Método     | Ruta                                                                    | Permiso                                                                                                       |
| ---------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `GET`      | `/editor`                                                               | `publicaciones.publicar`                                                                                      |
| `GET/POST` | `/editor/articulos/nuevo`, `/editor/articulos`, `/editor/articulos/:id` | `publicaciones.gestionar`                                                                                     |
| `GET`      | `/editor/biblioteca`                                                    | `publicaciones.gestionar`                                                                                     |
| `POST`     | `/editor/biblioteca`                                                    | `publicaciones.gestionar` (multipart: `imagen`, `texto_alternativo`, `autor_imagen`, `licencia` obligatorios) |

### Administración

| Método | Ruta                                                                | Permiso                     |
| ------ | ------------------------------------------------------------------- | --------------------------- |
| `GET`  | `/admin`                                                            | `usuarios.gestionar`        |
| `GET`  | `/admin/solicitudes`; `POST /admin/solicitudes/:id/aprobar          | rechazar`                   | `solicitudes.revisar` |
| `GET`  | `/admin/usuarios`; `POST /admin/usuarios/:id/rol                    | roles/:rol/quitar           | estado`               | `usuarios.gestionar` |
| `GET`  | `/admin/permisos`; `POST /admin/permisos/:rol`, `POST /admin/roles` | `roles.gestionar`           |
| `GET`  | `/admin/catalogos`; `POST /admin/catalogos/:tipo[/:id]`             | `catalogos.gestionar`       |
| `GET`  | `/admin/cultivos/:id/imagenes`; `POST` igual                        | `catalogos.gestionar`       |
| `GET`  | `/admin/auditoria`, `/admin/auditoria/exportar.csv`                 | `auditoria.ver`             |
| `GET`  | `/admin/contacto`; `POST /admin/contacto/:id/estado`                | `contacto.gestionar`        |
| `GET`  | `/admin/configuraciones`; `POST /admin/configuraciones/:clave`      | `configuraciones.gestionar` |
| `GET`  | `/admin/trabajos`; `POST /admin/trabajos/:clave/ejecutar`           | `trabajos.gestionar`        |

Claves de trabajo admitidas en `:clave`: `sincronizacion_datos`, `evaluacion_alertas`,
`limpieza_tokens`, `publicaciones_programadas`, `limpieza_imagenes`.

### Imágenes (rutas controladas)

| Método | Ruta                                           | Auth              | Descripción                            |
| ------ | ---------------------------------------------- | ----------------- | -------------------------------------- |
| `GET`  | `/media/imagenes/:id`                          | pública           | Redirige a la variante de 800 px       |
| `GET`  | `/media/imagenes/:id/:ancho?formato=webp\|jpg` | pública           | Imagen de artículo publicado o cultivo |
| `GET`  | `/media/privadas/:id[/:ancho]`                 | sesión + permisos | Foto de parcela, consulta o perfil     |
| `GET`  | `/archivos/:id`                                | sesión            | Descarga de un documento (PDF)         |
| `GET`  | `/archivos/:id/vista`                          | sesión            | Redirige a `/media/privadas/:id/800`   |

`:ancho` admite `400`, `800` o `1600`. Las respuestas públicas llevan
`Cache-Control: public, max-age=31536000, immutable`; las privadas, `private, max-age=300`.

### Público

| Método | Ruta                                                                                                                    |
| ------ | ----------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/`, `/calendario`, `/cultivos`, `/cultivos/:slug`, `/saberes`, `/saberes/:slug`, `/comunidades`, `/sobre`, `/contacto` |
| `GET`  | `/sitemap.xml`, `/robots.txt`                                                                                           |

## Ejemplos

### Reaccionar a un artículo (formulario HTML)

```bash
curl -X POST https://ejemplo.pe/saberes/mi-articulo/reacciones \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "Cookie: siembra.sid=$SESION" \
  --data "_csrf=$TOKEN&tipo=util"
```

### Subir una foto de perfil (multipart)

```bash
curl -X POST https://ejemplo.pe/perfil/foto \
  -H "x-csrf-token: $TOKEN" \
  -H "Cookie: siembra.sid=$SESION" \
  -F "_csrf=$TOKEN" \
  -F "foto=@foto-celular.jpg;type=image/jpeg"
```

Respuesta correcta: `302` a `/perfil`. Archivo inválido: `400` con
`{ "error": { "codigo": "solicitud_invalida", "mensaje": "El archivo no es una imagen válida..." } }`.

### Consultar la altitud de una coordenada

```bash
curl "https://ejemplo.pe/api/parcelas/altitud?latitud=-13.5&longitud=-72.1" \
  -H "Cookie: siembra.sid=$SESION"
# { "altitud_m": 3500 }
```
````

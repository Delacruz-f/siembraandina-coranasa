# Modelo de datos — Siembra Andina

## Alcance y convenciones

- Las migraciones nuevas transforman el esquema anterior sin borrar los registros ya existentes.
- Las tablas de dominio usan claves primarias enteras autoincrementales, `created_at` y
  `updated_at`. La excepción funcional es `migraciones`, administrada por Knex.
- `sesiones` también tiene una PK entera; `sid` conserva una restricción `UNIQUE` porque
  `connect-session-knex` identifica cada sesión por ese campo.
- Las relaciones eliminables en cascada se reservan para datos dependientes; los catálogos
  referenciados se protegen con `RESTRICT`; referencias opcionales de autoría usan `SET NULL`.
- El borrado lógico se aplica a `usuarios`, `parcelas`, `publicaciones` y, por la moderación de
  Fase 7, `comentarios`.
- La pertenencia de una variedad a uno o más cultivos se representa en
  `cultivo_variedades`. Así, `variedades` no repite el cultivo y la campaña puede conservar el
  cultivo aunque todavía no se haya seleccionado una variedad.
- Los registros de auditoría conservan `fecha` como instante del evento. `created_at` registra
  la creación de la fila, y `updated_at` su última modificación.
- Los datos iniciales de humedad, temperatura y calendario provienen de los seeds referenciales
  previos. Permanecen como no validados; no sustituyen la validación de técnicos ni fuentes
  agronómicas locales.
- Se siembran los departamentos con provincias andinas. Provincias, distritos y comunidades
  quedan disponibles para cargar datos geográficos oficiales, sin inventar sus límites.

## Diagrama entidad-relación

```mermaid
erDiagram
  USUARIOS {
    int id PK
    string email UK
    string password_hash
    boolean activo
    timestamp ultimo_acceso
    timestamp deleted_at
  }
  PERFILES {
    int id PK
    int usuario_id FK_UK
    int foto_archivo_id FK
    string nombre
    string telefono
    string comunidad
  }
  PREFERENCIAS_NOTIFICACION {
    int id PK
    int usuario_id FK_UK
    boolean correo_alertas
    boolean avisos_panel
    boolean resumen_semanal
  }
  ROLES {
    int id PK
    string clave UK
    string nombre
  }
  PERMISOS {
    int id PK
    string clave UK
    string descripcion
  }
  ROL_PERMISOS {
    int id PK
    int rol_id FK
    int permiso_id FK
  }
  USUARIO_ROLES {
    int id PK
    int usuario_id FK
    int rol_id FK
    boolean es_principal
    int otorgado_por FK
  }
  TOKENS_RECUPERACION {
    int id PK
    int usuario_id FK
    string token_hash UK
    timestamp expira_en
    timestamp usado_en
  }
  AUDITORIA {
    int id PK
    int usuario_id FK
    string accion
    string entidad
    int entidad_id
    string ip
    timestamp fecha
  }
  SESIONES {
    int id PK
    string sid UK
    text sess
    timestamp expired
  }
  DEPARTAMENTOS {
    int id PK
    string codigo UK
    string nombre UK
  }
  PROVINCIAS {
    int id PK
    int departamento_id FK
    string nombre
  }
  DISTRITOS {
    int id PK
    int provincia_id FK
    string nombre
  }
  COMUNIDADES {
    int id PK
    int distrito_id FK
    string nombre
    decimal latitud
    decimal longitud
  }
  ZONAS_ALTITUDINALES {
    int id PK
    string clave UK
    string nombre
    int altitud_min_m
    int altitud_max_m
  }
  CULTIVOS {
    int id PK
    string slug UK
    string nombre
  }
  VARIEDADES {
    int id PK
    string slug UK
    string nombre
  }
  CULTIVO_VARIEDADES {
    int id PK
    int cultivo_id FK
    int variedad_id FK
  }
  CULTIVO_REQUERIMIENTOS {
    int id PK
    int cultivo_id FK
    int zona_id FK
    decimal hum_min
    decimal hum_max
    decimal temp_min
    decimal temp_max
  }
  CALENDARIO_TRADICIONAL {
    int id PK
    int cultivo_id FK
    int zona_id FK
    int mes_inicio
    int mes_fin
    text fuente
  }
  PARCELAS {
    int id PK
    int usuario_id FK
    int zona_id FK
    int comunidad_id FK
    int distrito_id FK
    string nombre
    decimal latitud
    decimal longitud
    decimal altitud_m
    decimal area_hectareas
    text notas
    timestamp deleted_at
  }
  ESTADOS_CAMPANIA {
    int id PK
    string clave UK
    string nombre
  }
  CAMPANIAS {
    int id PK
    int parcela_id FK
    int cultivo_id FK
    int variedad_id FK
    int estado_id FK
    date fecha_inicio
    date fecha_fin
  }
  SIEMBRAS {
    int id PK
    int campania_id FK
    date fecha
    string metodo
  }
  UNIDADES_MEDIDA {
    int id PK
    string clave UK
    string nombre
  }
  COSECHAS {
    int id PK
    int campania_id FK
    int unidad_id FK
    date fecha
    decimal cantidad
  }
  FUENTES_DATOS {
    int id PK
    string clave UK
    string nombre
  }
  LECTURAS {
    int id PK
    int parcela_id FK
    int fuente_id FK
    int registrado_por FK
    date fecha
    decimal humedad
    decimal temperatura
  }
  SINCRONIZACIONES_PARCELA {
    int id PK
    int parcela_id FK
    int fuente_id FK
    boolean exitosa
    timestamp consultado_en
    date fecha_ultimo_dato
    string error_resumido
  }
  ACCESOS_PARCELA {
    int id PK
    int parcela_id FK
    int tecnico_id FK
    int otorgado_por FK
    boolean puede_escribir
    timestamp revocado_en
  }
  TIPOS_ALERTA {
    int id PK
    string clave UK
    string nombre
  }
  METRICAS_ALERTA {
    int id PK
    string clave UK
    string nombre
  }
  OPERADORES_ALERTA {
    int id PK
    string clave UK
    string nombre
  }
  ALERTA_REGLAS {
    int id PK
    int tipo_id FK
    int metrica_id FK
    int operador_id FK
    int cultivo_id FK
    int zona_id FK
    int umbral_tipo_id FK
    string clave UK
    decimal umbral
    int persistencia_dias
    int horizonte_horas
    boolean critica
  }
  TIPOS_UMBRAL {
    int id PK
    string clave UK
    string nombre
  }
  ESTADOS_ALERTA {
    int id PK
    string clave UK
    string nombre
  }
  ALERTAS {
    int id PK
    int regla_id FK
    int parcela_id FK
    int lectura_id FK
    int estado_id FK
    string mensaje
    timestamp fecha
  }
  TIPOS_NOTIFICACION {
    int id PK
    string clave UK
    string nombre
  }
  NOTIFICACIONES {
    int id PK
    int usuario_id FK
    int tipo_id FK
    int alerta_id FK
    int consulta_id FK
    int aviso_zona_id FK
    boolean leida
    text mensaje
  }
  TIPOS_AVISO_ZONA {
    int id PK
    string clave UK
    string nombre
  }
  AVISOS_ZONA {
    int id PK
    int tecnico_id FK
    int distrito_id FK
    int tipo_id FK
    string titulo
    text mensaje
    timestamp vigente_desde
    timestamp vigente_hasta
  }
  MENSAJES_CONTACTO {
    int id PK
    string nombre
    string email
    string asunto
    text mensaje
    boolean leido
    int atendido_por FK
  }
  CATEGORIAS {
    int id PK
    string slug UK
    string nombre UK
  }
  ETIQUETAS {
    int id PK
    string slug UK
    string nombre UK
  }
  ESTADOS_PUBLICACION {
    int id PK
    string clave UK
    string nombre
  }
  PUBLICACIONES {
    int id PK
    int usuario_id FK
    int categoria_id FK
    int estado_id FK
    string slug UK
    string titulo
    text contenido
    timestamp deleted_at
  }
  PUBLICACION_ETIQUETAS {
    int id PK
    int publicacion_id FK
    int etiqueta_id FK
  }
  COMENTARIOS {
    int id PK
    int publicacion_id FK
    int usuario_id FK
    int comentario_padre_id FK
    text contenido
    timestamp deleted_at
  }
  ESTADOS_REPORTE {
    int id PK
    string clave UK
    string nombre
  }
  REPORTES_COMENTARIOS {
    int id PK
    int comentario_id FK
    int usuario_id FK
    int estado_id FK
    int gestionado_por FK
    string motivo
    text detalle
  }
  TIPOS_REACCION {
    int id PK
    string clave UK
    string nombre
  }
  REACCIONES {
    int id PK
    int publicacion_id FK
    int usuario_id FK
    int tipo_id FK
  }
  FAVORITOS {
    int id PK
    int usuario_id FK
    int publicacion_id FK
  }
  REACCIONES_CULTIVOS {
    int id PK
    int cultivo_id FK
    int usuario_id FK
    int tipo_id FK
  }
  FAVORITOS_CULTIVOS {
    int id PK
    int usuario_id FK
    int cultivo_id FK
  }
  ESTADOS_CONSULTA {
    int id PK
    string clave UK
    string nombre
  }
  CONSULTAS {
    int id PK
    int usuario_id FK
    int distrito_id FK
    int cultivo_id FK
    int estado_id FK
    string titulo
    text contenido
  }
  RESPUESTAS {
    int id PK
    int consulta_id FK
    int usuario_id FK
    text contenido
  }
  TECNICO_DISTRITOS {
    int id PK
    int tecnico_id FK
    int distrito_id FK
  }
  CONSULTA_ARCHIVOS {
    int id PK
    int consulta_id FK
    int archivo_id FK
  }
  CALIFICACIONES_RESPUESTAS {
    int id PK
    int respuesta_id FK
    int usuario_id FK
    int puntuacion
    string comentario
  }
  ARCHIVOS {
    int id PK
    int autor_id FK
    string ruta
    string mime
    int tamano
    int ancho
    int alto
    string licencia
    string texto_alternativo
  }
  PARCELA_ARCHIVOS {
    int id PK
    int parcela_id FK
    int archivo_id FK
  }
  PUBLICACION_ARCHIVOS {
    int id PK
    int publicacion_id FK
    int archivo_id FK
  }
  CONFIGURACIONES {
    int id PK
    string clave UK
    text valor
  }
  ESTADOS_JOBS {
    int id PK
    string clave UK
    string nombre
  }
  EJECUCIONES_JOBS {
    int id PK
    string trabajo
    int estado_id FK
    int ejecutado_por FK
    string origen
    timestamp iniciado_en
    timestamp finalizado_en
    text resultado
    text error
  }
  ESTADOS_SOLICITUD {
    int id PK
    string clave UK
    string nombre
  }
  SOLICITUDES_ROL {
    int id PK
    int usuario_id FK
    int rol_id FK
    int estado_id FK
    int archivo_id FK
    int revisado_por FK
  }

  USUARIOS ||--|| PERFILES : tiene
  ARCHIVOS o|--o{ PERFILES : fotografia
  USUARIOS ||--o| PREFERENCIAS_NOTIFICACION : configura
  USUARIOS ||--o{ USUARIO_ROLES : recibe
  ROLES ||--o{ USUARIO_ROLES : asigna
  USUARIOS ||--o{ USUARIO_ROLES : otorga
  ROLES ||--o{ ROL_PERMISOS : incluye
  PERMISOS ||--o{ ROL_PERMISOS : concede
  USUARIOS ||--o{ TOKENS_RECUPERACION : solicita
  USUARIOS o|--o{ AUDITORIA : ejecuta
  DEPARTAMENTOS ||--o{ PROVINCIAS : contiene
  PROVINCIAS ||--o{ DISTRITOS : contiene
  DISTRITOS ||--o{ COMUNIDADES : contiene
  CULTIVOS ||--o{ CULTIVO_VARIEDADES : relaciona
  VARIEDADES ||--o{ CULTIVO_VARIEDADES : relaciona
  CULTIVOS ||--o{ CULTIVO_REQUERIMIENTOS : requiere
  ZONAS_ALTITUDINALES ||--o{ CULTIVO_REQUERIMIENTOS : condiciona
  CULTIVOS ||--o{ CALENDARIO_TRADICIONAL : calendario
  ZONAS_ALTITUDINALES ||--o{ CALENDARIO_TRADICIONAL : ubica
  USUARIOS ||--o{ PARCELAS : posee
  ZONAS_ALTITUDINALES ||--o{ PARCELAS : clasifica
  COMUNIDADES o|--o{ PARCELAS : ubica
  DISTRITOS o|--o{ PARCELAS : distrito
  PARCELAS ||--o{ CAMPANIAS : desarrolla
  CULTIVOS ||--o{ CAMPANIAS : cultiva
  ESTADOS_CAMPANIA ||--o{ CAMPANIAS : clasifica
  CULTIVO_VARIEDADES o|--o{ CAMPANIAS : permite
  CAMPANIAS ||--o{ SIEMBRAS : registra
  CAMPANIAS ||--o{ COSECHAS : produce
  UNIDADES_MEDIDA ||--o{ COSECHAS : expresa
  PARCELAS ||--o{ LECTURAS : recibe
  FUENTES_DATOS ||--o{ LECTURAS : origina
  USUARIOS o|--o{ LECTURAS : registra
  PARCELAS ||--o{ SINCRONIZACIONES_PARCELA : sincroniza
  FUENTES_DATOS ||--o{ SINCRONIZACIONES_PARCELA : consulta
  PARCELAS ||--o{ ACCESOS_PARCELA : comparte
  USUARIOS ||--o{ ACCESOS_PARCELA : accede
  TIPOS_ALERTA ||--o{ ALERTA_REGLAS : clasifica
  METRICAS_ALERTA ||--o{ ALERTA_REGLAS : mide
  OPERADORES_ALERTA ||--o{ ALERTA_REGLAS : compara
  TIPOS_UMBRAL o|--o{ ALERTA_REGLAS : determina
  CULTIVOS o|--o{ ALERTA_REGLAS : aplica
  ZONAS_ALTITUDINALES o|--o{ ALERTA_REGLAS : limita
  ALERTA_REGLAS ||--o{ ALERTAS : genera
  PARCELAS ||--o{ ALERTAS : recibe
  LECTURAS o|--o{ ALERTAS : sustenta
  ESTADOS_ALERTA ||--o{ ALERTAS : clasifica
  USUARIOS ||--o{ NOTIFICACIONES : recibe
  TIPOS_NOTIFICACION ||--o{ NOTIFICACIONES : clasifica
  ALERTAS o|--o{ NOTIFICACIONES : origina
  CONSULTAS o|--o{ NOTIFICACIONES : origina
  AVISOS_ZONA o|--o{ NOTIFICACIONES : origina
  TIPOS_AVISO_ZONA ||--o{ AVISOS_ZONA : clasifica
  USUARIOS ||--o{ AVISOS_ZONA : publica
  DISTRITOS ||--o{ AVISOS_ZONA : delimita
  USUARIOS o|--o{ MENSAJES_CONTACTO : atiende
  USUARIOS o|--o{ PUBLICACIONES : redacta
  CATEGORIAS ||--o{ PUBLICACIONES : clasifica
  ESTADOS_PUBLICACION ||--o{ PUBLICACIONES : controla
  PUBLICACIONES ||--o{ PUBLICACION_ETIQUETAS : etiqueta
  ETIQUETAS ||--o{ PUBLICACION_ETIQUETAS : asigna
  PUBLICACIONES ||--o{ COMENTARIOS : recibe
  USUARIOS o|--o{ COMENTARIOS : escribe
  COMENTARIOS o|--o{ COMENTARIOS : responde
  PUBLICACIONES ||--o{ REACCIONES : recibe
  USUARIOS ||--o{ REACCIONES : expresa
  TIPOS_REACCION ||--o{ REACCIONES : clasifica
  USUARIOS ||--o{ FAVORITOS : guarda
  PUBLICACIONES ||--o{ FAVORITOS : es_guardada
  CULTIVOS ||--o{ REACCIONES_CULTIVOS : recibe
  USUARIOS ||--o{ REACCIONES_CULTIVOS : expresa
  TIPOS_REACCION ||--o{ REACCIONES_CULTIVOS : clasifica
  USUARIOS ||--o{ FAVORITOS_CULTIVOS : guarda
  CULTIVOS ||--o{ FAVORITOS_CULTIVOS : es_guardado
  COMENTARIOS ||--o{ REPORTES_COMENTARIOS : recibe
  USUARIOS ||--o{ REPORTES_COMENTARIOS : reporta
  ESTADOS_REPORTE ||--o{ REPORTES_COMENTARIOS : clasifica
  USUARIOS o|--o{ REPORTES_COMENTARIOS : gestiona
  USUARIOS o|--o{ CONSULTAS : plantea
  ESTADOS_CONSULTA ||--o{ CONSULTAS : clasifica
  CONSULTAS ||--o{ RESPUESTAS : recibe
  USUARIOS o|--o{ RESPUESTAS : responde
  USUARIOS ||--o{ TECNICO_DISTRITOS : atiende
  DISTRITOS ||--o{ TECNICO_DISTRITOS : cubre
  CONSULTAS ||--o{ CONSULTA_ARCHIVOS : adjunta
  ARCHIVOS ||--o{ CONSULTA_ARCHIVOS : vincula
  RESPUESTAS ||--o{ CALIFICACIONES_RESPUESTAS : califica
  USUARIOS ||--o{ CALIFICACIONES_RESPUESTAS : evalua
  USUARIOS o|--o{ ARCHIVOS : autoriza
  PARCELAS ||--o{ PARCELA_ARCHIVOS : adjunta
  ARCHIVOS ||--o{ PARCELA_ARCHIVOS : vincula
  PUBLICACIONES ||--o{ PUBLICACION_ARCHIVOS : adjunta
  ARCHIVOS ||--o{ PUBLICACION_ARCHIVOS : vincula
  USUARIOS ||--o{ SOLICITUDES_ROL : solicita
  ROLES ||--o{ SOLICITUDES_ROL : pide
  ESTADOS_SOLICITUD ||--o{ SOLICITUDES_ROL : clasifica
  ARCHIVOS o|--o{ SOLICITUDES_ROL : acredita
  USUARIOS o|--o{ SOLICITUDES_ROL : revisa
  ESTADOS_JOBS ||--o{ EJECUCIONES_JOBS : clasifica
  USUARIOS o|--o{ EJECUCIONES_JOBS : ejecuta
```

## Por qué cada tabla cumple 3FN

| Tabla | Justificación de 3FN |
|---|---|
| `usuarios` | Cada atributo describe una cuenta; los datos personales y los roles están en relaciones separadas. |
| `perfiles` | `usuario_id` es único; nombre, teléfono y comunidad dependen únicamente de ese usuario. |
| `preferencias_notificacion` | Una fila única por usuario guarda solo sus preferencias, sin duplicar datos de cuenta. |
| `roles` | La clave/nombre/descripción describen un rol identificado por su PK. |
| `permisos` | La clave única identifica una acción; su descripción depende solo del permiso. |
| `rol_permisos` | La pareja rol-permiso es única; no duplica atributos de las entidades enlazadas. |
| `usuario_roles` | La pareja usuario-rol es única; otorgante y rol principal son atributos de la asignación. |
| `tokens_recuperacion` | El hash identifica un token; expiración y uso pertenecen a ese token. |
| `auditoria` | Acción, entidad, referencia e IP describen un evento; no almacena datos copiados del usuario. |
| `sesiones` | `sid` único identifica el documento de sesión; `sess` y expiración dependen de esa clave. |
| `departamentos` | Código y nombre son identificadores alternativos; no se guardan provincias en columnas repetidas. |
| `provincias` | Cada provincia depende de su PK y referencia un único departamento. |
| `distritos` | Cada distrito depende de su PK y referencia una única provincia. |
| `comunidades` | Nombre y coordenadas describen una comunidad identificada dentro de su distrito. |
| `zonas_altitudinales` | Clave, nombre y límites de altitud describen únicamente la zona. |
| `cultivos` | Nombre, slug y descripción dependen de la PK del cultivo. |
| `variedades` | Los atributos describen la variedad; su pertenencia a cultivos está fuera de esta tabla. |
| `cultivo_variedades` | La pareja cultivo-variedad es una relación sin atributos duplicados de las entidades. |
| `cultivo_requerimientos` | Cada par cultivo-zona tiene sus rangos; no se repiten nombres de cultivo o zona. |
| `calendario_tradicional` | La ventana y fuente dependen del par cultivo-zona, único en la tabla. |
| `parcelas` | Ubicación, elevación y medidas describen la parcela; el cultivo se obtiene de sus campañas. |
| `estados_campania` | La clave identifica un estado y su nombre no depende de otro atributo no clave. |
| `campanias` | Fechas y estado describen una campaña; el par cultivo-variedad es una relación válida. |
| `siembras` | Fecha, método y observaciones pertenecen a un evento de siembra individual. |
| `unidades_medida` | La clave de unidad determina su nombre, sin copiarlo en cada cosecha. |
| `cosechas` | Cantidad, fecha y unidad pertenecen al evento, sin guardar rendimiento calculado. |
| `fuentes_datos` | Cada clave identifica una fuente de lectura; `prioridad` ordena las fuentes automáticas de menor a mayor. |
| `lecturas` | Valores y fecha corresponden a una medición; la fuente y el autor son referencias. |
| `sincronizaciones_parcela` | Una fila por pareja parcela-fuente registra el último intento y su estado sin copiar coordenadas ni nombre. |
| `accesos_parcela` | Permiso y vigencia pertenecen a la relación entre técnico y parcela. |
| `tipos_alerta` | Catálogo de tipos separado de reglas y alertas. |
| `metricas_alerta` | Catálogo de magnitudes; sus nombres no se repiten en cada regla. |
| `operadores_alerta` | Catálogo de operadores independiente de las reglas. |
| `tipos_umbral` | Catálogo separado de referencias a límites dinámicos o numéricos. |
| `alerta_reglas` | Clave, umbral y periodicidad describen la regla; tipo, métrica, operador y umbral son referencias. |
| `estados_alerta` | Cada clave describe un estado de alerta sin atributos dependientes entre sí. |
| `alertas` | El evento referencia regla, parcela, lectura opcional y estado; no duplica el tipo de la regla. |
| `tipos_notificacion` | Catálogo de tipos de notificación reutilizable. |
| `notificaciones` | Mensaje y marca de lectura pertenecen a una notificación; el tipo es una referencia. |
| `tipos_aviso_zona` | Catálogo de clases de aviso, separado del contenido y la vigencia de cada aviso. |
| `avisos_zona` | Cada aviso contiene texto y vigencia propios; distrito, tipo y técnico son referencias. |
| `mensajes_contacto` | Nombre, correo, asunto y mensaje pertenecen al envío; el estado y responsable de atención describen su seguimiento. |
| `categorias` | Nombre, slug y descripción describen una categoría identificada por la PK. |
| `etiquetas` | Nombre y slug identifican una etiqueta, independiente de las publicaciones que la usan. |
| `estados_publicacion` | Catálogo de estados separado del contenido. |
| `publicaciones` | Título y contenido pertenecen a una publicación; autor, categoría y estado son FKs. |
| `publicacion_etiquetas` | La pareja publicación-etiqueta es única y no repite atributos de ambas tablas. |
| `comentarios` | Contenido, publicación y padre describen un comentario; borrado lógico y respuestas son propios de la fila. |
| `estados_reporte` | Catálogo que separa el nombre del estado de los reportes. |
| `reportes_comentarios` | Motivo y gestión pertenecen al reporte; comentario, autor y estado son referencias. |
| `tipos_reaccion` | El nombre del tipo depende de una clave de catálogo. |
| `reacciones` | Usuario, publicación y tipo forman una reacción; se restringe a una por usuario y publicación. |
| `favoritos` | La pareja usuario-publicación es única; no se copian títulos ni datos del contenido. |
| `reacciones_cultivos` | La pareja usuario-cultivo es única; el tipo de reacción se referencia al catálogo. |
| `favoritos_cultivos` | La pareja usuario-cultivo es única y no duplica datos del catálogo de cultivos. |
| `estados_consulta` | Catálogo de estados independiente de las consultas. |
| `consultas` | Título y contenido pertenecen a una consulta; estado, autor, distrito y cultivo se referencian. |
| `respuestas` | Contenido y autor opcional pertenecen a una respuesta de una consulta. |
| `tecnico_distritos` | La pareja técnico-distrito es única y expresa cobertura sin copiar nombres geográficos. |
| `consulta_archivos` | La pareja consulta-archivo es única; no usa una columna polimórfica. |
| `calificaciones_respuestas` | Puntuación y comentario pertenecen a la evaluación; respuesta y agricultor son referencias. |
| `archivos` | Ruta, tipo, dimensiones, licencia y autor describen un archivo; no hay entidad polimórfica. |
| `parcela_archivos` | La pareja parcela-archivo evita columnas genéricas de tipo de entidad. |
| `publicacion_archivos` | La pareja publicación-archivo es independiente y evita una relación polimórfica. |
| `configuraciones` | La clave única identifica un valor de configuración sin grupos repetidos. |
| `estados_jobs` | Catálogo de estados de ejecución; la clave determina su etiqueta. |
| `ejecuciones_jobs` | Inicio, fin y resultado describen un intento de trabajo; estado y ejecutor son referencias. |
| `estados_solicitud` | Catálogo requerido por las solicitudes de rol existentes. |
| `solicitudes_rol` | Una solicitud contiene su estado y referencias; nombres de usuario/rol no se duplican. |

## Catálogos, seeds y borrado

Los seeds cargan los cuatro roles operativos, permisos por módulo y acción, zonas
altitudinales, las fuentes `manual`, `nasa_power`, `open_meteo` y `smap`, los tres cultivos y
sus rangos/calendarios referenciales, los departamentos indicados y los catálogos de estados,
tipos, métricas, operadores, unidades y categorías. El seed de Fase 7 agrega los tipos de
reacción/umbral, estados de reporte y consultas, y reglas predeterminadas de alertas. El rol
`visitante` no se persiste.

La migración `20261112000000_interaccion_usuarios` agrega reportes, reacciones/favoritos de
cultivos, cobertura distrital de técnicos, archivos y calificaciones de consultas; también
incorpora al esquema la relación geográfica y de cultivo de las consultas, el borrado lógico de
comentarios y parámetros configurables de alertas. La respuesta se limita a una por consulta en
el servicio mediante transacción y bloqueo de la fila de consulta.

El seed de administrador usa `ADMIN_EMAIL`, `ADMIN_NOMBRE` y `ADMIN_PASSWORD` desde `.env`.
Las tres variables son opcionales, pero se deben configurar juntas. La contraseña se guarda
como hash bcrypt; si ya existe la cuenta, se promueve sin reemplazar su contraseña.

La migración `20261113000000_paneles_roles` agrega el catálogo de tipos de aviso zonal, los avisos
por distrito, la referencia opcional desde notificaciones y el seguimiento `leido` /
`atendido_por` en `mensajes_contacto`. El responsable se conserva como `NULL` al borrar su cuenta;
los avisos históricos restringen el borrado de su autor y distrito.

La migración `20261114000000_datos_reales_jobs` agrega estados y ejecuciones de trabajos,
disponibilidad de sincronización por parcela/fuente e impone `UNIQUE (parcela_id, fuente_id, fecha)`
en `lecturas`. Antes de migrar detecta duplicados existentes y falla con un mensaje de corrección;
no elimina lecturas automáticamente. Seeds de estado disponibles: `ejecutando`, `exitoso`,
`parcial` y `fallido`.

La conversión NASA conserva `GWETROOT × 100` como índice porcentual y usa `TS` en °C como
aproximación de temperatura de superficie. No es una medición volumétrica de agua ni una lectura
de temperatura a profundidad. Open-Meteo aporta pronóstico de clima y lecturas modeladas de suelo:
promedio de humedad volumétrica de 3–9 cm y 9–27 cm (en porcentaje) y temperatura a 6 cm.

- `CASCADE`: asignaciones y filas dependientes, como perfiles, roles, lecturas y tablas puente.
- `RESTRICT`: catálogos y datos históricos que no deben desaparecer al borrar una referencia.
- `SET NULL`: referencias opcionales de autoría, revisión o lectura asociada.
- El borrado lógico se aplica solo a usuarios, parcelas y publicaciones.

Las migraciones se ejecutan con `npm run migrate`; los seeds, con `npm run seed`. Para
deshacer el esquema en una base recién creada, `npm run rollback` revierte el lote de
migraciones más reciente; repítelo si se aplicaron en lotes separados.

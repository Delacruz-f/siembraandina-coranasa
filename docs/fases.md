# Registro de fases

## Fase 1 — Estructura base ✅

### Entregado

- Carpetas del proyecto (`src`, `views`, `public`, `migrations`, `seeds`, `tests`, `docs`).
- `package.json` con scripts `start`, `dev`, `migrate`, `migrate:make`, `rollback`, `seed`, `test`, `lint`.
- `src/config/env.js`: carga y valida el `.env`; si falta algo, mensaje claro en español.
- `src/config/db.js` (Knex + comprobación de conexión) y `src/config/logger.js` (pino).
- `src/app.js` (crea la app) separado de `src/server.js` (escucha el puerto y apaga ordenado).
- Middlewares: sesión en base de datos, CSRF, variables de vista, límite de peticiones, errores.
- Errores centralizados: páginas 404, 403, 429 y 500 en español; JSON para `/api`.
- helmet + CSP, compresión, estáticos con caché, cookies `httpOnly`.
- `GET /salud` (JSON con estado de la base de datos) y `GET /salud/vivo`.
- Migración inicial y seed de los tres cultivos.
- Layout EJS reutilizable y página de inicio pública.
- Pruebas Jest + Supertest, ESLint, `.env.example`, `.gitignore`, README con instalación en Windows.
- _Ajuste propuesto fuera de las fases_: el motor de recomendación TSAC (`src/engine.js`) y el
  cliente NASA (`src/nasa.js`) quedan guardados sin montar; se integrarán en el módulo `lecturas`.

### Pendiente para próximas fases

Motor de recomendación; comunidad y panel del editor; Chart.js; Leaflet; node-cron;
sincronización NASA POWER / Open-Meteo.

## Fase 2 — Roles, parcelas y lecturas ✅

### Decisiones aplicadas

- Roles fijos de origen (agricultor, tecnico, editor, administrador) con permisos editables en
  `permisos` + `rol_permisos`; el administrador puede crear roles nuevos.
- Registro público = agricultor. El técnico se obtiene por solicitud (`solicitudes_rol`) aprobada
  por el administrador; el editor se asigna directamente. Toda decisión queda en `auditoria`.
- Lecturas con `registrado_por` (nulo si es automática) y `fuente_id`.
- `accesos_parcela` con `puede_escribir`, `otorgado_en` y `revocado_en`: el agricultor concede y
  revoca; el técnico solo ve/escribe donde tiene acceso vigente.
- `cultivo_requerimientos` y `calendario_tradicional` con `validado`, `fuente` y `validado_por`;
  el técnico corrige y valida desde su panel.

### Entregado

- Migraciones: `20260201000000_roles_usuarios`, `20260202000000_solicitudes_auditoria`,
  `20260203000000_cultivos_requerimientos`, `20260204000000_parcelas_lecturas`.
- Modelo normalizado y migraciones de actualización en `docs/modelo.md`: perfiles 1:1, geografía,
  variedades, campañas, alertas, comunidad, archivos y configuraciones; se conservan los datos
  previos y se trasladan los cultivos actuales de las parcelas a campañas iniciales.
- Seeds: `02_roles_permisos`, `03_catalogos` (estados, fuentes, zonas), `04_cultivos`
  (9 requerimientos por zona y calendario 8–10 / 9–11 / 9–11, todos `validado = false`).
- Seeds adicionales para departamentos con provincias andinas, catálogos del nuevo modelo y
  administrador opcional desde `.env`.
- Módulos: `auth`, `usuarios` (perfil + solicitud), `parcelas` (CRUD + accesos), `lecturas`,
  `panel`, `tecnico`, `admin` (solicitudes, usuarios, permisos, auditoría), `cultivos`.
- Middlewares: `autorizacion` (permisos/roles), `validacion` (express-validator), `subida` (multer).
- Vistas: registro, ingreso, panel, parcelas, perfil, solicitud, panel técnico, administración.
- `scripts/crear-admin.js` (`npm run admin:crear`) para el primer administrador.
- Pruebas `tests/fase2.test.js` (registro, login, parcelas, lecturas, accesos, solicitudes, roles).

### Pendiente para completar la capa funcional de esta fase

CRUD de campañas, alertas y comunidad; herramientas de publicación del editor; motor de recomendación; Chart.js; Leaflet;
node-cron y sincronización NASA POWER / Open-Meteo.

## Fase 3 — Autenticación y RBAC ✅

### Entregado

- Registro público como agricultor, verificación de correo, ingreso, salida y recuperación de
  contraseña con tokens de un solo uso; recuperación vence en una hora y verificación en 24 horas.
- SMTP mediante Nodemailer; configuración y requisitos de producción documentados en `.env.example`
  y README.
- Contraseñas nuevas con bcrypt costo 12; las cuentas existentes conservan sus hashes hasta el
  primer ingreso correcto, cuando se actualizan sin cambiar la contraseña. Las cuentas antiguas
  se marcan verificadas en la migración.
- Bloqueo de 15 minutos tras cinco intentos fallidos, límite de peticiones en rutas de autenticación
  y regeneración de sesión al ingresar.
- Permisos consultados desde la base de datos y refrescados en sesión; usuarios con varios roles
  conservan los permisos y paneles de cada rol.
- Protección de propiedad para parcelas, lecturas y descargas de archivos: los recursos ajenos se
  ocultan con 404. Archivos subidos no se sirven desde la carpeta pública.
- Auditoría de ingresos, asignaciones de rol y borrados existentes. El registro de publicación se
  conectará al flujo de publicación, que pertenece a la capa funcional de comunidad aún pendiente.
- Matriz de acceso por rol, prueba CSRF y pruebas unitarias de autenticación.

### Pendiente para completar esta fase

- Configurar SMTP real en `.env` con el proveedor elegido.
- Ejecutar migraciones, seeds y pruebas de integración contra bases aisladas de MySQL y PostgreSQL.
- Conectar la auditoría al publicar cuando se implemente el flujo editorial/comunidad.

## Fase 4 — Sistema de diseño y layout ✅

### Entregado

- Tokens CSS para paleta, tipografía Manrope local, escala tipográfica, superficies, sombras y
  tema oscuro diseñado con contrastes y sombras propios.
- CSS sin frameworks externos, mobile-first, con breakpoints de 640, 960 y 1280 px; controles,
  foco visible de 3 px y respeto por `prefers-reduced-motion`.
- Componentes reutilizables para botones, tarjetas, campos, selector, interruptor, casilla,
  estados, alertas, tablas, paginación, pestañas, diálogo, progreso, avatar, tooltip, esqueletos
  y estado vacío.
- Layouts EJS público, panel con menú lateral colapsable y navegación inferior móvil, y
  autenticación centrada.
- Iconos SVG locales en parciales EJS; licencias de Manrope y Lucide incluidas.
- `/guia-estilo` protegida por rol de administrador, con muestras de componentes en ambos temas y
  prueba de acceso para administrador y agricultor.

### Validación

- Lighthouse en `/guia-estilo`, con sesión de administrador: **100/100 en accesibilidad**, sin
  auditorías fallidas.
- Sin desbordamiento horizontal en anchos de 360, 640, 960, 1280 y 1440 px; botones y enlaces
  visibles cumplen el objetivo mínimo de 44 px.
- Verificados en navegador el cambio de tema, las pestañas con teclado y la apertura/cierre del
  diálogo; los temas claro y oscuro tienen sus propias muestras.

## Fase 5 — Sitio público (en validación)

### Entregado

- Inicio público con búsqueda rápida de ubicación y cultivo, catálogo destacado, artículos recientes
  y explicación del flujo de consulta.
- Calendario compartible por URL, selección dependiente de departamento, provincia y distrito,
  ventanas tradicionales y estado explícito de los datos NASA POWER.
- Catálogo y detalle de cultivos con variedades, rangos por zona, calendario, galería y contenido
  relacionado.
- Saberes con filtros, búsqueda, paginación, detalle y lectura pública de comentarios; escribir
  comentarios requiere sesión y CSRF.
- Lista y mapa Leaflet de comunidades, información del proyecto y contacto con almacenamiento y
  límite de envíos.
- Metadatos SEO/Open Graph, `sitemap.xml`, `robots.txt`, estilos responsive y recursos locales.
- Migración `20260401000000_mensajes_contacto`, datos iniciales de variedades/artículos y datos
  UBIGEO de departamentos, provincias y distritos.

### Validación

- `npm run migrate` y `npm run seed` ejecutados en la base MySQL aislada de pruebas; la repetición
  del seed conserva cinco artículos y nueve variedades sin duplicados.
- `npm test`: **59 pruebas pasando**; `npm run lint` y compilación de todas las vistas EJS también
  pasan.
- Lighthouse móvil en `/`: **98/100 en rendimiento** (LCP 1.8 s, CLS 0.001, TBT 160 ms).
- Navegador verificado a 360 y 1440 px, con formularios dependientes de ubicación y mapa Leaflet.

### Pendiente

- Ejecutar migración y seeds y verificar rollback en PostgreSQL 15.
- Revalidar Lighthouse en el entorno público y con comunidades/datos representativos de producción.

## Fase 6 — Panel agricultor ✅

### Entregado

- Resumen por parcela con semáforo basado en la última lectura y en `cultivo_requerimientos`,
  próximas alertas y pronóstico de cinco días de Open-Meteo (clima, no medición del suelo).
- Alta, edición y archivo de parcelas; ubicación por departamento, provincia y distrito, pin de
  mapa, elevación opcional y sugerencia de zona consultando los límites del catálogo.
- Campañas con cultivo, variedad, estado y fechas; eventos de siembra/cosecha y comparación de la
  fecha real con el calendario tradicional.
- Lecturas manuales, historial paginado, gráfico local Chart.js con bandas ideales e importación
  CSV con vista previa, validación por fila y confirmación de las filas válidas.
- Galería privada JPG/PNG/WEBP con texto alternativo, límite de 5 MB por imagen y normalización con
  Sharp; fotografía de perfil y preferencias de notificación.
- Formularios con validación en servidor, mensajes de corrección, control de propiedad y datos
  privados servidos únicamente tras autorización.
- Migración `20260402000000_panel_agricultor` para el distrito de parcela, referencia de foto de
  perfil y preferencias de notificación.

### Validación

- Migración y ocho seeds ejecutados en la base MySQL aislada de pruebas.
- La migración de Fase 6 se revirtió y reaplicó; los ocho seeds volvieron a ejecutarse y las 14
  migraciones quedaron aplicadas sin pendientes.
- `npm test`: **68 pruebas pasando**. `npm run lint`: correcto.
- PostgreSQL 15 no está disponible en este entorno; esa comprobación queda pendiente junto con la
  verificación global ya indicada en Fase 5.

## Fase 7 — Interacciones comunitarias y alertas ✅

### Entregado

- Comentarios con un nivel de respuesta, edición propia durante 15 minutos, borrado lógico y reporte
  para la cola editorial. Reacciones y favoritos separados para artículos y cultivos; los totales
  se calculan con consultas.
- Consultas de agricultores con hasta tres imágenes, asignación a técnicos por distritos de
  cobertura, respuesta única y calificación del agricultor. Se aplican controles de propiedad para
  consultas y sus archivos.
- Evaluación diaria de reglas de humedad y temperatura, creación idempotente de alertas y
  notificaciones, correo opcional para alertas críticas según preferencias y centro paginado.
- Actualización de la campana con Server-Sent Events, máximo de tres conexiones por usuario,
  cierre de intervalos al desconectar y límites de frecuencia en acciones comunitarias.
- Migración `20261112000000_interaccion_usuarios`, seed `10_interacciones_alertas.js`, permisos,
  navegación por rol, formularios/vistas y documentación del modelo.

### Validación

- Migración y seeds de Fase 7 se ejecutaron en MySQL aislado de pruebas.
- `npm test`: **76 pruebas pasando**, incluidas pruebas de propiedad y plazo de comentarios,
  persistencia de alertas y límite/liberación de conexiones SSE.
- `npm run lint` y compilación de las **80 vistas EJS** correctos.
- No se ha verificado rollback de la nueva migración ni disponibilidad de PostgreSQL 15 en este
  entorno; esas comprobaciones siguen pendientes.

## Fase 8 — Paneles restringidos por rol ✅

### Entregado

- Técnico: historial de permisos de lectura concedidos/revocados sobre parcelas y publicación de
  avisos zonales; los usuarios con parcelas activas en el distrito reciben una notificación.
- Editor: gestión de artículos y estados `borrador`, `publicada`, `programada` y `archivada`,
  categorías/etiquetas, editor visual con controles de formato, biblioteca de imágenes con recorte
  de proporción/posición y texto alternativo, y moderación. El HTML se sanitiza al guardarse,
  editarse y renderizarse públicamente; la publicación programada se procesa cada minuto.
- Administrador: indicadores, usuarios con roles múltiples, suspensiones, rol personalizado con
  permisos dinámicos, catálogos, auditoría y mensajes de contacto con búsqueda/orden/paginación en
  servidor, auditoría exportable y configuraciones. Se protege al último administrador activo.
- Formularios sensibles con confirmación; operaciones de roles, publicaciones, avisos,
  configuraciones y contacto registran auditoría. Se amplió la matriz de acceso para los routers
  de Técnico, Editor y Administración.
- Migración `20261113000000_paneles_roles.js`; seed extiende permisos/estados/tipos. No se agregaron
  variables de entorno.

### Validación

- Migración y seeds aplicados en `siembra_andina_pruebas` (MySQL aislado); los seeds se ejecutaron
  de nuevo sin errores.
- Rollback y reaplicación de la migración de Fase 8 verificados en MySQL; seeds aplicados de nuevo.
- `npm test`: 88 pruebas pasando; `npm run lint` y compilación EJS correctos.
- PostgreSQL 15 no está disponible en este entorno; la compatibilidad debe verificarse allí.

## Fase 9 — Integración de clima y suelo ✅

### Entregado

- Contrato `FuenteDatos.obtener(latitud, longitud, fechaInicio, fechaFin)` y adaptadores para NASA
  POWER y Open-Meteo; caché por coordenadas redondeadas a dos decimales, coalescencia de solicitudes
  simultáneas, timeout y reintentos de errores transitorios.
- NASA POWER solicita `GWETROOT` y `TS`. La humedad se convierte con
  `índice_porcentual = GWETROOT × 100`; es el índice de humedad radicular de la API expresado en
  porcentaje, no humedad volumétrica observada. `TS` es temperatura superficial estimada, no una
  medición con sonda. Estos límites se indican en el panel y la documentación.
- Open-Meteo entrega pronóstico diario de siete días (mínima, máxima y lluvia), y las alertas
  conservan pronóstico horario para riesgo de helada en 48 horas. El panel muestra fecha de última
  lectura guardada cuando no hay datos recientes.
- La sincronización diaria de parcelas activas guarda fuente, evita duplicados mediante clave única
  parcela/fuente/fecha y registra disponibilidad por parcela/fuente. Se continúa el lote ante fallas
  individuales.
- Jobs de sincronización, evaluación de alertas, limpieza de tokens y publicación programada se
  registran en la base; el panel `/admin/trabajos` permite consultar estado y ejecutar manualmente
  con auditoría.
- Adaptador SMAP con interfaz común y variables opcionales `EARTHDATA_USER` / `EARTHDATA_TOKEN`;
  queda explícitamente inactivo hasta seleccionar producto/endpoint. Se documentó la creación del
  token NASA Earthdata en README.
- Migración `20261114000000_datos_reales_jobs.js`, seed `11_estados_jobs.js`, permiso
  `trabajos.gestionar` y variables en `.env.example`. No se leyó ni cambió `.env`.

### Validación

- Pruebas de API con respuestas simuladas, sin llamadas de red en Jest; incluye conversión NASA,
  caché de coordenadas, reintento HTTP, pronóstico de siete días, fallas por parcela, jobs y matriz
  RBAC.
- Migración, rollback y reaplicación verificados en `siembra_andina_pruebas` (MySQL); se comprobó
  el seed de los cuatro estados de jobs y se retiró una tabla `knex_migrations` vacía que no usa
  la configuración del proyecto.
- `npm test`: **96 pruebas pasando**. `npm run lint` y compilación EJS correctos.
- PostgreSQL 15 no está disponible en este entorno; la verificación de compatibilidad allí sigue
  pendiente.

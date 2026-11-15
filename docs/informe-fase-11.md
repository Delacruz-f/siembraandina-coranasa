# Informe de la Fase 11 — Endurecimiento y verificación

Fecha: noviembre de 2026. Alcance: todo el proyecto (fases 1 a 10) más el refuerzo de pruebas,
seguridad, herramientas y documentación.

## 1. Criterios de aceptación

| Criterio                                    | Estado | Evidencia                                                                                                              |
| ------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| `npm test` pasa                             | ✅     | 325 pruebas, 29 suites, 0 fallos                                                                                       |
| `npm run lint` pasa                         | ✅     | `eslint .` sin errores ni avisos                                                                                       |
| `npm audit` sin vulnerabilidades altas      | ✅     | 0 altas, 0 críticas (solo moderadas de herramientas de desarrollo)                                                     |
| Cobertura ≥ 70 % en services y repositories | ✅     | líneas 76,2 % · sentencias 74,1 % · funciones 75,2 % · ramas 60,1 %                                                    |
| El seed demo deja el sitio listo            | ✅     | 5 cuentas, 3 parcelas, 90 lecturas, 2 artículos publicados con imágenes, 1 consulta respondida y 3 imágenes de cultivo |

## 2. Lo entregado

### 2.1 Pruebas

Pruebas de integración nuevas (Supertest, base de pruebas real):

| Archivo                          | Qué cubre                                                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/fase11_cabeceras.test.js` | CSP, `nosniff`, `X-Frame-Options`, `Permissions-Policy`, ausencia de `X-Powered-By`                                                                                 |
| `tests/fase11_flujos.test.js`    | Reacciones, favoritos, comentarios, moderación, consultas técnico↔agricultor, editor, admin, trabajos, notificaciones, CSRF, inyección SQL, XSS, subida de archivos |
| `tests/fase11_admin.test.js`     | Catálogos (válidos e inválidos), configuración, auditoría y su CSV, contacto, técnico (requerimientos, calendario, avisos)                                          |

Pruebas unitarias nuevas (services con repositorios simulados):

| Archivo                            | Qué cubre                                                                               |
| ---------------------------------- | --------------------------------------------------------------------------------------- |
| `tests/fase11_motor.test.js`       | Motor de recomendación: ramas sin datos, rangos invertidos, extremos, los tres cultivos |
| `tests/fase11_alertas.test.js`     | Reglas de humedad y heladas, persistencia, resolución, alerta crítica, utilidades       |
| `tests/fase11_validacion.test.js`  | Guardas de parcelas, accesos, imágenes, requerimientos y calendario                     |
| `tests/fase11_lecturas.test.js`    | Fechas, rangos, permisos del técnico, duplicados, importación CSV                       |
| `tests/fase11_usuarios.test.js`    | Registro, bloqueo, cuenta inactiva, correo sin verificar, recuperación                  |
| `tests/fase11_editor.test.js`      | Estados, contenido sanitizado, programación, etiquetas, imágenes, sanitización          |
| `tests/fase11_comunidad.test.js`   | Edición fuera de plazo, respuestas anidadas, reportes duplicados, moderación            |
| `tests/fase11_campanias.test.js`   | Validación de campañas, siembras, cosechas y ventana tradicional                        |
| `tests/fase11_clienteHttp.test.js` | Caché, deduplicación, reintentos 5xx/429, errores de red                                |

Ajustes en pruebas existentes: el flujo de fotos de parcela exige ahora dos comprobaciones CSRF
(`fase2`), y la portada y la ficha de cultivo toleran contenido demo (`publico`).

### 2.2 Seguridad (OWASP Top 10)

| Riesgo                          | Medidas en el proyecto                                                                                                                                                        |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A01 Control de acceso roto**  | Permisos en rutas (`requierePermiso`), comprobaciones de propiedad en services, 404 en lugar de 403 para recursos ajenos, imágenes privadas con permisos en `/media/privadas` |
| **A02 Fallos criptográficos**   | bcrypt (coste 12), tokens de 32 bytes con hash SHA-256, cookies `httpOnly`/`sameSite`, HSTS en producción                                                                     |
| **A03 Inyección**               | Knex con parámetros enlazados en todos los repositories; validación con `express-validator`; pruebas con slugs y búsquedas maliciosas                                         |
| **A04 Diseño inseguro**         | Límites de peticiones, bloqueo tras 5 intentos, ventana de edición de comentarios, límites de tamaño de subida                                                                |
| **A05 Configuración**           | `.env` validado al arrancar; `helmet` con CSP estricta; `X-Powered-By` desactivado; secretos nunca en el código                                                               |
| **A06 Componentes vulnerables** | `sanitize-html` actualizado a 2.18.2; `npm audit` sin altas                                                                                                                   |
| **A07 Autenticación**           | Verificación de correo obligatoria, recuperación con token de un solo uso, mensajes sin revelar si el correo existe                                                           |
| **A08 Integridad**              | Imágenes validadas por contenido con sharp y regeneradas (ver Fase 10)                                                                                                        |
| **A09 Registro**                | Auditoría de acciones sensibles, `pino` con rutas y tokens enmascarados (`rutaSegura`)                                                                                        |
| **A10 SSRF**                    | Las llamadas externas usan URLs fijas (NASA, Open-Meteo) y coordenadas numéricas validadas                                                                                    |

### 2.3 Cabeceras y CSP

`src/app.js` aplica `helmet` con `useDefaults: false` y directivas explícitas:
`default-src 'self'`, `script-src 'self'` (sin `unsafe-inline` ni `unsafe-eval`),
`object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'none'`, `form-action 'self'`,
`img-src` con solo las teselas de OpenStreetMap y `connect-src 'self'`. Además
`Permissions-Policy`, `Cross-Origin-Opener-Policy` y HSTS solo en producción. Las plantillas ya no
usan `style=` (la proporción de las imágenes se aplica desde `galeria.js`).

### 2.4 Herramientas

- **ESLint** (configuración plana) y **Prettier** (`.prettierrc.json`, `.prettierignore`).
- **husky** + **lint-staged**: `.husky/pre-commit` ejecuta ESLint y Prettier sobre lo preparado.
  _Nota_: el proyecto aún no es un repositorio Git en esta máquina, así que `husky init` no pudo
  enganchar el hook; el archivo queda listo y se activa al ejecutar `npm install` en un clon con Git.
- Scripts nuevos: `test:cobertura`, `lint:fix`, `formato`, `formato:check`, `auditar`, `demo`.

### 2.5 Documentación

- `docs/arquitectura.md` — actualizado con módulos 3-11, imágenes, tareas y seguridad.
- `docs/api.md` — nuevo: rutas, permisos, códigos de error y ejemplos `curl`.
- `docs/modelo.md` — ya existía y sigue vigente.
- `CONTRIBUTING.md` — nuevo: entorno, flujo, arquitectura, convenciones, seguridad y pruebas.
- `README.md` — sección de la Fase 10.

## 3. Riesgos conocidos

| Riesgo                                                   | Impacto                                                  | Mitigación actual / recomendación                                                     |
| -------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Adaptadores S3 y Cloudinary son esqueletos               | No se puede cambiar de almacenamiento sin implementarlos | El contrato está definido; implementar con el SDK y probar la migración de binarios   |
| `sanitize-html` 2.18 arrastra ESM puro                   | Jest necesita Babel para transformarlo                   | Ya configurado (`babel.config.js` + `transformIgnorePatterns`); revisar al actualizar |
| Imágenes anteriores a la Fase 10 sin variantes           | No se sirven por `/media`                                | Script de reproceso pendiente (ver deuda técnica)                                     |
| Hook de husky sin activar                                | El pre-commit no se ejecuta todavía                      | Ejecutar `git init` y `npm install`                                                   |
| Vulnerabilidades moderadas en herramientas de desarrollo | Solo afectan a la cadena de build                        | No se instalan en producción; revisar en cada actualización                           |
| Recomendación basada en rangos estáticos                 | No modela microclima ni variedad                         | Documentado como orientación; la validación comunitaria es el paso siguiente          |
| Sino se ejecuta `npm run seed`, faltan catálogos         | Errores 500 claros al arrancar flujos                    | Mensajes explícitos ("Ejecuta npm run seed")                                          |
| Las pruebas usan una base real compartida                | Pueden fallar si se ejecutan en paralelo con datos demo  | Se ejecutan con `--runInBand` y base `siembra_andina_pruebas`                         |

## 4. Deuda técnica priorizada

1. **Reprocesar imágenes antiguas**: script que genere variantes para los `archivos` sin filas en
   `imagen_variantes` y marque los binarios obsoletos. Probablemente ninguna en producción todavía,
   pero conviene tenerlo antes de migrar datos reales.
2. **Adaptador S3 real**: implementar y añadir una prueba de integración con _minio_ o _localstack_.
3. **Mover multer a `diskStorage`** si el hosting limita la memoria: 10 MB por archivo en memoria
   multiplicado por subidas concurrentes.
4. **Índices y consultas**: revisar `listarPublicaciones` con `like '%texto%'`; evaluar búsqueda
   de texto completo cuando el volumen crezca.
5. **Accesibilidad**: auditar con axe/Lighthouse las vistas nuevas (galería, editor, panel técnico).
6. **Internacionalización**: hoy todo está en español; si se requiere quechua/aimara, aislar textos.
7. **Migraciones con datos**: las migraciones actuales son solo de esquema; añadir migraciones de
   datos versionadas para catálogos.
8. **Pruebas de rendimiento**: no hay pruebas de carga; añadir `autocannon` sobre calendario y panel.

## 5. Comandos

```powershell
# Base de pruebas (una vez por máquina)
$env:DB_NAME="siembra_andina_pruebas"; npm run migrate; npm run seed

npm test                 # pruebas
npm run test:cobertura   # pruebas + umbral de cobertura
npm run lint             # ESLint
npm run formato:check    # Prettier
npm audit --audit-level=high

npm run migrate          # base de desarrollo
npm run seed             # catálogos
npm run demo             # datos de demostración
npm run demo -- --limpiar
npm run dev
```

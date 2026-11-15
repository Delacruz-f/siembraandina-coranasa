# Guía de contribución — Siembra Andina

Gracias por aportar. Siembra Andina es una plataforma para comunidades agrícolas de la sierra
peruana; el código se escribe **en español** y busca ser fácil de leer para quien llega después.

## 1. Preparar el entorno

Requisitos: Node.js 20+, MySQL 8 (o MariaDB de XAMPP) o PostgreSQL 15, y Git.

```bash
git clone <url-del-repositorio> siembra-andina
cd siembra-andina
npm install                 # instala dependencias y activa husky
cp .env.example .env        # completa SESSION_SECRET y la conexión
npm run migrate             # crea el esquema
npm run seed                # catálogos y contenido base
npm run demo                # datos de demostración (opcional)
npm run dev                 # http://localhost:3000
```

Genera la clave de sesión con:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## 2. Flujo de trabajo

1. Crea una rama desde `main`: `git checkout -b feat/lecturas-csv`.
2. Haz cambios pequeños y con mensajes claros:
   - `feat:` nueva funcionalidad
   - `fix:` corrección de error
   - `docs:` documentación
   - `test:` pruebas
   - `chore:` tareas de mantenimiento
3. Antes de abrir el cambio: `npm test` y `npm run lint` deben pasar en verde.
4. Abre el _merge request_ explicando **qué** cambia y **por qué**.

### Hook pre-commit

`npx husky init` + `.husky/pre-commit` ejecuta `lint-staged`: ESLint y Prettier solo sobre los
archivos preparados. Para omitirlo puntualmente: `git commit --no-verify`.

## 3. Reglas de arquitectura

```
routes → controllers → services → repositories
```

- **routes**: URLs, validación con `express-validator`, permisos con `requierePermiso`.
- **controllers**: leen `req`, llaman al service, eligen la vista o redirigen.
- **services**: reglas de negocio. No conocen Express ni SQL.
- **repositories**: **la única capa que toca la base de datos** (Knex). Nunca concatenes SQL.

Un módulo nuevo vive en `src/modules/<dominio>/` con sus cuatro archivos y se monta en
`src/modules/index.js`.

## 4. Convenciones de código

- **Idioma**: nombres de variables, funciones, tablas y mensajes en español claro.
- **Tablas**: `snake_case`, en plural (`parcelas`, `imagen_variantes`).
- **Formato**: Prettier manda (`npm run formato`). Comillas dobles, 2 espacios, punto y coma.
- **Lint**: `npm run lint` (ESLint, configuración plana). Sin `console.log` (usa `config/logger`).
- **Errores**: lanza `ErrorHttp` desde `src/utils/errores.js` con un mensaje apto para el usuario.
- **Validación**: toda entrada del usuario se valida en la ruta; los services vuelven a comprobar
  las reglas que dependen del recurso.
- **Vistas**: `<%= %>` para escapar siempre. `<%- %>` solo con HTML ya sanitizado.
- **Configuración**: nunca leas `process.env` fuera de `src/config/env.js`; añade la variable a
  `.env.example` en el mismo cambio.

## 5. Seguridad (no negociable)

- Nada de `style=` ni `<script>` en línea en las plantillas: la CSP no los permite.
- Toda ruta `POST` que escriba debe tener token CSRF (el middleware global ya lo exige; si es
  multipart, añade `validarCsrf` antes y después de multer).
- Las imágenes privadas pasan por `/media/privadas/*`; no las sirvas como estáticos.
- Antes de un cambio de dependencias: `npm audit --audit-level=high`.

## 6. Pruebas

- Ubicación: `tests/`. Nombra por fase o por módulo: `fase11_flujos.test.js`.
- Base separada: `DB_NAME=siembra_andina_pruebas` (en `tests/configurarEntorno.js`).
- Utilidades en `tests/ayudas.js`: `crearUsuario`, `iniciarSesion`, `tokenCsrf`, `extraerCsrf`.
- Cobertura mínima: **70 %** en `services` y `repositories`:

```bash
npm run test:cobertura
```

Si un caso nuevo baja la cobertura, añade la prueba; no rebajes el umbral.

## 7. Documentación

- `docs/arquitectura.md`: capas, módulos, seguridad.
- `docs/modelo.md`: modelo de datos y justificación.
- `docs/api.md`: rutas, permisos y códigos de error.
- `docs/fases.md`: registro de lo entregado por fase.

Actualiza `docs/api.md` en el mismo cambio que añada o modifique una ruta.

## 8. Datos personales

La plataforma trata datos de comunidades reales. No subas a los repositorios fotografías de
parcelas, coordenadas exactas ni correos verdaderos en pruebas o seeds: usa los datos de
demostración (`npm run demo`).

// Configuración de ESLint (formato plano, ESLint 9+).
// Reglas mínimas para mantener el código en español, sin variables sin usar
// y sin concatenar SQL (se revisa a mano en la revisión de código).
const globals = require('globals');

module.exports = [
  {
    ignores: ['node_modules/**', 'public/uploads/**', 'public/vendor/**', 'coverage/**']
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_|^next$', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-var': 'error',
      'prefer-const': 'warn',
      eqeqeq: ['warn', 'smart'],
      'no-console': ['warn', { allow: ['error', 'warn'] }]
    }
  },
  {
    files: ['public/js/**/*.js'],
    languageOptions: { globals: { ...globals.browser } }
  },
  {
    // Service worker de la PWA: usa globales propios (self, caches, clients).
    files: ['public/sw.js'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.serviceworker }
    }
  },
  {
    files: ['scripts/**/*.js'],
    rules: { 'no-console': 'off' }
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.jest } }
  }
];

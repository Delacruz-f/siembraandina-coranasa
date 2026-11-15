// Babel solo se usa en las pruebas, para que Jest pueda transformar los
// paquetes que se publican como ESM puro (htmlparser2 y compañía, que
// arrastra sanitize-html 2.18). El código de la aplicación sigue en CommonJS.
module.exports = {
  presets: [
    [
      "@babel/preset-env",
      {
        targets: { node: "current" },
        modules: "commonjs",
      },
    ],
  ],
};

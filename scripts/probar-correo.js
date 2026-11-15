#!/usr/bin/env node
// Prueba la configuración SMTP: verifica conexión/credenciales y envía un correo.
// Uso: npm run correo:probar -- destino@ejemplo.pe
const env = require("../src/config/env");
const { verificarTransporte, enviar, traducirErrorCorreo } = require("../src/modules/auth/correo.service");

async function principal() {
  const destino = process.argv[2];
  if (!destino) {
    console.error("Uso: npm run correo:probar -- destino@correo.com");
    process.exit(1);
  }
  try {
    if (env.correo.modo === "consola") {
      console.log("MAIL_MODE=consola: no hay conexión SMTP que verificar. Se imprimirá el correo de prueba en la terminal.");
      await enviar({
        para: destino,
        asunto: "Prueba de correo · Siembra Andina",
        texto: "Este es un correo de prueba generado por scripts/probar-correo.js.",
        html: "<p>Este es un correo de prueba generado por <code>scripts/probar-correo.js</code>.</p>",
        tipo: "prueba",
      });
      console.log("Prueba completada en modo consola.");
      return;
    }
    await verificarTransporte();
    console.log("Conexión y credenciales OK");
    await enviar({
      para: destino,
      asunto: "Prueba de correo · Siembra Andina",
      texto: "Conexión SMTP verificada. Este es un correo de prueba.",
      html: "<p>Conexión SMTP verificada. Este es un correo de prueba.</p>",
      tipo: "prueba",
    });
    console.log(`Correo de prueba enviado a ${destino}.`);
  } catch (error) {
    const causa = traducirErrorCorreo(error);
    const detalle = [error && error.code, error && error.responseCode, error && error.message]
      .filter(Boolean)
      .join(" | ");
    console.error(`Error: ${causa}`);
    if (detalle) console.error(`Detalle: ${detalle}`);
    process.exit(1);
  }
}

principal();

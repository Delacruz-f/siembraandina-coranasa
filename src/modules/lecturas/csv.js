// Analiza CSV UTF-8 con comas, comillas escapadas y saltos de línea en celdas.
const { solicitudInvalida } = require("../../utils/errores");

function filasCsv(texto) {
  const filas = [];
  let fila = [];
  let celda = "";
  let entreComillas = false;
  let linea = 1;
  let inicioFila = 1;
  for (let indice = 0; indice < texto.length; indice += 1) {
    const caracter = texto[indice];
    if (entreComillas) {
      if (caracter === '"' && texto[indice + 1] === '"') {
        celda += '"';
        indice += 1;
      } else if (caracter === '"') {
        entreComillas = false;
      } else {
        celda += caracter;
        if (caracter === "\n") linea += 1;
      }
    } else if (caracter === '"' && celda.length === 0) {
      entreComillas = true;
    } else if (caracter === ",") {
      fila.push(celda);
      celda = "";
    } else if (caracter === "\n" || caracter === "\r") {
      if (caracter === "\r" && texto[indice + 1] === "\n") indice += 1;
      fila.push(celda);
      if (fila.some((valor) => valor.trim())) {
        filas.push({ linea: inicioFila, celdas: fila });
      }
      fila = [];
      celda = "";
      linea += 1;
      inicioFila = linea;
    } else {
      celda += caracter;
    }
  }
  if (entreComillas) {
    throw solicitudInvalida("El CSV tiene una comilla sin cerrar.");
  }
  fila.push(celda);
  if (fila.some((valor) => valor.trim())) {
    filas.push({ linea: inicioFila, celdas: fila });
  }
  return filas;
}

function analizarCsv(buffer) {
  let texto;
  try {
    texto = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw solicitudInvalida(
      "El archivo debe ser CSV codificado en UTF-8.",
      undefined,
    );
  }
  texto = texto.replace(/^\uFEFF/, "");
  const filas = filasCsv(texto);
  if (filas.length < 2) {
    throw solicitudInvalida(
      "El CSV debe incluir una cabecera y al menos una lectura.",
    );
  }
  if (filas.length > 1001) {
    throw solicitudInvalida("El archivo puede contener hasta 1 000 lecturas.");
  }

  const cabeceras = filas[0].celdas.map((celda) =>
    celda.trim().toLowerCase(),
  );
  const requeridas = ["fecha", "humedad", "temperatura"];
  const indices = Object.fromEntries(
    cabeceras.map((cabecera, indice) => [cabecera, indice]),
  );
  if (
    requeridas.some((cabecera) => !(cabecera in indices)) ||
    new Set(cabeceras).size !== cabeceras.length
  ) {
    throw solicitudInvalida(
      "La primera fila debe incluir fecha, humedad y temperatura, una sola vez cada una.",
    );
  }

  const validas = [];
  const errores = [];
  for (const fila of filas.slice(1)) {
    const valor = (clave) =>
      indices[clave] === undefined
        ? ""
        : (fila.celdas[indices[clave]] || "").trim();
    const lectura = {
      fecha: valor("fecha"),
      humedad: valor("humedad"),
      temperatura: valor("temperatura"),
      observacion: valor("observacion"),
    };
    const fecha = new Date(`${lectura.fecha}T00:00:00Z`);
    const humedad = Number(lectura.humedad);
    const temperatura = Number(lectura.temperatura);
    const motivos = [];
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(lectura.fecha) ||
      Number.isNaN(fecha.getTime()) ||
      fecha.toISOString().slice(0, 10) !== lectura.fecha
    ) {
      motivos.push("fecha debe tener el formato AAAA-MM-DD");
    } else if (fecha.getTime() > Date.now() + 86400000) {
      motivos.push("la fecha no puede estar en el futuro");
    }
    if (!Number.isFinite(humedad) || humedad < 0 || humedad > 100) {
      motivos.push("humedad debe estar entre 0 y 100");
    }
    if (!Number.isFinite(temperatura) || temperatura < -30 || temperatura > 60) {
      motivos.push("temperatura debe estar entre -30 y 60 °C");
    }
    if (lectura.observacion.length > 500) {
      motivos.push("observacion admite hasta 500 caracteres");
    }
    if (motivos.length) {
      errores.push({ linea: fila.linea, mensaje: motivos.join("; ") });
    } else {
      validas.push({
        linea: fila.linea,
        fecha: lectura.fecha,
        humedad,
        temperatura,
        observacion: lectura.observacion || null,
      });
    }
  }
  return { validas, errores };
}

module.exports = { analizarCsv };

// Límites de tamaño de archivo. Los valores viven en .env
// (UPLOADS_MAX_BYTES) y son los mismos para todas las subidas.
const multer = require("multer");
const env = require("../config/env");
const { ErrorHttp } = require("../utils/errores");

const subida = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.subidas.tamanoMaximoBytes, files: 1 },
  fileFilter(req, archivo, cb) {
    const permitidos = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];
    if (!permitidos.includes(archivo.mimetype)) {
      return cb(
        new Error("Solo se aceptan imágenes JPG, PNG, WEBP o documentos PDF."),
      );
    }
    return cb(null, true);
  },
});

const subidaCsv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.subidas.tamanoMaximoBytes, files: 1 },
});

// El MIME declarado por el navegador es solo una primera criba: el servicio de
// imágenes vuelve a validar el tipo real por contenido con sharp.
const subidaImagenes = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.subidas.tamanoMaximoBytes,
    files: 10,
    fieldSize: 2048,
    fields: 30,
  },
  fileFilter(req, archivo, cb) {
    const permitidos = ["image/jpeg", "image/png", "image/webp"];
    if (!permitidos.includes(archivo.mimetype)) {
      return cb(
        new ErrorHttp(400, "Solo se aceptan imágenes JPG, PNG o WEBP.", {
          codigo: "formato_imagen_invalido",
        }),
      );
    }
    return cb(null, true);
  },
});

module.exports = { subida, subidaCsv, subidaImagenes };

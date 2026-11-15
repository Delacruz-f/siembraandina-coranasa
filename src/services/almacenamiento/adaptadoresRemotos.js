// Esqueletos de los adaptadores remotos (S3 y Cloudinary).
// Implementan el mismo contrato que adaptadorLocal.js. Se activan cambiando
// STORAGE_DRIVER, pero hasta que se instale el SDK correspondiente responden
// con un error claro en lugar de fallar de forma confusa.
//
// Contrato: ver src/services/almacenamiento/almacenamiento.js
function crearEsqueleto(nombre, pista) {
  const sinImplementar = () => {
    throw new Error(
      `El adaptador de almacenamiento "${nombre}" aún no está implementado. ${pista}`,
    );
  };
  return {
    nombre,
    guardar: sinImplementar,
    leer: sinImplementar,
    existe: sinImplementar,
    eliminar: sinImplementar,
    listar: sinImplementar,
    // Con S3/Cloudinary las imágenes se sirven por su CDN público; las
    // privadas se resuelven igualmente por las rutas controladas de Express.
    urlPublica: () => null,
  };
}

function crearAdaptadorS3(config = {}) {
  const esqueleto = crearEsqueleto(
    "s3",
    "Instala @aws-sdk/client-s3 e implementa subir/leer/borrar/listar sobre el bucket configurado.",
  );
  return { ...esqueleto, bucket: config.bucket || null };
}

function crearAdaptadorCloudinary(config = {}) {
  const esqueleto = crearEsqueleto(
    "cloudinary",
    "Instala cloudinary e implementa upload/destroy/list sobre la nube configurada.",
  );
  return { ...esqueleto, nube: config.nube || null };
}

module.exports = { crearAdaptadorS3, crearAdaptadorCloudinary };

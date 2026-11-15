// Adaptador local: guarda los binarios en disco, fuera de public/.
// Las claves son rutas relativas POSIX (p. ej. "publicas/abc/1600.webp").
// Toda clave se normaliza y se comprueba que no escape de la carpeta base.
const fs = require("fs/promises");
const path = require("path");

const RAIZ = path.join(__dirname, "..", "..", "..");

function crearAdaptador({ directorio }) {
  const base = path.resolve(RAIZ, directorio);

  /** Convierte una clave en ruta absoluta, rechazando cualquier escape. */
  function rutaAbsoluta(clave) {
    if (typeof clave !== "string" || !clave || clave.includes("\0")) {
      throw new Error("Clave de almacenamiento inválida.");
    }
    if (path.isAbsolute(clave) || clave.split(/[\\/]/).includes("..")) {
      throw new Error(
        "La clave de almacenamiento no puede salir de la carpeta base.",
      );
    }
    const destino = path.resolve(base, clave);
    const relativa = path.relative(base, destino);
    if (relativa.startsWith("..") || path.isAbsolute(relativa)) {
      throw new Error(
        "La clave de almacenamiento no puede salir de la carpeta base.",
      );
    }
    return destino;
  }

  async function guardar(clave, buffer) {
    const destino = rutaAbsoluta(clave);
    await fs.mkdir(path.dirname(destino), { recursive: true });
    // Escritura atómica: el archivo aparece completo o no aparece.
    const temporal = `${destino}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temporal, buffer);
    await fs.rename(temporal, destino);
    return { clave, tamano: buffer.length };
  }

  function leer(clave) {
    return fs.readFile(rutaAbsoluta(clave));
  }

  async function existe(clave) {
    try {
      await fs.access(rutaAbsoluta(clave));
      return true;
    } catch (error) {
      if (error.code === "ENOENT") return false;
      throw error;
    }
  }

  async function eliminar(clave) {
    try {
      await fs.unlink(rutaAbsoluta(clave));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  /** Recorre un prefijo y devuelve los archivos con su tamaño y fecha. */
  async function listar(prefijo = "") {
    const raiz = rutaAbsoluta(prefijo || ".");
    const encontrados = [];
    async function recorrer(carpeta) {
      let entradas;
      try {
        entradas = await fs.readdir(carpeta, { withFileTypes: true });
      } catch (error) {
        if (error.code === "ENOENT") return;
        throw error;
      }
      for (const entrada of entradas) {
        const completa = path.join(carpeta, entrada.name);
        if (entrada.isDirectory()) {
          await recorrer(completa);
          continue;
        }
        if (!entrada.isFile() || entrada.name.endsWith(".tmp")) continue;
        const info = await fs.stat(completa);
        encontrados.push({
          clave: path.relative(base, completa).split(path.sep).join("/"),
          tamano: info.size,
          modificadoEn: info.mtime,
        });
      }
    }
    await recorrer(raiz);
    return encontrados;
  }

  // Los archivos no se exponen por URL: se sirven con rutas controladas.
  function urlPublica() {
    return null;
  }

  return {
    nombre: "local",
    guardar,
    leer,
    existe,
    eliminar,
    listar,
    urlPublica,
  };
}

module.exports = { crearAdaptador };

function rutaSegura(url) {
  return String(url).replace(
    /(\/(?:restablecer|verificar-correo)\/)[a-f0-9]{64}(?=[/?#]|$)/gi,
    "$1[oculto]",
  );
}

module.exports = { rutaSegura };

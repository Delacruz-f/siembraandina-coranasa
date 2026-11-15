(function () {
  const formulario = document.getElementById("form-importar-csv");
  const estado = document.getElementById("estado-importacion");
  if (!formulario || !estado) return;

  formulario.addEventListener("submit", async function (evento) {
    evento.preventDefault();
    const archivo = formulario.querySelector('[name="archivo"]').files[0];
    if (!archivo) {
      estado.textContent = "Selecciona un archivo CSV antes de continuar.";
      return;
    }
    const boton = formulario.querySelector('[type="submit"]');
    boton.disabled = true;
    estado.textContent = "Revisando el archivo...";
    try {
      const datos = new FormData(formulario);
      const token = datos.get("_csrf");
      const respuesta = await fetch(formulario.action, {
        method: "POST",
        body: datos,
        headers: {
          Accept: "application/json",
          "x-csrf-token": String(token),
        },
      });
      const resultado = await respuesta.json();
      if (!respuesta.ok || !resultado.ok) {
        throw new Error(
          resultado.error && resultado.error.mensaje
            ? resultado.error.mensaje
            : "No se pudo revisar el CSV. Comprueba el archivo e inténtalo otra vez.",
        );
      }
      window.location.assign(resultado.url);
    } catch (error) {
      estado.textContent = error.message;
      boton.disabled = false;
    }
  });
})();

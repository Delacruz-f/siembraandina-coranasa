(function () {
  const formulario = document.getElementById("form-foto-perfil");
  const estado = document.getElementById("estado-foto-perfil");
  if (!formulario || !estado) return;

  formulario.addEventListener("submit", async function (evento) {
    evento.preventDefault();
    const boton = formulario.querySelector('[type="submit"]');
    const archivo = formulario.querySelector('[name="foto"]').files[0];
    if (!archivo) {
      estado.textContent = "Selecciona una imagen antes de continuar.";
      return;
    }
    boton.disabled = true;
    estado.textContent = "Guardando la foto...";
    try {
      const datos = new FormData(formulario);
      const respuesta = await fetch(formulario.action, {
        method: "POST",
        body: datos,
        headers: {
          Accept: "application/json",
          "x-csrf-token": String(datos.get("_csrf")),
        },
      });
      if (!respuesta.ok) {
        const resultado = await respuesta.json();
        throw new Error(
          resultado.error && resultado.error.mensaje
            ? resultado.error.mensaje
            : "No se pudo guardar la foto. Inténtalo otra vez.",
        );
      }
      window.location.assign(respuesta.url);
    } catch (error) {
      estado.textContent = error.message;
      boton.disabled = false;
    }
  });
})();

document.addEventListener("DOMContentLoaded", () => {
  const editor = document.querySelector("#contenido_editor");
  const campoContenido = document.querySelector("#contenido");
  document.querySelectorAll("[data-formato]").forEach((boton) => {
    boton.addEventListener("click", () => {
      if (!editor) return;
      editor.focus();
      const formato = boton.dataset.formato;
      const valor = boton.dataset.valor;
      document.execCommand(formato, false, valor ? `<${valor}>` : undefined);
    });
  });
  const formularioArticulo = editor && editor.closest("form");
  if (formularioArticulo && campoContenido) {
    formularioArticulo.addEventListener("submit", () => {
      campoContenido.value = editor.innerHTML;
    });
  }

  const estado = document.querySelector("[data-estado-publicacion]");
  const campoProgramacion = document.querySelector("[data-fecha-programada]");
  const sincronizarFecha = () => {
    if (!estado || !campoProgramacion) return;
    const mostrar = estado.value === "programada";
    campoProgramacion.hidden = !mostrar;
    campoProgramacion.querySelector("input").required = mostrar;
  };
  if (estado) {
    estado.addEventListener("change", sincronizarFecha);
    sincronizarFecha();
  }

  const formulario = document.querySelector("[data-editor-upload]");
  if (formulario) formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const estadoCarga = formulario.querySelector("[data-editor-upload-status]");
    const token = formulario.querySelector('input[name="_csrf"]').value;
    estadoCarga.textContent = "Subiendo y procesando imagen…";
    try {
      const respuesta = await fetch(formulario.action, {
        method: "POST",
        body: new FormData(formulario),
        headers: { "x-csrf-token": token, Accept: "text/html" },
        credentials: "same-origin",
        redirect: "follow",
      });
      if (!respuesta.ok) throw new Error("No se pudo guardar la imagen.");
      window.location.assign(respuesta.url);
    } catch (error) {
      estadoCarga.textContent = error.message;
    }
  });

  const entradaImagen = document.querySelector("#imagen");
  const vistaRecorte = document.querySelector("[data-vista-recorte]");
  const imagenRecorte = document.querySelector("[data-imagen-recorte]");
  const formatoRecorte = document.querySelector("[data-formato-recorte]");
  const posicionX = document.querySelector("[data-recorte-x]");
  const posicionY = document.querySelector("[data-recorte-y]");
  let urlPrevia;
  const actualizarRecorte = () => {
    if (!imagenRecorte || !formatoRecorte || !vistaRecorte) return;
    const formato = formatoRecorte.value;
    const proporciones = {
      original: imagenRecorte.naturalWidth && imagenRecorte.naturalHeight
        ? `${imagenRecorte.naturalWidth} / ${imagenRecorte.naturalHeight}`
        : "auto",
      cuadrado: "1 / 1",
      horizontal: "16 / 9",
      vertical: "4 / 5",
    };
    vistaRecorte.style.aspectRatio = proporciones[formato];
    imagenRecorte.style.objectFit = formato === "original" ? "contain" : "cover";
    imagenRecorte.style.objectPosition =
      `${posicionX ? posicionX.value : 50}% ${posicionY ? posicionY.value : 50}%`;
  };
  if (entradaImagen && imagenRecorte && vistaRecorte) {
    entradaImagen.addEventListener("change", () => {
      if (urlPrevia) URL.revokeObjectURL(urlPrevia);
      const archivo = entradaImagen.files && entradaImagen.files[0];
      if (!archivo) {
        vistaRecorte.hidden = true;
        imagenRecorte.removeAttribute("src");
        return;
      }
      urlPrevia = URL.createObjectURL(archivo);
      imagenRecorte.src = urlPrevia;
      imagenRecorte.hidden = false;
      vistaRecorte.hidden = false;
      imagenRecorte.onload = actualizarRecorte;
      actualizarRecorte();
    });
    [formatoRecorte, posicionX, posicionY].forEach((control) => {
      if (control) control.addEventListener("input", actualizarRecorte);
    });
  }
});

(function () {
  const formulario = document.getElementById("form-imagenes-parcela");
  const entrada = document.getElementById("imagenes-parcela");
  const zona = document.getElementById("zona-arrastre");
  const previa = document.getElementById("vista-previa-imagenes");
  const estado = document.getElementById("estado-imagenes");
  if (!formulario || !entrada || !zona || !previa || !estado) return;

  function mostrarArchivos(archivos) {
    previa.replaceChildren();
    const lista = Array.from(archivos);
    if (lista.length > 5) {
      estado.textContent = "Puedes subir como máximo 5 imágenes por envío.";
      return;
    }
    estado.textContent = lista.length
      ? "Escribe un texto alternativo claro para cada imagen."
      : "";
    lista.forEach((archivo) => {
      const tarjeta = document.createElement("div");
      const imagen = document.createElement("img");
      const etiqueta = document.createElement("label");
      const texto = document.createElement("input");
      imagen.src = URL.createObjectURL(archivo);
      imagen.alt = `Vista previa de ${archivo.name}`;
      imagen.loading = "lazy";
      etiqueta.textContent = `Texto alternativo para ${archivo.name}`;
      texto.name = "textos_alternativos";
      texto.required = true;
      texto.maxLength = 255;
      texto.placeholder = "Describe lo que se ve en la foto";
      etiqueta.appendChild(texto);
      tarjeta.append(imagen, etiqueta);
      previa.appendChild(tarjeta);
      if (archivo.size > 10 * 1024 * 1024) {
        estado.textContent = `${archivo.name} supera el límite de 10 MB.`;
      } else if (!["image/jpeg", "image/png", "image/webp"].includes(archivo.type)) {
        estado.textContent = `${archivo.name} no es JPG, PNG o WEBP.`;
      }
    });
  }

  entrada.addEventListener("change", () => mostrarArchivos(entrada.files));
  ["dragenter", "dragover"].forEach((evento) =>
    zona.addEventListener(evento, (e) => {
      e.preventDefault();
      zona.dataset.arrastrando = "true";
    }),
  );
  ["dragleave", "drop"].forEach((evento) =>
    zona.addEventListener(evento, (e) => {
      e.preventDefault();
      delete zona.dataset.arrastrando;
    }),
  );
  zona.addEventListener("drop", (evento) => {
    const transferencia = new DataTransfer();
    Array.from(evento.dataTransfer.files).forEach((archivo) =>
      transferencia.items.add(archivo),
    );
    entrada.files = transferencia.files;
    mostrarArchivos(entrada.files);
  });

  formulario.addEventListener("submit", async function (evento) {
    evento.preventDefault();
    const boton = formulario.querySelector('[type="submit"]');
    const datos = new FormData(formulario);
    if (!entrada.files.length) {
      estado.textContent = "Selecciona al menos una imagen.";
      return;
    }
    boton.disabled = true;
    estado.textContent = "Guardando imágenes...";
    try {
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
            : "No se pudieron guardar las imágenes.",
        );
      }
      window.location.assign(respuesta.url);
    } catch (error) {
      estado.textContent = error.message;
      boton.disabled = false;
    }
  });
})();

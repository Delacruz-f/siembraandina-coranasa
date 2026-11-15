(function () {
  const departamento = document.getElementById("consulta-departamento");
  const provincia = document.getElementById("consulta-provincia");
  const distrito = document.getElementById("consulta-distrito");

  function filtrarProvincias() {
    if (!departamento || !provincia) return;
    Array.from(provincia.options).forEach((opcion) => {
      if (!opcion.value) return;
      opcion.hidden = opcion.dataset.departamentoId !== departamento.value;
    });
    provincia.value = "";
    if (distrito) distrito.replaceChildren(new Option("Elige un distrito", ""));
  }

  async function cargarDistritos() {
    if (!provincia || !distrito) return;
    distrito.replaceChildren(new Option("Cargando distritos…", ""));
    if (!provincia.value) {
      distrito.replaceChildren(new Option("Elige un distrito", ""));
      return;
    }
    const parametros = new URLSearchParams({ provincia_id: provincia.value });
    const respuesta = await fetch(`/api/publico/distritos?${parametros}`, {
      headers: { Accept: "application/json" },
    });
    if (!respuesta.ok) throw new Error("No se pudieron cargar los distritos.");
    const datos = await respuesta.json();
    distrito.replaceChildren(new Option("Elige un distrito", ""));
    datos.distritos.forEach((fila) => {
      distrito.add(new Option(fila.nombre, String(fila.id)));
    });
  }

  if (departamento) departamento.addEventListener("change", filtrarProvincias);
  if (provincia) {
    provincia.addEventListener("change", () => {
      cargarDistritos().catch(() => {
        distrito.replaceChildren(new Option("Error al cargar; vuelve a elegir provincia", ""));
      });
    });
  }

  const selectorFotos = document.getElementById("fotos-consulta");
  const alternativos = document.getElementById("alternativos-consulta");
  if (selectorFotos && alternativos) {
    selectorFotos.addEventListener("change", () => {
      alternativos.replaceChildren();
      const archivos = Array.from(selectorFotos.files || []);
      if (archivos.length > 3) {
        selectorFotos.value = "";
        alternativos.textContent = "Selecciona como máximo 3 fotos.";
        return;
      }
      archivos.forEach((archivo, indice) => {
        const etiqueta = document.createElement("label");
        etiqueta.textContent = `Texto alternativo para ${archivo.name}`;
        const campo = document.createElement("input");
        campo.name = "textos_alternativos";
        campo.required = true;
        campo.maxLength = 255;
        campo.setAttribute("aria-label", `Descripción de la foto ${indice + 1}`);
        etiqueta.append(campo);
        alternativos.append(etiqueta);
      });
    });
  }

  const formularioConsulta = document.getElementById("form-consulta");
  if (formularioConsulta) {
    formularioConsulta.addEventListener("submit", async (evento) => {
      evento.preventDefault();
      const estado = document.getElementById("estado-consulta");
      const boton = formularioConsulta.querySelector('[type="submit"]');
      const csrf = formularioConsulta.querySelector('[name="_csrf"]').value;
      boton.disabled = true;
      estado.textContent = "Enviando la consulta…";
      try {
        const respuesta = await fetch(formularioConsulta.action, {
          method: "POST",
          body: new FormData(formularioConsulta),
          headers: { "x-csrf-token": csrf },
          credentials: "same-origin",
        });
        if (respuesta.redirected) {
          window.location.assign(respuesta.url);
          return;
        }
        if (!respuesta.ok) {
          throw new Error("Revisa los datos y las fotos; no se pudo enviar la consulta.");
        }
        window.location.assign(respuesta.url);
      } catch (error) {
        estado.textContent = error.message || "No se pudo enviar la consulta. Inténtalo otra vez.";
        console.error("Consulta:", error);
        boton.disabled = false;
      }
    });
  }
})();

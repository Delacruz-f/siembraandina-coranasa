(() => {
  const formularios = document.querySelectorAll("[data-ubicacion]");

  for (const formulario of formularios) {
    const departamento = formulario.querySelector('[name="departamento"]');
    const provincia = formulario.querySelector('[name="provincia"]');
    const distrito = formulario.querySelector('[name="distrito"]');
    const estado = formulario.querySelector("[data-ubicacion-error]");
    if (!departamento || !provincia) continue;

    const mostrarError = (mensaje) => {
      if (!estado) return;
      estado.textContent = mensaje;
      estado.hidden = false;
    };

    const limpiarError = () => {
      if (!estado) return;
      estado.textContent = "";
      estado.hidden = true;
    };

    const cargarOpciones = async (url, selector, etiquetaInicial, clavePadre) => {
      const seleccionAnterior = selector.value;
      selector.disabled = true;
      selector.setAttribute("aria-busy", "true");
      try {
        const respuesta = await fetch(url, {
          headers: { Accept: "application/json" },
          credentials: "same-origin",
        });
        if (!respuesta.ok) throw new Error("No se pudieron cargar las ubicaciones.");
        const datos = await respuesta.json();
        const filas = datos[clavePadre];
        if (!Array.isArray(filas)) throw new Error("La respuesta de ubicaciones no es válida.");
        selector.replaceChildren(new Option(etiquetaInicial, ""));
        for (const fila of filas) {
          selector.add(new Option(fila.nombre, String(fila.id)));
        }
        if (filas.some((fila) => String(fila.id) === seleccionAnterior)) {
          selector.value = seleccionAnterior;
        }
        limpiarError();
        return true;
      } catch (error) {
        mostrarError(error.message);
        selector.replaceChildren(new Option(etiquetaInicial, ""));
        return false;
      } finally {
        selector.disabled = false;
        selector.removeAttribute("aria-busy");
      }
    };

    departamento.addEventListener("change", async () => {
      if (distrito) distrito.replaceChildren(new Option("Solo provincia", ""));
      if (!departamento.value) {
        provincia.replaceChildren(new Option("Elige una provincia", ""));
        return;
      }
      await cargarOpciones(
        `/api/publico/provincias?departamento_id=${encodeURIComponent(departamento.value)}`,
        provincia,
        "Elige una provincia",
        "provincias",
      );
    });

    if (distrito) {
      provincia.addEventListener("change", async () => {
        if (!provincia.value) {
          distrito.replaceChildren(new Option("Solo provincia", ""));
          return;
        }
        await cargarOpciones(
          `/api/publico/distritos?provincia_id=${encodeURIComponent(provincia.value)}`,
          distrito,
          "Solo provincia",
          "distritos",
        );
      });
    }
  }
})();

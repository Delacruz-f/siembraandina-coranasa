(function () {
  const cultivo = document.getElementById("campania-cultivo");
  const variedad = document.getElementById("campania-variedad");
  if (!cultivo || !variedad) return;

  function opcion(valor, texto) {
    const elemento = document.createElement("option");
    elemento.value = valor;
    elemento.textContent = texto;
    return elemento;
  }

  cultivo.addEventListener("change", async function () {
    variedad.replaceChildren(opcion("", "Cargando variedades..."));
    try {
      const respuesta = await fetch(
        `/panel/cultivos/${encodeURIComponent(cultivo.value)}/variedades`,
        { headers: { Accept: "application/json" } },
      );
      if (!respuesta.ok) throw new Error("No se pudieron cargar variedades.");
      const datos = await respuesta.json();
      variedad.replaceChildren(opcion("", "Sin variedad definida"));
      datos.variedades.forEach((fila) => {
        variedad.appendChild(opcion(String(fila.id), fila.nombre));
      });
    } catch {
      variedad.replaceChildren(opcion("", "No se pudieron cargar variedades"));
    }
  });
})();

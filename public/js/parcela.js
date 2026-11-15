// Búsqueda de técnicos para conceder acceso a una parcela.
// Se usa textContent (nunca innerHTML) para evitar inyección de HTML.
(function () {
  const entrada = document.getElementById("buscar-tecnico");
  const select = document.getElementById("select-tecnico");
  if (!entrada || !select) return;

  let temporizador = null;

  function limpiar() {
    while (select.firstChild) select.removeChild(select.firstChild);
  }

  function opcion(valor, texto) {
    const el = document.createElement("option");
    el.value = valor;
    el.textContent = texto;
    return el;
  }

  async function buscar() {
    const texto = entrada.value.trim();
    limpiar();
    if (texto.length < 2) {
      select.appendChild(opcion("", "Escribe al menos 2 letras para buscar"));
      return;
    }
    select.appendChild(opcion("", "Buscando..."));
    try {
      const respuesta = await fetch(
        "/tecnicos/buscar?q=" + encodeURIComponent(texto),
        {
          headers: { Accept: "application/json" },
        },
      );
      const datos = await respuesta.json();
      limpiar();
      if (!datos.tecnicos || !datos.tecnicos.length) {
        select.appendChild(opcion("", "No se encontraron técnicos"));
        return;
      }
      select.appendChild(opcion("", "Elige un técnico"));
      datos.tecnicos.forEach(function (t) {
        select.appendChild(opcion(String(t.id), t.nombre + " — " + t.email));
      });
    } catch {
      limpiar();
      select.appendChild(opcion("", "No se pudo buscar. Inténtalo de nuevo."));
    }
  }

  entrada.addEventListener("input", function () {
    clearTimeout(temporizador);
    temporizador = setTimeout(buscar, 300);
  });
})();

(function () {
  const contador = document.querySelectorAll("[data-notificaciones-count]");
  const contadorTexto = document.querySelector("[data-notificaciones-count-text]");
  const lista = document.getElementById("lista-notificaciones");
  const token = document.querySelector('meta[name="csrf-token"]')?.content;

  function actualizarContador(cantidad) {
    contador.forEach((elemento) => {
      elemento.textContent = String(cantidad);
      elemento.hidden = cantidad <= 0;
      elemento.setAttribute("aria-label", `${cantidad} notificaciones sin leer`);
    });
    if (contadorTexto) contadorTexto.textContent = String(cantidad);
  }

  function agregarFila(fila) {
    if (!lista || lista.querySelector(`[data-notificacion-id="${fila.id}"]`)) return;
    const vacio = lista.querySelector("[data-notificaciones-vacio]");
    if (vacio) vacio.remove();

    const elemento = document.createElement("li");
    elemento.className = "tarjeta";
    elemento.dataset.notificacionId = String(fila.id);
    const parrafo = document.createElement("p");
    const enlace = document.createElement("a");
    enlace.href = fila.enlace;
    enlace.textContent = fila.mensaje;
    parrafo.append(enlace);
    elemento.append(parrafo);

    const formulario = document.createElement("form");
    formulario.method = "post";
    formulario.action = `/notificaciones/${encodeURIComponent(fila.id)}/leida`;
    formulario.className = "en-linea";
    const campo = document.createElement("input");
    campo.type = "hidden";
    campo.name = "_csrf";
    campo.value = token || "";
    const boton = document.createElement("button");
    boton.className = "enlace";
    boton.type = "submit";
    boton.textContent = "Marcar como leída";
    formulario.append(campo, boton);
    elemento.append(formulario);
    lista.prepend(elemento);
  }

  fetch("/api/notificaciones/no-leidas", {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  })
    .then((respuesta) => {
      if (!respuesta.ok) throw new Error("No se pudo consultar el contador.");
      return respuesta.json();
    })
    .then((datos) => actualizarContador(datos.noLeidas))
    .catch((error) => console.error("Notificaciones:", error));

  if ("EventSource" in window) {
    const eventos = new EventSource("/notificaciones/eventos");
    eventos.addEventListener("notificacion", (evento) => {
      const fila = JSON.parse(evento.data);
      agregarFila(fila);
    });
    eventos.addEventListener("contador", (evento) => {
      const datos = JSON.parse(evento.data);
      actualizarContador(datos.noLeidas);
    });
    eventos.addEventListener("error", () => {
      console.warn("La conexión en vivo de notificaciones se interrumpió; se reintentará.");
    });
  }
})();

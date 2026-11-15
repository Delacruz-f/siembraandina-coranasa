// Página sin conexión: muestra el último calendario consultado.
// public/js/pwa.js guarda un resumen en localStorage cuando hay conexión; aquí
// solo se dibuja, sin estilos en línea (la CSP no los permite).
(function () {
  const CLAVE = "siembra.ultimoCalendario";
  const contenedor = document.querySelector("[data-ultimo-calendario]");
  const plantilla = document.getElementById("plantilla-calendario");
  if (!contenedor || !plantilla) return;

  const boton = document.querySelector("[data-reintentar]");
  if (boton) boton.addEventListener("click", () => window.location.reload());

  let guardado = null;
  try {
    guardado = JSON.parse(localStorage.getItem(CLAVE) || "null");
  } catch {
    guardado = null;
  }
  if (!guardado || !Array.isArray(guardado.recomendaciones)) return;

  const nodo = plantilla.content.cloneNode(true);
  const fecha = nodo.querySelector("[data-calendario-fecha]");
  const lista = nodo.querySelector("[data-calendario-lista]");
  const enlace = nodo.querySelector("[data-calendario-enlace]");

  if (fecha)
    fecha.textContent =
      `${guardado.cultivo || ""} · ${guardado.fecha || ""}`.trim();
  if (enlace && guardado.url) enlace.href = guardado.url;

  if (lista) {
    for (const item of guardado.recomendaciones.slice(0, 12)) {
      const li = document.createElement("li");
      li.className = "tarjeta";
      const zona = document.createElement("p");
      zona.className = "etiqueta";
      zona.textContent = item.zona || "";
      const titulo = document.createElement("strong");
      titulo.textContent = item.titulo || "";
      li.append(zona, titulo);
      lista.appendChild(li);
    }
  }

  contenedor.replaceChildren(nodo);
})();

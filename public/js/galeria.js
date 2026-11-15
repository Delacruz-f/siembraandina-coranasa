// Lightbox accesible para las galerías de imágenes.
// - Se abre con clic o con Enter/Espacio sobre el botón de la miniatura.
// - Escape cierra; flechas izquierda/derecha cambian de imagen.
// - El foco queda atrapado dentro del diálogo y vuelve al botón de origen.
// También reserva la proporción de cada imagen (data-proporcion) sin usar
// estilos en línea, para mantener una CSP estricta.
(function () {
  // Proporción reservada: se aplica como variable CSS, no como atributo style.
  document.querySelectorAll("[data-proporcion]").forEach((figura) => {
    const proporcion = figura.dataset.proporcion;
    if (/^\d+ \/ \d+$/.test(proporcion)) {
      figura.style.setProperty("--proporcion-imagen", proporcion);
    }
  });

  const galerias = document.querySelectorAll("[data-lightbox-item]");
  if (!galerias.length) return;

  const dialogo = document.querySelector("[data-lightbox]");
  if (!dialogo) return;

  const imagen = dialogo.querySelector("[data-lightbox-imagen]");
  const pie = dialogo.querySelector("[data-lightbox-pie]");
  const contador = dialogo.querySelector("[data-lightbox-contador]");
  const botonCerrar = dialogo.querySelector("[data-lightbox-cerrar]");
  const botonAnterior = dialogo.querySelector("[data-lightbox-anterior]");
  const botonSiguiente = dialogo.querySelector("[data-lightbox-siguiente]");
  const elementos = Array.from(galerias);
  let indiceActual = 0;
  let origen = null;

  const enfocables = () =>
    Array.from(
      dialogo.querySelectorAll(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((elemento) => !elemento.hidden);

  function mostrar(indice) {
    indiceActual = (indice + elementos.length) % elementos.length;
    const boton = elementos[indiceActual];
    imagen.src = boton.dataset.src || "";
    imagen.alt = boton.dataset.alt || "";
    pie.textContent = boton.dataset.alt || "";
    contador.textContent = `${indiceActual + 1} de ${elementos.length}`;
    const unica = elementos.length < 2;
    botonAnterior.hidden = unica;
    botonSiguiente.hidden = unica;
  }

  function abrir(indice, boton) {
    origen = boton;
    mostrar(indice);
    dialogo.hidden = false;
    document.body.classList.add("sin-desplazamiento");
    botonCerrar.focus();
  }

  function cerrar() {
    dialogo.hidden = true;
    document.body.classList.remove("sin-desplazamiento");
    imagen.removeAttribute("src");
    if (origen) origen.focus();
  }

  elementos.forEach((boton, indice) => {
    boton.addEventListener("click", () => abrir(indice, boton));
  });

  botonCerrar.addEventListener("click", cerrar);
  botonAnterior.addEventListener("click", () => mostrar(indiceActual - 1));
  botonSiguiente.addEventListener("click", () => mostrar(indiceActual + 1));

  // Clic en el fondo (fuera del contenido) cierra el visor.
  dialogo.addEventListener("click", (evento) => {
    if (evento.target === dialogo) cerrar();
  });

  dialogo.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") {
      evento.preventDefault();
      cerrar();
      return;
    }
    if (evento.key === "ArrowLeft") {
      evento.preventDefault();
      mostrar(indiceActual - 1);
      return;
    }
    if (evento.key === "ArrowRight") {
      evento.preventDefault();
      mostrar(indiceActual + 1);
      return;
    }
    if (evento.key !== "Tab") return;
    // Foco atrapado: Tab y Shift+Tab circulan dentro del diálogo.
    const lista = enfocables();
    if (!lista.length) return;
    const primero = lista[0];
    const ultimo = lista[lista.length - 1];
    if (evento.shiftKey && document.activeElement === primero) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault();
      primero.focus();
    }
  });
})();

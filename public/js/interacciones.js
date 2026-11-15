// Interacciones accesibles y sin dependencias para los layouts compartidos.
(() => {
  const raiz = document.documentElement;
  const botonesTema = document.querySelectorAll('[data-accion="tema"]');

  function actualizarBotonesTema(tema) {
    botonesTema.forEach((boton) => {
      boton.setAttribute("aria-pressed", String(tema === "oscuro"));
      boton.setAttribute(
        "aria-label",
        tema === "oscuro" ? "Cambiar a tema claro" : "Cambiar a tema oscuro",
      );
    });
  }

  function aplicarTema(tema, guardar) {
    raiz.dataset.tema = tema;
    actualizarBotonesTema(tema);

    if (!guardar) return;
    try {
      localStorage.setItem("siembra-tema", tema);
    } catch (error) {
      console.error("No se pudo guardar la preferencia de tema.", error);
    }
  }

  const temaSistema = window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "oscuro"
    : "claro";
  let temaInicial = temaSistema;
  try {
    const temaGuardado = localStorage.getItem("siembra-tema");
    if (temaGuardado === "claro" || temaGuardado === "oscuro") {
      temaInicial = temaGuardado;
      aplicarTema(temaInicial, false);
    } else {
      actualizarBotonesTema(temaInicial);
    }
  } catch (error) {
    actualizarBotonesTema(temaInicial);
    console.error("No se pudo leer la preferencia de tema.", error);
  }

  botonesTema.forEach((boton) => {
    boton.addEventListener("click", () => {
      const actual =
        raiz.dataset.tema ||
        (window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "oscuro"
          : "claro");
      aplicarTema(actual === "oscuro" ? "claro" : "oscuro", true);
    });
  });

  const escritorio = window.matchMedia("(min-width: 1024px)");

  function cambiarMenu(abierto) {
    const panel = document.querySelector(".app-panel");
    if (!panel) {
      console.error("No se encontró el contenedor del menú lateral.");
      return;
    }
    if (!abierto) {
      delete panel.dataset.menu;
      return;
    }
    panel.dataset.menu = "abierto";
    const enlace = panel.querySelector(".nav-panel a");
    if (enlace) enlace.focus({ preventScroll: true });
  }

  document
    .querySelectorAll('[data-accion="colapsar-menu"]')
    .forEach((boton) => {
      boton.addEventListener("click", () => {
        const panel = boton.closest(".app-panel");
        if (!panel) {
          console.error("No se encontró el contenedor del menú lateral.");
          return;
        }
        // En móvil el botón abre el menú deslizante; en escritorio contrae la barra.
        if (!escritorio.matches) {
          const abierto = panel.dataset.menu === "abierto";
          cambiarMenu(!abierto);
          boton.setAttribute("aria-expanded", String(!abierto));
          return;
        }
        const compacto = panel.dataset.sidebar !== "compacto";
        panel.dataset.sidebar = compacto ? "compacto" : "expandido";
        document
          .querySelectorAll('[data-accion="colapsar-menu"]')
          .forEach((otro) => {
            otro.setAttribute("aria-expanded", String(!compacto));
            otro.setAttribute(
              "aria-label",
              compacto ? "Expandir menú" : "Contraer menú",
            );
          });
      });
    });

  document.querySelectorAll('[data-accion="cerrar-menu"]').forEach((boton) => {
    boton.addEventListener("click", () => {
      cambiarMenu(false);
      const abridor = document.querySelector(
        '.barra-superior [data-accion="colapsar-menu"]',
      );
      if (abridor) {
        abridor.setAttribute("aria-expanded", "false");
        abridor.focus({ preventScroll: true });
      }
    });
  });

  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") cambiarMenu(false);
  });

  document.querySelectorAll(".nav-panel a").forEach((enlace) => {
    enlace.addEventListener("click", () => cambiarMenu(false));
  });

  escritorio.addEventListener("change", () => cambiarMenu(false));

  document
    .querySelectorAll("[data-dialogo-abrir]")
    .forEach((boton) => {
      boton.addEventListener("click", () => {
        const dialogo = document.getElementById(
          boton.getAttribute("data-dialogo-abrir"),
        );
        if (!dialogo || typeof dialogo.showModal !== "function") {
          console.error("No se pudo abrir el diálogo solicitado.");
          return;
        }
        dialogo.showModal();
      });
    });

  document
    .querySelectorAll("[data-dialogo-cerrar]")
    .forEach((boton) => {
      boton.addEventListener("click", () => boton.closest("dialog")?.close());
    });

  document.querySelectorAll('[role="tablist"]').forEach((lista) => {
    const pestanas = Array.from(lista.querySelectorAll('[role="tab"]'));
    pestanas.forEach((pestana, indice) => {
      pestana.addEventListener("click", () => activarPestana(pestanas, pestana));
      pestana.addEventListener("keydown", (evento) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(evento.key)) {
          return;
        }
        evento.preventDefault();
        let nuevoIndice = indice;
        if (evento.key === "ArrowRight") nuevoIndice = (indice + 1) % pestanas.length;
        if (evento.key === "ArrowLeft") {
          nuevoIndice = (indice - 1 + pestanas.length) % pestanas.length;
        }
        if (evento.key === "Home") nuevoIndice = 0;
        if (evento.key === "End") nuevoIndice = pestanas.length - 1;
        activarPestana(pestanas, pestanas[nuevoIndice]);
        pestanas[nuevoIndice].focus();
      });
    });
  });

  function activarPestana(pestanas, seleccionada) {
    pestanas.forEach((pestana) => {
      const activa = pestana === seleccionada;
      const panel = document.getElementById(
        pestana.getAttribute("aria-controls"),
      );
      pestana.setAttribute("aria-selected", String(activa));
      pestana.tabIndex = activa ? 0 : -1;
      if (panel) panel.hidden = !activa;
    });
  }
})();

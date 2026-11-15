(function () {
  if (!window.Chart) return;

  // Función para leer variables CSS del elemento raíz
  function leerColor(nombre) {
    return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
  }

  // Construir color rgba a partir de una variable CSS con alfa
  function construirRGBA(variableCSS, alfa) {
    const color = leerColor(variableCSS);
    // Si el color ya tiene alfa (rgba), extraerlo y combinar; si es hex, convertir
    const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (rgbaMatch) {
      const r = rgbaMatch[1];
      const g = rgbaMatch[2];
      const b = rgbaMatch[3];
      const existingAlpha = rgbaMatch[4] || 1;
      return `rgba(${r}, ${g}, ${b}, ${alfa * existingAlpha + (1 - alfa) * 0})`;
    }
    // Color hexadecimal a rgb
    const hexMatch = color.match(/^#?([a-fA-F0-9]{2})([a-fA-F0-9]{2})([a-fA-F0-9]{2})$/);
    if (hexMatch) {
      const r = parseInt(hexMatch[1], 16);
      const g = parseInt(hexMatch[2], 16);
      const b = parseInt(hexMatch[3], 16);
      return `rgba(${r}, ${g}, ${b}, ${alfa})`;
    }
    return `rgba(0, 0, 0, ${alfa})`;
  }

  function dibujar(id, clave, minimo, maximo, color, etiqueta, unidad) {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    const datos = JSON.parse(canvas.dataset.datos);
    const cantidad = datos.etiquetas.length;
    const colorTexto = leerColor("--texto-secundario");
    const colorLinea = leerColor("--linea");
    const colorBandaIdeal = construirRGBA("--acento-turquesa", 0.15);

    new window.Chart(canvas, {
      type: "line",
      data: {
        labels: datos.etiquetas,
        datasets: [
          {
            label: etiqueta,
            data: datos[clave],
            borderColor: color,
            backgroundColor: color,
            borderWidth: 2,
            pointRadius: 2,
            tension: 0.2,
          },
          {
            label: "Límite inferior",
            data: Array(cantidad).fill(datos[minimo]),
            borderColor: "transparent",
            pointRadius: 0,
            fill: false,
          },
          {
            label: "Límite superior",
            data: Array(cantidad).fill(datos[maximo]),
            borderColor: "transparent",
            pointRadius: 0,
            fill: "-1",
            backgroundColor: colorBandaIdeal,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: "index" },
        plugins: {
          legend: { labels: { color: colorTexto } },
          tooltip: {
            callbacks: {
              label: (contexto) =>
                `${contexto.dataset.label}: ${contexto.parsed.y} ${unidad}`,
            },
          },
        },
        scales: {
          x: {
            ticks: { color: colorTexto, maxTicksLimit: 7 },
            grid: { color: colorLinea },
          },
          y: {
            title: { display: true, text: unidad, color: colorTexto },
            ticks: { color: colorTexto },
            grid: { color: colorLinea },
          },
        },
      },
    });
  }

  // Observador de cambios de tema
  function iniciarObservadorTema() {
    const observer = new MutationObserver((mutations) => {
      // Verificar si hay cambios en el atributo data-tema o en botones de tema
      const botonTema = document.querySelector("[data-accion='tema']");
      if (botonTema) {
        // Actualizar gráficos existentes
        const graficos = document.querySelectorAll(".chart-container canvas");
        graficos.forEach((canvas) => {
          if (canvas.chart) {
            canvas.chart.update();
          }
        });
      }
    });

    // Observar cambios en el elemento html y en los botones de tema
    const html = document.documentElement;
    const temaBoton = document.querySelector("[data-accion='tema']");
    if (html) {
      observer.observe(html, { attributes: true, attributeFilter: ["data-tema"] });
    }
    if (temaBoton) {
      temaBoton.addEventListener("click", () => {
        const graficos = document.querySelectorAll(".chart-container canvas");
        graficos.forEach((canvas) => {
          if (canvas.chart) {
            canvas.chart.update();
          }
        });
      });
    }
  }

  // Reemplazar llamadas dibujar con la nueva función leerColor
  dibujar(
    "grafico-humedad",
    "humedad",
    "humMin",
    "humMax",
    leerColor("--acento-azul"),
    "Humedad medida",
    "%",
  );
  dibujar(
    "grafico-temperatura",
    "temperatura",
    "tempMin",
    "tempMax",
    leerColor("--acento-naranja"),
    "Temperatura medida",
    "°C",
  );

  iniciarObservadorTema();
})();
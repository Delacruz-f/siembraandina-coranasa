(() => {
  const root = document.getElementById("monitor-publico");
  if (!root) return;

  const mapaElemento = document.getElementById("monitor-mapa");
  const estado = document.getElementById("monitor-estado");
  const inputMeses = document.getElementById("monitor-meses");
  const salidaMeses = document.getElementById("monitor-meses-valor");
  const valores = {
    lugar: document.getElementById("monitor-lugar"),
    humedad: document.getElementById("monitor-humedad"),
    temperatura: document.getElementById("monitor-temperatura"),
    dias: document.getElementById("monitor-dias"),
    fuente: document.getElementById("monitor-fuente"),
    graficoEstado: document.getElementById("monitor-grafico-estado"),
    lista: document.getElementById("monitor-lista-valores"),
  };
  const texto = root.dataset;
  const nombresClase = {
    muy_seca: texto.claseMuySeca,
    seca: texto.claseSeca,
    adecuada: texto.claseAdecuada,
    humeda: texto.claseHumeda,
    saturada: texto.claseSaturada,
    sin_datos: texto.claseSinDatos,
  };
  const nombresFuente = {
    tecnico: texto.fuenteTecnico,
    nasa_power: texto.fuenteNasa,
    open_meteo_suelo: texto.fuentePronostico,
  };
  const clasesValidas = new Set([
    "muy-seca",
    "seca",
    "adecuada",
    "humeda",
    "saturada",
    "sin-datos",
  ]);
  let mapa;
  let grafico;
  let comunidadSeleccionada;

  function estadoTexto(elemento, mensaje) {
    elemento.textContent = mensaje || "";
  }

  function numero(valor, digitos = 1) {
    const cantidad = Number(valor);
    if (!Number.isFinite(cantidad)) return "—";
    return new Intl.NumberFormat(document.documentElement.lang || "es", {
      maximumFractionDigits: digitos,
    }).format(cantidad);
  }

  function esNumero(valor) {
    return (
      valor !== null &&
      valor !== undefined &&
      valor !== "" &&
      Number.isFinite(Number(valor))
    );
  }

  function fechaLegible(fecha) {
    if (!fecha) return "—";
    return new Intl.DateTimeFormat(document.documentElement.lang || "es", {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(`${String(fecha).slice(0, 10)}T00:00:00Z`));
  }

  function valorConUnidad(valor, unidad) {
    return esNumero(valor) ? `${numero(valor)} ${unidad}` : "—";
  }

  function nombreFuente(clave) {
    return nombresFuente[clave] || texto.claseSinDatos;
  }

  function crearMapa() {
    if (mapa) return true;
    if (!window.L) {
      estadoTexto(estado, texto.error);
      return false;
    }
    mapa = window.L.map(mapaElemento, { scrollWheelZoom: false });
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: texto.atribucionMapa,
    }).addTo(mapa);
    mapa.setView([-13.5, -71.9], 6);
    return true;
  }

  function colorDesdeToken(nombre) {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(nombre)
      .trim();
  }

  function limpiarGrafico() {
    if (grafico) {
      grafico.destroy();
      grafico = null;
    }
  }

  function dibujarGrafico(filas) {
    limpiarGrafico();
    valores.lista.replaceChildren();
    if (!filas.length) {
      estadoTexto(valores.graficoEstado, texto.sinDatos);
      return;
    }
    if (!window.Chart) {
      estadoTexto(valores.graficoEstado, texto.errorHistorial);
      return;
    }

    const colorTexto = colorDesdeToken("--pub-chart-text");
    const colorCuadricula = colorDesdeToken("--pub-chart-grid");
    const humedadColor = colorDesdeToken("--pub-accent");
    const temperaturaColor = colorDesdeToken("--pub-moisture-wet");
    const canvas = document.getElementById("monitor-grafico");
    grafico = new window.Chart(canvas, {
      type: "line",
      data: {
        labels: filas.map((fila) => fechaLegible(fila.fecha)),
        datasets: [
          {
            label: texto.serieHumedad,
            data: filas.map((fila) => fila.humedad),
            borderColor: humedadColor,
            backgroundColor: humedadColor,
            yAxisID: "y",
            spanGaps: true,
            tension: 0.25,
          },
          {
            label: texto.serieTemperatura,
            data: filas.map((fila) => fila.temperatura),
            borderColor: temperaturaColor,
            backgroundColor: temperaturaColor,
            yAxisID: "y1",
            spanGaps: true,
            tension: 0.25,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: "index" },
        plugins: {
          legend: { labels: { color: colorTexto } },
        },
        scales: {
          x: {
            ticks: { color: colorTexto, maxTicksLimit: 6 },
            grid: { color: colorCuadricula },
          },
          y: {
            min: 0,
            max: 100,
            title: {
              display: true,
              text: texto.serieHumedad,
              color: colorTexto,
            },
            ticks: { color: colorTexto },
            grid: { color: colorCuadricula },
          },
          y1: {
            position: "right",
            title: {
              display: true,
              text: texto.serieTemperatura,
              color: colorTexto,
            },
            ticks: { color: colorTexto },
            grid: { drawOnChartArea: false },
          },
        },
      },
    });

    for (const fila of filas) {
      const entrada = document.createElement("li");
      entrada.textContent = `${fechaLegible(fila.fecha)}: ${texto.serieHumedad} ${valorConUnidad(fila.humedad, "%")}; ${texto.serieTemperatura} ${valorConUnidad(fila.temperatura, "°C")}.`;
      valores.lista.append(entrada);
    }
    estadoTexto(valores.graficoEstado, "");
  }

  async function cargarHistorial(comunidad) {
    if (!comunidad) return;
    estadoTexto(valores.graficoEstado, texto.cargando);
    const meses = Number(inputMeses.value);
    salidaMeses.textContent =
      meses === 1 ? texto.unMes : texto.meses.replace("{meses}", meses);
    try {
      const respuesta = await fetch(
        `/api/publico/monitor/${encodeURIComponent(comunidad.id)}/lecturas?meses=${meses}`,
        { headers: { Accept: "application/json" } },
      );
      if (!respuesta.ok) throw new Error("historial");
      const contenido = await respuesta.json();
      dibujarGrafico(Array.isArray(contenido.datos) ? contenido.datos : []);
    } catch {
      estadoTexto(valores.graficoEstado, texto.errorHistorial);
      limpiarGrafico();
    }
  }

  function mostrarDetalle(comunidad) {
    comunidadSeleccionada = comunidad;
    valores.lugar.textContent = `${comunidad.nombre} · ${comunidad.distrito}, ${comunidad.provincia}`;
    valores.humedad.textContent = valorConUnidad(comunidad.humedad, "%");
    valores.temperatura.textContent = valorConUnidad(
      comunidad.temperatura,
      "°C",
    );
    valores.dias.textContent = esNumero(comunidad.dias_desde_lectura)
      ? texto.valorDias.replace("{dias}", comunidad.dias_desde_lectura)
      : "—";
    valores.fuente.textContent = nombreFuente(comunidad.fuente);
    inputMeses.disabled = false;
    cargarHistorial(comunidad);
  }

  function popupComunidad(comunidad) {
    const contenido = document.createElement("div");
    const nombre = document.createElement("strong");
    const ubicacion = document.createElement("p");
    const humedad = document.createElement("p");
    const fuente = document.createElement("p");
    nombre.textContent = comunidad.nombre;
    ubicacion.textContent = `${comunidad.distrito}, ${comunidad.provincia}, ${comunidad.departamento}`;
    humedad.textContent = `${texto.valorHumedad}: ${valorConUnidad(comunidad.humedad, "%")}`;
    fuente.textContent = `${texto.valorFuente}: ${nombreFuente(comunidad.fuente)} · ${fechaLegible(comunidad.fecha_lectura)}`;
    contenido.append(nombre, ubicacion, humedad, fuente);
    return contenido;
  }

  function agregarMarcadores(comunidades) {
    if (!crearMapa()) return;
    const limites = [];
    for (const comunidad of comunidades) {
      const latitud = Number(comunidad.latitud);
      const longitud = Number(comunidad.longitud);
      if (!Number.isFinite(latitud) || !Number.isFinite(longitud)) continue;
      const claseRecibida = String(
        comunidad.clase_humedad || "sin_datos",
      ).replaceAll("_", "-");
      const clase = clasesValidas.has(claseRecibida)
        ? claseRecibida
        : "sin-datos";
      const icono = window.L.divIcon({
        className: "monitor-publico__icono",
        html: `<span class="monitor-publico__marcador monitor-publico__marcador--${clase}" aria-hidden="true"></span>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });
      const marcador = window.L.marker([latitud, longitud], {
        title: `${comunidad.nombre}: ${nombresClase[comunidad.clase_humedad] || nombresClase.sin_datos}`,
        alt: comunidad.nombre,
        icon: icono,
        keyboard: true,
      }).addTo(mapa);
      marcador.bindPopup(popupComunidad(comunidad));
      marcador.on("click", () => mostrarDetalle(comunidad));
      limites.push([latitud, longitud]);
    }
    if (limites.length === 1) mapa.setView(limites[0], 10);
    else if (limites.length > 1)
      mapa.fitBounds(limites, { padding: [24, 24], maxZoom: 10 });
    if (!limites.length) estadoTexto(estado, texto.sinComunidades);
  }

  function actualizarResumen(comunidades) {
    const conDatos = comunidades.filter((comunidad) =>
      esNumero(comunidad.humedad),
    );
    const humedades = conDatos.map((comunidad) => Number(comunidad.humedad));
    const temperaturas = conDatos
      .map((comunidad) => comunidad.temperatura)
      .filter(esNumero)
      .map(Number);
    const promedio = (numeros) =>
      numeros.length
        ? numeros.reduce((suma, valor) => suma + valor, 0) / numeros.length
        : null;
    document.getElementById("monitor-promedio-humedad").textContent =
      valorConUnidad(promedio(humedades), "%");
    document.getElementById("monitor-promedio-temperatura").textContent =
      valorConUnidad(promedio(temperaturas), "°C");
    document.getElementById("monitor-comunidades-con-datos").textContent =
      `${conDatos.length} / ${comunidades.length}`;
  }

  inputMeses.disabled = true;
  inputMeses.addEventListener("change", () =>
    cargarHistorial(comunidadSeleccionada),
  );
  fetch("/api/v1/comunidades", { headers: { Accept: "application/json" } })
    .then((respuesta) => {
      if (!respuesta.ok) throw new Error("comunidades");
      return respuesta.json();
    })
    .then((contenido) => {
      const comunidades = Array.isArray(contenido.datos) ? contenido.datos : [];
      actualizarResumen(comunidades);
      agregarMarcadores(comunidades);
      estadoTexto(estado, comunidades.length ? "" : texto.sinComunidades);
    })
    .catch(() => estadoTexto(estado, texto.error));
})();

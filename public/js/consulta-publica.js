(() => {
  const formulario = document.querySelector("[data-consulta-publica]");
  if (!formulario) return;

  const porId = (id) => document.getElementById(id);
  const estado = porId("consulta-publica-estado");
  const resultado = porId("consulta-publica-resultado");
  const tarjetas = porId("consulta-publica-tarjetas");
  const coordenadaLatitud = porId("consulta-publica-latitud");
  const coordenadaLongitud = porId("consulta-publica-longitud");
  const distrito = porId("consulta-publica-distrito");
  const provincia = porId("consulta-publica-provincia");
  const departamento = porId("consulta-publica-departamento");
  const provinciaId = porId("consulta-publica-provincia-id");
  const punto = porId("consulta-publica-punto");
  const botonUbicacion = porId("consulta-publica-geolocalizacion");
  const cacheAviso = porId("consulta-publica-cache");
  const claveCache = "siembra-andina-consulta-publica-v1";
  let mapa;
  let marcador;
  let grafico;

  const texto = (clave) => formulario.dataset[clave] || "";
  const elemento = (etiqueta, clase, contenido) => {
    const nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (contenido !== undefined) nodo.textContent = contenido;
    return nodo;
  };
  const cambiarEstado = (mensaje, visible = true) => {
    estado.textContent = mensaje;
    estado.hidden = !visible;
  };
  const fechaLegible = (valor) => {
    if (!valor) return "";
    const [anio, mes, dia] = valor.split("-").map(Number);
    return new Intl.DateTimeFormat(document.documentElement.lang || "es", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(anio, mes - 1, dia)));
  };

  function limpiarPunto() {
    coordenadaLatitud.value = "";
    coordenadaLongitud.value = "";
    punto.textContent = "";
    if (mapa && marcador) {
      mapa.removeLayer(marcador);
      marcador = null;
    }
  }

  function marcarPunto(lat, lon, mensaje) {
    coordenadaLatitud.value = Number(lat).toFixed(2);
    coordenadaLongitud.value = Number(lon).toFixed(2);
    punto.textContent = mensaje;
    if (mapa) {
      const posicion = [Number(lat), Number(lon)];
      if (!marcador) marcador = window.L.marker(posicion).addTo(mapa);
      else marcador.setLatLng(posicion);
      mapa.setView(posicion, 9);
    }
  }

  function inicializarMapa() {
    const contenedor = porId("consulta-publica-mapa");
    const leaflet = window.L;
    if (!contenedor || !leaflet) return;
    mapa = leaflet
      .map(contenedor, { scrollWheelZoom: false })
      .setView([-13.5, -71.9], 5);
    leaflet
      .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: formulario.dataset.mapaAtribucion,
      })
      .addTo(mapa);
    mapa.on("click", (evento) => {
      distrito.value = "";
      marcarPunto(
        evento.latlng.lat,
        evento.latlng.lng,
        texto("ubicacionLista"),
      );
    });
  }

  async function cargarOpciones(url, campo) {
    const respuesta = await fetch(url, {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    if (!respuesta.ok) throw new Error("No se pudieron cargar las opciones.");
    const datos = await respuesta.json();
    return Array.isArray(datos[campo]) ? datos[campo] : [];
  }

  function poblar(select, filas, etiqueta) {
    const opcionInicial = select.options[0].cloneNode(true);
    select.replaceChildren(opcionInicial);
    filas.forEach((fila) => {
      const opcion = document.createElement("option");
      opcion.value = fila.id;
      opcion.textContent = fila.nombre;
      select.append(opcion);
    });
    select.disabled = filas.length === 0;
    if (etiqueta) select.setAttribute("aria-label", etiqueta);
  }

  departamento.addEventListener("change", async () => {
    provinciaId.value = "";
    poblar(provincia, [], "");
    poblar(distrito, [], "");
    limpiarPunto();
    if (!departamento.value) return;
    try {
      const filas = await cargarOpciones(
        `/api/publico/provincias?departamento_id=${encodeURIComponent(departamento.value)}`,
        "provincias",
      );
      poblar(provincia, filas, texto("provincia"));
    } catch {
      cambiarEstado(texto("error"));
    }
  });

  provincia.addEventListener("change", async () => {
    provinciaId.value = provincia.value;
    poblar(distrito, [], "");
    limpiarPunto();
    if (!provincia.value) return;
    try {
      const filas = await cargarOpciones(
        `/api/publico/distritos?provincia_id=${encodeURIComponent(provincia.value)}`,
        "distritos",
      );
      poblar(distrito, filas, texto("distrito"));
    } catch {
      cambiarEstado(texto("error"));
    }
  });

  distrito.addEventListener("change", () => {
    limpiarPunto();
    provinciaId.value = provincia.value;
    if (distrito.value) {
      punto.textContent = texto("distritoElegido");
    }
  });

  botonUbicacion.addEventListener("click", () => {
    if (!navigator.geolocation) {
      cambiarEstado(texto("ubicacionError"));
      return;
    }
    cambiarEstado(texto("ubicacionBuscando"));
    botonUbicacion.disabled = true;
    distrito.value = "";
    limpiarPunto();
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        marcarPunto(coords.latitude, coords.longitude, texto("ubicacionLista"));
        botonUbicacion.disabled = false;
        cambiarEstado("", false);
      },
      () => {
        botonUbicacion.disabled = false;
        cambiarEstado(texto("ubicacionError"));
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  });

  function renderizarVentana(cultivo, ventana) {
    const li = elemento(
      "li",
      `consulta-publica__ventana consulta-publica__ventana--${ventana.color}`,
    );
    const titulo = elemento(
      "strong",
      "",
      `${fechaLegible(ventana.inicio)} – ${fechaLegible(ventana.fin)}`,
    );
    const puntaje = elemento(
      "p",
      "",
      `${texto("puntaje")}: ${Math.round(ventana.puntaje)} %`,
    );
    li.append(titulo, puntaje);
    if (ventana.cosecha) {
      li.append(
        elemento(
          "p",
          "",
          `${texto("cosecha")}: ${fechaLegible(ventana.cosecha.inicio)} – ${fechaLegible(ventana.cosecha.fin)}`,
        ),
      );
      if (ventana.cosecha.referencial) {
        li.append(
          elemento("p", "consulta-publica__nota", texto("referencial")),
        );
      }
    }
    const riesgos = elemento("p", "");
    riesgos.append(elemento("strong", "", `${texto("riesgos")}: `));
    const alertas = [];
    if (ventana.riesgos.helada === true) alertas.push(texto("riesgoHelada"));
    if (ventana.riesgos.humedadBaja === true)
      alertas.push(texto("riesgoHumedad"));
    if (
      ventana.riesgos.helada === null &&
      ventana.riesgos.humedadBaja === null
    ) {
      alertas.push(texto("sinPronostico"));
    } else if (!alertas.length) {
      alertas.push(texto("sinRiesgos"));
    }
    riesgos.append(document.createTextNode(alertas.join(" ")));
    li.append(riesgos);
    return li;
  }

  function renderizarTarjetas(datos) {
    tarjetas.replaceChildren();
    datos.cultivos.forEach((cultivo) => {
      const tarjeta = elemento("article", "consulta-publica__tarjeta");
      tarjeta.append(elemento("h3", "", cultivo.nombre));
      tarjeta.append(elemento("h4", "", texto("ventanas")));
      if (!cultivo.ventanas.length) {
        tarjeta.append(elemento("p", "", texto("sinVentanas")));
      } else {
        const lista = elemento("ol", "consulta-publica__ventanas");
        cultivo.ventanas.forEach((ventana) => {
          lista.append(renderizarVentana(cultivo, ventana));
        });
        tarjeta.append(lista);
      }
      tarjetas.append(tarjeta);
    });
  }

  function renderizarFuentes(datos) {
    const lista = porId("consulta-publica-fuentes-lista");
    lista.replaceChildren();
    [
      ["nasa", datos.fuentes.nasaPower],
      ["openMeteoSuelo", datos.fuentes.openMeteoSuelo],
      ["openMeteoTemperatura", datos.fuentes.openMeteoTemperatura],
    ].forEach(([clave, disponible]) => {
      const item = elemento(
        "li",
        "",
        `${texto(clave)}: ${disponible ? texto("disponible") : texto("noDisponible")}`,
      );
      lista.append(item);
    });
    lista.append(
      elemento(
        "li",
        "",
        `${texto("fechaConsulta")}: ${fechaLegible(datos.fuentes.fechaConsulta)}`,
      ),
      elemento(
        "li",
        "",
        `${texto("periodoHistorial")}: ${fechaLegible(datos.fuentes.inicioHistorial)} – ${fechaLegible(datos.fuentes.fechaConsulta)}`,
      ),
    );
  }

  function renderizarTecnicos(datos, cacheado) {
    const lista = porId("consulta-publica-tecnicos-lista");
    lista.replaceChildren();
    datos.tecnicos.forEach((tecnico) =>
      lista.append(elemento("li", "", tecnico.nombre)),
    );
    porId("consulta-publica-sin-tecnicos").textContent = datos.tecnicos.length
      ? ""
      : texto("sinTecnicos");
    porId("consulta-publica-detalle").hidden = cacheado;
  }

  function renderizarGrafico(datos) {
    const pronostico = datos.pronostico || [];
    const tieneHumedad = pronostico.some(
      (dia) => dia.humedad !== null && dia.humedad !== undefined,
    );
    porId("consulta-publica-grafico-resumen").textContent = tieneHumedad
      ? texto("resumenGrafico")
      : texto("graficoSinDatos");
    const lecturas = porId("consulta-publica-grafico-lecturas");
    lecturas.replaceChildren();
    pronostico.forEach((dia) => {
      if (dia.humedad === null || dia.humedad === undefined) return;
      const mensaje = texto("lecturaGrafico")
        .replace("{fecha}", fechaLegible(dia.fecha))
        .replace("{humedad}", dia.humedad);
      lecturas.append(elemento("li", "", mensaje));
    });
    const ChartConstructor = window.Chart;
    if (!ChartConstructor || !tieneHumedad) return;
    if (grafico) grafico.destroy();

    const rangos = datos.cultivos
      .map((cultivo) => cultivo.rangoHumedad)
      .filter(Boolean);
    const rango = rangos.length
      ? {
          minimo: Math.min(...rangos.map((fila) => fila.minimo)),
          maximo: Math.max(...rangos.map((fila) => fila.maximo)),
        }
      : null;
    const rellenoRango = {
      id: "rangoIdeal",
      beforeDatasetsDraw(chart) {
        if (!rango || !chart.chartArea) return;
        const escala = chart.scales.y;
        const alto = escala.getPixelForValue(rango.maximo);
        const bajo = escala.getPixelForValue(rango.minimo);
        const contexto = chart.ctx;
        contexto.save();
        contexto.fillStyle = getComputedStyle(document.documentElement)
          .getPropertyValue("--pub-chart-range")
          .trim();
        contexto.fillRect(
          chart.chartArea.left,
          alto,
          chart.chartArea.right - chart.chartArea.left,
          bajo - alto,
        );
        contexto.restore();
      },
    };
    const elementoGrafico = porId("consulta-publica-grafico");
    const estilos = getComputedStyle(document.documentElement);
    const colorGrafico = (variable) =>
      estilos.getPropertyValue(variable).trim();
    elementoGrafico.setAttribute("aria-label", texto("resumenGrafico"));
    grafico = new ChartConstructor(elementoGrafico, {
      type: "line",
      data: {
        labels: pronostico.map((dia) => fechaLegible(dia.fecha)),
        datasets: [
          {
            label: `${texto("humedad")} — ${texto("rangoIdeal")}`,
            data: pronostico.map((dia) => dia.humedad),
            borderColor: colorGrafico("--pub-accent"),
            backgroundColor: colorGrafico("--pub-transparent"),
            spanGaps: false,
            tension: 0.25,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? 0
            : 500,
        },
        scales: {
          y: {
            min: 0,
            max: 100,
            ticks: { color: colorGrafico("--pub-chart-text") },
            grid: { color: colorGrafico("--pub-chart-grid") },
            title: {
              display: true,
              text: "%",
              color: colorGrafico("--pub-chart-text"),
            },
          },
          x: {
            ticks: {
              maxTicksLimit: 8,
              color: colorGrafico("--pub-chart-text"),
            },
            grid: { color: colorGrafico("--pub-chart-grid") },
          },
        },
        plugins: {
          legend: {
            display: true,
            labels: { color: colorGrafico("--pub-chart-text") },
          },
          tooltip: {
            enabled: true,
            backgroundColor: colorGrafico("--pub-surface"),
            titleColor: colorGrafico("--pub-text"),
            bodyColor: colorGrafico("--pub-text"),
            borderColor: colorGrafico("--pub-border"),
            borderWidth: 1,
          },
        },
      },
      plugins: [rellenoRango],
    });
  }

  function renderizar(datos, cacheado = false) {
    resultado.hidden = false;
    cacheAviso.textContent = cacheado ? texto("ultimaConsulta") : "";
    cacheAviso.hidden = !cacheado;
    porId("consulta-publica-resultado-titulo").textContent =
      `${datos.lugar} · ${texto(`confianza${datos.confianza[0].toUpperCase()}${datos.confianza.slice(1)}`)}`;
    renderizarTarjetas(datos);
    porId("consulta-publica-grafico-titulo").textContent = texto("grafico");
    porId("consulta-publica-grafico-resumen").textContent =
      texto("resumenGrafico");
    porId("consulta-publica-grafico-detalle").textContent =
      texto("verDatosGrafico");
    porId("consulta-publica-explicacion-titulo").textContent =
      texto("explicacion");
    porId("consulta-publica-insignia").textContent = texto(
      datos.generadoConIA ? "insigniaIA" : "insigniaPlantilla",
    );
    porId("consulta-publica-explicacion").textContent = datos.explicacion;
    porId("consulta-publica-resolucion").textContent =
      texto("limiteResolucion");
    porId("consulta-publica-fuentes-titulo").textContent = texto("fuentes");
    porId("consulta-publica-tecnicos-titulo").textContent = texto("tecnicos");
    renderizarFuentes(datos);
    renderizarTecnicos(datos, cacheado);
    renderizarGrafico(datos);
    if (!cacheado) {
      try {
        localStorage.setItem(claveCache, JSON.stringify(datos));
      } catch {
        console.warn(
          "No se pudo guardar la consulta pública en este dispositivo.",
        );
      }
    }
  }

  function leerCache() {
    try {
      const guardado = localStorage.getItem(claveCache);
      return guardado ? JSON.parse(guardado) : null;
    } catch {
      console.warn("No se pudo leer la consulta pública guardada.");
      return null;
    }
  }

  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    if (!formulario.reportValidity()) return;
    if (
      !distrito.value &&
      (!coordenadaLatitud.value || !coordenadaLongitud.value)
    ) {
      cambiarEstado(texto("seleccionaLugar"));
      return;
    }
    cambiarEstado(texto("cargando"));
    formulario.querySelector('[type="submit"]').disabled = true;
    const formularioDatos = new FormData(formulario);
    if (!formularioDatos.get("provincia_id") && provincia.value) {
      formularioDatos.set("provincia_id", provincia.value);
    }
    const cuerpo = new URLSearchParams(formularioDatos);
    try {
      const respuesta = await fetch(formulario.action, {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        body: cuerpo,
      });
      let datos;
      try {
        datos = await respuesta.json();
      } catch {
        cambiarEstado(texto("error"));
        return;
      }
      if (!respuesta.ok || !datos.ok) {
        if (
          respuesta.status === 429 ||
          (datos.error && datos.error.codigo === "limite_consultas")
        ) {
          cambiarEstado(texto("errorLimite"));
        } else if (datos.error && datos.error.codigo === "sin_coordenadas") {
          cambiarEstado(texto("errorCoordenadas"));
        } else {
          cambiarEstado(texto("error"));
        }
        return;
      }
      renderizar(datos.resultado);
      cambiarEstado("", false);
      resultado.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    } catch {
      const guardado = leerCache();
      cambiarEstado(texto("errorRed"));
      if (guardado) renderizar(guardado, true);
    } finally {
      formulario.querySelector('[type="submit"]').disabled = false;
    }
  });

  if (navigator.onLine === false) {
    const guardado = leerCache();
    if (guardado) renderizar(guardado, true);
  }
  inicializarMapa();
})();

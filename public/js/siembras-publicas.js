(() => {
  const root = document.getElementById("siembras-publicas");
  if (!root) return;

  const texto = root.dataset;
  const formulario = document.getElementById("siembras-filtros");
  const estado = document.getElementById("siembras-estado");
  const avisoDemo = document.getElementById("siembras-demo-aviso");
  const cuerpo = document.getElementById("siembras-resultados");
  const mapaElemento = document.getElementById("siembras-mapa");
  let mapa;
  let marcadores;

  function mostrarEstado(mensaje) {
    estado.textContent = mensaje || "";
  }

  function crearMapa() {
    if (mapa) return true;
    if (!window.L) {
      mostrarEstado(texto.error);
      return false;
    }
    mapa = window.L.map(mapaElemento, { scrollWheelZoom: false });
    marcadores = window.L.layerGroup().addTo(mapa);
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: texto.atribucionMapa,
    }).addTo(mapa);
    mapa.setView([-13.5, -71.9], 6);
    return true;
  }

  function nombreArea(fila, indice) {
    if (!fila.demoKey) return fila.distrito;
    return (
      texto[`areaDemo${fila.demoKey.toUpperCase()}`] ||
      `${texto.etiquetaDemo} ${indice + 1}`
    );
  }

  function nombreCultivo(fila) {
    if (!fila.demo) return fila.cultivo;
    const slug = fila.cultivoSlug.replaceAll("-", "");
    return (
      texto[`cultivo${slug[0].toUpperCase()}${slug.slice(1)}`] ||
      fila.cultivoSlug
    );
  }

  function nombreEstado(estadoFila) {
    const clave = estadoFila[0].toUpperCase() + estadoFila.slice(1);
    return texto[`estado${clave}`] || texto.estadoSembrado;
  }

  function fechaLegible(fecha) {
    if (!fecha) return "—";
    return new Intl.DateTimeFormat(document.documentElement.lang || "es", {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(`${String(fecha).slice(0, 10)}T00:00:00Z`));
  }

  function crearCelda(textoCelda, fila) {
    const celda = document.createElement("td");
    celda.textContent = textoCelda;
    fila.append(celda);
    return celda;
  }

  function contenidoPopup(fila, indice, demo) {
    const contenido = document.createElement("div");
    const titulo = document.createElement("strong");
    const cultivoLinea = document.createElement("p");
    const cantidad = document.createElement("p");
    titulo.textContent = nombreArea(fila, indice);
    cultivoLinea.textContent = nombreCultivo(fila);
    cantidad.textContent = `${fila.cantidadSiembras} · ${fechaLegible(fila.fechaMediana)}`;
    contenido.append(titulo, cultivoLinea, cantidad);
    if (demo) {
      const insignia = document.createElement("p");
      insignia.textContent = texto.etiquetaDemo;
      contenido.append(insignia);
    }
    return contenido;
  }

  function agregarMarcadores(filas) {
    if (!crearMapa()) return;
    marcadores.clearLayers();
    const limites = [];
    filas.forEach((fila, indice) => {
      const latitud = Number(fila.latitud);
      const longitud = Number(fila.longitud);
      if (!Number.isFinite(latitud) || !Number.isFinite(longitud)) return;
      const demo = Boolean(fila.demo);
      const icono = window.L.divIcon({
        className: "siembras-publicas__icono",
        html: `<span class="siembras-publicas__marcador${demo ? " siembras-publicas__marcador--demo" : ""}" aria-hidden="true"></span>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });
      const marcador = window.L.marker([latitud, longitud], {
        title: `${nombreArea(fila, indice)} · ${nombreCultivo(fila)}`,
        alt: demo ? texto.etiquetaDemo : nombreArea(fila, indice),
        icon: icono,
        keyboard: true,
      }).addTo(marcadores);
      marcador.bindPopup(contenidoPopup(fila, indice, demo));
      limites.push([latitud, longitud]);
    });
    if (limites.length === 1) mapa.setView(limites[0], 9);
    else if (limites.length > 1)
      mapa.fitBounds(limites, { padding: [24, 24], maxZoom: 9 });
    else mapa.setView([-13.5, -71.9], 6);
  }

  function agregarFila(fila, indice, demo) {
    const tr = document.createElement("tr");
    if (demo) tr.className = "siembras-publicas__fila-demo";

    const area = nombreArea(fila, indice);
    const distritoCelda = crearCelda(
      `${area}${fila.provincia && !demo ? `, ${fila.provincia}` : ""}`,
      tr,
    );
    if (demo) {
      const insignia = document.createElement("span");
      insignia.className = "siembras-publicas__insignia-demo";
      insignia.textContent = texto.etiquetaDemo;
      distritoCelda.append(document.createElement("br"), insignia);
    }
    crearCelda(nombreCultivo(fila), tr);
    crearCelda(String(fila.cantidadSiembras), tr);
    crearCelda(fechaLegible(fila.fechaMediana), tr);
    crearCelda(
      `${fechaLegible(fila.fechaDesde)} – ${fechaLegible(fila.fechaHasta)}`,
      tr,
    );
    const estadoCelda = crearCelda(nombreEstado(fila.estado), tr);
    const cantidades = document.createElement("small");
    cantidades.textContent = `${texto.sembradas}: ${fila.sembradas}; ${texto.cosechadas}: ${fila.cosechadas}`;
    estadoCelda.append(document.createElement("br"), cantidades);
    cuerpo.append(tr);
  }

  async function cargar() {
    mostrarEstado(texto.cargando);
    cuerpo.replaceChildren();
    const parametros = new URLSearchParams(new FormData(formulario));
    for (const [clave, valor] of [...parametros.entries()]) {
      if (!valor) parametros.delete(clave);
    }
    try {
      const respuesta = await fetch(
        `/api/publico/siembras?${parametros.toString()}`,
        {
          headers: { Accept: "application/json" },
        },
      );
      if (!respuesta.ok) throw new Error("siembras");
      const contenido = await respuesta.json();
      const reales = Array.isArray(contenido.datos?.reales)
        ? contenido.datos.reales
        : [];
      const demo = Array.isArray(contenido.datos?.demo)
        ? contenido.datos.demo
        : [];
      avisoDemo.hidden = demo.length === 0;
      reales.forEach((fila, indice) => agregarFila(fila, indice, false));
      demo.forEach((fila, indice) => agregarFila(fila, indice, true));
      agregarMarcadores([...reales, ...demo]);
      mostrarEstado(reales.length || demo.length ? "" : texto.sinDatos);
    } catch {
      avisoDemo.hidden = true;
      agregarMarcadores([]);
      mostrarEstado(texto.error);
    }
  }

  formulario.addEventListener("submit", (evento) => {
    evento.preventDefault();
    cargar();
  });
  formulario.addEventListener("change", cargar);
  cargar();
})();

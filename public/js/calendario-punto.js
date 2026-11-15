// Tarjeta "Elige tu punto" del calendario público.
// Cuatro formas de elegir el punto: buscador (Open-Meteo, solo Perú),
// ubicación del navegador, clic en el mapa Leaflet y latitud/longitud manuales.
// Al elegir, se recarga /calendario con ?lat=&lon= (URL compartible).
// Todo texto sale de data-* rellenados con t('clave') en la vista; aquí no hay
// frases escritas a mano. Los errores se pintan con textContent (sin HTML).
(() => {
  const formulario = document.querySelector("[data-calendario-punto]");
  if (!formulario) return;

  const porId = (id) => document.getElementById(id);
  const config = formulario.dataset;
  const limites = {
    latMin: Number(config.latMin),
    latMax: Number(config.latMax),
    lonMin: Number(config.lonMin),
    lonMax: Number(config.lonMax),
  };
  const urlCalendario = config.url || "/calendario";
  const urlGeocodificar = config.geocodificar || "/api/publico/geocodificar";

  const campoLat = porId("calendario-lat");
  const campoLon = porId("calendario-lon");
  const campoCultivo = porId("calendario-cultivo");
  const campoOtro = porId("calendario-otro");
  const errorFormulario = document.querySelector("[data-calendario-error]");

  const buscador = porId("calendario-busqueda");
  const estadoBusqueda = porId("calendario-busqueda-estado");
  const listaResultados = porId("calendario-resultados");
  const botonUbicacion = porId("calendario-usar-ubicacion");
  const estadoUbicacion = porId("calendario-ubicacion-estado");
  const latManual = porId("calendario-lat-manual");
  const lonManual = porId("calendario-lon-manual");
  const botonManual = porId("calendario-usar-manual");
  const estadoManual = porId("calendario-manual-estado");
  const estadoGeneral = porId("calendario-punto-estado");

  let mapa = null;
  let marcador = null;
  let temporizador = null;
  let ultimaConsulta = "";

  function aviso(elemento, mensaje) {
    if (!elemento) return;
    elemento.textContent = mensaje || "";
    elemento.hidden = !mensaje;
  }

  function enPeru(lat, lon) {
    return (
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      lat >= limites.latMin &&
      lat <= limites.latMax &&
      lon >= limites.lonMin &&
      lon <= limites.lonMax
    );
  }

  function redondear(valor) {
    return Number(Number(valor).toFixed(2));
  }

  /** Recarga el calendario con el punto en la URL; la URL se puede compartir. */
  function irAlPunto(lat, lon) {
    const latitud = redondear(lat);
    const longitud = redondear(lon);
    if (!enPeru(latitud, longitud)) {
      aviso(estadoGeneral, config.fueraDePeru);
      return;
    }
    const parametros = new URLSearchParams();
    if (campoCultivo && campoCultivo.value) {
      parametros.set("cultivo", campoCultivo.value);
    } else if (campoOtro && campoOtro.value.trim()) {
      parametros.set("otro", campoOtro.value.trim());
    }
    parametros.set("lat", latitud.toFixed(2));
    parametros.set("lon", longitud.toFixed(2));
    window.location.assign(`${urlCalendario}?${parametros.toString()}`);
  }

  // ---------- Mapa Leaflet ----------
  function marcar(lat, lon, mensaje) {
    if (!mapa) return;
    const posicion = [lat, lon];
    if (!marcador) marcador = window.L.marker(posicion).addTo(mapa);
    else marcador.setLatLng(posicion);
    mapa.setView(posicion, 9);
    if (mensaje) aviso(estadoGeneral, mensaje);
  }

  /** Carga Leaflet (y sus estilos) solo cuando la persona pide ver el mapa. */
  function cargarLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (!cargarLeaflet.pendiente) {
      cargarLeaflet.pendiente = new Promise((resolver, rechazar) => {
        const estilos = document.createElement("link");
        estilos.rel = "stylesheet";
        estilos.href = "/vendor/leaflet/leaflet.css";
        document.head.append(estilos);
        const script = document.createElement("script");
        script.src = "/vendor/leaflet/leaflet.js";
        script.defer = true;
        script.onload = () => resolver(window.L || null);
        script.onerror = () => rechazar(new Error("leaflet"));
        document.head.append(script);
      });
    }
    return cargarLeaflet.pendiente;
  }

  function inicializarMapa() {
    const contenedor = porId("calendario-mapa");
    const leaflet = window.L;
    if (!contenedor || !leaflet) return;
    // Centro aproximado del Perú; el clic elige el punto y recarga.
    mapa = leaflet.map(contenedor, { scrollWheelZoom: false }).setView(
      [-13.5, -71.9],
      5,
    );
    leaflet
      .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: config.mapaAtribucion,
      })
      .addTo(mapa);
    mapa.on("click", (evento) => {
      const lat = redondear(evento.latlng.lat);
      const lon = redondear(evento.latlng.lng);
      if (!enPeru(lat, lon)) {
        aviso(estadoGeneral, config.fueraDePeru);
        return;
      }
      marcar(lat, lon);
      irAlPunto(lat, lon);
    });
  }

  // ---------- Buscador de lugares (Open-Meteo, solo Perú) ----------
  function limpiarResultados() {
    if (listaResultados) listaResultados.replaceChildren();
  }

  function elegirResultado(resultado) {
    if (!resultado) return;
    if (resultado.enPeru === false) {
      aviso(estadoGeneral, config.fueraDePeru);
      return;
    }
    irAlPunto(resultado.latitud, resultado.longitud);
  }

  async function buscarLugares(texto) {
    const consulta = String(texto || "").trim();
    if (consulta.length < 2) {
      limpiarResultados();
      aviso(estadoBusqueda, config.busquedaCorta);
      return;
    }
    if (consulta === ultimaConsulta) return;
    ultimaConsulta = consulta;
    aviso(estadoBusqueda, config.buscando);
    try {
      const respuesta = await fetch(
        `${urlGeocodificar}?q=${encodeURIComponent(consulta)}`,
        { headers: { Accept: "application/json" }, credentials: "same-origin" },
      );
      // El servidor decide el mensaje; aquí solo se muestra estado.
      if (!respuesta.ok) {
        limpiarResultados();
        aviso(estadoBusqueda, config.busquedaError);
        return;
      }
      const datos = await respuesta.json();
      const resultados = Array.isArray(datos.resultados) ? datos.resultados : [];
      limpiarResultados();
      if (!resultados.length) {
        aviso(estadoBusqueda, config.sinResultados);
        return;
      }
      aviso(estadoBusqueda, "");
      resultados.forEach((resultado) => {
        const item = document.createElement("li");
        const boton = document.createElement("button");
        boton.type = "button";
        boton.className = "calendario-punto__resultado";
        boton.setAttribute("role", "option");
        boton.textContent = resultado.etiqueta || resultado.nombre;
        boton.addEventListener("click", () => elegirResultado(resultado));
        item.append(boton);
        listaResultados.append(item);
      });
    } catch {
      limpiarResultados();
      aviso(estadoBusqueda, config.busquedaError);
    }
  }

  if (buscador) {
    buscador.addEventListener("input", () => {
      clearTimeout(temporizador);
      const texto = buscador.value;
      // Pequeña espera para no pedir una búsqueda por cada tecla.
      temporizador = setTimeout(() => buscarLugares(texto), 350);
    });
    buscador.addEventListener("keydown", (evento) => {
      if (evento.key !== "Enter") return;
      const primero = listaResultados && listaResultados.querySelector("button");
      if (!primero) return;
      evento.preventDefault();
      primero.click();
    });
  }

  // ---------- Ubicación del navegador ----------
  if (botonUbicacion) {
    botonUbicacion.addEventListener("click", () => {
      if (!navigator.geolocation) {
        aviso(estadoUbicacion, config.ubicacionError);
        return;
      }
      aviso(estadoUbicacion, config.ubicacionBuscando);
      botonUbicacion.disabled = true;
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          botonUbicacion.disabled = false;
          aviso(estadoUbicacion, "");
          const lat = redondear(coords.latitude);
          const lon = redondear(coords.longitude);
          if (!enPeru(lat, lon)) {
            aviso(estadoUbicacion, config.fueraDePeru);
            return;
          }
          marcar(lat, lon);
          irAlPunto(lat, lon);
        },
        () => {
          botonUbicacion.disabled = false;
          aviso(estadoUbicacion, config.ubicacionError);
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
      );
    });
  }

  // ---------- Coordenadas manuales ----------
  if (botonManual) {
    botonManual.addEventListener("click", () => {
      const lat = Number(String(latManual.value).replace(",", "."));
      const lon = Number(String(lonManual.value).replace(",", "."));
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        aviso(estadoManual, config.coordenadasInvalidas);
        return;
      }
      if (!enPeru(lat, lon)) {
        aviso(estadoManual, config.fueraDePeru);
        return;
      }
      aviso(estadoManual, "");
      marcar(redondear(lat), redondear(lon));
      irAlPunto(lat, lon);
    });
  }

  // ---------- Envío del formulario principal ----------
  if (formulario) {
    formulario.addEventListener("submit", (evento) => {
      evento.preventDefault();
      if (campoOtro && campoOtro.value.trim() && campoCultivo) {
        // "Otro cultivo" manda sobre el select: se envía solo el texto.
        const lat = campoLat && campoLat.value;
        const lon = campoLon && campoLon.value;
        const parametros = new URLSearchParams();
        parametros.set("otro", campoOtro.value.trim());
        if (lat && lon) {
          parametros.set("lat", lat);
          parametros.set("lon", lon);
        }
        window.location.assign(`${urlCalendario}?${parametros.toString()}`);
        return;
      }
      if (!campoCultivo || !campoCultivo.value) {
        aviso(errorFormulario, null);
        campoCultivo.focus();
        return;
      }
      const parametros = new URLSearchParams();
      parametros.set("cultivo", campoCultivo.value);
      if (campoLat && campoLon && campoLat.value && campoLon.value) {
        parametros.set("lat", campoLat.value);
        parametros.set("lon", campoLon.value);
      }
      window.location.assign(`${urlCalendario}?${parametros.toString()}`);
    });
  }

  // El mapa se activa a petición: antes de pulsar no se descargan teselas ni
  // se contacta con ningún servidor de mapas.
  const botonMapa = porId("calendario-cargar-mapa");
  if (botonMapa) {
    botonMapa.hidden = Boolean(window.L);
    botonMapa.addEventListener("click", async () => {
      botonMapa.disabled = true;
      try {
        await cargarLeaflet();
        inicializarMapa();
        if (mapa) {
          mapa.invalidateSize();
          botonMapa.hidden = true;
        }
      } catch {
        aviso(estadoGeneral, config.mapaError);
        botonMapa.disabled = false;
      }
    });
  }
  inicializarMapa();
})();

(function () {
  const mapaElemento = document.getElementById("mapa-parcela");
  const latitud = document.querySelector('[name="latitud"]');
  const longitud = document.querySelector('[name="longitud"]');
  const altitud = document.getElementById("parcela-altitud");
  const zona = document.getElementById("parcela-zona");
  const departamento = document.getElementById("parcela-departamento");
  const provincia = document.getElementById("parcela-provincia");
  const distrito = document.getElementById("parcela-distrito");
  const botonAltitud = document.getElementById("estimar-altitud");
  const estadoAltitud = document.getElementById("estado-altitud");
  const botonUbicacion = document.getElementById("usar-ubicacion");
  const estadoUbicacion = document.getElementById("estado-ubicacion");
  const botonCapaMapa = document.getElementById("cambiar-capa-mapa");
  const botonDibujarTerreno = document.getElementById("iniciar-trazo-terreno");
  const botonFinalizarTerreno = document.getElementById("finalizar-trazo-terreno");
  const botonBorrarTerreno = document.getElementById("borrar-trazo-terreno");
  const estadoTerreno = document.getElementById("estado-trazo-terreno");
  const areaTerreno = document.getElementById("parcela-area");
  let solicitudAltitud = 0;

  function llenar(select, filas, textoInicial, atributoPadre) {
    select.replaceChildren(new Option(textoInicial, ""));
    filas.forEach((fila) => {
      const opcion = new Option(fila.nombre, String(fila.id));
      if (atributoPadre) {
        opcion.dataset[atributoPadre] = String(fila[atributoPadre]);
      }
      select.add(opcion);
    });
  }

  async function cargarOpciones(select, url, clave, textoInicial, atributoPadre) {
    llenar(select, [], textoInicial);
    if (!url) return;
    const respuesta = await fetch(url, { headers: { Accept: "application/json" } });
    if (!respuesta.ok) throw new Error("No se pudo cargar la ubicación.");
    const datos = await respuesta.json();
    llenar(select, datos[clave] || [], textoInicial, atributoPadre);
  }

  if (departamento && provincia && distrito) {
    departamento.addEventListener("change", async function () {
      try {
        const id = encodeURIComponent(departamento.value);
        await cargarOpciones(
          provincia,
          id ? `/api/publico/provincias?departamento_id=${id}` : "",
          "provincias",
          "Elige una provincia",
          "departamento_id",
        );
        llenar(distrito, [], "Elige un distrito");
      } catch {
        estadoUbicacion.textContent = estadoUbicacion.dataset.errorCargarUbicacion;
      }
    });
    provincia.addEventListener("change", async function () {
      try {
        const id = encodeURIComponent(provincia.value);
        await cargarOpciones(
          distrito,
          id ? `/api/publico/distritos?provincia_id=${id}` : "",
          "distritos",
          "Elige un distrito",
          "provincia_id",
        );
      } catch {
        estadoUbicacion.textContent = estadoUbicacion.dataset.errorCargarUbicacion;
      }
    });
  }

  function sugerirZona() {
    const metros = Number(altitud && altitud.value);
    if (!Number.isFinite(metros) || !zona) return;
    const opciones = Array.from(zona.options);
    const elegida = opciones.find((opcion, indice) => {
      if (!opcion.value) return false;
      const minimo = Number(opcion.dataset.min);
      const maximo = Number(opcion.dataset.max);
      const ultima = opciones.slice(indice + 1).every((siguiente) => !siguiente.value);
      return metros >= minimo && (metros < maximo || (ultima && metros <= maximo));
    });
    if (elegida) {
      zona.value = elegida.value;
      estadoAltitud.textContent = estadoAltitud.dataset.zonaSugerida.replace(
        "{zona}",
        elegida.textContent,
      );
    }
  }

  async function estimarAltitudDesdeCoordenadas() {
    const solicitudActual = ++solicitudAltitud;
    if (!latitud.value || !longitud.value) {
      estadoAltitud.textContent = estadoAltitud.dataset.faltaCoordenadas;
      return;
    }

    if (botonAltitud) botonAltitud.disabled = true;
    estadoAltitud.textContent = estadoAltitud.dataset.consultando;
    try {
      const parametros = new URLSearchParams({
        latitud: latitud.value,
        longitud: longitud.value,
      });
      const respuesta = await fetch(`/api/parcelas/altitud?${parametros}`, {
        headers: { Accept: "application/json" },
      });
      if (!respuesta.ok) throw new Error("No se pudo consultar la altitud.");
      const datos = await respuesta.json();
      if (solicitudActual !== solicitudAltitud) return;
      const metros = Number(datos.altitud_m);
      if (!Number.isFinite(metros) || metros < 0 || metros > 6000) {
        throw new Error("La altitud devuelta no es válida.");
      }
      altitud.value = String(metros);
      sugerirZona();
      estadoAltitud.textContent = estadoAltitud.dataset.actualizada;
    } catch {
      if (solicitudActual === solicitudAltitud) {
        estadoAltitud.textContent = estadoAltitud.dataset.error;
      }
    } finally {
      if (solicitudActual === solicitudAltitud && botonAltitud) {
        botonAltitud.disabled = false;
      }
    }
  }

  if (altitud) altitud.addEventListener("input", sugerirZona);

  if (mapaElemento && window.L) {
    const latInicial = Number(mapaElemento.dataset.latitud);
    const lonInicial = Number(mapaElemento.dataset.longitud);
    const tieneCoordenadasIniciales =
      mapaElemento.dataset.latitud !== "" &&
      mapaElemento.dataset.longitud !== "" &&
      Number.isFinite(latInicial) &&
      Number.isFinite(lonInicial) &&
      Math.abs(latInicial) <= 90 &&
      Math.abs(lonInicial) <= 180;
    const posicion = tieneCoordenadasIniciales
      ? [latInicial, lonInicial]
      : [-9.19, -75.015];
    const zoomInicial = tieneCoordenadasIniciales ? 16 : 6;
    const mapa = window.L.map(mapaElemento, { maxZoom: 23, zoomSnap: 0.5 })
      .setView(posicion, zoomInicial);
    const capaCalles = window.L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxNativeZoom: 18,
        maxZoom: 23,
      },
    );
    const capaSatelital = window.L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        attribution:
          "Tiles &copy; Esri, Vantor, Earthstar Geographics, and the GIS User Community",
        maxZoom: 23,
      },
    );
    capaSatelital.addTo(mapa);
    let mostrarSatelite = true;
    if (botonCapaMapa) {
      botonCapaMapa.addEventListener("click", () => {
        mostrarSatelite = !mostrarSatelite;
        const capa = mostrarSatelite ? capaSatelital : capaCalles;
        const capaAnterior = mostrarSatelite ? capaCalles : capaSatelital;
        mapa.removeLayer(capaAnterior);
        capa.addTo(mapa);
        botonCapaMapa.textContent = mostrarSatelite
          ? botonCapaMapa.dataset.mostrarCalles
          : botonCapaMapa.dataset.mostrarSatelite;
        botonCapaMapa.setAttribute("aria-pressed", String(mostrarSatelite));
      });
    }

    const marcador = window.L.marker(posicion, { draggable: true }).addTo(mapa);
    let puntosTerreno = [];
    let marcadoresVertices = [];
    let capaTerreno = null;
    let modoTrazado = false;
    let areaAntesDelTrazo = "";
    const estiloLineaTerreno = {
      color: "var(--marca)",
      weight: 5,
      opacity: 1,
      lineCap: "round",
      lineJoin: "round",
      bubblingMouseEvents: false,
    };
    const estiloPoligonoTerreno = {
      ...estiloLineaTerreno,
      fillColor: "var(--marca)",
      fillOpacity: 0.22,
    };
    const estiloVertice = {
      radius: 6,
      color: "var(--superficie)",
      weight: 2,
      fillColor: "var(--marca)",
      fillOpacity: 1,
      bubblingMouseEvents: false,
    };

    function actualizarControlesTerreno() {
      if (botonDibujarTerreno) {
        botonDibujarTerreno.disabled = modoTrazado || puntosTerreno.length > 0;
        botonDibujarTerreno.setAttribute("aria-pressed", String(modoTrazado));
      }
      if (botonFinalizarTerreno) {
        botonFinalizarTerreno.disabled =
          !modoTrazado || puntosTerreno.length < 3;
      }
      if (botonBorrarTerreno) {
        botonBorrarTerreno.disabled = puntosTerreno.length === 0;
      }
    }

    function actualizarCapaTerreno() {
      if (capaTerreno) mapa.removeLayer(capaTerreno);
      marcadoresVertices.forEach((vertice) => mapa.removeLayer(vertice));
      marcadoresVertices = [];

      if (puntosTerreno.length > 1) {
        capaTerreno =
          puntosTerreno.length > 2
            ? window.L.polygon(puntosTerreno, estiloPoligonoTerreno)
            : window.L.polyline(puntosTerreno, estiloLineaTerreno);
        capaTerreno.addTo(mapa);
      } else {
        capaTerreno = null;
      }
      puntosTerreno.forEach((punto) => {
        marcadoresVertices.push(
          window.L.circleMarker(punto, estiloVertice).addTo(mapa),
        );
      });
      actualizarControlesTerreno();
    }

    function calcularAreaHectareas(puntos) {
      const radioTierra = 6378137;
      let suma = 0;
      puntos.forEach((punto, indice) => {
        const siguiente = puntos[(indice + 1) % puntos.length];
        const latitudActual = (punto.lat * Math.PI) / 180;
        const latitudSiguiente = (siguiente.lat * Math.PI) / 180;
        const diferenciaLongitud = ((siguiente.lng - punto.lng) * Math.PI) / 180;
        suma +=
          diferenciaLongitud *
          (2 + Math.sin(latitudActual) + Math.sin(latitudSiguiente));
      });
      return (Math.abs(suma * radioTierra * radioTierra) / 2) / 10000;
    }

    if (botonDibujarTerreno && estadoTerreno) {
      botonDibujarTerreno.addEventListener("click", () => {
        modoTrazado = true;
        areaAntesDelTrazo = areaTerreno.value;
        estadoTerreno.textContent = estadoTerreno.dataset.dibujando;
        actualizarControlesTerreno();
      });
    }
    if (botonFinalizarTerreno && estadoTerreno) {
      botonFinalizarTerreno.addEventListener("click", () => {
        if (puntosTerreno.length < 3) {
          estadoTerreno.textContent = estadoTerreno.dataset.pocosPuntos;
          return;
        }
        const hectareas = Number(calcularAreaHectareas(puntosTerreno).toFixed(2));
        if (!Number.isFinite(hectareas) || hectareas <= 0 || hectareas > 10000) {
          estadoTerreno.textContent = estadoTerreno.dataset.areaInvalida;
          return;
        }
        const centro = puntosTerreno.reduce(
          (total, punto) => ({
            lat: total.lat + punto.lat / puntosTerreno.length,
            lng: total.lng + punto.lng / puntosTerreno.length,
          }),
          { lat: 0, lng: 0 },
        );
        areaTerreno.value = hectareas.toFixed(2);
        marcador.setLatLng(centro);
        if (capaTerreno) {
          mapa.fitBounds(capaTerreno.getBounds(), {
            padding: [32, 32],
            maxZoom: 19,
          });
        } else {
          mapa.setView(centro, 17);
        }
        actualizarCoordenadas(centro);
        modoTrazado = false;
        estadoTerreno.textContent = estadoTerreno.dataset.areaCalculada.replace(
          "{area}",
          hectareas.toFixed(2),
        );
        actualizarControlesTerreno();
      });
    }
    if (botonBorrarTerreno && estadoTerreno) {
      botonBorrarTerreno.addEventListener("click", () => {
        if (capaTerreno) mapa.removeLayer(capaTerreno);
        marcadoresVertices.forEach((vertice) => mapa.removeLayer(vertice));
        puntosTerreno = [];
        marcadoresVertices = [];
        capaTerreno = null;
        modoTrazado = false;
        areaTerreno.value = areaAntesDelTrazo;
        estadoTerreno.textContent = estadoTerreno.dataset.limpiar;
        actualizarControlesTerreno();
      });
    }

    function actualizarCoordenadas(punto) {
      latitud.value = punto.lat.toFixed(6);
      longitud.value = punto.lng.toFixed(6);
      estimarAltitudDesdeCoordenadas();
    }
    mapa.on("click", (evento) => {
      if (modoTrazado) {
        puntosTerreno.push(evento.latlng);
        actualizarCapaTerreno();
        return;
      }
      marcador.setLatLng(evento.latlng);
      actualizarCoordenadas(evento.latlng);
    });
    marcador.on("dragend", () => actualizarCoordenadas(marcador.getLatLng()));
    actualizarControlesTerreno();
    if (botonUbicacion && estadoUbicacion) {
      botonUbicacion.addEventListener("click", () => {
        if (!navigator.geolocation) {
          estadoUbicacion.textContent = estadoUbicacion.dataset.noSoportada;
          return;
        }

        botonUbicacion.disabled = true;
        estadoUbicacion.textContent = estadoUbicacion.dataset.solicitando;
        navigator.geolocation.getCurrentPosition(
          (resultado) => {
            const punto = {
              lat: resultado.coords.latitude,
              lng: resultado.coords.longitude,
            };
            if (
              !Number.isFinite(punto.lat) ||
              !Number.isFinite(punto.lng) ||
              Math.abs(punto.lat) > 90 ||
              Math.abs(punto.lng) > 180
            ) {
              estadoUbicacion.textContent =
                estadoUbicacion.dataset.noDisponible;
              botonUbicacion.disabled = false;
              return;
            }

            marcador.setLatLng(punto);
            actualizarCoordenadas(punto);
            mapa.setView(punto, 17);
            estadoUbicacion.textContent = estadoUbicacion.dataset.seleccionada;
            botonUbicacion.disabled = false;
          },
          (error) => {
            estadoUbicacion.textContent =
              error.code === 1
                ? estadoUbicacion.dataset.permisoDenegado
                : error.code === 3
                  ? estadoUbicacion.dataset.tiempoAgotado
                  : estadoUbicacion.dataset.noDisponible;
            botonUbicacion.disabled = false;
          },
          { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 },
        );
      });
    }
    [latitud, longitud].forEach((campo) => {
      campo.addEventListener("change", () => {
        const nuevaLatitud = Number(latitud.value);
        const nuevaLongitud = Number(longitud.value);
        if (
          Number.isFinite(nuevaLatitud) &&
          Number.isFinite(nuevaLongitud) &&
          Math.abs(nuevaLatitud) <= 90 &&
          Math.abs(nuevaLongitud) <= 180
        ) {
          const punto = [nuevaLatitud, nuevaLongitud];
          marcador.setLatLng(punto);
          mapa.setView(punto, 16);
          estimarAltitudDesdeCoordenadas();
        }
      });
    });
  }

  if (botonAltitud) {
    botonAltitud.addEventListener("click", estimarAltitudDesdeCoordenadas);
  }

  sugerirZona();
})();

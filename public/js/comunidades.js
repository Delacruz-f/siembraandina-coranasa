(() => {
  const elemento = document.getElementById("mapa-comunidades");
  if (!elemento) return;
  if (!window.L) {
    elemento.textContent = "No se pudo cargar el mapa. Consulta la lista de comunidades debajo.";
    return;
  }

  let comunidades;
  try {
    comunidades = JSON.parse(elemento.dataset.comunidades);
  } catch {
    elemento.textContent = "No se pudieron leer las ubicaciones. Consulta la lista de comunidades debajo.";
    return;
  }
  if (!Array.isArray(comunidades) || comunidades.length === 0) {
    elemento.textContent = "No hay ubicaciones disponibles para el mapa.";
    return;
  }

  const mapa = window.L.map(elemento, { scrollWheelZoom: false });
  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(mapa);

  const limites = [];
  const iconoComunidad = window.L.icon({
    iconUrl: "/vendor/leaflet/images/marker-icon.png",
    iconRetinaUrl: "/vendor/leaflet/images/marker-icon-2x.png",
    shadowUrl: "/vendor/leaflet/images/marker-shadow.png",
    iconSize: [44, 72],
    iconAnchor: [22, 72],
    popupAnchor: [1, -62],
    shadowSize: [72, 72],
  });
  for (const comunidad of comunidades) {
    if (
      !Number.isFinite(comunidad.latitud) ||
      !Number.isFinite(comunidad.longitud)
    ) continue;
    const marcador = window.L.marker([comunidad.latitud, comunidad.longitud], {
      title: comunidad.nombre,
      alt: `Ubicación de ${comunidad.nombre}`,
      icon: iconoComunidad,
    }).addTo(mapa);
    const contenido = document.createElement("div");
    const titulo = document.createElement("strong");
    titulo.textContent = comunidad.nombre;
    const ubicacion = document.createElement("p");
    ubicacion.textContent = comunidad.ubicacion;
    contenido.append(titulo, ubicacion);
    marcador.bindPopup(contenido);
    limites.push([comunidad.latitud, comunidad.longitud]);
  }

  if (limites.length === 1) {
    mapa.setView(limites[0], 10);
  } else if (limites.length > 1) {
    mapa.fitBounds(limites, { padding: [24, 24], maxZoom: 10 });
  } else {
    mapa.setView([-13.5, -71.9], 6);
  }
})();

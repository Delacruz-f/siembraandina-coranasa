// Service worker de Siembra Andina (Fase 12).
// Estrategias:
//  - Navegaciones (HTML): red primero; si falla por falta de señal, caché y,
//    como último recurso, /sin-conexion, que muestra el último calendario
//    consultado (guardado por public/js/pwa.js en localStorage).
//  - Estáticos propios (CSS, JS, fuentes, íconos): caché primero.
//  - Imágenes /media/*: caché con actualización en segundo plano.
// Nunca se cachean respuestas privadas, de sesión ni de la API autenticada.
const VERSION = "siembra-v4";
const CACHE_ESTATICOS = `${VERSION}-estaticos`;
const CACHE_PAGINAS = `${VERSION}-paginas`;
const CACHE_IMAGENES = `${VERSION}-imagenes`;

const PAGINAS_PUBLICAS = [
  "/",
  "/consulta",
  "/calendario",
  "/monitor",
  "/siembras",
  "/cultivos",
  "/saberes",
  "/comunidades",
  "/sobre",
];
const ESTATICOS = [
  "/css/tokens.css",
  "/css/base.css",
  "/css/components.css",
  "/css/utilities.css",
  "/css/publico.css",
  "/css/imagenes.css",
  "/js/publico.js",
  "/js/consulta-publica.js",
  "/js/monitor-publico.js",
  "/js/siembras-publicas.js",
  "/js/interacciones.js",
  "/js/galeria.js",
  "/img/favicon.svg",
  "/img/pwa/icono-192.png",
  "/img/pwa/icono-512.png",
  "/sin-conexion",
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_ESTATICOS);
      // addAll falla entero si un recurso responde mal: se agregan uno a uno.
      await Promise.all(
        ESTATICOS.map((url) => cache.add(url).catch(() => undefined)),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    (async () => {
      const claves = await caches.keys();
      await Promise.all(
        claves
          .filter((clave) => !clave.startsWith(VERSION))
          .map((clave) => caches.delete(clave)),
      );
      await self.clients.claim();
    })(),
  );
});

function esNavegacion(peticion) {
  return peticion.mode === "navigate";
}

function esPrivada(url) {
  return (
    url.pathname.startsWith("/panel") ||
    url.pathname.startsWith("/admin") ||
    url.pathname.startsWith("/editor") ||
    url.pathname.startsWith("/tecnico") ||
    url.pathname.startsWith("/perfil") ||
    url.pathname.startsWith("/notificaciones") ||
    url.pathname.startsWith("/media/privadas") ||
    url.pathname.startsWith("/archivos") ||
    url.pathname.startsWith("/api/")
  );
}

async function redPrimero(peticion) {
  const cache = await caches.open(CACHE_PAGINAS);
  try {
    const respuesta = await fetch(peticion);
    if (respuesta && respuesta.ok && peticion.method === "GET") {
      cache.put(peticion, respuesta.clone());
    }
    return respuesta;
  } catch {
    const guardada = await cache.match(peticion, { ignoreSearch: true });
    if (guardada) return guardada;
    const offline = await caches.match("/sin-conexion");
    if (offline) return offline;
    return new Response("Sin conexión", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

async function cachePrimero(peticion, nombreCache) {
  const cache = await caches.open(nombreCache);
  const guardada = await cache.match(peticion);
  if (guardada) return guardada;
  const respuesta = await fetch(peticion);
  if (respuesta && respuesta.ok) cache.put(peticion, respuesta.clone());
  return respuesta;
}

self.addEventListener("fetch", (evento) => {
  const peticion = evento.request;
  if (peticion.method !== "GET") return;

  const url = new URL(peticion.url);
  if (url.origin !== self.location.origin) return;
  if (esPrivada(url)) return;

  if (esNavegacion(peticion)) {
    evento.respondWith(redPrimero(peticion));
    return;
  }

  if (url.pathname === "/vendor/chartjs/chart.umd.js") {
    evento.respondWith(cachePrimero(peticion, CACHE_ESTATICOS));
    return;
  }

  if (
    url.pathname.startsWith("/vendor/") ||
    url.pathname.startsWith("/fonts/")
  ) {
    return;
  }

  if (/\.(css|js|woff2?|ttf)$/.test(url.pathname)) {
    evento.respondWith(cachePrimero(peticion, CACHE_ESTATICOS));
    return;
  }

  if (
    url.pathname.startsWith("/media/imagenes/") ||
    /\.(png|jpe?g|webp|svg)$/.test(url.pathname)
  ) {
    evento.respondWith(cachePrimero(peticion, CACHE_IMAGENES));
  }
});

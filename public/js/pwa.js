// Registro de la PWA y "último calendario consultado" (Fase 12).
// - Registra el service worker (con caché de páginas públicas).
// - Avisa cuando no hay conexión con un banner discreto.
// - En /calendario guarda un resumen legible del resultado en localStorage
//   para que /sin-conexion pueda mostrarlo sin red.
(function () {
  const AVISO_CLAVE = "siembra.ultimoCalendario";

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Sin service worker la app sigue funcionando, solo pierde el modo offline.
      });
    });
  }

  // Banner de conexión: aparece y desaparece sin recargar.
  const banner = document.createElement("div");
  banner.className = "aviso-conexion";
  banner.setAttribute("role", "status");
  banner.setAttribute("aria-live", "polite");
  banner.hidden = true;
  banner.textContent =
    document.documentElement.lang === "qu"
      ? "Mana internet kanchu"
      : "Sin conexión: estás viendo contenido guardado.";
  document.body.insertBefore(banner, document.body.firstChild);

  const sincronizarConexion = () => {
    banner.hidden = navigator.onLine;
  };
  window.addEventListener("online", sincronizarConexion);
  window.addEventListener("offline", sincronizarConexion);
  sincronizarConexion();

  // Resumen del calendario para el modo sin conexión.
  const datos = document.getElementById("datos-calendario");
  if (!datos) return;
  try {
    const resumen = JSON.parse(datos.textContent || "{}");
    localStorage.setItem(
      AVISO_CLAVE,
      JSON.stringify({
        fecha: new Date().toLocaleDateString("es-PE"),
        url: window.location.pathname + window.location.search,
        ...resumen,
      }),
    );
  } catch {
    // Si el JSON no es válido no se guarda nada; la página sigue funcionando.
  }
})();

// Pruebas unitarias del cliente HTTP de fuentes externas (Fase 11).
// Cubren caché, deduplicación de solicitudes, reintentos y errores de red.
const {
  solicitarJson,
  limpiarCache,
  coordenadaRedondeada,
  claveCoordenadas,
  ErrorHttpFuente,
} = require("../src/services/fuentesDatos/clienteHttp");

function respuestaJson(valor, estado = 200) {
  return {
    ok: estado >= 200 && estado < 300,
    status: estado,
    json: async () => valor,
  };
}

beforeEach(() => {
  limpiarCache();
});

describe("Utilidades de coordenadas", () => {
  test("redondea a dos decimales", () => {
    expect(coordenadaRedondeada("-13.4567")).toBe(-13.46);
  });

  test("rechaza valores no numéricos", () => {
    expect(() => coordenadaRedondeada("norte")).toThrow(TypeError);
  });

  test("la clave usa coordenadas redondeadas y un sufijo", () => {
    expect(claveCoordenadas("nasa", -13.4567, -72.1134, "2025-01")).toBe(
      "nasa:-13.46,-72.11:2025-01",
    );
  });
});

describe("solicitarJson", () => {
  test("devuelve el JSON de una respuesta correcta", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(respuestaJson({ ok: true }));
    await expect(
      solicitarJson("https://api.ejemplo/x", { fetchImpl }),
    ).resolves.toEqual({ ok: true });
  });

  test("reutiliza la caché mientras no expira", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(respuestaJson({ n: 1 }));
    await solicitarJson("https://api.ejemplo/x", {
      fetchImpl,
      cacheKey: "clave",
      cacheTtlMs: 60000,
    });
    await solicitarJson("https://api.ejemplo/x", {
      fetchImpl,
      cacheKey: "clave",
      cacheTtlMs: 60000,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("vuelve a consultar si la caché expiró", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(respuestaJson({ n: 1 }));
    await solicitarJson("https://api.ejemplo/x", {
      fetchImpl,
      cacheKey: "clave",
      cacheTtlMs: 1,
    });
    await new Promise((resolver) => setTimeout(resolver, 10));
    await solicitarJson("https://api.ejemplo/x", {
      fetchImpl,
      cacheKey: "clave",
      cacheTtlMs: 1,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("deduplica solicitudes simultáneas con la misma clave", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(respuestaJson({ n: 2 }));
    const [a, b] = await Promise.all([
      solicitarJson("https://api.ejemplo/x", { fetchImpl, cacheKey: "k" }),
      solicitarJson("https://api.ejemplo/x", { fetchImpl, cacheKey: "k" }),
    ]);
    expect(a).toEqual(b);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("reintenta los errores 5xx y termina bien", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(respuestaJson(null, 503))
      .mockResolvedValueOnce(respuestaJson({ ok: true }));
    await expect(
      solicitarJson("https://api.ejemplo/x", {
        fetchImpl,
        reintentos: 2,
        pausaInicialMs: 1,
      }),
    ).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("no reintenta un 404: falla de inmediato", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(respuestaJson(null, 404));
    await expect(
      solicitarJson("https://api.ejemplo/x", { fetchImpl, reintentos: 3 }),
    ).rejects.toBeInstanceOf(ErrorHttpFuente);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("reintenta el 429 y luego falla con el último error", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(respuestaJson(null, 429));
    await expect(
      solicitarJson("https://api.ejemplo/x", {
        fetchImpl,
        reintentos: 1,
        pausaInicialMs: 1,
      }),
    ).rejects.toMatchObject({ estado: 429 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("propaga errores de red tras agotar los reintentos", async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error("ECONNRESET"));
    await expect(
      solicitarJson("https://api.ejemplo/x", {
        fetchImpl,
        reintentos: 1,
        pausaInicialMs: 1,
      }),
    ).rejects.toThrow("ECONNRESET");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("exige un runtime con fetch", async () => {
    await expect(
      solicitarJson("https://api.ejemplo/x", { fetchImpl: undefined }),
    ).rejects.toThrow(/fetch/);
  });
});

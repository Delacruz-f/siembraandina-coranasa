# Hoja de ruta propuesta — Siembra Andina

Prioridades pensadas para comunidades con poca señal y presupuesto limitado. Cada línea indica el
valor para la comunidad, el esfuerzo técnico y de qué depende.

## 1. Integración SMAP (NASA Soil Moisture) — _primera_

**Valor.** Hoy la humedad viene de la NASA POWER (rejilla gruesa) y de lecturas manuales. SMAP
aporta humedad superficial (~9 km) con actualización de días y permite mostrar una referencia
satelital entre visitas de campo.

**Esfuerzo.** Medio. El adaptador ya está previsto en `src/services/fuentesDatos`
(`EARTHDATA_USER`/`EARTHDATA_TOKEN`). Requiere Earthdata Login, caché por coordenada/día (ya
existe en `clienteHttp.js`) y una pantalla de "fuente satelital" junto a la lectura manual.

**Depende de.** Credenciales de NASA Earthdata y validar en campo si el dato representa la zona.

## 2. Notificaciones por WhatsApp o SMS — _segunda_

**Valor.** El agricultor no revisa el panel a diario; una alerta de helada o humedad baja por
WhatsApp/ SMS llega donde está. Es el canal con mayor adopción real en la sierra.

**Esfuerzo.** Medio. Se puede empezar con **Twilio** (WhatsApp Business API) o un BSP local
(Meta Cloud API + proveedor peruano). El sistema de alertas ya genera `alerta_parcela`; falta una
preferencia por canal y un "enviador" con plantillas aprobadas.

**Depende de.** Número verificado, plantillas aprobadas por Meta, costo por mensaje (evaluar
subsidio o convenio con la municipalidad).

## 3. Sensores IoT de bajo costo — _tercera_

**Valor.** Lecturas automáticas cada hora sin depender de la visita del técnico. Un nodo con
ESP32 + sensor capacitivo de humedad + sonda DS18B20 cuesta del orden de USD 25–40.

**Esfuerzo.** Alto. Hace falta:

- protocolo de ingesta (`POST /api/v1/lecturas` con token por dispositivo),
- tabla `dispositivos` (parcela, clave, última conexión, batería),
- tolerancia a cortes de red y reloj del nodo,
- validación de datos (rango, duplicados por hora) reutilizando `lecturas.service`.

**Depende de.** Piloto con 2–3 comunidades; mantenimiento y capacitación local.

## 4. Panel para municipalidades y ONG — _cuarta_

**Valor.** Agregados por distrito: campañas activas, alertas emitidas, consultas atendidas por el
técnico, superficie sembrada por cultivo. Sirve para justificar proyectos y planificar apoyo.

**Esfuerzo.** Medio-alto. Nuevo rol `gestor_territorial`, permisos por distrito, consultas
agregadas (`repositories`) y una vista con gráficos Chart.js locales. **Solo datos agregados**: nunca
coordenadas exactas ni fotos de parcelas individuales.

**Depende de.** Definir con las municipalidades qué indicadores necesitan y firmar acuerdos de uso.

## 5. Reportes PDF por campaña — _quinta_

**Valor.** Un técnico o una familia puede imprimir el resumen de la campaña (siembras, cosechas,
lecturas, comparación con la ventana tradicional) para llevarlo a una reunión o a una oficina.

**Esfuerzo.** Bajo-medio. Generación en el servidor (por ejemplo con `pdfkit`) en un trabajo de
cola, sobre los datos de `campanias.service.detalle`. Incluir la marca, la fuente de los rangos y la
advertencia de que son referenciales.

**Depende de.** Fuente disponible fuera de línea y prueba de impresión en una impresora local.

---

## Orden sugerido y dependencias

```
SMAP ─────────┐
              ├─► Alertas WhatsApp/SMS ──► Sensores IoT ──► Reportes PDF
Panel ONG ────┘
```

- Empezar por **SMAP** y **WhatsApp**: bajo costo de infraestructura y valor inmediato.
- **Sensores** después de tener un protocolo de ingesta probado con un piloto.
- **Panel ONG** en paralelo si hay una municipalidad interesada (financia el resto).
- **PDF** en cualquier momento: es el más barato y aporta visibilidad.

## Fuera de alcance por ahora

- Pagos o comercio dentro de la plataforma.
- Aplicación nativa iOS/Android: la PWA y la API v1 cubren el caso de uso.
- Modelos de recomendación con aprendizaje automático: primero una base de datos de campo amplia y
  validada por técnicos.

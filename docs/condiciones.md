# Condiciones y recomendación de siembra

La tarjeta de condiciones reúne lecturas manuales del agricultor y las fuentes
automáticas disponibles para una parcela. Los valores consolidados se calculan
al consultar la página; no se guardan como nuevas lecturas.

## Consolidación

- Una lectura manual de las últimas 48 horas es la principal. Las fuentes
  automáticas se muestran como contraste.
- Sin una lectura manual reciente, se comparan las fuentes automáticas cuya
  fecha no difiere más de un día. Si hay varias, el valor mostrado es su
  promedio.
- Dos o más fuentes coinciden cuando la diferencia entre sus valores no supera
  5 puntos porcentuales de humedad o 3 °C. La confianza es alta cuando
  coinciden y baja cuando difieren; el rango muestra el mínimo y el máximo.
- Una sola fuente automática implica confianza media. Si no hay lecturas, se
  indica que no hay datos.
- La vigencia manual, las tolerancias de humedad y temperatura, y los
  umbrales del pronóstico se leen de la tabla `configuraciones`.

## Pronóstico y recomendación

Open-Meteo aporta la temperatura mínima diaria, la precipitación y la humedad
pronosticada del suelo para los próximos siete días. Los umbrales referenciales
son:

- Riesgo de helada: temperatura mínima de 2 °C o menos.
- Helada: temperatura mínima de 0 °C o menos.
- Lluvia significativa: 5 mm o más en el día.

Estos tres umbrales se guardan con `validado: false`; deben validarse con
conocimiento agronómico local. Si el suelo está por debajo del rango ideal y se
espera lluvia significativa en las siguientes 48 horas, la recomendación es
esperar la lluvia. Un riesgo de helada previsto en los próximos tres días
también indica esperar. La confianza baja impide recomendar «Siembra ahora».

La mejor ventana es el periodo más largo de días consecutivos dentro de los
próximos siete en que no se pronostica riesgo de helada y la humedad esperada
está dentro del rango ideal del cultivo.

## Alcance y cautela

La información automática es una **estimación regional**, no una medición en la
chacra. En particular, los datos de NASA POWER son estimaciones derivadas de
productos satelitales/modelados y no equivalen a una lectura directa de humedad
volumétrica o temperatura a profundidad. Open-Meteo también ofrece estimaciones
para la ubicación seleccionada. La medición manual reciente tiene prioridad,
pero conviene contrastar la recomendación con la experiencia de la comunidad o
un agrónomo. Si falla una fuente, las restantes siguen utilizándose; si falta el
pronóstico, la aplicación no presenta la recomendación como segura.

Fuentes mostradas cuando hay datos disponibles: medición propia, Open-Meteo y
NASA POWER. Agromonitoring se muestra solamente si existe una lectura de esa
fuente; no se requiere para que funcione la consolidación.

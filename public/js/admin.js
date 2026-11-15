document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.querySelector("[data-admin-roles]");
  if (!canvas || !window.Chart) return;

  const filas = JSON.parse(canvas.dataset.adminRoles || "[]");
  const total = filas.reduce((s, f) => s + f.total, 0);

  // Paleta profesional que combina con el tema del sitio.
  const colores = [
    "#3f6b3a", // verde marca
    "#d9a52b", // maíz
    "#5b8fb9", // azul suave
    "#b4472f", // teja
    "#7c6dab", // lavanda
    "#2a9d8f", // turquesa
    "#e07b53", // coral
    "#6b8f5e", // verde hoja
  ];

  const colorFondo = getComputedStyle(document.documentElement)
    .getPropertyValue("--superficie")
    .trim() || "#232e28";

  new window.Chart(canvas, {
    type: "doughnut",
    data: {
      labels: filas.map((f) => f.nombre),
      datasets: [
        {
          data: filas.map((f) => f.total),
          backgroundColor: filas.map((_, i) => colores[i % colores.length]),
          borderColor: colorFondo,
          borderWidth: 3,
          hoverOffset: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: "68%",
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(29, 36, 51, 0.92)",
          titleFont: { weight: "bold", size: 13 },
          bodyFont: { size: 12 },
          cornerRadius: 8,
          padding: 10,
          callbacks: {
            label: (ctx) => {
              const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
              return ` ${ctx.raw} usuario(s) — ${pct}%`;
            },
          },
        },
      },
      animation: { animateRotate: true, duration: 600 },
    },
    plugins: [
      {
        // Texto central: total de usuarios.
        id: "centroDoughnut",
        afterDraw(chart) {
          const { ctx, chartArea } = chart;
          const cx = (chartArea.left + chartArea.right) / 2;
          const cy = (chartArea.top + chartArea.bottom) / 2;
          const estiloTexto = getComputedStyle(document.documentElement)
            .getPropertyValue("--texto")
            .trim() || "#f1f3eb";
          const estiloSecundario = getComputedStyle(document.documentElement)
            .getPropertyValue("--texto-secundario")
            .trim() || "#c1ccc2";

          ctx.save();
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          ctx.font = "bold 1.6rem Manrope, sans-serif";
          ctx.fillStyle = estiloTexto;
          ctx.fillText(total, cx, cy - 8);

          ctx.font = "600 0.7rem Manrope, sans-serif";
          ctx.fillStyle = estiloSecundario;
          ctx.fillText("usuarios", cx, cy + 14);
          ctx.restore();
        },
      },
    ],
  });

  // Leyenda personalizada.
  const contenedor = document.getElementById("leyenda-roles");
  if (!contenedor) return;

  filas.forEach((f, i) => {
    const pct = total > 0 ? ((f.total / total) * 100).toFixed(0) : 0;
    const li = document.createElement("li");
    li.className = "grafico-roles__item";
    li.innerHTML =
      `<span class="grafico-roles__color" style="background:${colores[i % colores.length]}"></span>` +
      `<span class="grafico-roles__nombre">${f.nombre}</span>` +
      `<span class="grafico-roles__valor">${f.total}</span>` +
      `<span class="grafico-roles__pct">${pct}%</span>`;
    contenedor.appendChild(li);
  });
});

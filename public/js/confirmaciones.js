document.addEventListener("submit", (evento) => {
  const formulario = evento.target.closest("[data-confirmar]");
  if (!formulario) return;
  if (!window.confirm(formulario.dataset.confirmar)) evento.preventDefault();
});

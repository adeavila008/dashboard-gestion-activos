/* =========================================================================
   18. BOOTSTRAP DE LA APLICACION
   ========================================================================= */

function initApp() {
  STATE.ib.rows = loadDefaultIBReport();
  STATE.baseline.rows = loadDefaultBaseline();
  STATE.wip = loadDefaultWip();
  STATE.facturacion = loadDefaultFacturacion();

  wireNav();
  wireModal();
  wireUploads();
  wireFinancieroFilters();
  wireTransactionsPager();
  wireProjectToggle();
  wireSaludFilters();
  wireWipFilters();
  wireAnalisisFilters();

  populateFinancieroFilterOptions();
  populateSaludFilterOptions();
  populateAnalisisFilterOptions();

  renderHomeStats();
  updateBadgePeriod();

  // El boton "Actualizar" de Financiero recarga la pagina para traer la
  // ultima version publicada (necesita una recarga real, no solo re-render,
  // para asegurar que trae JS/datos frescos y no una copia en cache) -- pero
  // NO debe mandar al usuario de vuelta a "Inicio": si la URL trae
  // "?view=financiero" (o cualquier otra vista valida), abrimos ESA vista en
  // vez de la de por defecto, para que quede como si "se hubiera quedado
  // ahi mismo".
  const viewParam = new URLSearchParams(window.location.search).get("view");
  switchView(VIEW_META[viewParam] ? viewParam : "inicio");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

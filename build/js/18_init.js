/* =========================================================================
   18. BOOTSTRAP DE LA APLICACION
   ========================================================================= */

function initApp() {
  STATE.ib.rows = loadDefaultIBReport();
  STATE.baseline.rows = loadDefaultBaseline();

  wireNav();
  wireModal();
  wireUploads();
  wireFinancieroFilters();
  wireTransactionsPager();
  wireProjectToggle();
  wireSaludFilters();

  populateFinancieroFilterOptions();
  populateSaludFilterOptions();

  renderHomeStats();
  updateBadgePeriod();
  switchView("inicio");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

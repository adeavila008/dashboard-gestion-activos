/* =========================================================================
   17. NAVEGACION, HOME Y ORQUESTADOR DE RENDER
   ========================================================================= */

const VIEW_META = {
  inicio: { title: "Inicio", sub: CFG.direccionLabel },
  financiero: { title: "Financiero", sub: "Análisis de costos e ingresos — " + CFG.direccionLabel },
  salud: { title: "Salud de Proyectos", sub: "CPI, SPI y Curva S — " + CFG.direccionLabel },
  wip: { title: "WIP y Facturación", sub: "Provisión de ingresos y proyección de facturación — " + CFG.direccionLabel },
};

function switchView(view) {
  STATE.view = view;
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById("view-" + view).classList.add("active");
  document.querySelectorAll(".nav-item[data-view]").forEach(n => n.classList.toggle("active", n.dataset.view === view));
  document.getElementById("topbar-title").textContent = VIEW_META[view].title;
  document.getElementById("topbar-sub").textContent = VIEW_META[view].sub;
  if (view === "financiero") renderFinanciero();
  if (view === "salud") renderSalud();
  if (view === "wip") renderWip();
  if (view === "inicio") renderHomeStats();
}

function updateBadgePeriod() {
  const rows = STATE.ib.rows;
  const badge = document.getElementById("badge-period");
  if (!rows.length) { badge.textContent = "— sin datos —"; return; }
  const periodos = rows.map(r => r.periodo).sort((a, b) => a - b);
  badge.textContent = periodoToLabel(periodos[0]) + " – " + periodoToLabel(periodos[periodos.length - 1]) + " · " + rows.length.toLocaleString("es-CO") + " registros";
}

function renderHomeStats() {
  const rows = STATE.ib.rows;
  const kpi = computeFinancieroKPIs(rows);
  const proyectos = getProjectAggregates().filter(p => p.activo && !p.isOverhead);
  const wrap = document.getElementById("home-stats");
  wrap.innerHTML = `
    <div class="mini-stat"><div class="l">Proyectos activos</div><div class="v">${proyectos.length}</div></div>
    <div class="mini-stat"><div class="l">Margen acumulado</div><div class="v" style="color:${kpi.margen >= 0 ? "var(--success)" : "var(--danger)"}">${fmtPct(kpi.margenPct)}</div></div>
    <div class="mini-stat"><div class="l">Costos totales</div><div class="v">${fmtCompact(kpi.costos)}</div></div>`;

  const tags = document.getElementById("hero-tags");
  tags.innerHTML = `
    <span class="tag">📊 Financiero: ${STATE.ib.source === "upload" ? escapeHtml(STATE.ib.fileName) : "dataset de ejemplo"}</span>
    <span class="tag">🩺 Líneas base: ${STATE.baseline.source === "upload" ? escapeHtml(STATE.baseline.fileName) : "dataset de ejemplo"}</span>`;
}

function renderFinanciero(opts) {
  opts = opts || {};
  const rows = getFilteredIBRows();
  if (!opts.skipHeavy) {
    renderFinancieroKPIs(rows);
    renderCostoCategorias(rows);
    renderChartTrend();
    renderChartCuentaMayor(rows);
    renderChartMargen();
    renderChartPersonal(rows);
    renderChartIngresos(rows);
    renderChartTopCuentas(rows);
    renderPersonalTable(rows);
    renderMatrix(getFilteredIBRows({ ignoreMes: true }));
    renderProjects();
  }
  renderTransactionsTable(rows);
  updateBadgePeriod();
}

function wireNav() {
  document.querySelectorAll(".nav-item[data-view]").forEach(item => {
    item.addEventListener("click", () => switchView(item.dataset.view));
  });
  document.querySelectorAll(".module-card[data-goto]").forEach(card => {
    card.addEventListener("click", () => switchView(card.dataset.goto));
  });
  document.getElementById("btn-collapse").addEventListener("click", () => {
    STATE.sidebarCollapsed = !STATE.sidebarCollapsed;
    document.getElementById("sidebar").classList.toggle("collapsed", STATE.sidebarCollapsed);
  });
  document.getElementById("btn-report").addEventListener("click", () => openReportConfigModal());

  document.querySelectorAll(".icon-btn[data-expand]").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.expand;
      if (target === "matrix-costos") openMatrixExpandModal();
      else openChartExpandModal(target);
    });
  });

  wireRefreshPublished();
}

/**
 * Boton "Actualizar" del modulo Financiero: el dashboard es una pagina
 * ESTATICA en GitHub Pages (sin servidor propio), asi que este boton NO
 * puede disparar la extraccion/publicacion de datos por si solo -- eso
 * sigue siendo algo que hay que pedirle a Claude por chat (ver skill
 * "actualizar-dashboard-ga"). Lo que SI puede (y vale la pena) hacer es
 * forzar al navegador a traer la version MAS RECIENTE ya publicada,
 * saltandose cualquier copia vieja que haya quedado en cache -- por eso el
 * cache-busting con un parametro unico en la URL.
 */
function wireRefreshPublished() {
  const btn = document.getElementById("btn-refresh-published");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const usoDatosPropios = STATE.ib.source === "upload" || STATE.baseline.source === "upload";
    if (usoDatosPropios) {
      const ok = window.confirm("Vas a recargar la última versión publicada del dashboard. Esto reemplaza el Excel que cargaste manualmente en esta sesión (no se guarda). ¿Continuar?");
      if (!ok) return;
    }
    showToast("Actualizando", "Cargando la última versión publicada del dashboard…", "info");
    const url = new URL(window.location.href);
    url.searchParams.set("v", Date.now().toString());
    setTimeout(() => { window.location.href = url.toString(); }, 300);
  });
}

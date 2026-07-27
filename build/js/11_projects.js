/* =========================================================================
   11. GESTION DE PROYECTOS
   ========================================================================= */

function getProjectAggregates() {
  const registry = window.__PROJECTS_REGISTRY__ || [];
  const registryByCode = new Map(registry.map(p => [p.codigo, p]));
  const byProj = groupBy(STATE.ib.rows, r => r.proyectoCod || r.proyecto);

  return Array.from(byProj.entries()).map(([code, rs]) => {
    const kpi = computeFinancieroKPIs(rs);
    const reg = registryByCode.get(code);
    const nombre = rs[0].proyecto || (reg && reg.nombre) || code;
    const isOverhead = code === "1012";
    const activo = isOverhead ? true : (reg ? /ejecuci/i.test(reg.estado || "") : true);
    return {
      codigo: code, nombre, registro: reg, activo, isOverhead,
      ingresos: kpi.ingresos, costos: kpi.costos, margen: kpi.margen, margenPct: kpi.margenPct, count: rs.length, rows: rs,
    };
  }).sort((a, b) => b.costos - a.costos);
}

function renderProjects() {
  const all = getProjectAggregates();
  const list = STATE.projFilter === "activos" ? all.filter(p => p.activo) : all;
  const grid = document.getElementById("proj-grid");
  if (!list.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><b>Sin proyectos para mostrar</b><span>Ajusta el filtro o carga un Excel con más datos.</span></div>';
    return;
  }
  grid.innerHTML = list.map(p => `
    <div class="proj-card" data-code="${escapeHtml(p.codigo)}">
      <div class="pc-head">
        <div><h4>${escapeHtml(truncateLabel(p.nombre, 34))}</h4><div class="code">${escapeHtml(p.codigo)}</div></div>
        <span class="pill ${p.activo ? "pill-green" : "pill-neutral"}">${p.activo ? "Activo" : (p.registro ? p.registro.estado || "—" : "—")}</span>
      </div>
      <div class="row"><span>Ingresos</span><b>${fmtCompact(p.ingresos)}</b></div>
      <div class="row"><span>Costos</span><b>${fmtCompact(p.costos)}</b></div>
      <div class="row"><span>Margen</span><b style="color:${p.margen >= 0 ? "var(--success)" : "var(--danger)"}">${fmtPct(p.margenPct)}</b></div>
      ${p.registro ? `<div class="row"><span>Cliente</span><b>${escapeHtml(truncateLabel(p.registro.cliente || "—", 22))}</b></div>` : ""}
    </div>`).join("");

  grid.querySelectorAll(".proj-card").forEach(card => {
    card.addEventListener("click", () => openProjectModal(card.dataset.code, list));
  });
}

function wireProjectToggle() {
  document.getElementById("btn-proj-activos").addEventListener("click", () => {
    STATE.projFilter = "activos";
    document.getElementById("btn-proj-activos").classList.add("active");
    document.getElementById("btn-proj-todos").classList.remove("active");
    renderProjects();
  });
  document.getElementById("btn-proj-todos").addEventListener("click", () => {
    STATE.projFilter = "todos";
    document.getElementById("btn-proj-todos").classList.add("active");
    document.getElementById("btn-proj-activos").classList.remove("active");
    renderProjects();
  });
}

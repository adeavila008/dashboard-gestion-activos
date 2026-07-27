/* =========================================================================
   15. SALUD DE PROYECTOS — CPI / SPI / CURVA S
   ========================================================================= */

function pick(...vals) { for (const v of vals) if (v !== null && v !== undefined && v !== "") return v; return null; }

/**
 * La columna "Año" del Excel de indicadores solo viene diligenciada para
 * BDA III; en Cerrejón, ESSA, Luminarias y Transformadores queda vacía en
 * TODAS sus filas (se ve en el archivo fuente: el bloque de "Gerencia"
 * tampoco se llenó para esos proyectos nuevos). Si el filtro de Año se basa
 * en esa columna, esos 4 proyectos desaparecen apenas se elige un año,
 * aunque sí tengan meses reales dentro de ese año. Por eso el año se deriva
 * siempre de "Mes" (que sí está poblado en el 100% de las filas), y "anio"
 * solo se usa como respaldo si por algún motivo "mes" no se pudo parsear.
 */
function rowYear(r) {
  if (r.mes) return r.mes.getFullYear();
  return r.anio !== null && r.anio !== undefined && r.anio !== "" ? Number(r.anio) : null;
}

function semaforoEstado(cpi, spi) {
  if (cpi === null || spi === null) return { level: "neutral", label: "Sin datos" };
  if (cpi >= CFG.metaCPI_SPI && spi >= CFG.metaCPI_SPI) return { level: "green", label: "En control" };
  if (cpi < 0.9 || spi < 0.9) return { level: "red", label: "Crítico" };
  return { level: "yellow", label: "En riesgo" };
}

function getBaselineProjects() {
  const byCeco = groupBy(STATE.baseline.rows, r => r.cecoCod);
  return Array.from(byCeco.keys()).map(ceco => {
    const rows = byCeco.get(ceco).slice().sort((a, b) => (a.mes ? a.mes.getTime() : 0) - (b.mes ? b.mes.getTime() : 0));
    const ref = lastReportedRow(rows);
    return { ceco, nombre: ref.proyectoNombre || ceco, gerente: ref.gerente, rows };
  }).filter(p => p.ceco !== "1012");
}

/**
 * La hoja de indicadores suele traer el cronograma completo del proyecto,
 * incluyendo meses futuros que solo tienen el plan (sin avance/costo real
 * todavia, y con CPI/SPI en error de formula tipo #DIV/0!). Para "el ultimo
 * mes reportado" se necesita el ultimo mes con avance real o CPI/SPI
 * efectivamente diligenciados, no simplemente el ultimo mes del cronograma.
 */
function lastReportedRow(rows) {
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    // avance real / costo real acumulado son los campos que efectivamente se
    // diligencian mes a mes; CPI y SPI pueden quedar en 0 por formula aunque
    // el mes todavia no tenga ejecucion, asi que no sirven como indicador.
    if (pick(r.avanceReal) !== null || pick(r.costoRealAcum, r.costoRealMens) !== null) return r;
  }
  return rows[rows.length - 1];
}

function populateSaludFilterOptions() {
  const projects = getBaselineProjects();
  const selP = document.getElementById("s-proyecto");
  const curP = STATE.saludFilters.proyecto;
  selP.innerHTML = '<option value="">Proyecto: todos</option>' + projects.map(p => `<option value="${escapeHtml(p.ceco)}">${escapeHtml(truncateLabel(p.nombre, 34))}</option>`).join("");
  selP.value = projects.some(p => p.ceco === curP) ? curP : "";

  const anios = uniqueSorted(STATE.baseline.rows.map(rowYear)).sort((a, b) => b - a);
  const selA = document.getElementById("s-anio");
  selA.innerHTML = '<option value="">Año: todos</option>' + anios.map(a => `<option value="${a}">${a}</option>`).join("");
  selA.value = anios.includes(Number(STATE.saludFilters.anio)) ? STATE.saludFilters.anio : "";

  populateSaludMesOptions();
}

/**
 * El "Mes de corte" solo debe ofrecer los meses que existen dentro del
 * Año/Proyecto ya seleccionados (antes listaba TODOS los meses de TODOS los
 * proyectos sin importar el filtro de Año, por lo que elegir "2026" seguia
 * mostrando meses de 2024 o 2027 en el desplegable).
 */
function populateSaludMesOptions() {
  let rows = STATE.baseline.rows;
  if (STATE.saludFilters.anio) rows = rows.filter(r => rowYear(r) === Number(STATE.saludFilters.anio));
  if (STATE.saludFilters.proyecto) rows = rows.filter(r => r.cecoCod === STATE.saludFilters.proyecto);

  const meses = uniqueSorted(rows.map(r => r.mes ? r.mes.getTime() : null)).filter(Boolean).sort((a, b) => a - b);
  const selM = document.getElementById("s-mes");
  selM.innerHTML = '<option value="">Mes de corte: más reciente</option>' + meses.map(t => `<option value="${t}">${new Date(t).toLocaleDateString("es-CO", { year: "numeric", month: "long" })}</option>`).join("");
  const valid = meses.includes(Number(STATE.saludFilters.mes));
  selM.value = valid ? STATE.saludFilters.mes : "";
  // si el mes que estaba elegido ya no aplica al nuevo Año/Proyecto, limpia
  // tambien el estado (antes quedaba "" en pantalla pero seguia filtrando
  // con el timestamp viejo por debajo, dando resultados incongruentes).
  if (!valid) STATE.saludFilters.mes = "";
}

/**
 * Devuelve { row, stale }. "stale" = true cuando el proyecto NO tiene un
 * registro exactamente en el mes de corte elegido (ej. el proyecto ya
 * termino antes de esa fecha, o todavia no habia iniciado): en ese caso se
 * muestra el ultimo mes disponible de ESE proyecto, pero se marca para que
 * no parezca que todos los proyectos estan reportando el mismo corte.
 */
function rowAtCutoff(rows, cutoffTs) {
  if (!cutoffTs) return { row: lastReportedRow(rows), stale: false };
  const filtered = rows.filter(r => r.mes && r.mes.getTime() <= Number(cutoffTs));
  if (!filtered.length) return { row: lastReportedRow(rows), stale: true };
  const row = filtered[filtered.length - 1];
  const stale = !row.mes || row.mes.getTime() !== Number(cutoffTs);
  return { row, stale };
}

function renderSemaforoTable() {
  let projects = getBaselineProjects();
  if (STATE.saludFilters.anio) projects = projects.map(p => ({ ...p, rows: p.rows.filter(r => rowYear(r) === Number(STATE.saludFilters.anio)) })).filter(p => p.rows.length);
  if (STATE.saludFilters.proyecto) projects = projects.filter(p => p.ceco === STATE.saludFilters.proyecto);

  const cutoff = STATE.saludFilters.mes || null;
  const tbody = document.querySelector("#tbl-semaforo tbody");
  if (!projects.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="padding:18px;color:var(--text-faint);">Sin datos de líneas base para los filtros actuales.</td></tr>';
    return;
  }
  tbody.innerHTML = projects.map(p => {
    const { row, stale } = rowAtCutoff(p.rows, cutoff);
    const cpi = pick(row.cpi), spi = pick(row.spi);
    const avanceReal = pick(row.avanceReal), avancePlan = pick(row.avancePlanLB3, row.avancePlanLB2, row.avancePlanLB1);
    const sem = semaforoEstado(cpi, spi);
    const mesLabel = row.mes ? row.mes.toLocaleDateString("es-CO", { year: "numeric", month: "short" }) : "—";
    const mesCell = (cutoff && stale)
      ? `<span class="text-faint" title="Este proyecto no tiene reporte en el mes de corte seleccionado; se muestra su último mes disponible.">${mesLabel} <span style="color:var(--warning);">⚠</span></span>`
      : mesLabel;
    return `<tr class="clickable" data-ceco="${escapeHtml(p.ceco)}">
      <td class="cell-wrap">${escapeHtml(p.nombre)}</td>
      <td>${escapeHtml(p.gerente || "—")}</td>
      <td>${mesCell}</td>
      <td class="num">${avanceReal !== null ? fmtPct(avanceReal * 100, 0) : "—"}</td>
      <td class="num">${avancePlan !== null ? fmtPct(avancePlan * 100, 0) : "—"}</td>
      <td class="num">${cpi !== null ? cpi.toFixed(2) : "—"}</td>
      <td class="num">${spi !== null ? spi.toFixed(2) : "—"}</td>
      <td><span class="pill pill-${sem.level === "neutral" ? "neutral" : sem.level}"><span class="sem-dot sem-${sem.level}"></span>${sem.label}</span></td>
    </tr>`;
  }).join("");

  tbody.querySelectorAll("tr.clickable").forEach(tr => {
    tr.addEventListener("click", () => {
      STATE.saludSelectedProject = tr.dataset.ceco;
      document.getElementById("s-proyecto").value = tr.dataset.ceco;
      STATE.saludFilters.proyecto = tr.dataset.ceco;
      renderSalud();
    });
  });
}

function getSelectedSaludProject() {
  const projects = getBaselineProjects();
  if (!projects.length) return null;
  let ceco = STATE.saludFilters.proyecto || STATE.saludSelectedProject;
  let p = projects.find(x => x.ceco === ceco);
  if (!p) p = projects[0];
  return p;
}

function derivedSeries(rows) {
  return rows.map(r => ({
    mes: r.mes,
    avanceReal: pick(r.avanceReal),
    avancePlan: pick(r.avancePlanLB3, r.avancePlanLB2, r.avancePlanLB1),
    costoRealAcum: pick(r.costoRealAcum),
    costoPlanAcum: pick(r.costoPlanAcumLB3, r.costoPlanAcumLB2, r.costoPlanAcumLB1),
    cpi: pick(r.cpi), spi: pick(r.spi),
    raw: r,
  }));
}

function renderCurvaSAvance(project) {
  if (!project) { emptyChart("chart-curvas-avance"); return; }
  const serie = derivedSeries(project.rows);
  const labels = serie.map(s => s.mes ? CFG.monthNames[s.mes.getMonth()] + " " + s.mes.getFullYear() : "—");
  upsertChart("chart-curvas-avance", {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Avance planeado %", data: serie.map(s => s.avancePlan !== null ? s.avancePlan * 100 : null), borderColor: PALETTE.textDim, borderDash: [5, 3], tension: .3, pointRadius: 2, spanGaps: true },
        { label: "Avance real %", data: serie.map(s => s.avanceReal !== null ? s.avanceReal * 100 : null), borderColor: PALETTE.primary, backgroundColor: colorWithAlpha(PALETTE.primary, .12), fill: true, tension: .3, pointRadius: 3, spanGaps: true, datalabels: dlPercent(PALETTE.primary, 0, { align: "top", offset: 6 }) },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 18 } },
      onClick: (evt, els, chart) => {
        const pts = chart.getElementsAtEventForMode(evt, "index", { intersect: false }, true);
        if (!pts.length) return;
        openSaludMonthModal(project, serie[pts[0].index]);
      },
      scales: { y: { min: 0, max: 110, ticks: { callback: v => v + "%" }, grid: { color: "rgba(255,255,255,.05)" } }, x: { grid: { display: false } } },
      plugins: { legend: { position: "top", align: "end" } },
    },
  });
}

function renderCurvaSCosto(project) {
  if (!project) { emptyChart("chart-curvas-costo"); return; }
  const serie = derivedSeries(project.rows);
  const labels = serie.map(s => s.mes ? CFG.monthNames[s.mes.getMonth()] + " " + s.mes.getFullYear() : "—");
  upsertChart("chart-curvas-costo", {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Costo planeado acum. (MCOP)", data: serie.map(s => s.costoPlanAcum), borderColor: PALETTE.textDim, borderDash: [5, 3], tension: .3, pointRadius: 2, spanGaps: true },
        { label: "Costo real acum. (MCOP)", data: serie.map(s => s.costoRealAcum), borderColor: PALETTE.danger, backgroundColor: colorWithAlpha(PALETTE.danger, .12), fill: true, tension: .3, pointRadius: 3, spanGaps: true, datalabels: dlNum(PALETTE.danger, 0, { align: "top", offset: 6 }) },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 18 } },
      onClick: (evt, els, chart) => {
        const pts = chart.getElementsAtEventForMode(evt, "index", { intersect: false }, true);
        if (!pts.length) return;
        openSaludMonthModal(project, serie[pts[0].index]);
      },
      scales: { y: { ticks: { callback: v => fmtNum(v, 0) }, grid: { color: "rgba(255,255,255,.05)" } }, x: { grid: { display: false } } },
      plugins: { legend: { position: "top", align: "end" } },
    },
  });
}

function renderCPISPIChart(project) {
  if (!project) { emptyChart("chart-cpi-spi"); return; }
  const serie = derivedSeries(project.rows);
  const labels = serie.map(s => s.mes ? CFG.monthNames[s.mes.getMonth()] + " " + s.mes.getFullYear() : "—");
  upsertChart("chart-cpi-spi", {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "CPI", data: serie.map(s => s.cpi), borderColor: PALETTE.primary, tension: .3, pointRadius: 3, spanGaps: true, datalabels: dlNum(PALETTE.primary, 2, { align: "top", offset: 6 }) },
        { label: "SPI", data: serie.map(s => s.spi), borderColor: PALETTE.secondary, tension: .3, pointRadius: 3, spanGaps: true, datalabels: dlNum(PALETTE.secondary, 2, { align: "bottom", offset: 6 }) },
        { label: "Meta 1.0", data: serie.map(() => 1), borderColor: PALETTE.textDim, borderDash: [2, 3], pointRadius: 0, borderWidth: 1 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 18, bottom: 14 } },
      onClick: (evt, els, chart) => {
        const pts = chart.getElementsAtEventForMode(evt, "index", { intersect: false }, true);
        if (!pts.length) return;
        openSaludMonthModal(project, serie[pts[0].index]);
      },
      scales: { y: { grid: { color: "rgba(255,255,255,.05)" } }, x: { grid: { display: false } } },
      plugins: { legend: { position: "top", align: "end" } },
    },
  });
}

function emptyChart(canvasId) {
  if (STATE.charts[canvasId]) { STATE.charts[canvasId].destroy(); delete STATE.charts[canvasId]; }
}

function openSaludMonthModal(project, s) {
  const r = s.raw;
  const body = `
    <div class="modal-kpis">
      <div class="modal-kpi"><div class="l">Avance real</div><div class="v">${s.avanceReal !== null ? fmtPct(s.avanceReal * 100, 0) : "—"}</div></div>
      <div class="modal-kpi"><div class="l">Avance planeado</div><div class="v">${s.avancePlan !== null ? fmtPct(s.avancePlan * 100, 0) : "—"}</div></div>
      <div class="modal-kpi"><div class="l">CPI</div><div class="v">${s.cpi !== null ? s.cpi.toFixed(2) : "—"}</div></div>
      <div class="modal-kpi"><div class="l">SPI</div><div class="v">${s.spi !== null ? s.spi.toFixed(2) : "—"}</div></div>
      <div class="modal-kpi"><div class="l">Costo real acum.</div><div class="v">${s.costoRealAcum !== null ? fmtNum(s.costoRealAcum, 1) + "M" : "—"}</div></div>
      <div class="modal-kpi"><div class="l">EAC</div><div class="v">${pick(r.eac) !== null ? fmtNum(pick(r.eac), 1) : "—"}</div></div>
    </div>
    ${r.comentariosAvance ? `<p class="text-dim" style="font-size:12px;"><b>Avance:</b> ${escapeHtml(r.comentariosAvance)}</p>` : ""}
    ${r.comentariosCostos ? `<p class="text-dim" style="font-size:12px;"><b>Costos:</b> ${escapeHtml(r.comentariosCostos)}</p>` : ""}
    ${r.comentariosFacturacion ? `<p class="text-dim" style="font-size:12px;"><b>Facturación:</b> ${escapeHtml(r.comentariosFacturacion)}</p>` : ""}`;
  openModal(project.nombre, s.mes ? s.mes.toLocaleDateString("es-CO", { year: "numeric", month: "long" }) : "", body);
}

function renderSeguimientoPanel(project) {
  const box = document.getElementById("seguimiento-body");
  const label = document.getElementById("seguimiento-proyecto-label");
  if (!project) { box.innerHTML = '<div class="empty-state"><b>Sin proyecto seleccionado</b></div>'; label.textContent = ""; return; }
  const last = lastReportedRow(project.rows);
  label.textContent = project.nombre + " · " + (last.mes ? last.mes.toLocaleDateString("es-CO", { year: "numeric", month: "long" }) : "");
  const blocks = [
    ["Hechos relevantes", last.hechosRelevantes],
    ["Próximos pasos", last.proximosPasos],
    ["Comentarios de avance", last.comentariosAvance],
    ["Comentarios de facturación", last.comentariosFacturacion],
    ["Comentarios de costos", last.comentariosCostos],
  ].filter(([, v]) => v);
  box.innerHTML = blocks.length ? blocks.map(([t, v]) => `<div class="mt-8"><div class="section-title" style="font-size:12px;">${t}</div><p class="text-dim" style="font-size:12.5px;line-height:1.5;margin:4px 0 0;">${escapeHtml(v)}</p></div>`).join("")
    : '<div class="empty-state"><b>Sin comentarios registrados</b><span>El último mes reportado no tiene notas de seguimiento.</span></div>';
}

function renderSalud() {
  renderSemaforoTable();
  const project = getSelectedSaludProject();
  renderCurvaSAvance(project);
  renderCurvaSCosto(project);
  renderCPISPIChart(project);
  renderSeguimientoPanel(project);
}

function wireSaludFilters() {
  document.getElementById("s-proyecto").addEventListener("change", e => { STATE.saludFilters.proyecto = e.target.value; STATE.saludSelectedProject = e.target.value || null; populateSaludMesOptions(); renderSalud(); });
  document.getElementById("s-anio").addEventListener("change", e => { STATE.saludFilters.anio = e.target.value; populateSaludMesOptions(); renderSalud(); });
  document.getElementById("s-mes").addEventListener("change", e => { STATE.saludFilters.mes = e.target.value; renderSalud(); });
  document.getElementById("btn-clear-filters-salud").addEventListener("click", () => {
    STATE.saludFilters = { proyecto: "", anio: "", mes: "" };
    STATE.saludSelectedProject = null;
    populateSaludFilterOptions();
    renderSalud();
  });
}

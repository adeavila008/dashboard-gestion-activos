/* =========================================================================
   08. GRAFICAS — MODULO FINANCIERO (Chart.js)
   ========================================================================= */

function upsertChart(canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (STATE.charts[canvasId]) { STATE.charts[canvasId].destroy(); }
  STATE.charts[canvasId] = new Chart(canvas, config);
  return STATE.charts[canvasId];
}

function costosPorCuentaMayor(rows) {
  const m = groupBy(rows.filter(r => !r.esIngreso), r => r.cuentaMayor || "Sin clasificar");
  return Array.from(m.entries()).map(([k, rs]) => ({ label: k, value: sumBy(rs, r => r.importe), rows: rs }))
    .sort((a, b) => b.value - a.value);
}
function costoPorPersonal(rows) {
  const m = groupBy(rows.filter(r => !r.esIngreso && r.empleado), r => r.empleado);
  return Array.from(m.entries()).map(([k, rs]) => ({ label: k, value: sumBy(rs, r => r.importe), rows: rs }))
    .sort((a, b) => b.value - a.value);
}
function ingresosPorConcepto(rows) {
  const m = groupBy(rows.filter(r => r.esIngreso), r => r.cuenta || r.cuentaMayor || "Sin clasificar");
  return Array.from(m.entries()).map(([k, rs]) => ({ label: k, value: -sumBy(rs, r => r.importe), rows: rs }))
    .sort((a, b) => b.value - a.value);
}
function topCuentasCosto(rows) {
  const m = groupBy(rows.filter(r => !r.esIngreso), r => r.cuenta || r.cuentaMayor || "Sin clasificar");
  return Array.from(m.entries()).map(([k, rs]) => ({ label: k, value: sumBy(rs, r => r.importe), rows: rs }))
    .sort((a, b) => b.value - a.value);
}

function truncateLabel(s, n) {
  s = String(s || "");
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function renderChartTrend() {
  const rows = getFilteredIBRows({ ignoreMes: true });
  const serie = monthlySeries(rows);
  const labels = serie.map(s => periodoToLabel(s.periodo));
  upsertChart("chart-trend", {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Ingresos", data: serie.map(s => s.ingresos), backgroundColor: colorWithAlpha(PALETTE.secondary, .85), borderRadius: 5, maxBarThickness: 28, order: 2, datalabels: dlCompactCurrency(PALETTE.secondary) },
        { label: "Costos", data: serie.map(s => s.costos), backgroundColor: colorWithAlpha(PALETTE.danger, .8), borderRadius: 5, maxBarThickness: 28, order: 2, datalabels: dlCompactCurrency(PALETTE.danger) },
        { label: "Margen %", data: serie.map(s => s.margenPct), type: "line", yAxisID: "y1", borderColor: PALETTE.primary, backgroundColor: PALETTE.primary, tension: .35, pointRadius: 3, pointBackgroundColor: PALETTE.primary, order: 1, datalabels: dlPercent(PALETTE.primary, 0, { align: "top", offset: 8 }) },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 24 } },
      interaction: { mode: "index", intersect: false },
      onClick: (evt, els, chart) => {
        const pts = chart.getElementsAtEventForMode(evt, "index", { intersect: false }, true);
        if (!pts.length) return;
        openMonthDetailModal(serie[pts[0].index].periodo);
      },
      scales: {
        y: { ticks: { callback: v => fmtCompact(v) }, grid: { color: "rgba(255,255,255,.05)" } },
        y1: { position: "right", ticks: { callback: v => v + "%" }, grid: { display: false } },
        x: { grid: { display: false } },
      },
      plugins: {
        legend: { position: "top", align: "end" },
        tooltip: { callbacks: { label: ctx => ctx.dataset.label + ": " + (ctx.dataset.yAxisID === "y1" ? fmtPct(ctx.parsed.y) : fmtCOP(ctx.parsed.y)) } },
      },
    },
  });
}

function renderChartCuentaMayor(rows) {
  const data = costosPorCuentaMayor(rows).slice(0, 8);
  const total = sumBy(data, d => d.value);
  upsertChart("chart-cuentamayor", {
    type: "doughnut",
    data: {
      labels: data.map(d => d.label),
      datasets: [{ data: data.map(d => d.value), backgroundColor: PALETTE.chartSeries, borderColor: "#111827", borderWidth: 2, hoverOffset: 6, datalabels: dlDonutPct(4) }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: "62%",
      onClick: (evt, els, chart) => {
        const pts = chart.getElementsAtEventForMode(evt, "nearest", { intersect: true }, true);
        if (!pts.length) return;
        openCuentaBreakdownModal(data[pts[0].index], "Cuenta mayor");
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ctx.label + ": " + fmtCOP(ctx.parsed) + " (" + (total ? (ctx.parsed / total * 100).toFixed(1) : 0) + "%)" } },
      },
    },
  });
  const legend = document.getElementById("legend-cuentamayor");
  legend.innerHTML = data.map((d, i) => `<div class="legend-item"><span class="legend-dot" style="background:${PALETTE.chartSeries[i % PALETTE.chartSeries.length]}"></span>${truncateLabel(d.label, 26)} · ${fmtCompact(d.value)}</div>`).join("");
}

function renderChartMargen() {
  const rows = getFilteredIBRows({ ignoreMes: true });
  const serie = monthlySeries(rows);
  const labels = serie.map(s => periodoToLabel(s.periodo));
  let accIngresos = 0, accCostos = 0;
  const acumPct = serie.map(s => { accIngresos += s.ingresos; accCostos += s.costos; return accIngresos !== 0 ? ((accIngresos - accCostos) / accIngresos) * 100 : 0; });
  upsertChart("chart-margen", {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Margen mensual %", data: serie.map(s => s.margenPct), borderColor: PALETTE.primary, backgroundColor: colorWithAlpha(PALETTE.primary, .12), fill: true, tension: .35, pointRadius: 3, datalabels: dlPercent(PALETTE.primary, 0, { align: "top", offset: 6 }) },
        { label: "Margen acumulado %", data: acumPct, borderColor: PALETTE.secondary, backgroundColor: "transparent", borderDash: [5, 3], tension: .35, pointRadius: 2, datalabels: dlPercent(PALETTE.secondary, 0, { align: "bottom", offset: 6 }) },
        { label: "Meta " + CFG.metaMargen + "%", data: serie.map(() => CFG.metaMargen), borderColor: PALETTE.textDim, borderDash: [2, 3], pointRadius: 0, borderWidth: 1 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 20, bottom: 14 } },
      onClick: (evt, els, chart) => {
        const pts = chart.getElementsAtEventForMode(evt, "index", { intersect: false }, true);
        if (!pts.length) return;
        openMonthDetailModal(serie[pts[0].index].periodo);
      },
      scales: { y: { ticks: { callback: v => v + "%" }, grid: { color: "rgba(255,255,255,.05)" } }, x: { grid: { display: false } } },
      plugins: { legend: { position: "top", align: "end" }, tooltip: { callbacks: { label: ctx => ctx.dataset.label + ": " + fmtPct(ctx.parsed.y) } } },
    },
  });
}

function renderChartPersonal(rows) {
  const data = costoPorPersonal(rows).slice(0, 10);
  upsertChart("chart-personal", {
    type: "bar",
    data: { labels: data.map(d => truncateLabel(d.label, 20)), datasets: [{ label: "Costo", data: data.map(d => d.value), backgroundColor: colorWithAlpha(PALETTE.violet, .85), borderRadius: 5, maxBarThickness: 22, datalabels: dlCompactCurrency(PALETTE.violet, { anchor: "end", align: "right", offset: 4 }) }] },
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false,
      layout: { padding: { right: 34 } },
      onClick: (evt, els, chart) => {
        const pts = chart.getElementsAtEventForMode(evt, "nearest", { intersect: true }, true);
        if (!pts.length) return;
        STATE.filters.empleado = data[pts[0].index].label;
        populateFinancieroFilterOptions();
        renderFinanciero();
        showToast("Filtro aplicado", "Empleado: " + data[pts[0].index].label, "success");
      },
      scales: { x: { ticks: { callback: v => fmtCompact(v) }, grid: { color: "rgba(255,255,255,.05)" } }, y: { grid: { display: false } } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtCOP(ctx.parsed.x) } } },
    },
  });
}

function renderChartIngresos(rows) {
  const data = ingresosPorConcepto(rows).slice(0, 10);
  upsertChart("chart-ingresos", {
    type: "bar",
    data: { labels: data.map(d => truncateLabel(d.label, 24)), datasets: [{ label: "Ingresos", data: data.map(d => d.value), backgroundColor: colorWithAlpha(PALETTE.secondary, .85), borderRadius: 5, maxBarThickness: 26, datalabels: dlCompactCurrency(PALETTE.secondary) }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 22 } },
      onClick: (evt, els, chart) => {
        const pts = chart.getElementsAtEventForMode(evt, "nearest", { intersect: true }, true);
        if (!pts.length) return;
        openCuentaBreakdownModal(data[pts[0].index], "Concepto de ingreso");
      },
      scales: { y: { ticks: { callback: v => fmtCompact(v) }, grid: { color: "rgba(255,255,255,.05)" } }, x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 32, minRotation: 0 } } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtCOP(ctx.parsed.y) } } },
    },
  });
}

function renderChartTopCuentas(rows) {
  const data = topCuentasCosto(rows).slice(0, 10);
  upsertChart("chart-topcuentas", {
    type: "bar",
    data: { labels: data.map(d => truncateLabel(d.label, 24)), datasets: [{ label: "Costo", data: data.map(d => d.value), backgroundColor: colorWithAlpha(PALETTE.danger, .8), borderRadius: 5, maxBarThickness: 26, datalabels: dlCompactCurrency(PALETTE.danger) }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 22 } },
      onClick: (evt, els, chart) => {
        const pts = chart.getElementsAtEventForMode(evt, "nearest", { intersect: true }, true);
        if (!pts.length) return;
        openCuentaBreakdownModal(data[pts[0].index], "Cuenta de costo");
      },
      scales: { y: { ticks: { callback: v => fmtCompact(v) }, grid: { color: "rgba(255,255,255,.05)" } }, x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 32, minRotation: 0 } } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtCOP(ctx.parsed.y) } } },
    },
  });
}

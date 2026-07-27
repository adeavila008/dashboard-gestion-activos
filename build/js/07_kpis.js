/* =========================================================================
   07. KPIs — MODULO FINANCIERO
   ========================================================================= */

function computeFinancieroKPIs(rows) {
  const ingresos = -sumBy(rows.filter(r => r.esIngreso), r => r.importe);
  const costos = sumBy(rows.filter(r => !r.esIngreso), r => r.importe);
  const margen = ingresos - costos;
  const margenPct = ingresos !== 0 ? (margen / ingresos) * 100 : 0;
  return { ingresos, costos, margen, margenPct, count: rows.length };
}

function monthlySeries(rows) {
  const byMonth = groupBy(rows, r => r.periodo);
  const periodos = Array.from(byMonth.keys()).sort((a, b) => a - b);
  return periodos.map(p => {
    const rs = byMonth.get(p);
    const k = computeFinancieroKPIs(rs);
    return Object.assign({ periodo: p }, k);
  });
}

function kpiCard(opts) {
  const trendHtml = opts.trend === null || opts.trend === undefined ? "" : `
    <span class="kpi-trend ${opts.trend >= 0 ? "up" : "down"}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${opts.trend >= 0 ? '<path d="M6 15l6-6 6 6"/>' : '<path d="M6 9l6 6 6-6"/>'}</svg>
      ${Math.abs(opts.trend).toFixed(1)}%
    </span>`;
  return `
  <div class="kpi-card" style="--accent:${opts.color};--accent-soft:${colorWithAlpha(opts.color, .14)};--accent-glow:${colorWithAlpha(opts.color, .16)}">
    <div class="kpi-top">
      <div class="kpi-icon">${opts.icon}</div>
      ${trendHtml}
    </div>
    <div class="kpi-label">${opts.label}</div>
    <div class="kpi-value">${opts.value}</div>
    <div class="kpi-foot">${opts.foot || ""}</div>
  </div>`;
}

const ICONS = {
  ingresos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1v22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  costos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>',
  margen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M8.5 9.5h5.25a2 2 0 1 1 0 4H8"/></svg>',
  margenPct: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>',
};

function renderFinancieroKPIs(rows) {
  const kpi = computeFinancieroKPIs(rows);
  const serie = monthlySeries(getFilteredIBRows({ ignoreMes: true }));
  let trendIngresos = null, trendCostos = null, trendMargen = null, trendMargenPct = null;
  if (serie.length >= 2) {
    const a = serie[serie.length - 2], b = serie[serie.length - 1];
    trendIngresos = a.ingresos !== 0 ? ((b.ingresos - a.ingresos) / Math.abs(a.ingresos)) * 100 : null;
    trendCostos = a.costos !== 0 ? ((b.costos - a.costos) / Math.abs(a.costos)) * 100 : null;
    trendMargen = a.margen !== 0 ? ((b.margen - a.margen) / Math.abs(a.margen)) * 100 : null;
    trendMargenPct = b.margenPct - a.margenPct;
  }

  const wrap = document.getElementById("fin-kpis");
  wrap.innerHTML =
    kpiCard({ label: "Ingresos", value: fmtCOP(kpi.ingresos), icon: ICONS.ingresos, color: PALETTE.secondary, trend: trendIngresos, foot: kpi.count + " transacciones en el filtro" }) +
    kpiCard({ label: "Costos", value: fmtCOP(kpi.costos), icon: ICONS.costos, color: PALETTE.danger, trend: trendCostos !== null ? -trendCostos : null, foot: "vs. mes anterior (serie completa)" }) +
    kpiCard({ label: "Margen", value: fmtCOP(kpi.margen), icon: ICONS.margen, color: PALETTE.primary, trend: trendMargen, foot: kpi.margen >= 0 ? "Resultado positivo" : "Resultado negativo" }) +
    kpiCard({ label: "Margen %", value: fmtPct(kpi.margenPct), icon: ICONS.margenPct, color: kpi.margenPct >= CFG.metaMargen ? PALETTE.success : PALETTE.warning, trend: trendMargenPct, foot: "meta ≥ " + CFG.metaMargen + "%" });
}

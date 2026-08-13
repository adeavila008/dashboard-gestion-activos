/* =========================================================================
   21. ANALISIS GENERAL — resumen automatico de puntos criticos
   ========================================================================= */

/** Filtra STATE.ib.rows solo por Proyecto y Año (los del panel de Analisis).
 * El "Mes" NO se aplica aqui a proposito: el motor de analisis necesita la
 * continuidad completa de meses para poder comparar cada mes contra el
 * anterior -- el filtro de mes se aplica DESPUES, sobre la lista de puntos
 * ya detectados (ver renderAnalisis), para mostrar solo los que ocurrieron
 * en el/los mes(es) elegido(s). */
function getAnalisisScopedRows() {
  const f = STATE.analisisFilters;
  return STATE.ib.rows.filter(r => {
    if (f.proyecto && r.proyecto !== f.proyecto) return false;
    if (f.anio && String(r.anio) !== String(f.anio)) return false;
    return true;
  });
}

/** Umbral propio de este modulo -- mas permisivo que el de la matriz de
 * Financiero (CFG.anomalyMinPct=45%). Ese umbral esta pensado para resaltar
 * en ROJO solo los sobrecostos mas graves dentro de una tabla ya densa; este
 * modulo en cambio es un resumen ejecutivo pensado para responder "a que se
 * debio tal cambio" -- variaciones de doble digito (ej. el +14.7% de SUELDOS
 * jun->jul en ESSA, claramente visible y preguntable aunque no sea un
 * "outlier" estadistico) tambien merecen aparecer aqui. */
const ANALISIS_CFG = { anomalyZ: 1.5, anomalyMinPct: 0.12, minAbs: 250000 };

/** Igual al detector de anomalias de la matriz de costos (09_matrix.js), pero
 * simetrico: aqui SI interesan tanto subidas como bajadas (una caida de
 * ingresos es tan relevante como un pico de costos para este resumen). */
function detectSeriesAnomaliesBothWays(vals) {
  const flags = [];
  const nonZero = vals.filter(v => v !== 0);
  if (nonZero.length < 2) return flags;
  const m = avg(nonZero), sd = stdev(nonZero);
  for (let i = 1; i < vals.length; i++) {
    const prev = vals[i - 1], curr = vals[i];
    if (curr === 0 && prev === 0) continue;
    const delta = curr - prev;
    const pctChange = prev !== 0 ? delta / Math.abs(prev) : Infinity;
    const zFlag = sd > 0 && Math.abs(curr - m) > ANALISIS_CFG.anomalyZ * sd;
    const pctFlag = isFinite(pctChange) ? Math.abs(pctChange) >= ANALISIS_CFG.anomalyMinPct : Math.abs(delta) > ANALISIS_CFG.minAbs;
    if ((zFlag || pctFlag) && Math.abs(delta) > ANALISIS_CFG.minAbs) flags.push({ i, prev, curr, delta, pctChange });
  }
  return flags;
}

/** Clona las filas cambiando el signo de "importe" -- los ingresos vienen
 * con importe NEGATIVO en el IBReport (por eso computeFinancieroKPIs hace
 * "-sumBy(...)"). Para poder reusar buildVariacionBreakdown (pensada para
 * costos, con importe positivo) en el lado de ingresos, se voltea el signo
 * primero para que "sube/baja" se lea de forma natural. */
function negateImporte(rows) {
  return rows.map(r => Object.assign({}, r, { importe: -r.importe }));
}

/** Detecta picos/caidas por cuenta mayor dentro de "rows" (ya sea de costos
 * o de ingresos con el signo ya normalizado) y devuelve un item de analisis
 * por cada uno, con el desglose de quien/que tercero lo explica. */
function cuentaSeriesInsights(rows, periodos, tipoKey, tipoLabel) {
  const out = [];
  const porCuenta = groupBy(rows, r => r.cuentaMayor);
  porCuenta.forEach((rs, cuenta) => {
    const porPeriodo = groupBy(rs, r => r.periodo);
    const vals = periodos.map(p => sumBy(porPeriodo.get(p) || [], r => r.importe));
    detectSeriesAnomaliesBothWays(vals).forEach(f => {
      const currRows = porPeriodo.get(periodos[f.i]) || [];
      const prevRows = porPeriodo.get(periodos[f.i - 1]) || [];
      const brk = buildVariacionBreakdown(currRows, prevRows);
      const subio = f.delta >= 0;
      // Para costos, subir es la mala noticia; para ingresos, bajar lo es.
      const severidad = tipoKey === "costo" ? (subio ? "alta" : "positiva") : (subio ? "positiva" : "alta");
      out.push({
        tipo: tipoKey, cuenta, periodo: periodos[f.i], prevPeriodo: periodos[f.i - 1],
        impacto: Math.abs(f.delta), severidad,
        texto: `${tipoLabel} de <b>${escapeHtml(cuenta)}</b> ${subio ? "subieron" : "bajaron"} de ${fmtCOP(f.prev)} a ${fmtCOP(f.curr)} en ${periodoToLabel(periodos[f.i])} (${subio ? "+" : ""}${fmtCOP(f.delta)}${isFinite(f.pctChange) ? ", " + (f.pctChange >= 0 ? "+" : "") + (f.pctChange * 100).toFixed(0) + "%" : ""} vs. ${periodoToLabel(periodos[f.i - 1])})` +
          (brk.list.length ? `, principalmente por ${brk.fieldLabel.toLowerCase()}: ${brk.list.slice(0, 3).map(d => escapeHtml(d.key) + " (" + (d.delta >= 0 ? "+" : "") + fmtCOP(d.delta) + ")").join(", ")}.` : "."),
      });
    });
  });
  return out;
}

/** Motor principal: dado un conjunto de filas (ya acotado por Proyecto/Año),
 * devuelve la lista completa de puntos criticos detectados -- giros de
 * margen, picos/caidas de costos por cuenta mayor y picos/caidas de ingresos
 * por cuenta mayor -- ordenada de mayor a menor impacto. */
function buildAnalisisInsights(rows) {
  const serie = monthlySeries(rows);
  const periodos = serie.map(s => s.periodo);
  const insights = [];

  // ---- Margen: giros relevantes mes a mes ----
  for (let i = 1; i < serie.length; i++) {
    const prev = serie[i - 1], curr = serie[i];
    const deltaMargen = curr.margen - prev.margen;
    const deltaPts = (isFinite(prev.margenPct) && isFinite(curr.margenPct)) ? curr.margenPct - prev.margenPct : null;
    const flipNeg = prev.margen >= 0 && curr.margen < 0;
    const flipPos = prev.margen < 0 && curr.margen >= 0;
    const bigSwing = deltaPts !== null && Math.abs(deltaPts) >= 15;
    if (!flipNeg && !flipPos && !bigSwing) continue;

    const deltaIng = curr.ingresos - prev.ingresos;
    const deltaCos = curr.costos - prev.costos;
    const liderIngresos = Math.abs(deltaIng) >= Math.abs(deltaCos);
    const causaTexto = liderIngresos
      ? `principalmente por el cambio en <b>ingresos</b> (${deltaIng >= 0 ? "+" : ""}${fmtCOP(deltaIng)} vs. ${periodoToLabel(prev.periodo)})`
      : `principalmente por el cambio en <b>costos</b> (${deltaCos >= 0 ? "+" : ""}${fmtCOP(deltaCos)} vs. ${periodoToLabel(prev.periodo)})`;

    insights.push({
      tipo: "margen", periodo: curr.periodo, prevPeriodo: prev.periodo,
      impacto: Math.abs(deltaMargen),
      severidad: flipNeg ? "alta" : (flipPos ? "positiva" : (deltaMargen < 0 ? "media" : "positiva")),
      texto: `El margen ${flipNeg ? "pasó a ser <b>NEGATIVO</b>" : flipPos ? "volvió a ser <b>positivo</b>" : (deltaMargen < 0 ? "se deterioró" : "mejoró")} en ${periodoToLabel(curr.periodo)}: ${fmtPct(prev.margenPct)} → ${fmtPct(curr.margenPct)} (Ingresos ${fmtCOP(curr.ingresos)}, Costos ${fmtCOP(curr.costos)}), ${causaTexto}.`,
    });
  }

  // ---- Costos por cuenta mayor ----
  insights.push(...cuentaSeriesInsights(rows.filter(r => !r.esIngreso), periodos, "costo", "Costos"));

  // ---- Ingresos por cuenta mayor (importe normalizado a signo positivo) ----
  insights.push(...cuentaSeriesInsights(negateImporte(rows.filter(r => r.esIngreso)), periodos, "ingreso", "Ingresos"));

  insights.sort((a, b) => b.impacto - a.impacto);
  return insights;
}

const ANALISIS_MAX_ITEMS = 30;

function populateAnalisisFilterOptions() {
  const rows = STATE.ib.rows;
  const setOptions = (selId, values, current) => {
    const sel = document.getElementById(selId);
    const placeholder = sel.options[0];
    sel.innerHTML = "";
    sel.appendChild(placeholder);
    values.forEach(v => {
      const opt = document.createElement("option");
      opt.value = v; opt.textContent = v;
      sel.appendChild(opt);
    });
    sel.value = values.includes(current) ? current : "";
  };
  setOptions("an-proyecto", uniqueSorted(rows.map(r => r.proyecto)), STATE.analisisFilters.proyecto);
  setOptions("an-anio", uniqueSorted(rows.map(r => r.anio)).sort((a, b) => b - a), STATE.analisisFilters.anio);

  const meses = uniqueSorted(rows.map(r => r.periodo)).sort((a, b) => a - b);
  STATE.analisisFilters.meses = STATE.analisisFilters.meses.filter(m => meses.includes(Number(m)));
  const list = document.getElementById("an-mes-list");
  list.innerHTML = meses.map(p => `
    <label class="multiselect-item"><input type="checkbox" value="${p}" ${STATE.analisisFilters.meses.includes(String(p)) ? "checked" : ""}> ${periodoToLabel(p)}</label>
  `).join("");
  updateAnalisisMesLabel();
}

function updateAnalisisMesLabel() {
  const btn = document.getElementById("an-mes-btn");
  const total = document.querySelectorAll("#an-mes-list input").length;
  const checks = [...document.querySelectorAll("#an-mes-list input:checked")];
  const n = checks.length;
  if (n === 0 || n === total) { btn.textContent = "Mes: todos"; btn.classList.remove("has-selection"); }
  else if (n === 1) { btn.textContent = "Mes: " + checks[0].parentElement.textContent.trim(); btn.classList.add("has-selection"); }
  else { btn.textContent = "Mes: " + n + " seleccionados"; btn.classList.add("has-selection"); }
}

function renderAnalisis() {
  const scoped = getAnalisisScopedRows();
  const kpi = computeFinancieroKPIs(scoped);

  const wrapKpi = document.getElementById("an-kpis");
  wrapKpi.innerHTML =
    kpiCard({ label: "Ingresos", value: fmtCOP(kpi.ingresos), icon: ICONS.ingresos, color: PALETTE.secondary, foot: kpi.count + " transacciones en el filtro" }) +
    kpiCard({ label: "Costos", value: fmtCOP(kpi.costos), icon: ICONS.costos, color: PALETTE.danger }) +
    kpiCard({ label: "Margen", value: fmtCOP(kpi.margen), icon: ICONS.margen, color: PALETTE.primary, foot: kpi.margen >= 0 ? "Resultado positivo" : "Resultado negativo" }) +
    kpiCard({ label: "Margen %", value: fmtPct(kpi.margenPct), icon: ICONS.margenPct, color: kpi.margenPct >= CFG.metaMargen ? PALETTE.success : PALETTE.warning, foot: "meta ≥ " + CFG.metaMargen + "%" });

  const allInsights = buildAnalisisInsights(scoped);
  const meses = STATE.analisisFilters.meses;
  const filtered = meses.length ? allInsights.filter(it => meses.includes(String(it.periodo))) : allInsights;
  const shown = filtered.slice(0, ANALISIS_MAX_ITEMS);

  const hint = document.getElementById("an-hint");
  if (!filtered.length) {
    hint.textContent = scoped.length ? "No se detectaron puntos críticos para los filtros actuales." : "Sin datos para los filtros actuales.";
  } else {
    hint.textContent = `${filtered.length} punto(s) crítico(s) detectado(s)` + (filtered.length > shown.length ? ` · mostrando los ${shown.length} de mayor impacto` : "") + " · ordenados de mayor a menor impacto.";
  }

  const list = document.getElementById("an-list");
  list.innerHTML = shown.map((it, idx) => `
    <div class="analisis-item sev-${it.severidad}">
      <div class="ai-num">${idx + 1}</div>
      <div class="ai-body">
        <div class="ai-meta">${periodoToLabel(it.periodo)} · ${it.tipo === "margen" ? "Margen" : it.tipo === "costo" ? "Costos" : "Ingresos"}</div>
        <div class="ai-text">${it.texto}</div>
      </div>
    </div>`).join("");
}

function wireAnalisisFilters() {
  ["an-proyecto", "an-anio"].forEach(id => {
    document.getElementById(id).addEventListener("change", e => {
      const key = { "an-proyecto": "proyecto", "an-anio": "anio" }[id];
      STATE.analisisFilters[key] = e.target.value;
      renderAnalisis();
    });
  });

  const mesBtn = document.getElementById("an-mes-btn");
  const mesPanel = document.getElementById("an-mes-panel");
  mesBtn.addEventListener("click", e => {
    e.stopPropagation();
    mesPanel.classList.toggle("open");
  });
  document.addEventListener("click", e => {
    if (!mesPanel.contains(e.target) && e.target !== mesBtn) mesPanel.classList.remove("open");
  });
  document.getElementById("an-mes-list").addEventListener("change", () => {
    STATE.analisisFilters.meses = [...document.querySelectorAll("#an-mes-list input:checked")].map(c => c.value);
    updateAnalisisMesLabel();
    renderAnalisis();
  });
  document.getElementById("an-mes-todos").addEventListener("click", () => {
    document.querySelectorAll("#an-mes-list input").forEach(c => c.checked = true);
    STATE.analisisFilters.meses = [...document.querySelectorAll("#an-mes-list input:checked")].map(c => c.value);
    updateAnalisisMesLabel();
    renderAnalisis();
  });
  document.getElementById("an-mes-ninguno").addEventListener("click", () => {
    document.querySelectorAll("#an-mes-list input").forEach(c => c.checked = false);
    STATE.analisisFilters.meses = [];
    updateAnalisisMesLabel();
    renderAnalisis();
  });

  document.getElementById("btn-clear-filters-analisis").addEventListener("click", () => {
    STATE.analisisFilters = { proyecto: "", anio: "", meses: [] };
    populateAnalisisFilterOptions();
    renderAnalisis();
    showToast("Filtros limpiados", "", "success");
  });
}

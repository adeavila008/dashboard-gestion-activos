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
 * debio tal cambio" -- variaciones de doble digito (ej. un +15% en Gastos de
 * Personal, claramente visible y preguntable aunque no sea un "outlier"
 * estadistico) tambien merecen aparecer aqui. */
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
 * ESTRUCTURADO (no texto ya armado) por cada uno -- asi renderAnalisis()
 * puede pintarlo como fila de tabla en vez de parrafo. */
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
        tipo: tipoKey, tipoLabel, cuenta,
        periodo: periodos[f.i], prevPeriodo: periodos[f.i - 1],
        prevValor: f.prev, actualValor: f.curr, deltaValor: f.delta, deltaPct: f.pctChange,
        impacto: Math.abs(f.delta), severidad, esMargen: false,
        breakdownLabel: brk.fieldLabel,
        breakdown: brk.list.slice(0, 2).map(d => ({ key: d.key, delta: d.delta })),
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

    insights.push({
      tipo: "margen", tipoLabel: "Margen", cuenta: null,
      periodo: curr.periodo, prevPeriodo: prev.periodo,
      prevValor: prev.margenPct, actualValor: curr.margenPct, deltaValor: deltaMargen, deltaPct: deltaPts,
      impacto: Math.abs(deltaMargen),
      severidad: flipNeg ? "alta" : (flipPos ? "positiva" : (deltaMargen < 0 ? "media" : "positiva")),
      esMargen: true,
      breakdownLabel: "Explicado por",
      breakdown: [{ key: liderIngresos ? "Ingresos" : "Costos", delta: liderIngresos ? deltaIng : deltaCos }],
    });
  }

  // ---- Costos por cuenta mayor ----
  insights.push(...cuentaSeriesInsights(rows.filter(r => !r.esIngreso), periodos, "costo", "Costos"));

  // ---- Ingresos por cuenta mayor (importe normalizado a signo positivo) ----
  insights.push(...cuentaSeriesInsights(negateImporte(rows.filter(r => r.esIngreso)), periodos, "ingreso", "Ingresos"));

  insights.sort((a, b) => b.impacto - a.impacto);
  return insights;
}

const ANALISIS_MAX_ITEMS = 20;

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

/** Formatea "Anterior"/"Actual" de un item: porcentaje para las filas de
 * margen, pesos para las de costos/ingresos. */
function fmtItemValor(it, v) { return it.esMargen ? fmtPct(v) : fmtCOP(v); }

function analisisBreakdownHtml(it) {
  if (!it.breakdown.length) return "—";
  return it.breakdown.map(d => `${escapeHtml(d.key)} (${d.delta >= 0 ? "+" : ""}${fmtCOP(d.delta)})`).join(", ");
}

/** "Variación": para margen se muestra en PUNTOS porcentuales (no tiene
 * sentido un "% de un %"); para costos/ingresos se muestra el delta en
 * pesos junto con el cambio porcentual relativo al mes anterior. */
function analisisVariacionHtml(it) {
  if (it.esMargen) {
    const pts = it.deltaPct;
    return (pts !== null && isFinite(pts)) ? (pts >= 0 ? "+" : "") + fmtNum(pts, 1) + " pts" : "—";
  }
  const pctTxt = isFinite(it.deltaPct) ? " (" + (it.deltaPct >= 0 ? "+" : "") + (it.deltaPct * 100).toFixed(0) + "%)" : "";
  return (it.deltaValor >= 0 ? "+" : "") + fmtCOP(it.deltaValor) + pctTxt;
}

function analisisTableHtml(items) {
  if (!items.length) return '<p class="text-dim" style="font-size:12px;padding:8px 2px;">Sin puntos en esta categoría para los filtros actuales.</p>';
  return `
    <div class="table-wrap table-wrap-scroll"><table class="analisis-table">
      <thead><tr><th>Mes</th><th>Tipo</th><th>Cuenta / Concepto</th><th class="num">Mes anterior</th><th class="num">Mes actual</th><th class="num">Variación</th><th>${items[0] ? escapeHtml(items[0].breakdownLabel) : "Explicado por"}</th></tr></thead>
      <tbody>
        ${items.map(it => `
          <tr>
            <td>${periodoToLabel(it.periodo)}</td>
            <td>${it.tipoLabel}</td>
            <td class="cell-wrap">${it.esMargen ? "Margen general" : escapeHtml(it.cuenta)}</td>
            <td class="num">${fmtItemValor(it, it.prevValor)}</td>
            <td class="num">${fmtItemValor(it, it.actualValor)}</td>
            <td class="num" style="font-weight:700;color:${it.severidad === "positiva" ? "var(--success)" : "var(--danger)"}">${analisisVariacionHtml(it)}</td>
            <td class="cell-wrap">${analisisBreakdownHtml(it)}</td>
          </tr>`).join("")}
      </tbody>
    </table></div>`;
}

/** Resumen textual tipo "la variacion entre junio y julio en ESSA se debe
 * a...": toma los puntos ya detectados (filtrados por el/los mes(es)
 * elegidos) y los redacta en prosa + listas numeradas, enfocado en el ULTIMO
 * mes seleccionado (o el ultimo disponible si no hay filtro de mes) vs. el
 * mes inmediatamente anterior -- asi responde directo "a que se debe el
 * cambio entre estos dos meses", con la disminucion de ingresos y el
 * incremento de costos como bloques separados, y las mejoras aparte. */
function buildResumenNarrativoHtml(filtered, meses, proyectoLabel) {
  if (!filtered.length) return "";
  const periodoFoco = meses.length ? Math.max(...meses.map(Number)) : Math.max(...filtered.map(it => it.periodo));
  const focused = filtered.filter(it => it.periodo === periodoFoco);
  if (!focused.length) return "";
  const prevPeriodo = focused[0].prevPeriodo;

  const negIngresos = focused.filter(it => it.tipo === "ingreso" && it.severidad === "alta");
  const negCostos = focused.filter(it => it.tipo === "costo" && it.severidad === "alta");
  const posIngresos = focused.filter(it => it.tipo === "ingreso" && it.severidad === "positiva");
  const posCostos = focused.filter(it => it.tipo === "costo" && it.severidad === "positiva");
  const margenItem = focused.find(it => it.tipo === "margen");

  const itemLine = it => {
    const base = `<b>${escapeHtml(it.cuenta)}</b>: ${fmtCOP(it.prevValor)} → ${fmtCOP(it.actualValor)} (${it.deltaValor >= 0 ? "+" : ""}${fmtCOP(it.deltaValor)})`;
    const quien = it.breakdown.length ? `, principalmente por ${it.breakdownLabel.toLowerCase()} ${it.breakdown.map(d => escapeHtml(d.key) + " (" + (d.delta >= 0 ? "+" : "") + fmtCOP(d.delta) + ")").join(" y ")}` : "";
    return base + quien;
  };
  const pStyle = "font-size:12.5px;color:var(--text-dim);line-height:1.6;margin:0 0 8px;";
  const olStyle = "font-size:12.5px;color:var(--text-dim);line-height:1.75;margin:0 0 12px 18px;padding:0;";

  let html = `<p style="${pStyle}">La variación entre <b>${periodoToLabel(prevPeriodo)}</b> y <b>${periodoToLabel(periodoFoco)}</b> en <b>${escapeHtml(proyectoLabel)}</b> se explica por:</p>`;

  if (margenItem) {
    const dir = margenItem.actualValor < 0 && margenItem.prevValor >= 0 ? 'pasó a ser <b style="color:var(--danger)">negativo</b>'
      : (margenItem.actualValor >= margenItem.prevValor ? "mejoró" : "se deterioró");
    html += `<p style="${pStyle}">El margen ${dir}: ${fmtPct(margenItem.prevValor)} → ${fmtPct(margenItem.actualValor)}.</p>`;
  }

  if (negIngresos.length) {
    html += `<p style="${pStyle}color:var(--danger);font-weight:700;margin-top:12px;">↓ Disminución de ingresos por:</p><ol style="${olStyle}">${negIngresos.map(it => `<li>${itemLine(it)}.</li>`).join("")}</ol>`;
  }
  if (negCostos.length) {
    html += `<p style="${pStyle}color:var(--danger);font-weight:700;margin-top:12px;">↑ Incremento de costos por:</p><ol style="${olStyle}">${negCostos.map(it => `<li>${itemLine(it)}.</li>`).join("")}</ol>`;
  }
  const posItems = posIngresos.concat(posCostos);
  if (posItems.length) {
    html += `<p style="${pStyle}color:var(--success);font-weight:700;margin-top:12px;">✓ Esto se compensó parcialmente por:</p><ol style="${olStyle}margin-bottom:0;">${posItems.map(it => `<li>${itemLine(it)}.</li>`).join("")}</ol>`;
  }
  if (!negIngresos.length && !negCostos.length && !posItems.length) {
    html += `<p style="font-size:12.5px;color:var(--text-faint);margin:0;">No se detectaron cambios relevantes de ingresos o costos en ${periodoToLabel(periodoFoco)} frente a ${periodoToLabel(prevPeriodo)}.</p>`;
  }
  return html;
}

function renderAnalisisChart(serie) {
  const canvas = document.getElementById("chart-analisis-trend");
  if (!canvas) return;
  upsertChart("chart-analisis-trend", {
    type: "bar",
    data: {
      labels: serie.map(s => periodoToLabel(s.periodo)),
      datasets: [
        { label: "Ingresos", data: serie.map(s => s.ingresos), backgroundColor: colorWithAlpha(PALETTE.secondary, .85), borderRadius: 5, maxBarThickness: 40, order: 2, datalabels: dlCompactCurrency(PALETTE.secondary) },
        { label: "Costos", data: serie.map(s => s.costos), backgroundColor: colorWithAlpha(PALETTE.danger, .8), borderRadius: 5, maxBarThickness: 40, order: 2, datalabels: dlCompactCurrency(PALETTE.danger) },
        { label: "Margen %", data: serie.map(s => s.margenPct), type: "line", yAxisID: "y1", borderColor: PALETTE.primary, backgroundColor: PALETTE.primary, tension: .3, pointRadius: 4, pointBackgroundColor: PALETTE.primary, order: 1, datalabels: dlPercent(PALETTE.primary, 0, { align: "top", offset: 8 }) },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 24 } },
      interaction: { mode: "index", intersect: false },
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

function renderAnalisis() {
  const scoped = getAnalisisScopedRows();
  const meses = STATE.analisisFilters.meses;

  // Las tarjetas KPI y la grafica SI respetan el filtro de mes (a diferencia
  // del motor de deteccion, que necesita la serie completa para comparar
  // cada mes contra el anterior) -- asi reflejan exactamente "lo que
  // seleccionaste", no todo el año.
  const rowsForKpi = meses.length ? scoped.filter(r => meses.includes(String(r.periodo))) : scoped;
  const kpi = computeFinancieroKPIs(rowsForKpi);

  const wrapKpi = document.getElementById("an-kpis");
  wrapKpi.innerHTML =
    kpiCard({ label: "Ingresos", value: fmtCOP(kpi.ingresos), icon: ICONS.ingresos, color: PALETTE.secondary, foot: kpi.count + " transacciones en el filtro" }) +
    kpiCard({ label: "Costos", value: fmtCOP(kpi.costos), icon: ICONS.costos, color: PALETTE.danger }) +
    kpiCard({ label: "Margen", value: fmtCOP(kpi.margen), icon: ICONS.margen, color: PALETTE.primary, foot: kpi.margen >= 0 ? "Resultado positivo" : "Resultado negativo" }) +
    kpiCard({ label: "Margen %", value: fmtPct(kpi.margenPct), icon: ICONS.margenPct, color: kpi.margenPct >= CFG.metaMargen ? PALETTE.success : PALETTE.warning, foot: "meta ≥ " + CFG.metaMargen + "%" });

  // Grafica: la serie completa del alcance (Proyecto/Año), pero si hay
  // meses puntuales elegidos se muestra SOLO esos (comparacion enfocada).
  const serieCompleta = monthlySeries(scoped);
  const serieChart = meses.length ? serieCompleta.filter(s => meses.includes(String(s.periodo))) : serieCompleta;
  renderAnalisisChart(serieChart.length ? serieChart : serieCompleta);

  const allInsights = buildAnalisisInsights(scoped);
  const filtered = meses.length ? allInsights.filter(it => meses.includes(String(it.periodo))) : allInsights;
  const negativos = filtered.filter(it => it.severidad === "alta" || it.severidad === "media");
  const positivos = filtered.filter(it => it.severidad === "positiva");

  const proyectoLabel = STATE.analisisFilters.proyecto || "todos los proyectos con movimiento";
  const resumenEl = document.getElementById("an-resumen");
  const resumenHtml = buildResumenNarrativoHtml(filtered, meses, proyectoLabel);
  resumenEl.innerHTML = resumenHtml || '<p class="text-dim" style="font-size:12px;margin:0;">No hay suficiente historial para redactar un resumen con los filtros actuales.</p>';

  const hint = document.getElementById("an-hint");
  if (!filtered.length) {
    hint.textContent = scoped.length ? "No se detectaron puntos críticos para los filtros actuales." : "Sin datos para los filtros actuales.";
  } else {
    hint.textContent = `${negativos.length} punto(s) negativo(s) y ${positivos.length} positivo(s) detectados · ordenados de mayor a menor impacto` +
      ((negativos.length > ANALISIS_MAX_ITEMS || positivos.length > ANALISIS_MAX_ITEMS) ? ` (mostrando los ${ANALISIS_MAX_ITEMS} de mayor impacto por categoría)` : "") + ".";
  }

  document.getElementById("an-negativos-count").textContent = negativos.length;
  document.getElementById("an-positivos-count").textContent = positivos.length;
  document.getElementById("an-negativos-table").innerHTML = analisisTableHtml(negativos.slice(0, ANALISIS_MAX_ITEMS));
  document.getElementById("an-positivos-table").innerHTML = analisisTableHtml(positivos.slice(0, ANALISIS_MAX_ITEMS));
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

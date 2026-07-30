/* =========================================================================
   20. MODULO — WIP Y PROYECCION DE FACTURACION
   ========================================================================= */

function mesKey(iso) { return iso ? String(iso).slice(0, 7) : null; }
function mesAnio(iso) { return iso ? Number(String(iso).slice(0, 4)) : null; }

/** Busca en la serie de proyeccion mensual (facturacion) el valor de un mes
 * dado (por clave "YYYY-MM"), y el del mes siguiente. */
function facturacionMesYSiguiente(proyeccionMensual, mesIso) {
  const key = mesKey(mesIso);
  const serie = proyeccionMensual || [];
  const idx = serie.findIndex(m => mesKey(m.mes) === key);
  return {
    mesActual: idx >= 0 ? serie[idx] : null,
    mesSiguiente: idx >= 0 && idx + 1 < serie.length ? serie[idx + 1] : null,
  };
}

/**
 * Igual que rowAtCutoff() del módulo de Salud (mismo concepto de "mes de
 * corte"), pero comparando por clave "YYYY-MM" en vez de timestamp exacto:
 * cada proyecto de WIP puede tener su corte un día distinto del mes (25, 26,
 * 27...), así que comparar por mes calendario evita que un corte del
 * 2026-08-25 quede "después" del cutoff 2026-08 solo por el día.
 * Devuelve { row, stale }: stale=true cuando el proyecto no tiene dato
 * exactamente en el mes de corte (ya terminó antes, o no había iniciado).
 */
function rowAtCutoffWip(historico, cutoffKey) {
  if (!historico.length) return { row: null, stale: false };
  if (!cutoffKey) return { row: historico[historico.length - 1], stale: false };
  const filtered = historico.filter(h => mesKey(h.mes) <= cutoffKey);
  if (!filtered.length) return { row: historico[historico.length - 1], stale: true };
  const row = filtered[filtered.length - 1];
  return { row, stale: mesKey(row.mes) !== cutoffKey };
}

/** Cutoff efectivo derivado de los filtros: si hay "mes" explícito se usa
 * ese; si solo hay "año" se usa diciembre de ese año (para tomar el último
 * corte disponible dentro/antes de ese año); si no hay ninguno, sin cutoff
 * (se usa siempre el último corte real de cada proyecto). */
function wipCutoffKey() {
  if (STATE.wipFilters.mes) return STATE.wipFilters.mes;
  if (STATE.wipFilters.anio) return STATE.wipFilters.anio + "-12";
  return null;
}

function wipComparativoRows() {
  const cutoff = wipCutoffKey();
  let list = getWipFacturacionProjects();
  if (STATE.wipFilters.proyecto) list = list.filter(p => p.codigo === STATE.wipFilters.proyecto);

  return list.map(p => {
    const { row, stale } = rowAtCutoffWip(p.historico, cutoff);
    const u = row || {};
    const proy = p.facturacion ? facturacionMesYSiguiente(p.facturacion.proyeccionMensual, u.mes) : { mesActual: null, mesSiguiente: null };
    return {
      codigo: p.codigo, nombre: p.nombre, cliente: p.cliente,
      mes: u.mes || null, stale,
      saldoWip: u.saldoWip ?? null,
      wipMes: u.wipMesAjustes ?? u.wipMes ?? null,
      facturacionRealMes: u.facturacionRealMes ?? null,
      facturacionRealAcum: u.facturacionRealAcum ?? null,
      pendienteFacturarReal: u.pendienteFacturarReal ?? null,
      proyeccionMesActual: proy.mesActual ? proy.mesActual.valor : null,
      proyeccionMesSiguiente: proy.mesSiguiente ? proy.mesSiguiente.valor : null,
      historico: p.historico,
      facturacion: p.facturacion,
    };
  });
}

function renderWipKPIs(rows) {
  const wrap = document.getElementById("wip-kpis");
  if (!wrap) return;
  const saldoWipTotal = sumBy(rows, r => r.saldoWip);
  const facturacionAcumTotal = sumBy(rows, r => r.facturacionRealAcum);
  const pendienteTotal = sumBy(rows, r => r.pendienteFacturarReal);
  const proyeccionSigTotal = sumBy(rows, r => r.proyeccionMesSiguiente);
  const foot = rows.length === 1 ? rows[0].nombre : rows.length + " proyectos";
  wrap.innerHTML =
    kpiCard({ label: "Saldo WIP pendiente", value: fmtCOP(saldoWipTotal), icon: ICONS.margen, color: PALETTE.violet, foot }) +
    kpiCard({ label: "Facturación real acumulada", value: fmtCOP(facturacionAcumTotal), icon: ICONS.ingresos, color: PALETTE.secondary, foot: "según balance WIP" }) +
    kpiCard({ label: "Pendiente por facturar", value: fmtCOP(pendienteTotal), icon: ICONS.costos, color: PALETTE.warning, foot: "valor contrato − facturado" }) +
    kpiCard({ label: "Proyección próximo mes", value: fmtCOP(proyeccionSigTotal), icon: ICONS.margenPct, color: PALETTE.primary, foot: "según GP-F08" });
}

function renderWipComparativoTable(rows) {
  const tbody = document.querySelector("#tbl-wip-comparativo tbody");
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="padding:14px;color:var(--text-faint);">Sin datos de WIP/Facturación para los filtros actuales.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr class="clickable" data-code="${escapeHtml(r.codigo)}">
      <td><b>${escapeHtml(truncateLabel(r.nombre, 34))}</b><div class="text-faint" style="font-size:11px;">${escapeHtml(r.codigo)}</div></td>
      <td class="num">${r.mes ? fmtDate(mesToLocalDate(r.mes)) : "—"}${r.stale ? ' <span class="text-faint" title="Este proyecto no tiene corte exacto en el mes seleccionado; se muestra su último disponible antes de ese mes.">⚠</span>' : ""}</td>
      <td class="num">${fmtCOP(r.saldoWip)}</td>
      <td class="num">${fmtCOP(r.wipMes)}</td>
      <td class="num">${fmtCOP(r.facturacionRealMes)}</td>
      <td class="num">${fmtCOP(r.facturacionRealAcum)}</td>
      <td class="num">${fmtCOP(r.pendienteFacturarReal)}</td>
      <td class="num">${fmtCOP(r.proyeccionMesSiguiente)}</td>
    </tr>`).join("");
  tbody.querySelectorAll("tr[data-code]").forEach(tr => {
    tr.addEventListener("click", () => {
      STATE.wipFilters.proyecto = tr.dataset.code;
      document.getElementById("f-wip-proyecto").value = tr.dataset.code;
      renderWip();
    });
  });
}

function renderWipEvolucionChart(row) {
  const canvas = document.getElementById("chart-wip-evolucion");
  if (!canvas) return;
  const hist = row ? row.historico : [];
  const proyAcum = row && row.facturacion ? proyeccionAcumulada(row.facturacion.proyeccionMensual) : [];
  const labels = hist.map(h => fmtDate(mesToLocalDate(h.mes)));
  const proyByKey = new Map(proyAcum.map(p => [mesKey(p.mes), p.acumulado]));

  upsertChart("chart-wip-evolucion", {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Saldo WIP", data: hist.map(h => h.saldoWip), borderColor: PALETTE.violet,
          backgroundColor: colorWithAlpha(PALETTE.violet, .12), fill: true, tension: .25, pointRadius: 2,
        },
        {
          label: "Facturación real acumulada", data: hist.map(h => h.facturacionRealAcum), borderColor: PALETTE.secondary,
          backgroundColor: "transparent", tension: .25, pointRadius: 2,
        },
        {
          label: "Proyección facturación acumulada", data: hist.map(h => proyByKey.get(mesKey(h.mes)) ?? null), borderColor: PALETTE.primary,
          borderDash: [5, 4], backgroundColor: "transparent", tension: .25, pointRadius: 2,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: { y: { ticks: { callback: v => fmtCompact(v) } } },
      plugins: {
        legend: { position: "bottom" },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmtCOP(ctx.parsed.y)}` } },
        datalabels: { display: false },
      },
    },
  });
}

function renderWipSemanalChart(row) {
  const canvas = document.getElementById("chart-wip-semanal");
  const card = canvas ? canvas.closest(".card") : null;
  if (!canvas) return;
  const mesConSemanas = row ? [...row.historico].reverse().find(h => h.semanas && h.semanas.length && h.semanas.some(s => s.wipSemana !== null)) : null;
  if (!mesConSemanas) {
    if (card) card.style.display = "none";
    return;
  }
  if (card) card.style.display = "";
  const hint = card ? card.querySelector(".card-hint") : null;
  if (hint) hint.textContent = "Detalle semanal de " + fmtDate(mesToLocalDate(mesConSemanas.mes));

  upsertChart("chart-wip-semanal", {
    type: "bar",
    data: {
      labels: mesConSemanas.semanas.map(s => s.semana),
      datasets: [{
        label: "WIP de la semana", data: mesConSemanas.semanas.map(s => s.wipSemana), backgroundColor: PALETTE.violet, borderRadius: 6,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { ticks: { callback: v => fmtCompact(v) } } },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` WIP semana: ${fmtCOP(ctx.parsed.y)}` } },
        datalabels: dlCompactCurrency(PALETTE.violet),
      },
    },
  });
}

function renderWipHistoricoTable(row) {
  const tbody = document.querySelector("#tbl-wip-historico tbody");
  if (!tbody) return;
  if (!row || !row.historico.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="padding:14px;color:var(--text-faint);">Selecciona un proyecto con datos de WIP.</td></tr>';
    return;
  }
  const hist = [...row.historico].reverse();
  tbody.innerHTML = hist.map(h => `
    <tr class="${h.semanas && h.semanas.length ? "clickable" : ""}" data-mes="${escapeHtml(h.mes)}">
      <td>${fmtDate(mesToLocalDate(h.mes))} ${h.semanas && h.semanas.length ? '<span class="text-faint" style="font-size:11px;">(semanal ⌄)</span>' : ""}</td>
      <td class="num">${fmtCOP(h.saldoWip)}</td>
      <td class="num">${fmtCOP(h.wipMesAjustes ?? h.wipMes)}</td>
      <td class="num">${fmtCOP(h.facturacionRealMes)}</td>
      <td class="num">${fmtCOP(h.facturacionRealAcum)}</td>
      <td class="num">${fmtCOP(h.pendienteFacturarReal)}</td>
      <td class="cell-wrap">${escapeHtml(h.observaciones || "—")}</td>
    </tr>`).join("");

  tbody.querySelectorAll("tr[data-mes]").forEach(tr => {
    tr.addEventListener("click", () => {
      const h = row.historico.find(x => x.mes === tr.dataset.mes);
      if (!h || !h.semanas || !h.semanas.length) return;
      const rowsHtml = h.semanas.map(s => `
        <tr><td>${escapeHtml(s.semana)}</td><td class="num">${fmtCOP(s.saldoWip)}</td><td class="num">${fmtCOP(s.wipSemana)}</td></tr>`).join("");
      openModal(
        "Detalle semanal — " + fmtDate(mesToLocalDate(h.mes)),
        row.nombre,
        `<div class="table-wrap"><table><thead><tr><th>Semana</th><th class="num">Saldo WIP</th><th class="num">WIP semana</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>`
      );
    });
  });
}

/** Proyecto a usar para las gráficas/tabla histórica de detalle: si hay uno
 * seleccionado en el filtro se usa ese; si el filtro está en "Todos" se usa
 * el primero de la lista visible, para que siempre haya algo que mostrar. */
function getWipDetalleProject(rows) {
  if (!rows.length) return null;
  if (STATE.wipFilters.proyecto) return rows.find(r => r.codigo === STATE.wipFilters.proyecto) || rows[0];
  return rows[0];
}

function renderWipDetalle(rows) {
  const row = getWipDetalleProject(rows);
  document.getElementById("wip-detalle-title").textContent = row ? row.nombre + " (" + row.codigo + ")" + (!STATE.wipFilters.proyecto ? " · mostrando el primero de la lista, filtra por proyecto para ver otro" : "") : "Sin proyectos para mostrar";
  renderWipEvolucionChart(row);
  renderWipSemanalChart(row);
  renderWipHistoricoTable(row);
}

function allWipHistoricoEntries() {
  const out = [];
  getWipFacturacionProjects().forEach(p => p.historico.forEach(h => out.push(h)));
  return out;
}

function populateWipFilterOptions() {
  const selP = document.getElementById("f-wip-proyecto");
  const selA = document.getElementById("f-wip-anio");
  if (!selP || !selA) return;

  const allProjects = getWipFacturacionProjects();
  const curP = STATE.wipFilters.proyecto;
  selP.innerHTML = '<option value="">Proyecto: todos</option>' + allProjects.map(p => `<option value="${escapeHtml(p.codigo)}">${escapeHtml(truncateLabel(p.nombre, 40))}</option>`).join("");
  selP.value = allProjects.some(p => p.codigo === curP) ? curP : "";
  if (!allProjects.some(p => p.codigo === curP)) STATE.wipFilters.proyecto = "";

  const anios = uniqueSorted(allWipHistoricoEntries().map(h => mesAnio(h.mes))).sort((a, b) => b - a);
  selA.innerHTML = '<option value="">Año: todos</option>' + anios.map(a => `<option value="${a}">${a}</option>`).join("");
  selA.value = anios.includes(Number(STATE.wipFilters.anio)) ? STATE.wipFilters.anio : "";
  if (!anios.includes(Number(STATE.wipFilters.anio))) STATE.wipFilters.anio = "";

  populateWipMesOptions();
}

/** El "Mes de corte" solo ofrece los meses que existen dentro del Año /
 * Proyecto ya seleccionados (mismo criterio que Salud de Proyectos). */
function populateWipMesOptions() {
  const selM = document.getElementById("f-wip-mes");
  if (!selM) return;
  let projects = getWipFacturacionProjects();
  if (STATE.wipFilters.proyecto) projects = projects.filter(p => p.codigo === STATE.wipFilters.proyecto);
  let entries = [];
  projects.forEach(p => entries.push(...p.historico));
  if (STATE.wipFilters.anio) entries = entries.filter(h => mesAnio(h.mes) === Number(STATE.wipFilters.anio));

  const keys = uniqueSorted(entries.map(h => mesKey(h.mes))).sort();
  selM.innerHTML = '<option value="">Mes de corte: más reciente</option>' + keys.map(k => {
    const d = mesToLocalDate(k + "-01");
    return `<option value="${k}">${d.toLocaleDateString("es-CO", { year: "numeric", month: "long" })}</option>`;
  }).join("");
  const valid = keys.includes(STATE.wipFilters.mes);
  selM.value = valid ? STATE.wipFilters.mes : "";
  if (!valid) STATE.wipFilters.mes = "";
}

function wireWipFilters() {
  const selP = document.getElementById("f-wip-proyecto");
  const selA = document.getElementById("f-wip-anio");
  const selM = document.getElementById("f-wip-mes");
  const btnClear = document.getElementById("btn-clear-filters-wip");
  if (!selP) return;
  selP.addEventListener("change", () => { STATE.wipFilters.proyecto = selP.value; populateWipMesOptions(); renderWip(); });
  selA.addEventListener("change", () => { STATE.wipFilters.anio = selA.value; populateWipMesOptions(); renderWip(); });
  selM.addEventListener("change", () => { STATE.wipFilters.mes = selM.value; renderWip(); });
  if (btnClear) btnClear.addEventListener("click", () => {
    STATE.wipFilters = { proyecto: "", anio: "", mes: "" };
    populateWipFilterOptions();
    renderWip();
  });
}

function renderWip() {
  populateWipFilterOptions();
  const rows = wipComparativoRows();
  renderWipKPIs(rows);
  renderWipComparativoTable(rows);
  renderWipDetalle(rows);

  const badge = document.getElementById("badge-wip-source");
  if (badge) {
    const wipFile = STATE.wip._sourceFile, factFile = STATE.facturacion._sourceFile;
    badge.textContent = wipFile || factFile
      ? "WIP: " + (wipFile || "—") + " · Facturación: " + (factFile || "—")
      : "— sin datos —";
  }
}

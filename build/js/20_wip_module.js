/* =========================================================================
   20. MODULO — WIP Y PROYECCION DE FACTURACION
   ========================================================================= */

function mesKey(iso) { return iso ? String(iso).slice(0, 7) : null; }

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

function wipComparativoRows() {
  return getWipFacturacionProjects().map(p => {
    const u = p.ultimo || {};
    const proy = p.facturacion ? facturacionMesYSiguiente(p.facturacion.proyeccionMensual, u.mes) : { mesActual: null, mesSiguiente: null };
    return {
      codigo: p.codigo, nombre: p.nombre, cliente: p.cliente,
      mes: u.mes || null,
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
  wrap.innerHTML =
    kpiCard({ label: "Saldo WIP pendiente", value: fmtCOP(saldoWipTotal), icon: ICONS.margen, color: PALETTE.violet, foot: rows.length + " proyectos" }) +
    kpiCard({ label: "Facturación real acumulada", value: fmtCOP(facturacionAcumTotal), icon: ICONS.ingresos, color: PALETTE.secondary, foot: "según balance WIP" }) +
    kpiCard({ label: "Pendiente por facturar", value: fmtCOP(pendienteTotal), icon: ICONS.costos, color: PALETTE.warning, foot: "valor contrato − facturado" }) +
    kpiCard({ label: "Proyección próximo mes", value: fmtCOP(proyeccionSigTotal), icon: ICONS.margenPct, color: PALETTE.primary, foot: "según GP-F08" });
}

function renderWipComparativoTable(rows) {
  const tbody = document.querySelector("#tbl-wip-comparativo tbody");
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="padding:14px;color:var(--text-faint);">Sin datos de WIP/Facturación cargados.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr class="clickable" data-code="${escapeHtml(r.codigo)}">
      <td><b>${escapeHtml(truncateLabel(r.nombre, 34))}</b><div class="text-faint" style="font-size:11px;">${escapeHtml(r.codigo)}</div></td>
      <td class="num">${fmtDate(r.mes)}</td>
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
      renderWipDetalle();
    });
  });
}

function renderWipEvolucionChart(row) {
  const canvas = document.getElementById("chart-wip-evolucion");
  if (!canvas) return;
  const hist = row ? row.historico : [];
  const proyAcum = row && row.facturacion ? proyeccionAcumulada(row.facturacion.proyeccionMensual) : [];
  const labels = hist.map(h => fmtDate(h.mes));
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
  if (hint) hint.textContent = "Detalle semanal de " + fmtDate(mesConSemanas.mes);

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
      <td>${fmtDate(h.mes)} ${h.semanas && h.semanas.length ? '<span class="text-faint" style="font-size:11px;">(semanal ⌄)</span>' : ""}</td>
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
        "Detalle semanal — " + fmtDate(h.mes),
        row.nombre,
        `<div class="table-wrap"><table><thead><tr><th>Semana</th><th class="num">Saldo WIP</th><th class="num">WIP semana</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>`
      );
    });
  });
}

function renderWipDetalle() {
  const rows = wipComparativoRows();
  const code = STATE.wipFilters.proyecto;
  const row = code ? rows.find(r => r.codigo === code) : rows[0];
  document.getElementById("wip-detalle-title").textContent = row ? row.nombre + " (" + row.codigo + ")" : "Selecciona un proyecto";
  renderWipEvolucionChart(row);
  renderWipSemanalChart(row);
  renderWipHistoricoTable(row);
}

function populateWipFilterOptions() {
  const sel = document.getElementById("f-wip-proyecto");
  if (!sel) return;
  const rows = wipComparativoRows();
  const current = sel.value;
  sel.innerHTML = '<option value="">Proyecto: selecciona uno</option>' + rows.map(r => `<option value="${escapeHtml(r.codigo)}">${escapeHtml(truncateLabel(r.nombre, 40))}</option>`).join("");
  if (rows.some(r => r.codigo === current)) sel.value = current;
  else if (rows.length) { sel.value = rows[0].codigo; STATE.wipFilters.proyecto = rows[0].codigo; }
}

function wireWipFilters() {
  const sel = document.getElementById("f-wip-proyecto");
  if (!sel) return;
  sel.addEventListener("change", () => {
    STATE.wipFilters.proyecto = sel.value;
    renderWipDetalle();
  });
}

function renderWip() {
  const rows = wipComparativoRows();
  renderWipKPIs(rows);
  renderWipComparativoTable(rows);
  populateWipFilterOptions();
  renderWipDetalle();

  const badge = document.getElementById("badge-wip-source");
  if (badge) {
    const wipFile = STATE.wip._sourceFile, factFile = STATE.facturacion._sourceFile;
    badge.textContent = wipFile || factFile
      ? "WIP: " + (wipFile || "—") + " · Facturación: " + (factFile || "—")
      : "— sin datos —";
  }
}

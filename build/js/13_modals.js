/* =========================================================================
   13. MODALES DE DETALLE (clic en graficas / matriz / proyectos)
   ========================================================================= */

function openModal(title, sub, bodyHtml) {
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-sub").textContent = sub || "";
  document.getElementById("modal-body").innerHTML = bodyHtml;
  document.getElementById("modal-overlay").classList.add("open");
}
function closeModal() {
  document.getElementById("modal-overlay").classList.remove("open");
}

function miniTxTable(rows, limit) {
  const sorted = rows.slice().sort((a, b) => Math.abs(b.importe) - Math.abs(a.importe));
  const shown = sorted.slice(0, limit || 60);
  const rowsHtml = shown.map(r => `
    <tr>
      <td>${fmtDate(r.fecha)}</td>
      <td class="cell-wrap">${escapeHtml(r.descripcion || "—")}</td>
      <td class="cell-wrap">${escapeHtml(r.tercero || "—")}</td>
      <td>${escapeHtml(r.empleado || "—")}</td>
      <td class="num" style="color:${r.esIngreso ? "var(--secondary)" : "var(--text)"}">${fmtCOP(r.importe)}</td>
    </tr>`).join("");
  const more = sorted.length > shown.length ? `<div class="text-faint" style="font-size:11px;margin-top:8px;">Mostrando ${shown.length} de ${sorted.length} transacciones (ordenadas por valor absoluto).</div>` : "";
  return `<div class="table-wrap table-wrap-scroll-modal"><table><thead><tr><th>Fecha</th><th>Descripción</th><th>Tercero</th><th>Empleado</th><th class="num">Importe</th></tr></thead><tbody>${rowsHtml || '<tr><td colspan="5" style="padding:14px;color:var(--text-faint);">Sin transacciones.</td></tr>'}</tbody></table></div>${more}`;
}

function openMonthDetailModal(periodo) {
  const rows = getFilteredIBRows({ ignoreMes: true }).filter(r => r.periodo === periodo);
  const kpi = computeFinancieroKPIs(rows);
  const body = `
    <div class="modal-kpis">
      <div class="modal-kpi"><div class="l">Ingresos</div><div class="v" style="color:var(--secondary)">${fmtCOP(kpi.ingresos)}</div></div>
      <div class="modal-kpi"><div class="l">Costos</div><div class="v" style="color:var(--danger)">${fmtCOP(kpi.costos)}</div></div>
      <div class="modal-kpi"><div class="l">Margen</div><div class="v">${fmtCOP(kpi.margen)}</div></div>
      <div class="modal-kpi"><div class="l">Margen %</div><div class="v">${fmtPct(kpi.margenPct)}</div></div>
    </div>
    ${miniTxTable(rows, 80)}`;
  openModal("Detalle de " + periodoToLabel(periodo), kpi.count + " transacciones en el mes (según filtros activos)", body);
}

function openCuentaBreakdownModal(item, kindLabel, backFn) {
  const porEmpleado = costoPorPersonal(item.rows).slice(0, 8);
  const empHtml = porEmpleado.length ? `
    <div class="section-title" style="font-size:12px;margin:14px 0 6px;">Personal / terceros involucrados</div>
    <div class="gerente-list gerente-list-scroll">
      ${porEmpleado.map(e => `<div class="gerente-row"><span class="name">${escapeHtml(e.label)}</span><span class="pct">${fmtCOP(e.value)}</span></div>`).join("")}
    </div>` : "";
  const backHtml = backFn ? `<button class="btn btn-ghost btn-sm" id="modal-back-btn" style="margin-bottom:12px;">‹ Volver</button>` : "";
  const body = `
    ${backHtml}
    <div class="modal-kpis">
      <div class="modal-kpi"><div class="l">Total</div><div class="v">${fmtCOP(item.value)}</div></div>
      <div class="modal-kpi"><div class="l"># Transacciones</div><div class="v">${item.rows.length}</div></div>
    </div>
    ${empHtml}
    <div class="mt-8"></div>
    ${miniTxTable(item.rows, 80)}`;
  openModal(item.label, kindLabel, body);
  if (backFn) document.getElementById("modal-back-btn").addEventListener("click", backFn);
}

function openCostoCategoriaModal(cat, rows, totalAmbasCategorias) {
  const total = sumBy(rows, r => r.importe);
  const porCuenta = costosPorCuentaMayor(rows);
  const catLabel = cat === "directo" ? "Costos directos" : "Otros costos";
  const cuentasHtml = porCuenta.map((d, i) => `
    <div class="gerente-row clickable" data-idx="${i}" title="Clic para ver el detalle de esta cuenta">
      <span class="name">${escapeHtml(d.label)}</span>
      <span class="pct">${fmtCOP(d.value)} · ${fmtPct(total ? d.value / total * 100 : 0, 0)}</span>
    </div>`).join("");
  const porEmpleado = costoPorPersonal(rows).slice(0, 8);
  const empHtml = porEmpleado.length ? `
    <div class="section-title" style="font-size:12px;margin:14px 0 6px;">Personal involucrado</div>
    <div class="gerente-list gerente-list-scroll">${porEmpleado.map(e => `<div class="gerente-row"><span class="name">${escapeHtml(e.label)}</span><span class="pct">${fmtCOP(e.value)}</span></div>`).join("")}</div>` : "";

  const body = `
    <div class="modal-kpis">
      <div class="modal-kpi"><div class="l">Total</div><div class="v">${fmtCOP(total)}</div></div>
      <div class="modal-kpi"><div class="l">% del total de costos</div><div class="v">${fmtPct(totalAmbasCategorias ? total / totalAmbasCategorias * 100 : 0)}</div></div>
      <div class="modal-kpi"><div class="l"># Transacciones</div><div class="v">${rows.length}</div></div>
    </div>
    <div class="section-title" style="font-size:12px;margin-bottom:6px;">Cuentas mayores incluidas <span class="text-faint" style="font-weight:500;text-transform:none;">· clic en una para ver su detalle</span></div>
    <div class="gerente-list gerente-list-scroll" id="modal-cuentas-list">${cuentasHtml || '<div class="text-faint" style="font-size:12px;">Sin cuentas para este filtro.</div>'}</div>
    ${empHtml}
    <div class="mt-8"></div>
    ${miniTxTable(rows, 80)}`;
  openModal(catLabel, "Clasificación oficial del IBReport (campo Eri_est) · según los filtros activos", body);

  document.querySelectorAll("#modal-cuentas-list .gerente-row[data-idx]").forEach(elx => {
    elx.addEventListener("click", () => {
      const item = porCuenta[Number(elx.dataset.idx)];
      openCuentaBreakdownModal(item, catLabel + " › " + item.label, () => openCostoCategoriaModal(cat, rows, totalAmbasCategorias));
    });
  });
}

function openMatrixCellModal(cuenta, periodo, matrix, periodos) {
  const rows = getFilteredIBRows({ ignoreMes: true }).filter(r => !r.esIngreso && r.cuentaMayor === cuenta && r.periodo === periodo);
  const idx = periodos.indexOf(periodo);
  const prevPeriodo = idx > 0 ? periodos[idx - 1] : null;
  const currVal = matrix[cuenta][periodo];
  const prevVal = prevPeriodo !== null ? matrix[cuenta][prevPeriodo] : null;
  const variacion = (prevVal !== null && prevVal !== 0) ? ((currVal - prevVal) / Math.abs(prevVal)) * 100 : null;
  const porEmpleado = costoPorPersonal(rows).slice(0, 8);

  const body = `
    <div class="modal-kpis">
      <div class="modal-kpi"><div class="l">${periodoToLabel(periodo)}</div><div class="v">${fmtCOP(currVal)}</div></div>
      <div class="modal-kpi"><div class="l">${prevPeriodo ? periodoToLabel(prevPeriodo) : "Mes anterior"}</div><div class="v">${prevVal !== null ? fmtCOP(prevVal) : "—"}</div></div>
      <div class="modal-kpi"><div class="l">Variación</div><div class="v" style="color:${variacion === null ? "inherit" : (variacion >= 0 ? "var(--danger)" : "var(--success)")}">${variacion === null ? "—" : (variacion >= 0 ? "+" : "") + variacion.toFixed(1) + "%"}</div></div>
    </div>
    ${porEmpleado.length ? `<div class="section-title" style="font-size:12px;margin-bottom:6px;">Personal involucrado</div><div class="gerente-list">${porEmpleado.map(e => `<div class="gerente-row"><span class="name">${escapeHtml(e.label)}</span><span class="pct">${fmtCOP(e.value)}</span></div>`).join("")}</div>` : ""}
    <div class="mt-8"></div>
    ${miniTxTable(rows, 80)}`;
  openModal(cuenta, periodoToLabel(periodo) + " · detalle de la matriz de costos", body);
}

function openProjectModal(code, list) {
  const p = list.find(x => x.codigo === code) || getProjectAggregates().find(x => x.codigo === code);
  if (!p) return;
  const reg = p.registro;
  const serie = monthlySeries(p.rows);
  const seriesHtml = serie.map(s => `<tr><td>${periodoToLabel(s.periodo)}</td><td class="num">${fmtCOP(s.ingresos)}</td><td class="num">${fmtCOP(s.costos)}</td><td class="num">${fmtPct(s.margenPct)}</td></tr>`).join("");

  const infoRows = reg ? `
    <div class="modal-kpis">
      <div class="modal-kpi"><div class="l">Cliente</div><div class="v" style="font-size:13px;">${escapeHtml(reg.cliente || "—")}</div></div>
      <div class="modal-kpi"><div class="l">Gerente</div><div class="v" style="font-size:13px;">${escapeHtml(reg.gerente || "—")}</div></div>
      <div class="modal-kpi"><div class="l">Contrato</div><div class="v" style="font-size:13px;">${escapeHtml(reg.contrato || "—")}</div></div>
      <div class="modal-kpi"><div class="l">Vigencia</div><div class="v" style="font-size:12.5px;">${fmtDate(reg.fechaInicio)} – ${fmtDate(reg.fechaFin)}</div></div>
    </div>
    ${reg.objeto ? `<p class="text-dim" style="font-size:12px;line-height:1.5;">${escapeHtml(reg.objeto)}</p>` : ""}` : "";

  const body = `
    ${infoRows}
    <div class="modal-kpis">
      <div class="modal-kpi"><div class="l">Ingresos totales</div><div class="v" style="color:var(--secondary)">${fmtCOP(p.ingresos)}</div></div>
      <div class="modal-kpi"><div class="l">Costos totales</div><div class="v" style="color:var(--danger)">${fmtCOP(p.costos)}</div></div>
      <div class="modal-kpi"><div class="l">Margen</div><div class="v">${fmtPct(p.margenPct)}</div></div>
    </div>
    <div class="table-wrap"><table><thead><tr><th>Mes</th><th class="num">Ingresos</th><th class="num">Costos</th><th class="num">Margen %</th></tr></thead><tbody>${seriesHtml}</tbody></table></div>
    <button class="btn btn-primary mt-8" id="btn-ver-transacciones-proyecto">Ver transacciones de este proyecto</button>`;
  openModal(p.nombre, p.codigo, body);

  document.getElementById("btn-ver-transacciones-proyecto").addEventListener("click", () => {
    STATE.filters.proyecto = p.rows[0] ? p.rows[0].proyecto : "";
    closeModal();
    switchView("financiero");
    populateFinancieroFilterOptions();
    renderFinanciero();
  });
}

function wireModal() {
  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("modal-overlay").addEventListener("click", e => { if (e.target.id === "modal-overlay") closeModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
}

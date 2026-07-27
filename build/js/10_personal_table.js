/* =========================================================================
   10. TABLA — ANALISIS DE PERSONAL
   ========================================================================= */

function renderPersonalTable(rows) {
  const filtradas = costoPorPersonal(rows);
  const totales = groupBy(STATE.ib.rows.filter(r => !r.esIngreso && r.empleado), r => r.empleado);

  const tbody = document.querySelector("#tbl-personal tbody");
  if (!filtradas.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="padding:18px;color:var(--text-faint);">Sin costos de personal para los filtros actuales.</td></tr>';
    return;
  }
  tbody.innerHTML = filtradas.map(f => {
    const totalRows = totales.get(f.label) || [];
    const totalCosto = sumBy(totalRows, r => r.importe);
    const pct = totalCosto ? (f.value / totalCosto) * 100 : 0;
    return `<tr><td>${escapeHtml(f.label)}</td><td class="num">${fmtCOP(f.value)}</td><td class="num">${fmtCOP(totalCosto)}</td><td class="num">${fmtPct(pct)}</td><td class="num">${f.rows.length}</td></tr>`;
  }).join("");
}

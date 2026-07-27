/* =========================================================================
   12. TABLA DE TRANSACCIONES (paginada)
   ========================================================================= */

function renderTransactionsTable(rows, opts) {
  opts = opts || {};
  const sorted = rows.slice().sort((a, b) => (b.fecha ? b.fecha.getTime() : 0) - (a.fecha ? a.fecha.getTime() : 0));
  const pageSize = CFG.txPageSize;
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  if (STATE.tx.page >= totalPages) STATE.tx.page = totalPages - 1;
  if (STATE.tx.page < 0) STATE.tx.page = 0;
  const start = STATE.tx.page * pageSize;
  const pageRows = sorted.slice(start, start + pageSize);

  const tbody = document.querySelector("#tbl-transacciones tbody");
  if (!pageRows.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="padding:18px;color:var(--text-faint);">Sin transacciones para los filtros actuales.</td></tr>';
  } else {
    tbody.innerHTML = pageRows.map(r => `
      <tr>
        <td>${fmtDate(r.fecha)}</td>
        <td>${escapeHtml(truncateLabel(r.proyecto, 22))}</td>
        <td>${escapeHtml(r.tipo || "—")}</td>
        <td>${escapeHtml(truncateLabel(r.cuentaMayor, 20))}</td>
        <td>${escapeHtml(truncateLabel(r.cuenta, 22))}</td>
        <td>${escapeHtml(truncateLabel(r.descripcion, 34))}</td>
        <td>${escapeHtml(truncateLabel(r.tercero, 22))}</td>
        <td>${escapeHtml(r.empleado || "—")}</td>
        <td class="num" style="color:${r.esIngreso ? "var(--secondary)" : "var(--text)"}">${fmtCOP(r.importe)}</td>
      </tr>`).join("");
  }

  document.getElementById("tx-count-hint").textContent = sorted.length.toLocaleString("es-CO") + " transacciones encontradas";
  document.getElementById("tx-pager-info").textContent = sorted.length
    ? `Mostrando ${start + 1}–${Math.min(start + pageSize, sorted.length)} de ${sorted.length}`
    : "Sin resultados";
  document.getElementById("tx-prev").disabled = STATE.tx.page <= 0;
  document.getElementById("tx-next").disabled = STATE.tx.page >= totalPages - 1;
}

function wireTransactionsPager() {
  document.getElementById("tx-prev").addEventListener("click", () => { STATE.tx.page--; renderFinanciero({ skipHeavy: true }); });
  document.getElementById("tx-next").addEventListener("click", () => { STATE.tx.page++; renderFinanciero({ skipHeavy: true }); });
}

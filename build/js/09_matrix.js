/* =========================================================================
   09. MATRIZ MENSUAL DE COSTOS + DETECCION DE ANOMALIAS
   ========================================================================= */

function buildCostMatrix(rows) {
  const costRows = rows.filter(r => !r.esIngreso);
  const cuentas = uniqueSorted(costRows.map(r => r.cuentaMayor));
  const periodos = uniqueSorted(costRows.map(r => r.periodo)).map(Number).sort((a, b) => a - b);

  const matrix = {}; // cuenta -> periodo -> value
  cuentas.forEach(c => { matrix[c] = {}; periodos.forEach(p => matrix[c][p] = 0); });
  costRows.forEach(r => { matrix[r.cuentaMayor][r.periodo] = (matrix[r.cuentaMayor][r.periodo] || 0) + r.importe; });

  // Solo se resaltan AUMENTOS inusuales de costo (posible sobrecosto a
  // revisar). Una caida fuerte en un costo es una buena noticia, no una
  // anomalia que revisar, asi que ya no se marca en rojo (antes se
  // resaltaban por igual subidas y bajadas, usando el valor absoluto del
  // cambio, lo cual hacia ver como "problema" algo que en realidad era una
  // mejora).
  const anomalies = new Set();
  const anomalyList = [];
  cuentas.forEach(c => {
    const vals = periodos.map(p => matrix[c][p]);
    const nonZero = vals.filter(v => v !== 0);
    const m = avg(nonZero), sd = stdev(nonZero);
    for (let i = 1; i < periodos.length; i++) {
      const prev = vals[i - 1], curr = vals[i];
      if (curr === 0) continue;
      const pctChange = prev !== 0 ? (curr - prev) / Math.abs(prev) : Infinity;
      const zFlag = sd > 0 && (curr - m) > CFG.anomalyZ * sd;       // muy por ENCIMA del promedio
      const pctFlag = pctChange >= CFG.anomalyMinPct && Math.abs(curr) > 250000; // solo aumentos vs. mes anterior
      if ((zFlag || pctFlag) && Math.abs(curr) > 250000) {
        const key = c + "|" + periodos[i];
        anomalies.add(key);
        anomalyList.push({ cuenta: c, periodo: periodos[i], value: curr, prevValue: prev, pctChange });
      }
    }
  });
  anomalyList.sort((a, b) => Math.abs(b.value) - Math.abs(a.value) || b.periodo - a.periodo);

  return { cuentas, periodos, matrix, anomalies, anomalyList };
}

function renderMatrix(rows) {
  const { cuentas, periodos, matrix, anomalies } = buildCostMatrix(rows);
  const thead = document.querySelector("#tbl-matrix thead");
  const tbody = document.querySelector("#tbl-matrix tbody");

  if (!cuentas.length) {
    thead.innerHTML = "";
    tbody.innerHTML = '<tr><td style="padding:20px;color:var(--text-faint);">Sin datos de costos para los filtros actuales.</td></tr>';
    return;
  }

  thead.innerHTML = "<tr><th class='rowhead'>Cuenta mayor</th>" + periodos.map(p => `<th class="num">${periodoToLabel(p)}</th>`).join("") + "<th class='num'>Total</th></tr>";

  tbody.innerHTML = cuentas.map(c => {
    const rowTotal = periodos.reduce((s, p) => s + matrix[c][p], 0);
    const cells = periodos.map(p => {
      const v = matrix[c][p];
      const isAnom = anomalies.has(c + "|" + p);
      return `<td class="mval${isAnom ? " anomaly" : ""}" data-cuenta="${escapeHtml(c)}" data-periodo="${p}">${v ? fmtCompact(v) : "—"}</td>`;
    }).join("");
    return `<tr><th class="rowhead">${escapeHtml(c)}</th>${cells}<td class="num" style="font-weight:700;">${fmtCompact(rowTotal)}</td></tr>`;
  }).join("");

  tbody.querySelectorAll("td.mval").forEach(td => {
    td.addEventListener("click", () => {
      const cuenta = td.dataset.cuenta, periodo = Number(td.dataset.periodo);
      openMatrixCellModal(cuenta, periodo, matrix, periodos);
    });
  });
}

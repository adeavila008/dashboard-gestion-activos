/* =========================================================================
   09. MATRIZ MENSUAL DE COSTOS + DETECCION DE ANOMALIAS
   ========================================================================= */

function buildCostMatrix(rows) {
  const costRows = rows.filter(r => !r.esIngreso);
  const cuentas = uniqueSorted(costRows.map(r => r.cuentaMayor));
  const periodos = uniqueSorted(costRows.map(r => r.periodo)).map(Number).sort((a, b) => a - b);

  const matrix = {}; // cuentaMayor -> periodo -> value
  const catCount = {}; // cuenta -> conteo de transacciones por categoria (directo/otro)
  cuentas.forEach(c => { matrix[c] = {}; periodos.forEach(p => matrix[c][p] = 0); catCount[c] = { directo: 0, otro: 0 }; });
  costRows.forEach(r => {
    matrix[r.cuentaMayor][r.periodo] = (matrix[r.cuentaMayor][r.periodo] || 0) + r.importe;
    catCount[r.cuentaMayor][costoCategoria(r)]++;
  });

  // Desglose por sub-cuenta ("cuenta", ej. SUELDOS/CESANTIAS dentro de la
  // cuenta mayor GASTOS DE PERSONAL) -- igual al "+" de la tabla dinamica de
  // Excel del usuario. Solo tiene sentido mostrarlo cuando una cuenta mayor
  // agrupa mas de una sub-cuenta; si solo tiene una, repetir la misma fila no
  // aporta nada.
  const subCuentasPorMayor = {}; // cuentaMayor -> [subcuentas] (solo si hay >1)
  const subMatrix = {};          // cuentaMayor -> subcuenta -> periodo -> value
  cuentas.forEach(c => { subMatrix[c] = {}; });
  costRows.forEach(r => {
    const cm = r.cuentaMayor, sc = r.cuenta;
    if (!subMatrix[cm][sc]) { subMatrix[cm][sc] = {}; periodos.forEach(p => subMatrix[cm][sc][p] = 0); }
    subMatrix[cm][sc][r.periodo] = (subMatrix[cm][sc][r.periodo] || 0) + r.importe;
  });
  cuentas.forEach(cm => {
    const subs = uniqueSorted(costRows.filter(r => r.cuentaMayor === cm).map(r => r.cuenta));
    if (subs.length > 1) subCuentasPorMayor[cm] = subs;
  });
  // Categoria oficial de cada cuenta mayor (para agrupar la matriz igual que
  // la tabla dinamica de Excel: "02 Costos Directos" / "03 Otros Costos").
  // En la practica cada cuenta cae 100% en una sola categoria; se usa la
  // mayoritaria por si alguna transaccion trajera el campo Eri_est distinto.
  const categoriaPorCuenta = {};
  cuentas.forEach(c => { categoriaPorCuenta[c] = catCount[c].directo >= catCount[c].otro ? "directo" : "otro"; });

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

  return { cuentas, periodos, matrix, anomalies, anomalyList, categoriaPorCuenta, subCuentasPorMayor, subMatrix };
}

/** Grupos de la matriz, en el mismo orden/nombre que la clasificacion
 * oficial del IBReport (campo Eri_est) y que la tabla dinamica de Excel del
 * usuario: "02 Costos Directos" primero, "03 Otros Costos" despues. */
const MATRIX_GRUPOS = [
  { key: "directo", label: "02 Costos Directos" },
  { key: "otro", label: "03 Otros Costos" },
];

/** Construye las filas HTML de la matriz (cuenta mayor + sub-cuentas
 * colapsables debajo, igual al "+" de la tabla dinamica de Excel). Se separa
 * en su propia funcion para poder reutilizarla tanto en la tarjeta normal
 * como en el modal de "Ampliar" (openMatrixExpandModal), que antes solo
 * clonaba el HTML ya renderizado -- eso funcionaba para el nivel de cuenta
 * mayor, pero el estado de los toggles (abierto/cerrado) y el data-* de las
 * sub-filas hay que reconstruirlo igual en ambos lados. */
function buildMatrixRowsHtml(built) {
  const { cuentas, periodos, matrix, anomalies, categoriaPorCuenta, subCuentasPorMayor, subMatrix } = built;
  const bodyRows = [];
  let groupSeq = 0;
  MATRIX_GRUPOS.forEach(g => {
    const cuentasGrupo = cuentas.filter(c => categoriaPorCuenta[c] === g.key);
    if (!cuentasGrupo.length) return;

    // Fila de grupo: subtotal por periodo (suma de todas las cuentas de esa categoria).
    const grupoTotal = periodos.reduce((s, p) => s + cuentasGrupo.reduce((s2, c) => s2 + matrix[c][p], 0), 0);
    const grupoCells = periodos.map(p => {
      const v = cuentasGrupo.reduce((s, c) => s + matrix[c][p], 0);
      return `<td class="num">${v ? fmtCompact(v) : "—"}</td>`;
    }).join("");
    bodyRows.push(`<tr class="matrix-group-row"><th class="rowhead">${escapeHtml(g.label)}</th>${grupoCells}<td class="num" style="font-weight:800;">${fmtCompact(grupoTotal)}</td></tr>`);

    // Cuentas mayores de ese grupo, indentadas debajo (igual que el "+" de la tabla dinamica).
    cuentasGrupo.forEach(c => {
      const subs = subCuentasPorMayor[c]; // solo definido si hay mas de 1 sub-cuenta
      const gid = "g" + (groupSeq++);
      const rowTotal = periodos.reduce((s, p) => s + matrix[c][p], 0);
      const cells = periodos.map(p => {
        const v = matrix[c][p];
        const isAnom = anomalies.has(c + "|" + p);
        return `<td class="mval${isAnom ? " anomaly" : ""}" data-cuenta="${escapeHtml(c)}" data-periodo="${p}">${v ? fmtCompact(v) : "—"}</td>`;
      }).join("");
      const toggleHtml = subs ? `<span class="matrix-toggle" data-toggle="${gid}">▸</span>` : `<span class="matrix-toggle-spacer"></span>`;
      bodyRows.push(`<tr><th class="rowhead rowhead-indent">${toggleHtml}${escapeHtml(c)}</th>${cells}<td class="num" style="font-weight:700;">${fmtCompact(rowTotal)}</td></tr>`);

      // Sub-cuentas (ej. SUELDOS, CESANTIAS... dentro de GASTOS DE PERSONAL) --
      // colapsadas por defecto, se muestran al hacer clic en el toggle "▸".
      if (subs) {
        subs.forEach(sc => {
          const scMatrix = subMatrix[c][sc];
          const scTotal = periodos.reduce((s, p) => s + (scMatrix[p] || 0), 0);
          const scCells = periodos.map(p => {
            const v = scMatrix[p] || 0;
            return `<td class="mval2" data-cuenta="${escapeHtml(c)}" data-subcuenta="${escapeHtml(sc)}" data-periodo="${p}">${v ? fmtCompact(v) : "—"}</td>`;
          }).join("");
          bodyRows.push(`<tr class="matrix-sub-row" data-group="${gid}" style="display:none;"><th class="rowhead rowhead-indent-2">${escapeHtml(sc)}</th>${scCells}<td class="num">${fmtCompact(scTotal)}</td></tr>`);
        });
      }
    });
  });
  return bodyRows.join("");
}

/** Engancha los toggles "▸"/"▾" de sub-cuentas y los clics en celdas (nivel
 * cuenta mayor y nivel sub-cuenta) dentro de un <tbody> ya renderizado con
 * buildMatrixRowsHtml(). Se separa de renderMatrix() para poder reusarla
 * tambien en el modal de "Ampliar". */
function wireMatrixRows(tbody, matrix, periodos) {
  tbody.querySelectorAll(".matrix-toggle").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const gid = btn.dataset.toggle;
      const abierta = btn.textContent === "▾";
      btn.textContent = abierta ? "▸" : "▾";
      tbody.querySelectorAll(`tr.matrix-sub-row[data-group="${gid}"]`).forEach(tr => {
        tr.style.display = abierta ? "none" : "table-row";
      });
    });
  });
  tbody.querySelectorAll("td.mval").forEach(td => {
    td.addEventListener("click", () => {
      const cuenta = td.dataset.cuenta, periodo = Number(td.dataset.periodo);
      openMatrixCellModal(cuenta, periodo, matrix, periodos);
    });
  });
  tbody.querySelectorAll("td.mval2").forEach(td => {
    td.addEventListener("click", () => {
      const cuenta = td.dataset.cuenta, subCuenta = td.dataset.subcuenta, periodo = Number(td.dataset.periodo);
      openMatrixCellModal(cuenta, periodo, matrix, periodos, subCuenta);
    });
  });
}

function renderMatrix(rows) {
  const built = buildCostMatrix(rows);
  const { cuentas, periodos, matrix } = built;
  const thead = document.querySelector("#tbl-matrix thead");
  const tbody = document.querySelector("#tbl-matrix tbody");

  if (!cuentas.length) {
    thead.innerHTML = "";
    tbody.innerHTML = '<tr><td style="padding:20px;color:var(--text-faint);">Sin datos de costos para los filtros actuales.</td></tr>';
    return;
  }

  thead.innerHTML = "<tr><th class='rowhead'>Cuenta mayor</th>" + periodos.map(p => `<th class="num">${periodoToLabel(p)}</th>`).join("") + "<th class='num'>Total</th></tr>";
  tbody.innerHTML = buildMatrixRowsHtml(built);
  wireMatrixRows(tbody, matrix, periodos);
}

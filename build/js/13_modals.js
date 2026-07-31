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
  document.getElementById("modal-box").classList.remove("modal-box-lg");
  if (STATE.charts["modal-expand-canvas"]) {
    STATE.charts["modal-expand-canvas"].destroy();
    delete STATE.charts["modal-expand-canvas"];
  }
}

/**
 * Boton "Ampliar" (⤢) de cada tarjeta: antes solo hacia scroll hasta la
 * misma tarjeta (sin cambiar nada de tamaño, por eso "no servia"). Ahora
 * abre la grafica en un modal grande, reconstruyendo un Chart.js nuevo con
 * la MISMA config/datos/interacciones de la grafica original (asi que el
 * clic para ver detalle sigue funcionando tambien dentro del modal).
 */
function openChartExpandModal(canvasId) {
  const src = STATE.charts[canvasId];
  if (!src) { showToast("Ampliar", "Todavía no hay datos para mostrar en esta gráfica.", "warning"); return; }
  const canvasEl = document.getElementById(canvasId);
  const card = canvasEl.closest(".card");
  const title = card ? (card.querySelector(".card-title")?.textContent || "Gráfica") : "Gráfica";
  const hint = card ? (card.querySelector(".card-hint")?.textContent || "") : "";

  document.getElementById("modal-box").classList.add("modal-box-lg");
  openModal(title, hint, '<div class="modal-chart-wrap"><canvas id="modal-expand-canvas"></canvas></div>');

  if (STATE.charts["modal-expand-canvas"]) STATE.charts["modal-expand-canvas"].destroy();
  // OJO: "src.options" es el objeto de opciones ya RESUELTO/mezclado con los
  // defaults que usa Chart.js internamente para dibujar (un proxy de solo
  // lectura) -- no sirve para pasarlo de nuevo como config a un Chart nuevo
  // (queda vacio/roto y el canvas no dibuja nada). Lo que hay que reusar es
  // "src.config.options", que es la config ORIGINAL tal como se le paso a
  // upsertChart() (con sus scales, plugins, callbacks, etc. intactos).
  STATE.charts["modal-expand-canvas"] = new Chart(document.getElementById("modal-expand-canvas"), {
    type: src.config.type,
    data: src.data,
    options: Object.assign({}, src.config.options, { responsive: true, maintainAspectRatio: false }),
  });
}

/** Igual que openChartExpandModal pero para la matriz de costos (es una
 * tabla, no un canvas): clona la tabla ya renderizada en un modal grande
 * con más alto/ancho, y vuelve a enganchar el clic en cada celda. */
function openMatrixExpandModal() {
  const rows = getFilteredIBRows({ ignoreMes: true });
  const { cuentas, periodos, matrix } = buildCostMatrix(rows);
  if (!cuentas.length) { showToast("Ampliar", "No hay datos de costos para los filtros actuales.", "warning"); return; }

  const theadHtml = document.querySelector("#tbl-matrix thead").innerHTML;
  const tbodyHtml = document.querySelector("#tbl-matrix tbody").innerHTML;
  document.getElementById("modal-box").classList.add("modal-box-lg");
  openModal(
    "Matriz mensual de costos por cuenta mayor",
    "clic en un valor para ver el detalle · aumentos inusuales resaltados en rojo",
    `<div class="table-wrap table-wrap-scroll-modal-lg"><table class="matrix-table"><thead>${theadHtml}</thead><tbody>${tbodyHtml}</tbody></table></div>`
  );
  document.querySelectorAll("#modal-body td.mval").forEach(td => {
    td.addEventListener("click", () => {
      const cuenta = td.dataset.cuenta, periodo = Number(td.dataset.periodo);
      openMatrixCellModal(cuenta, periodo, matrix, periodos);
    });
  });
}

/* ---------- Exportacion de modales de detalle (Excel / PDF) ----------
   Todos los modales que muestran transacciones (miniTxTable) comparten esta
   barra: un filtro de RANGO DE PERIODO ("Desde" - "Hasta", ej. 202503 a
   202508) que filtra SOLO dentro del modal (sin tocar los filtros globales
   del dashboard, para no perder el contexto al cerrarlo) y 2 botones de
   descarga que exportan TODAS las transacciones del rango elegido (no solo
   las 80 que se muestran en pantalla) -- y cuando el contexto abarca varias
   cuentas mayores (ej. "Otros costos"), separadas por cuenta (una
   hoja/tabla por cuenta) en vez de una sola tabla con todo mezclado. */

function uniquePeriodos(rows) {
  return uniqueSorted(rows.map(r => r.periodo)).map(Number).sort((a, b) => a - b);
}

/** Filtra filas cuyo periodo cae DENTRO del rango [desde, hasta] (inclusive
 * en ambos extremos). "desde"/"hasta" son strings de un <select> (o "" si no
 * hay limite en ese extremo) -- asi se puede pedir "de 202503 a 202508" o
 * dejar cualquiera de los dos lados abierto. */
function filterByPeriodoRange(rows, desde, hasta) {
  const d = desde ? Number(desde) : null;
  const h = hasta ? Number(hasta) : null;
  return rows.filter(r => (d === null || r.periodo >= d) && (h === null || r.periodo <= h));
}
function periodoRangeLabel(desde, hasta) {
  if (!desde && !hasta) return "Todos";
  if (desde && hasta) return desde === hasta ? String(desde) : desde + " a " + hasta;
  return desde ? "Desde " + desde : "Hasta " + hasta;
}

function modalExportBarHtml(idPrefix, rows, showPeriodo) {
  const periodos = uniquePeriodos(rows);
  const opts = periodos.map(p => `<option value="${p}">${escapeHtml(String(p))}</option>`).join("");
  const periodoHtml = showPeriodo === false ? "" : `
    <div class="modal-export-range">
      <span class="l">Periodo: </span>
      <select class="modal-export-select" id="${idPrefix}-periodo-desde"><option value="">Desde (inicio)</option>${opts}</select>
      <span class="l">a</span>
      <select class="modal-export-select" id="${idPrefix}-periodo-hasta"><option value="">Hasta (fin)</option>${opts}</select>
    </div>`;
  return `
    <div class="modal-export-bar">
      ${periodoHtml}
      <div class="modal-export-actions">
        <button class="btn btn-ghost btn-sm" id="${idPrefix}-export-xlsx" title="Descargar Excel (todas las transacciones del rango elegido)">⬇ Excel</button>
        <button class="btn btn-ghost btn-sm" id="${idPrefix}-export-pdf" title="Descargar PDF">⬇ PDF</button>
      </div>
    </div>`;
}

/** Engancha "Desde"/"Hasta" de la barra de exportacion para que, al
 * cambiar cualquiera de los dos, se vuelva a llamar "renderContent(desde,
 * hasta)" -- asi el rango tambien filtra lo que se VE en el modal, no solo
 * lo que se descarga. */
function wireModalPeriodoRange(idPrefix, renderContent) {
  const selD = document.getElementById(idPrefix + "-periodo-desde");
  const selH = document.getElementById(idPrefix + "-periodo-hasta");
  const onChange = () => renderContent(selD ? selD.value : "", selH ? selH.value : "");
  if (selD) selD.addEventListener("change", onChange);
  if (selH) selH.addEventListener("change", onChange);
}

function slugFilename(s) {
  return (String(s || "detalle")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase()) || "detalle";
}

function txToRecord(r) {
  return {
    Periodo: r.periodo != null ? String(r.periodo) : "",
    "Cuenta mayor": r.cuentaMayor || "",
    Descripcion: r.descripcion || "",
    Tercero: r.tercero || "",
    Empleado: r.empleado || "",
    Importe: r.importe,
  };
}

/** true si "cuentasRows" viene con el desglose de transacciones por cuenta
 * (c.rows) -- en ese caso el export se organiza POR CUENTA MAYOR (una hoja
 * de Excel / una tabla de PDF por cuenta) en vez de una tabla plana con
 * todas las cuentas mezcladas. */
function tieneGruposPorCuenta(cuentasRows) {
  return !!(cuentasRows && cuentasRows.length && cuentasRows.every(c => c.rows));
}

/** Hoja "Resumen" (KPIs + periodo aplicado) + hoja "Cuentas mayores"
 * (totales) + una hoja POR CADA cuenta mayor con sus transacciones -- o, si
 * el contexto ya es de una sola cuenta, una unica hoja "Transacciones" con
 * TODAS las filas (no solo las 80 mostradas en el modal). */
function exportModalExcel(filenameBase, title, resumenPares, cuentasRows, txRows) {
  const wb = XLSX.utils.book_new();
  const wsResumen = XLSX.utils.aoa_to_sheet([[title], [], ...resumenPares]);
  XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");

  if (tieneGruposPorCuenta(cuentasRows)) {
    const wsCuentas = XLSX.utils.aoa_to_sheet([
      ["Cuenta mayor", "Valor", "% del total"],
      ...cuentasRows.map(c => [c.label, c.value, c.pct != null ? c.pct.toFixed(1) + "%" : ""]),
    ]);
    XLSX.utils.book_append_sheet(wb, wsCuentas, "Cuentas mayores");

    const usedNames = new Set(["Resumen", "Cuentas mayores"]);
    cuentasRows.forEach(c => {
      const base = (c.label || "Cuenta").substring(0, 31) || "Cuenta";
      let name = base, i = 2;
      while (usedNames.has(name)) { name = (base.substring(0, 27) + "_" + i).substring(0, 31); i++; }
      usedNames.add(name);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(c.rows.map(txToRecord)), name);
    });
  } else {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txRows.map(txToRecord)), "Transacciones");
  }
  XLSX.writeFile(wb, filenameBase + ".xlsx");
}

function exportModalPDF(filenameBase, title, sub, resumenPares, cuentasRows, txRows) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 36;
  doc.setFillColor(17, 24, 39);
  doc.rect(0, 0, pageW, 58, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold"); doc.setFontSize(14);
  doc.text(title, margin, 26);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
  doc.text(sub || "", margin, 42);
  doc.setTextColor(20, 20, 20);
  let y = 80;
  doc.autoTable({
    startY: y, margin: { left: margin, right: margin },
    head: [["Campo", "Valor"]], body: resumenPares,
    theme: "grid", styles: { fontSize: 9, cellPadding: 5 }, headStyles: { fillColor: [240, 166, 58], textColor: 20 },
  });
  y = doc.lastAutoTable.finalY + 18;

  if (tieneGruposPorCuenta(cuentasRows)) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text("Cuentas mayores incluidas", margin, y); y += 8;
    doc.autoTable({
      startY: y, margin: { left: margin, right: margin },
      head: [["Cuenta mayor", "Valor", "%"]],
      body: cuentasRows.map(c => [c.label, fmtCOP(c.value), c.pct != null ? c.pct.toFixed(1) + "%" : "—"]),
      theme: "striped", styles: { fontSize: 8.5, cellPadding: 5 }, headStyles: { fillColor: [139, 143, 245], textColor: 255 },
    });
    y = doc.lastAutoTable.finalY + 22;

    // Una tabla POR CADA cuenta mayor (en vez de una sola tabla con todas
    // las transacciones mezcladas) -- se lee mucho mejor: "SERVICIOS" y su
    // tabla, luego "SEGUROS" y su tabla, y asi con cada cuenta.
    cuentasRows.forEach(c => {
      if (y > 700) { doc.addPage(); y = 40; }
      doc.setFont("helvetica", "bold"); doc.setFontSize(11);
      doc.text(c.label + " (" + c.rows.length + ")", margin, y); y += 8;
      doc.autoTable({
        startY: y, margin: { left: margin, right: margin },
        head: [["Periodo", "Descripción", "Tercero", "Empleado", "Importe"]],
        body: c.rows.map(r => [r.periodo != null ? String(r.periodo) : "—", r.descripcion || "—", r.tercero || "—", r.empleado || "—", fmtCOP(r.importe)]),
        theme: "grid", styles: { fontSize: 7, cellPadding: 3 }, headStyles: { fillColor: [52, 195, 217], textColor: 20 },
      });
      y = doc.lastAutoTable.finalY + 22;
    });
  } else {
    if (y > 680) { doc.addPage(); y = 40; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text("Transacciones (" + txRows.length + ")", margin, y); y += 8;
    doc.autoTable({
      startY: y, margin: { left: margin, right: margin },
      head: [["Periodo", "Cuenta mayor", "Descripción", "Tercero", "Empleado", "Importe"]],
      body: txRows.map(r => [r.periodo != null ? String(r.periodo) : "—", r.cuentaMayor || "—", r.descripcion || "—", r.tercero || "—", r.empleado || "—", fmtCOP(r.importe)]),
      theme: "grid", styles: { fontSize: 7, cellPadding: 3 }, headStyles: { fillColor: [52, 195, 217], textColor: 20 },
    });
  }
  doc.save(filenameBase + ".pdf");
}

/** Engancha los 2 botones de descarga de la barra de exportacion.
 * "getExportData(desde, hasta)" debe devolver { title, sub, resumenPares,
 * cuentasRows, txRows } ya calculados para ese rango de periodo (o para
 * todos si ambos son ""). El rango en si (para refrescar lo que se VE en el
 * modal) se engancha por fuera con wireModalPeriodoRange(). */
function wireModalExportBar(idPrefix, getExportData) {
  const selD = document.getElementById(idPrefix + "-periodo-desde");
  const selH = document.getElementById(idPrefix + "-periodo-hasta");
  const btnXlsx = document.getElementById(idPrefix + "-export-xlsx");
  const btnPdf = document.getElementById(idPrefix + "-export-pdf");
  const curRange = () => [selD ? selD.value : "", selH ? selH.value : ""];
  if (btnXlsx) btnXlsx.addEventListener("click", () => {
    const [desde, hasta] = curRange();
    const d = getExportData(desde, hasta);
    exportModalExcel(slugFilename(d.title), d.title, d.resumenPares, d.cuentasRows, d.txRows);
  });
  if (btnPdf) btnPdf.addEventListener("click", () => {
    const [desde, hasta] = curRange();
    const d = getExportData(desde, hasta);
    exportModalPDF(slugFilename(d.title), d.title, d.sub, d.resumenPares, d.cuentasRows, d.txRows);
  });
}

function miniTxTable(rows, limit) {
  const sorted = rows.slice().sort((a, b) => Math.abs(b.importe) - Math.abs(a.importe));
  const shown = sorted.slice(0, limit || 60);
  const rowsHtml = shown.map(r => `
    <tr>
      <td>${r.periodo != null ? escapeHtml(String(r.periodo)) : "—"}</td>
      <td class="cell-wrap">${escapeHtml(r.descripcion || "—")}</td>
      <td class="cell-wrap">${escapeHtml(r.tercero || "—")}</td>
      <td>${escapeHtml(r.empleado || "—")}</td>
      <td class="num" style="color:${r.esIngreso ? "var(--secondary)" : "var(--text)"}">${fmtCOP(r.importe)}</td>
    </tr>`).join("");
  const more = sorted.length > shown.length ? `<div class="text-faint" style="font-size:11px;margin-top:8px;">Mostrando ${shown.length} de ${sorted.length} transacciones (ordenadas por valor absoluto).</div>` : "";
  return `<div class="table-wrap table-wrap-scroll-modal"><table><thead><tr><th>Periodo</th><th>Descripción</th><th>Tercero</th><th>Empleado</th><th class="num">Importe</th></tr></thead><tbody>${rowsHtml || '<tr><td colspan="5" style="padding:14px;color:var(--text-faint);">Sin transacciones.</td></tr>'}</tbody></table></div>${more}`;
}

function openMonthDetailModal(periodo) {
  const idPrefix = "modal-month";
  const rows = getFilteredIBRows({ ignoreMes: true }).filter(r => r.periodo === periodo);
  const titleBase = "Detalle de " + periodoToLabel(periodo);

  const kpi = computeFinancieroKPIs(rows);
  function renderContent() {
    document.getElementById(idPrefix + "-content").innerHTML = `
      <div class="modal-kpis">
        <div class="modal-kpi"><div class="l">Ingresos</div><div class="v" style="color:var(--secondary)">${fmtCOP(kpi.ingresos)}</div></div>
        <div class="modal-kpi"><div class="l">Costos</div><div class="v" style="color:var(--danger)">${fmtCOP(kpi.costos)}</div></div>
        <div class="modal-kpi"><div class="l">Margen</div><div class="v">${fmtCOP(kpi.margen)}</div></div>
        <div class="modal-kpi"><div class="l">Margen %</div><div class="v">${fmtPct(kpi.margenPct)}</div></div>
      </div>
      ${miniTxTable(rows, 80)}`;
  }
  function getExportData() {
    const filtered = rows;
    // El mes mezcla varias cuentas mayores (ingresos + costos): se agrupan
    // igual que en "Otros costos" para que el export quede una tabla por
    // cuenta, no todo mezclado.
    const porCuenta = porCuentaMayorTodo(filtered);
    return {
      title: titleBase, sub: kpi.count + " transacciones en el mes",
      resumenPares: [["Ingresos", fmtCOP(kpi.ingresos)], ["Costos", fmtCOP(kpi.costos)], ["Margen", fmtCOP(kpi.margen)], ["Margen %", fmtPct(kpi.margenPct)], ["Transacciones", String(filtered.length)]],
      cuentasRows: porCuenta.map(c => ({ label: c.label, value: c.value, pct: null, rows: c.rows })),
      txRows: filtered,
    };
  }

  openModal(titleBase, rows.length + " transacciones en el mes (según filtros activos)",
    modalExportBarHtml(idPrefix, rows, false) + `<div id="${idPrefix}-content"></div>`); // sin selector: ya esta acotado a un solo mes
  renderContent();
  wireModalExportBar(idPrefix, getExportData);
}

function openCuentaBreakdownModal(item, kindLabel, backFn) {
  const idPrefix = "modal-cuenta";
  const rows = item.rows;

  function computeView(desde, hasta) {
    const filtered = filterByPeriodoRange(rows, desde, hasta);
    return { filtered, total: sumBy(filtered, r => r.importe), porEmpleado: costoPorPersonal(filtered).slice(0, 8) };
  }

  function renderContent(desde, hasta) {
    const { filtered, total, porEmpleado } = computeView(desde, hasta);
    const empHtml = porEmpleado.length ? `
      <div class="section-title" style="font-size:12px;margin:14px 0 6px;">Personal / terceros involucrados</div>
      <div class="gerente-list gerente-list-scroll">
        ${porEmpleado.map(e => `<div class="gerente-row"><span class="name">${escapeHtml(e.label)}</span><span class="pct">${fmtCOP(e.value)}</span></div>`).join("")}
      </div>` : "";
    const backHtml = backFn ? `<button class="btn btn-ghost btn-sm" id="modal-back-btn" style="margin-bottom:12px;">‹ Volver</button>` : "";
    document.getElementById(idPrefix + "-content").innerHTML = `
      ${backHtml}
      <div class="modal-kpis">
        <div class="modal-kpi"><div class="l">Total</div><div class="v">${fmtCOP(total)}</div></div>
        <div class="modal-kpi"><div class="l"># Transacciones</div><div class="v">${filtered.length}</div></div>
      </div>
      ${empHtml}
      <div class="mt-8"></div>
      ${miniTxTable(filtered, 80)}`;
    if (backFn) { const b = document.getElementById("modal-back-btn"); if (b) b.addEventListener("click", backFn); }
  }

  function getExportData(desde, hasta) {
    const { filtered, total } = computeView(desde, hasta);
    const periodoLabel = periodoRangeLabel(desde, hasta);
    return {
      title: item.label + (periodoLabel !== "Todos" ? " — " + periodoLabel : ""), sub: kindLabel + " · periodo: " + periodoLabel,
      resumenPares: [["Total", fmtCOP(total)], ["Periodo", periodoLabel], ["Transacciones", String(filtered.length)]],
      cuentasRows: null, txRows: filtered,
    };
  }

  openModal(item.label, kindLabel, modalExportBarHtml(idPrefix, rows) + `<div id="${idPrefix}-content"></div>`);
  renderContent("", "");
  wireModalExportBar(idPrefix, getExportData);
  wireModalPeriodoRange(idPrefix, renderContent);
}

function openCostoCategoriaModal(cat, rows, totalAmbasCategorias) {
  const idPrefix = "modal-cat";
  const catLabel = cat === "directo" ? "Costos directos" : "Otros costos";

  function computeView(desde, hasta) {
    const filtered = filterByPeriodoRange(rows, desde, hasta);
    const total = sumBy(filtered, r => r.importe);
    const porCuenta = costosPorCuentaMayor(filtered);
    const porEmpleado = costoPorPersonal(filtered).slice(0, 8);
    return { filtered, total, porCuenta, porEmpleado };
  }

  function renderContent(desde, hasta) {
    const { filtered, total, porCuenta, porEmpleado } = computeView(desde, hasta);
    const cuentasHtml = porCuenta.map((d, i) => `
      <div class="gerente-row clickable" data-idx="${i}" title="Clic para ver el detalle de esta cuenta">
        <span class="name">${escapeHtml(d.label)}</span>
        <span class="pct">${fmtCOP(d.value)} · ${fmtPct(total ? d.value / total * 100 : 0, 0)}</span>
      </div>`).join("");
    const empHtml = porEmpleado.length ? `
      <div class="section-title" style="font-size:12px;margin:14px 0 6px;">Personal involucrado</div>
      <div class="gerente-list gerente-list-scroll">${porEmpleado.map(e => `<div class="gerente-row"><span class="name">${escapeHtml(e.label)}</span><span class="pct">${fmtCOP(e.value)}</span></div>`).join("")}</div>` : "";

    document.getElementById(idPrefix + "-content").innerHTML = `
      <div class="modal-kpis">
        <div class="modal-kpi"><div class="l">Total</div><div class="v">${fmtCOP(total)}</div></div>
        <div class="modal-kpi"><div class="l">% del total de costos</div><div class="v">${fmtPct(totalAmbasCategorias ? total / totalAmbasCategorias * 100 : 0)}</div></div>
        <div class="modal-kpi"><div class="l"># Transacciones</div><div class="v">${filtered.length}</div></div>
      </div>
      <div class="section-title" style="font-size:12px;margin-bottom:6px;">Cuentas mayores incluidas <span class="text-faint" style="font-weight:500;text-transform:none;">· clic en una para ver su detalle</span></div>
      <div class="gerente-list gerente-list-scroll" id="${idPrefix}-cuentas-list">${cuentasHtml || '<div class="text-faint" style="font-size:12px;">Sin cuentas para este filtro.</div>'}</div>
      ${empHtml}
      <div class="mt-8"></div>
      ${miniTxTable(filtered, 80)}`;

    document.querySelectorAll("#" + idPrefix + "-cuentas-list .gerente-row[data-idx]").forEach(elx => {
      elx.addEventListener("click", () => {
        const item = porCuenta[Number(elx.dataset.idx)];
        openCuentaBreakdownModal(item, catLabel + " › " + item.label, () => openCostoCategoriaModal(cat, rows, totalAmbasCategorias));
      });
    });
  }

  function getExportData(desde, hasta) {
    const { filtered, total, porCuenta } = computeView(desde, hasta);
    const periodoLabel = periodoRangeLabel(desde, hasta);
    return {
      title: catLabel + (periodoLabel !== "Todos" ? " — " + periodoLabel : ""),
      sub: "Clasificación oficial del IBReport (campo Eri_est) · periodo: " + periodoLabel,
      resumenPares: [["Total", fmtCOP(total)], ["% del total de costos", fmtPct(totalAmbasCategorias ? total / totalAmbasCategorias * 100 : 0)], ["Periodo", periodoLabel], ["Transacciones", String(filtered.length)]],
      cuentasRows: porCuenta.map(c => ({ label: c.label, value: c.value, pct: total ? c.value / total * 100 : 0, rows: c.rows })),
      txRows: filtered,
    };
  }

  openModal(catLabel, "Clasificación oficial del IBReport (campo Eri_est) · según los filtros activos",
    modalExportBarHtml(idPrefix, rows) + `<div id="${idPrefix}-content"></div>`);
  renderContent("", "");
  wireModalExportBar(idPrefix, getExportData);
  wireModalPeriodoRange(idPrefix, renderContent);
}

function openMatrixCellModal(cuenta, periodo, matrix, periodos) {
  const idPrefix = "modal-cell";
  const rows = getFilteredIBRows({ ignoreMes: true }).filter(r => !r.esIngreso && r.cuentaMayor === cuenta && r.periodo === periodo);
  const idx = periodos.indexOf(periodo);
  const prevPeriodo = idx > 0 ? periodos[idx - 1] : null;
  const currVal = matrix[cuenta][periodo];
  const prevVal = prevPeriodo !== null ? matrix[cuenta][prevPeriodo] : null;
  const variacion = (prevVal !== null && prevVal !== 0) ? ((currVal - prevVal) / Math.abs(prevVal)) * 100 : null;
  const porEmpleado = costoPorPersonal(rows).slice(0, 8);
  const titleBase = cuenta;
  const subBase = periodoToLabel(periodo) + " · detalle de la matriz de costos";

  function renderContent() {
    document.getElementById(idPrefix + "-content").innerHTML = `
      <div class="modal-kpis">
        <div class="modal-kpi"><div class="l">${periodoToLabel(periodo)}</div><div class="v">${fmtCOP(currVal)}</div></div>
        <div class="modal-kpi"><div class="l">${prevPeriodo ? periodoToLabel(prevPeriodo) : "Mes anterior"}</div><div class="v">${prevVal !== null ? fmtCOP(prevVal) : "—"}</div></div>
        <div class="modal-kpi"><div class="l">Variación</div><div class="v" style="color:${variacion === null ? "inherit" : (variacion >= 0 ? "var(--danger)" : "var(--success)")}">${variacion === null ? "—" : (variacion >= 0 ? "+" : "") + variacion.toFixed(1) + "%"}</div></div>
      </div>
      ${porEmpleado.length ? `<div class="section-title" style="font-size:12px;margin-bottom:6px;">Personal involucrado</div><div class="gerente-list">${porEmpleado.map(e => `<div class="gerente-row"><span class="name">${escapeHtml(e.label)}</span><span class="pct">${fmtCOP(e.value)}</span></div>`).join("")}</div>` : ""}
      <div class="mt-8"></div>
      ${miniTxTable(rows, 80)}`;
  }
  function getExportData() {
    return {
      title: titleBase + " — " + periodoToLabel(periodo), sub: subBase,
      resumenPares: [[periodoToLabel(periodo), fmtCOP(currVal)], [prevPeriodo ? periodoToLabel(prevPeriodo) : "Mes anterior", prevVal !== null ? fmtCOP(prevVal) : "—"], ["Variación", variacion === null ? "—" : (variacion >= 0 ? "+" : "") + variacion.toFixed(1) + "%"], ["Transacciones", String(rows.length)]],
      cuentasRows: null, txRows: rows,
    };
  }

  openModal(titleBase, subBase, modalExportBarHtml(idPrefix, rows, false) + `<div id="${idPrefix}-content"></div>`); // sin selector: ya esta acotado a un solo mes
  renderContent();
  wireModalExportBar(idPrefix, getExportData);
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

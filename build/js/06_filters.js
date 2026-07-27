/* =========================================================================
   06. FILTROS — MODULO FINANCIERO
   ========================================================================= */

function populateFinancieroFilterOptions() {
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

  setOptions("f-proyecto", uniqueSorted(rows.map(r => r.proyecto)), STATE.filters.proyecto);
  setOptions("f-anio", uniqueSorted(rows.map(r => r.anio)).sort((a, b) => b - a), STATE.filters.anio);
  const meses = uniqueSorted(rows.map(r => r.periodo)).sort((a, b) => a - b);
  const selMes = document.getElementById("f-mes");
  const cur = STATE.filters.mes;
  selMes.innerHTML = '<option value="">Mes: todos</option>';
  meses.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p; opt.textContent = periodoToLabel(p);
    selMes.appendChild(opt);
  });
  selMes.value = meses.includes(Number(cur)) ? cur : "";

  setOptions("f-tipo", uniqueSorted(rows.map(r => r.tipo)), STATE.filters.tipo);
  setOptions("f-empleado", uniqueSorted(rows.map(r => r.empleado)), STATE.filters.empleado);
  setOptions("f-cuenta", uniqueSorted(rows.map(r => r.cuentaMayor)), STATE.filters.cuenta);
}

function getFilteredIBRows(opts) {
  opts = opts || {};
  const f = STATE.filters;
  const searchTerm = normText(f.search || "");
  return STATE.ib.rows.filter(r => {
    if (!opts.ignoreProyecto && f.proyecto && r.proyecto !== f.proyecto) return false;
    if (!opts.ignoreAnio && f.anio && String(r.anio) !== String(f.anio)) return false;
    if (!opts.ignoreMes && f.mes && String(r.periodo) !== String(f.mes)) return false;
    if (!opts.ignoreTipo && f.tipo && r.tipo !== f.tipo) return false;
    if (!opts.ignoreEmpleado && f.empleado && r.empleado !== f.empleado) return false;
    if (!opts.ignoreCuenta && f.cuenta && r.cuentaMayor !== f.cuenta) return false;
    if (searchTerm) {
      const hay = normText(r.descripcion) + " " + normText(r.tercero);
      if (!hay.includes(searchTerm)) return false;
    }
    return true;
  });
}

function wireFinancieroFilters() {
  ["f-proyecto", "f-anio", "f-mes", "f-tipo", "f-empleado", "f-cuenta"].forEach(id => {
    document.getElementById(id).addEventListener("change", e => {
      const key = { "f-proyecto": "proyecto", "f-anio": "anio", "f-mes": "mes", "f-tipo": "tipo", "f-empleado": "empleado", "f-cuenta": "cuenta" }[id];
      STATE.filters[key] = e.target.value;
      STATE.tx.page = 0;
      renderFinanciero();
    });
  });
  document.getElementById("f-search").addEventListener("input", debounce(e => {
    STATE.filters.search = e.target.value;
    STATE.tx.page = 0;
    renderFinanciero();
  }, 250));
  document.getElementById("btn-clear-filters").addEventListener("click", () => {
    STATE.filters = { proyecto: "", anio: "", mes: "", tipo: "", empleado: "", cuenta: "", search: "" };
    document.getElementById("f-search").value = "";
    STATE.tx.page = 0;
    populateFinancieroFilterOptions();
    renderFinanciero();
    showToast("Filtros limpiados", "", "success");
  });
}

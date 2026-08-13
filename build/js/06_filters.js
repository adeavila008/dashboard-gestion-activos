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

  // "Mes" es multi-seleccion (checkboxes en un panel desplegable) en vez de
  // un <select> normal, para poder comparar varios meses a la vez (ej. dos
  // meses puntuales) sin perder la opcion de "todos". Se repuebla la lista
  // de checkboxes cada vez que cambian los datos, conservando la seleccion
  // vigente si esos meses todavia existen en el dataset actual.
  const meses = uniqueSorted(rows.map(r => r.periodo)).sort((a, b) => a - b);
  STATE.filters.meses = STATE.filters.meses.filter(m => meses.includes(Number(m)));
  const list = document.getElementById("f-mes-list");
  list.innerHTML = meses.map(p => `
    <label class="multiselect-item"><input type="checkbox" value="${p}" ${STATE.filters.meses.includes(String(p)) ? "checked" : ""}> ${periodoToLabel(p)}</label>
  `).join("");
  updateMesFilterLabel();

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
    if (!opts.ignoreMes && f.meses && f.meses.length && !f.meses.includes(String(r.periodo))) return false;
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

/** Actualiza el texto del boton "Mes" segun cuantos meses hay marcados en el
 * panel: "Mes: todos" (ninguno marcado = sin filtro), el mes puntual si solo
 * hay uno, o "Mes: N seleccionados" si hay varios. */
function updateMesFilterLabel() {
  const btn = document.getElementById("f-mes-btn");
  const total = document.querySelectorAll("#f-mes-list input").length;
  const checks = [...document.querySelectorAll("#f-mes-list input:checked")];
  const n = checks.length;
  // Marcar TODOS los meses filtra exactamente igual que no marcar ninguno
  // (ambos casos dejan pasar todas las filas) -- se muestra igual como
  // "todos" para no confundir con un conteo raro tipo "20 seleccionados".
  if (n === 0 || n === total) { btn.textContent = "Mes: todos"; btn.classList.remove("has-selection"); }
  else if (n === 1) { btn.textContent = "Mes: " + checks[0].parentElement.textContent.trim(); btn.classList.add("has-selection"); }
  else { btn.textContent = "Mes: " + n + " seleccionados"; btn.classList.add("has-selection"); }
}

function wireFinancieroFilters() {
  ["f-proyecto", "f-anio", "f-tipo", "f-empleado", "f-cuenta"].forEach(id => {
    document.getElementById(id).addEventListener("change", e => {
      const key = { "f-proyecto": "proyecto", "f-anio": "anio", "f-tipo": "tipo", "f-empleado": "empleado", "f-cuenta": "cuenta" }[id];
      STATE.filters[key] = e.target.value;
      STATE.tx.page = 0;
      renderFinanciero();
    });
  });

  // Panel de "Mes" (multi-seleccion): un boton tipo chip que abre/cierra un
  // panel con checkboxes -- se cierra solo al hacer clic afuera, y cada
  // cambio de checkbox re-renderiza de una (sin necesitar boton "Aplicar").
  const mesBtn = document.getElementById("f-mes-btn");
  const mesPanel = document.getElementById("f-mes-panel");
  mesBtn.addEventListener("click", e => {
    e.stopPropagation();
    mesPanel.classList.toggle("open");
  });
  document.addEventListener("click", e => {
    if (!mesPanel.contains(e.target) && e.target !== mesBtn) mesPanel.classList.remove("open");
  });
  document.getElementById("f-mes-list").addEventListener("change", () => {
    STATE.filters.meses = [...document.querySelectorAll("#f-mes-list input:checked")].map(c => c.value);
    updateMesFilterLabel();
    STATE.tx.page = 0;
    renderFinanciero();
  });
  document.getElementById("f-mes-todos").addEventListener("click", () => {
    document.querySelectorAll("#f-mes-list input").forEach(c => c.checked = true);
    STATE.filters.meses = [...document.querySelectorAll("#f-mes-list input:checked")].map(c => c.value);
    updateMesFilterLabel();
    STATE.tx.page = 0;
    renderFinanciero();
  });
  document.getElementById("f-mes-ninguno").addEventListener("click", () => {
    document.querySelectorAll("#f-mes-list input").forEach(c => c.checked = false);
    STATE.filters.meses = [];
    updateMesFilterLabel();
    STATE.tx.page = 0;
    renderFinanciero();
  });

  document.getElementById("f-search").addEventListener("input", debounce(e => {
    STATE.filters.search = e.target.value;
    STATE.tx.page = 0;
    renderFinanciero();
  }, 250));
  document.getElementById("btn-clear-filters").addEventListener("click", () => {
    STATE.filters = { proyecto: "", anio: "", meses: [], tipo: "", empleado: "", cuenta: "", search: "" };
    document.getElementById("f-search").value = "";
    STATE.tx.page = 0;
    populateFinancieroFilterOptions();
    renderFinanciero();
    showToast("Filtros limpiados", "", "success");
  });
}

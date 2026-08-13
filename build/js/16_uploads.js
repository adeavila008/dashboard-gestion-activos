/* =========================================================================
   16. TOASTS, LOADING Y CARGA DE ARCHIVOS EXCEL (100% en el navegador)
   ========================================================================= */

function showToast(title, msg, type) {
  const stack = document.getElementById("toast-stack");
  const t = el(`<div class="toast ${type || ""}"><b>${escapeHtml(title)}</b>${msg ? `<span>${escapeHtml(msg)}</span>` : ""}</div>`);
  stack.appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .3s"; setTimeout(() => t.remove(), 300); }, 4200);
}
function showLoading(text) {
  document.getElementById("loading-text").textContent = text || "Procesando…";
  document.getElementById("loading-overlay").classList.add("open");
}
function hideLoading() { document.getElementById("loading-overlay").classList.remove("open"); }

function readWorkbook(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: "array", cellDates: true });
        resolve(wb);
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsArrayBuffer(file);
  });
}

async function handleIBReportFile(file) {
  showLoading("Procesando Excel mensual…");
  try {
    const wb = await readWorkbook(file);
    const rows = parseIBReportWorkbook(wb);
    if (!rows.length) throw new Error("No se encontraron filas de la Dirección de Gestión de Activos en este archivo.");
    STATE.ib.rows = rows; STATE.ib.source = "upload"; STATE.ib.fileName = file.name;
    STATE.filters = { proyecto: "", anio: "", meses: [], tipo: "", empleado: "", cuenta: "", search: "" };
    STATE.analisisFilters = { proyecto: "", anio: "", meses: [] };
    STATE.tx.page = 0;
    populateFinancieroFilterOptions();
    populateAnalisisFilterOptions();
    renderFinanciero();
    renderHomeStats();
    updateBadgePeriod();
    showToast("Excel cargado", rows.length.toLocaleString("es-CO") + " filas de la dirección (" + file.name + ")", "success");
  } catch (err) {
    console.error(err);
    showToast("No se pudo procesar el archivo", err.message || String(err), "error");
  } finally { hideLoading(); }
}

async function handleBaselineFile(file) {
  showLoading("Procesando Excel de indicadores…");
  try {
    const wb = await readWorkbook(file);
    const rows = parseBaselineWorkbook(wb);
    if (!rows.length) throw new Error("No se encontraron filas de proyectos de la dirección en este archivo.");
    STATE.baseline.rows = rows; STATE.baseline.source = "upload"; STATE.baseline.fileName = file.name;
    STATE.saludFilters = { proyecto: "", anio: "", mes: "" };
    STATE.saludSelectedProject = null;
    document.getElementById("baseline-file-status").textContent = file.name + " · " + rows.length.toLocaleString("es-CO") + " registros";
    populateSaludFilterOptions();
    renderSalud();
    showToast("Líneas base cargadas", rows.length.toLocaleString("es-CO") + " registros (" + file.name + ")", "success");
  } catch (err) {
    console.error(err);
    showToast("No se pudo procesar el archivo", err.message || String(err), "error");
  } finally { hideLoading(); }
}

function wireUploads() {
  const finInput = document.getElementById("file-ibreport");
  const baseInput = document.getElementById("file-baseline");

  document.getElementById("nav-upload-fin").addEventListener("click", () => finInput.click());
  document.getElementById("nav-upload-baseline").addEventListener("click", () => { switchView("salud"); baseInput.click(); });

  finInput.addEventListener("change", e => { if (e.target.files[0]) handleIBReportFile(e.target.files[0]); e.target.value = ""; });
  baseInput.addEventListener("change", e => { if (e.target.files[0]) handleBaselineFile(e.target.files[0]); e.target.value = ""; });

  const dz = document.getElementById("dropzone-baseline");
  dz.addEventListener("click", () => baseInput.click());
  ["dragenter", "dragover"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add("drag"); }));
  ["dragleave", "drop"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove("drag"); }));
  dz.addEventListener("drop", e => { if (e.dataTransfer.files[0]) handleBaselineFile(e.dataTransfer.files[0]); });
}

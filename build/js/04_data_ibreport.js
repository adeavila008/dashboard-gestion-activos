/* =========================================================================
   04. CARGA Y NORMALIZACION DE DATOS — IBREPORT (FINANCIERO)
   ========================================================================= */

function normHeader(s) {
  return String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // quita tildes
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}
function normText(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
}

const IB_HEADER_MAP = {
  "DIRECCION LINEA T": "direccion",
  "DIRECCION LINEA": "direccion",
  "ERI EST T": "eriEst",
  "CUENTA MAYOR": "cuentaMayorCod",
  "CUENTA MAYOR T": "cuentaMayor",
  "CUENTA": "cuentaCod",
  "CUENTA T": "cuenta",
  "PROYECTO": "proyectoCod",
  "PROYECTO T": "proyecto",
  "ANO": "anio",
  "PERIODO": "periodo",
  "FCHA ASTO": "fecha",
  "TIPO DE ASIENTOS": "tipo",
  "NUMERO DE ASIENTO": "numAsiento",
  "N DE SECUENCIA": "secuencia",
  "DESCRIPCION": "descripcion",
  "TERCERO T": "tercero",
  "IMPORTE": "importe",
  "EMPLEADO": "empleadoCod",
  "EMPLEADO T": "empleado",
  "ACTIVOS FIJOS": "activoFijoCod",
  "ACTIVOS FIJOS T": "activoFijo",
  "EMPRESA": "empresa",
};

function excelSerialToDate(v) {
  if (v instanceof Date) return v;
  if (typeof v === "number") {
    // fecha serial de Excel (base 1899-12-30)
    return new Date(Math.round((v - 25569) * 86400 * 1000));
  }
  if (typeof v === "string" && v.trim()) {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function loadDefaultIBReport() {
  const payload = window.__DEFAULT_IBREPORT__ || { cols: [], rows: [] };
  const cols = payload.cols;
  return payload.rows.map(r => {
    const rec = {};
    cols.forEach((c, i) => rec[c] = r[i]);
    if (rec.fecha) rec.fecha = new Date(rec.fecha);
    return rec;
  });
}

function loadDefaultBaseline() {
  return (window.__DEFAULT_BASELINE__ || []).map(r => {
    const rec = Object.assign({}, r);
    if (rec.mes) rec.mes = new Date(rec.mes);
    if (rec.fechaInicio) rec.fechaInicio = new Date(rec.fechaInicio);
    if (rec.fechaFin) rec.fechaFin = new Date(rec.fechaFin);
    return rec;
  });
}

/**
 * Parsea un archivo IBReport subido por el usuario (mismo formato de export
 * contable) y devuelve solo las filas de la Direccion de Gestion de Activos,
 * normalizadas al mismo esquema que el dataset por defecto.
 */
function parseIBReportWorkbook(workbook) {
  // Busca la hoja que contenga las columnas esperadas (por si el nombre cambia,
  // ej. "IBReport 963" -> "IBReport 1024").
  let sheetName = workbook.SheetNames.find(n => /ibreport/i.test(n)) || workbook.SheetNames[0];
  const ws = workbook.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
  if (!aoa.length) throw new Error("La hoja '" + sheetName + "' está vacía.");

  const headerRow = aoa[0];
  const idxMap = {}; // internalKey -> columnIndex
  headerRow.forEach((h, i) => {
    const nk = normHeader(h);
    const mapped = IB_HEADER_MAP[nk];
    if (mapped) idxMap[mapped] = i;
  });
  const required = ["direccion", "cuentaMayorCod", "cuentaMayor", "importe", "periodo"];
  const missing = required.filter(k => !(k in idxMap));
  if (missing.length) {
    throw new Error("El archivo no tiene el formato IBReport esperado (faltan columnas: " + missing.join(", ") + ").");
  }

  const targetDir = normText(CFG.direccionNombre);
  const out = [];
  for (let i = 1; i < aoa.length; i++) {
    const row = aoa[i];
    if (!row || row.length === 0) continue;
    const dirVal = row[idxMap.direccion];
    if (normText(dirVal) !== targetDir) continue;
    const rec = {
      direccion: dirVal,
      cuentaMayorCod: row[idxMap.cuentaMayorCod],
      cuentaMayor: row[idxMap.cuentaMayor],
      cuentaCod: idxMap.cuentaCod !== undefined ? row[idxMap.cuentaCod] : null,
      cuenta: idxMap.cuenta !== undefined ? row[idxMap.cuenta] : null,
      proyectoCod: idxMap.proyectoCod !== undefined ? row[idxMap.proyectoCod] : null,
      proyecto: idxMap.proyecto !== undefined ? row[idxMap.proyecto] : null,
      anio: idxMap.anio !== undefined ? row[idxMap.anio] : null,
      periodo: row[idxMap.periodo],
      fecha: idxMap.fecha !== undefined ? excelSerialToDate(row[idxMap.fecha]) : null,
      tipo: idxMap.tipo !== undefined ? row[idxMap.tipo] : null,
      numAsiento: idxMap.numAsiento !== undefined ? row[idxMap.numAsiento] : null,
      descripcion: idxMap.descripcion !== undefined ? row[idxMap.descripcion] : null,
      tercero: idxMap.tercero !== undefined ? row[idxMap.tercero] : null,
      importe: Number(row[idxMap.importe]) || 0,
      empleado: idxMap.empleado !== undefined ? row[idxMap.empleado] : null,
      activoFijoCod: idxMap.activoFijoCod !== undefined ? row[idxMap.activoFijoCod] : null,
      activoFijo: idxMap.activoFijo !== undefined ? row[idxMap.activoFijo] : null,
    };
    rec.esIngreso = String(rec.cuentaMayorCod || "").startsWith("4");
    out.push(rec);
  }
  return out;
}

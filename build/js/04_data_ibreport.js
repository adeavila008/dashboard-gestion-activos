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

/**
 * Convierte un serial de Excel, un string "YYYY-MM-DD" o un objeto Date a un
 * Date LOCAL a medianoche.
 *
 * OJO: `new Date("2025-11-01")` lo interpreta el motor de JS como UTC
 * medianoche (asi lo dice el estandar ECMA-262 para strings solo-fecha). Si
 * luego se lee con metodos locales (getMonth/getFullYear/toLocaleDateString,
 * que es lo que se usa en todo el dashboard), en cualquier timezone negativo
 * (Colombia es UTC-5) esa fecha se muestra un dia antes de lo real. Como en
 * "Indicadores GA" el campo Mes siempre es el dia 1 de cada mes, ese
 * corrimiento de un dia hace que el mes completo se vea corrido hacia atras
 * (ej. "2025-11-01" aparece como "octubre de 2025"), lo que rompe el filtro
 * de "Mes de corte" y las curvas S. Por eso aqui SIEMPRE se construye la
 * fecha con new Date(year, month-1, day) (constructor local), nunca via el
 * parser de strings ISO.
 */
function excelSerialToDate(v) {
  if (v instanceof Date) {
    // ya es un Date; si viene de un new Date("YYYY-MM-DD") previo puede tener
    // el mismo corrimiento, asi que se reconstruye a partir de sus
    // componentes UTC (que es donde realmente quedo guardada la fecha
    // "intencionada") como fecha local.
    return new Date(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate());
  }
  if (typeof v === "number") {
    // fecha serial de Excel (base 1899-12-30)
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const utc = new Date(ms);
    return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
  }
  if (typeof v === "string" && v.trim()) {
    const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(v);
    if (!isNaN(d.getTime())) return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  return null;
}

function loadDefaultIBReport() {
  const payload = window.__DEFAULT_IBREPORT__ || { cols: [], rows: [] };
  const cols = payload.cols;
  return payload.rows.map(r => {
    const rec = {};
    cols.forEach((c, i) => rec[c] = r[i]);
    if (rec.fecha) rec.fecha = excelSerialToDate(rec.fecha);
    return rec;
  });
}

function loadDefaultBaseline() {
  return (window.__DEFAULT_BASELINE__ || []).map(r => {
    const rec = Object.assign({}, r);
    if (rec.mes) rec.mes = excelSerialToDate(rec.mes);
    if (rec.fechaInicio) rec.fechaInicio = excelSerialToDate(rec.fechaInicio);
    if (rec.fechaFin) rec.fechaFin = excelSerialToDate(rec.fechaFin);
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
      eriEst: idxMap.eriEst !== undefined ? row[idxMap.eriEst] : null,
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
      secuencia: idxMap.secuencia !== undefined ? row[idxMap.secuencia] : null,
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

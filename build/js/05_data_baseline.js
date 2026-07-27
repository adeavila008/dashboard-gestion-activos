/* =========================================================================
   05. CARGA Y NORMALIZACION DE DATOS — INDICADORES GA (SALUD DE PROYECTOS)
   ========================================================================= */

// Mismos encabezados usados al construir el dataset por defecto (ver
// extract_data.py). Se normalizan en tiempo real para que coincidan aunque
// el Excel subido tenga variaciones menores de espacios/acentos.
const BASELINE_HEADER_TO_KEY = {
  "Gerencia": "gerencia", "Año": "anio", "Mes": "mes", "Estado": "estado",
  "Ceco": "cecoCod", "Proyecto": "proyectoNombre", "Cliente": "cliente",
  "Gerente": "gerente", "N° Contrato": "contrato", "Objeto": "objeto",
  "Fecha de Inicio": "fechaInicio", "Fecha Fin": "fechaFin",
  "Margen LB ": "margenLB", "Margen LB": "margenLB", "Margena Ofertado": "margenOfertado",
  "Estado del Contrato": "estadoContrato",
  "Valor Contrato Inicial": "valorContratoInicial",
  "Valor Contrato Final": "valorContratoFinal",
  "Avance Planeado LB1 %": "avancePlanLB1", "Avance Planeado LB2 %": "avancePlanLB2",
  "Avance Planeado LB3 %": "avancePlanLB3", "Avance Real %": "avanceReal",
  "Variación Cronograma %": "variacionCronograma",
  "Cumplimiento Cronograma %": "cumplimientoCronograma",
  "WIP": "wip", "Saldo WIP": "saldoWip",
  "Presupuesto MCOP LB1": "presupuestoLB1", "Presupuesto MCOP LB2": "presupuestoLB2",
  "Presupuesto MCOP LB3": "presupuestoLB3",
  "Costo Planeado Mensual MCOP LB1": "costoPlanMensLB1",
  "Costo Planeado Acum MCOP LB1": "costoPlanAcumLB1",
  "Costo Planeado Mensual MCOP LB 2": "costoPlanMensLB2",
  "Costo Planeado Acum MCOP LB2": "costoPlanAcumLB2",
  "Costo Planeado Mensual MCOP LB 3": "costoPlanMensLB3",
  "Costo Planeado Acum MCOP LB3": "costoPlanAcumLB3",
  "Costo Real MCOP": "costoRealMens", "Costo Real Acum MCOP": "costoRealAcum",
  "Proyección Costos MCOP": "proyeccionCostoMens",
  "Proyección Costos Acum MCOP": "proyeccionCostoAcum",
  "Facturación MCOP LB1": "facturacionLB1", "Facturación MCOP LB2": "facturacionLB2",
  "Facturación MCOP LB3": "facturacionLB3",
  "Facturación Planeada Mensual MCOP LB1": "factPlanMensLB1",
  "Facturación Planeado Acum MCOP LB1": "factPlanAcumLB1",
  "Facturación Planeada Mensual MCOP LB2": "factPlanMensLB2",
  "Facturación Planeado Acum MCOP LB2": "factPlanAcumLB2",
  "Facturación Planeada Mensual MCOP LB3": "factPlanMensLB3",
  "Facturación Planeado Acum MCOP LB3": "factPlanAcumLB3",
  "Facturación Real MCOP": "factRealMens", "Facturación Real Acum MCOP": "factRealAcum",
  "Proyección Fact MCOP": "proyeccionFactMens", "Proyección Fact Acum MCOP": "proyeccionFactAcum",
  "Margen + WIP": "margenMasWip", "Margen Proyectado": "margenProyectado",
  "CV (Variación Costo) MCOP": "cv", "CV (% Variación Costo) MCOP": "cvPct",
  "EV (Valor ganado) MCOP": "ev", "CPI (Cost performance index)": "cpi",
  "SPI (Schedule performance index)": "spi", "EAC (Estimated at completion)": "eac",
  "ETC (Estimate to complete)": "etc", "CSI (Cost schedule index)": "csi",
  "Hechos Relevantes": "hechosRelevantes", "Proxímos Pasos": "proximosPasos",
  "Comentarios Avance": "comentariosAvance",
  "Comentarios Facturación": "comentariosFacturacion",
  "Comentarios Costos": "comentariosCostos", "Margen real": "margenReal",
};

function normBaselineKey(s) {
  let n = normHeader(s);
  n = n.replace(/LB\s*(\d)/g, "LB$1"); // unifica "LB 2" y "LB2"
  return n;
}

const BASELINE_NORM_MAP = (() => {
  const m = {};
  Object.entries(BASELINE_HEADER_TO_KEY).forEach(([orig, key]) => { m[normBaselineKey(orig)] = key; });
  return m;
})();

const EXCEL_ERROR_TOKENS = new Set(["#DIV/0!", "#N/A", "#VALUE!", "#REF!", "#NAME?", "#NULL!", "#NUM!", "#ERROR!"]);
function sanitizeExcelValue(v) {
  if (typeof v === "string" && EXCEL_ERROR_TOKENS.has(v.trim().toUpperCase())) return null;
  return v;
}

/**
 * Parsea el Excel de "Indicadores GA" (consolidado de líneas base) subido
 * por el usuario. Acepta la hoja "Consolidado" o "DATA"; si no encuentra
 * ninguna usa la primera hoja del libro.
 */
function parseBaselineWorkbook(workbook) {
  let sheetName = workbook.SheetNames.find(n => /^data$/i.test(n.trim()))
    || workbook.SheetNames.find(n => /consolidad/i.test(n))
    || workbook.SheetNames[0];
  const ws = workbook.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
  if (!aoa.length) throw new Error("La hoja '" + sheetName + "' está vacía.");

  const headerRow = aoa[0];
  const idxMap = {};
  headerRow.forEach((h, i) => {
    const key = BASELINE_NORM_MAP[normBaselineKey(h)];
    if (key && !(key in idxMap)) idxMap[key] = i;
  });
  const required = ["cecoCod", "mes", "cpi", "spi"];
  const missing = required.filter(k => !(k in idxMap));
  if (missing.length) {
    throw new Error("El archivo no tiene el formato de Indicadores GA esperado (faltan columnas: " + missing.join(", ") + ").");
  }

  const out = [];
  for (let i = 1; i < aoa.length; i++) {
    const row = aoa[i];
    if (!row || row.every(v => v === null || v === "")) continue;
    if (row[idxMap.cecoCod] === null || row[idxMap.cecoCod] === undefined || row[idxMap.cecoCod] === "") continue;
    const rec = {};
    Object.entries(idxMap).forEach(([key, i2]) => { rec[key] = sanitizeExcelValue(row[i2]); });
    if (rec.mes !== undefined) rec.mes = excelSerialToDate(rec.mes);
    if (rec.fechaInicio) rec.fechaInicio = excelSerialToDate(rec.fechaInicio);
    if (rec.fechaFin) rec.fechaFin = excelSerialToDate(rec.fechaFin);
    out.push(rec);
  }
  return out;
}

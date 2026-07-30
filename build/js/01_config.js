/* =========================================================================
   01. CONFIGURACION GLOBAL
   ========================================================================= */
const CFG = {
  direccionNombre: "DIRECCION DE GESTIÓN DE ACTIVOS",
  direccionLabel: "Dirección de Gestión de Activos",
  metaMargen: 30,      // % meta de margen mensual
  metaCPI_SPI: 1.0,    // meta CPI / SPI
  anomalyZ: 1.8,        // umbral (desv. estandar) para marcar anomalias en la matriz
  anomalyMinPct: 0.45,  // variacion minima % vs mes anterior para considerar anomalia
  txPageSize: 25,
  monthNames: ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"],
  monthNamesLong: ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"],
};

/* ---------- Clasificacion Costos Directos vs Otros Costos ----------
   El IBReport contable trae, por transaccion, el campo "Eri_est (T)" con
   la clasificacion OFICIAL de la Direccion: "01 Ingresos", "02 Costos
   Directos" o "03 Otros Costos". Esa es la fuente de verdad (no una
   suposicion por cuenta mayor): en los datos reales, por ejemplo, TODOS los
   Gastos de Personal quedan como Costo Directo y el resto (viajes,
   honorarios, servicios, arrendamientos, impuestos, depreciacion, etc.)
   como Otros Costos. Si algun Excel cargado no trae esa columna (formatos
   viejos), se usa como respaldo el mismo criterio por cuenta mayor. */
const COSTO_DIRECTO_FALLBACK_CODES = new Set(["7405"]); // Gastos de Personal
function costoCategoria(row) {
  const raw = row && row.eriEst;
  if (raw) {
    const n = normText(raw);
    if (n.indexOf("COSTOS DIRECTOS") !== -1) return "directo";
    if (n.indexOf("OTROS COSTOS") !== -1) return "otro";
  }
  return COSTO_DIRECTO_FALLBACK_CODES.has(String(row && row.cuentaMayorCod)) ? "directo" : "otro";
}

const PALETTE = {
  primary: "#f0a63a",
  primary2: "#ffbf5e",
  secondary: "#34c3d9",
  violet: "#8b8ff5",
  success: "#33d17e",
  warning: "#f5c04b",
  danger: "#ef5b71",
  textDim: "#98a3ba",
  border: "rgba(255,255,255,.08)",
  chartSeries: ["#f0a63a", "#34c3d9", "#8b8ff5", "#33d17e", "#ef5b71", "#f5c04b", "#5ee6c4", "#f0789a", "#7ea3f0", "#c9915a"],
};

// Chart.js defaults (tema oscuro)
if (typeof Chart !== "undefined") {
  Chart.defaults.color = PALETTE.textDim;
  Chart.defaults.borderColor = "rgba(255,255,255,.06)";
  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.font.size = 11.5;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.boxWidth = 8;
  Chart.defaults.plugins.legend.labels.boxHeight = 8;
  Chart.defaults.plugins.tooltip.backgroundColor = "#1c2739";
  Chart.defaults.plugins.tooltip.borderColor = "rgba(255,255,255,.1)";
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.titleFont = { weight: "700", size: 12 };
  Chart.defaults.plugins.tooltip.cornerRadius = 8;
  Chart.defaults.plugins.tooltip.displayColors = true;

  // chartjs-plugin-datalabels se auto-registra en TODAS las graficas al
  // cargarse; lo apagamos por defecto y lo activamos explicitamente por
  // dataset (ver DL_* helpers abajo) para controlar donde y como se ve.
  if (typeof ChartDataLabels !== "undefined") {
    Chart.register(ChartDataLabels);
    Chart.defaults.plugins.datalabels = Chart.defaults.plugins.datalabels || {};
    Chart.defaults.plugins.datalabels.display = false;
  }
}

/* ---------- Helpers de etiquetas de datos (chartjs-plugin-datalabels) ----------
   Estilo "pill" discreto: texto pequeno, color acorde a la serie, fondo
   semitransparente solo para legibilidad sobre las lineas de la grilla.
   Se aplican por dataset (dataset.datalabels = DL_xxx(...)) para poder
   apagarlas selectivamente en lineas de meta/plan y evitar saturar el chart. */
function dlBase(color, extra) {
  return Object.assign({
    display: "auto",           // deja que Chart.js oculte las que no caben (evita solapes)
    color: color || "#eef1f8",
    backgroundColor: colorWithAlpha(color || "#0b1220", .16),
    borderRadius: 4,
    padding: { top: 2, bottom: 2, left: 5, right: 5 },
    font: { size: 10, weight: "600" },
  }, extra || {});
}
function dlCompactCurrency(color, extra) {
  return dlBase(color, Object.assign({
    anchor: "end", align: "end", offset: 4,
    formatter: v => (v === null || v === undefined) ? "" : fmtCompact(v),
  }, extra || {}));
}
// "meaningful" = no nulo/NaN y distinto de cero: series largas de WIP suelen
// arrancar (o terminar) con varios meses en 0 antes de que el proyecto tenga
// ejecucion, y llenar la grafica de etiquetas "0" repetidas se ve mal / no
// aporta nada -- mejor no etiquetar esos puntos (la linea en 0 ya se ve sola).
function _dlMeaningful(v) { return v !== null && v !== undefined && !isNaN(v) && v !== 0; }
/** Etiqueta en TODOS los puntos con dato real (no cero) -- para series con
 * pocos meses o donde cada punto importa (a diferencia de dlSparse, que
 * espacia 1 de cada N para series muy largas). */
function dlNonZero(color, extra) {
  return dlCompactCurrency(color, Object.assign({
    display: ctx => _dlMeaningful(ctx.dataset.data[ctx.dataIndex]),
  }, extra || {}));
}

/** Para lineas con muchos puntos (series mensuales largas): en vez de una
 * etiqueta por cada punto (ilegible, se amontonan unas con otras), solo
 * marca el ULTIMO punto con dato real (y distinto de cero) de esa serie --
 * que suele ser el numero que mas importa mirar (el acumulado/valor mas
 * reciente). */
function dlLastPoint(color, extra) {
  return dlCompactCurrency(color, Object.assign({
    display: ctx => {
      const data = ctx.dataset.data;
      for (let i = data.length - 1; i >= 0; i--) {
        if (_dlMeaningful(data[i])) return i === ctx.dataIndex;
      }
      return false;
    },
  }, extra || {}));
}
/** Para lineas largas donde SI se quiere ver progresion (no solo el ultimo
 * punto): marca 1 de cada N puntos, y siempre el ultimo dato real (no cero),
 * para que no queden ilegibles pero tampoco "vacias" de etiquetas -- y sin
 * repetir "0" en cada mes sin ejecucion. */
function dlSparse(color, everyN, extra) {
  return dlCompactCurrency(color, Object.assign({
    display: ctx => {
      const data = ctx.dataset.data;
      let lastValid = -1;
      for (let i = data.length - 1; i >= 0; i--) {
        if (_dlMeaningful(data[i])) { lastValid = i; break; }
      }
      if (ctx.dataIndex === lastValid) return true;
      if (!_dlMeaningful(data[ctx.dataIndex])) return false;
      return ctx.dataIndex % everyN === 0;
    },
  }, extra || {}));
}
function dlPercent(color, dec, extra) {
  return dlBase(color, Object.assign({
    anchor: "end", align: "top", offset: 3,
    formatter: v => (v === null || v === undefined) ? "" : fmtPct(v, dec === undefined ? 1 : dec),
  }, extra || {}));
}
function dlNum(color, dec, extra) {
  return dlBase(color, Object.assign({
    anchor: "end", align: "top", offset: 3,
    formatter: v => (v === null || v === undefined) ? "" : fmtNum(v, dec === undefined ? 2 : dec),
  }, extra || {}));
}
function dlDonutPct(minPctToShow) {
  const min = minPctToShow === undefined ? 4 : minPctToShow;
  return {
    display: ctx => {
      const arr = ctx.dataset.data;
      const total = arr.reduce((a, b) => a + (Number(b) || 0), 0);
      const v = Number(arr[ctx.dataIndex]) || 0;
      return total ? (v / total * 100) >= min : false;
    },
    color: "#0b1220",
    font: { size: 10.5, weight: "700" },
    formatter: (v, ctx) => {
      const arr = ctx.dataset.data;
      const total = arr.reduce((a, b) => a + (Number(b) || 0), 0);
      return total ? (v / total * 100).toFixed(0) + "%" : "";
    },
  };
}

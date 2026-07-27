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
}

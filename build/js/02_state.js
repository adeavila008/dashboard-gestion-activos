/* =========================================================================
   02. ESTADO GLOBAL
   ========================================================================= */
const STATE = {
  ib: {
    rows: [],            // filas normalizadas del IBReport (financiero)
    source: "default",   // "default" | "upload"
    fileName: null,
  },
  baseline: {
    rows: [],
    source: "default",
    fileName: null,
  },
  filters: {
    proyecto: "", anio: "", mes: "", tipo: "", empleado: "", cuenta: "", search: "",
  },
  saludFilters: {
    proyecto: "", anio: "", mes: "",
  },
  tx: { page: 0 },
  charts: {},           // instancias Chart.js por id de canvas
  view: "inicio",
  sidebarCollapsed: false,
  projFilter: "activos", // "activos" | "todos"
};

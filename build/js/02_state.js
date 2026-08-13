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
    // "meses" es un arreglo (multi-seleccion): [] = todos los meses.
    proyecto: "", anio: "", meses: [], tipo: "", empleado: "", cuenta: "", search: "",
  },
  saludFilters: {
    proyecto: "", anio: "", mes: "",
  },
  wip: { proyectos: {}, _sourceFile: null },
  facturacion: { mesActualizacion: null, proyectos: {}, _sourceFile: null },
  wipFilters: { proyecto: "" },
  tx: { page: 0 },
  charts: {},           // instancias Chart.js por id de canvas
  view: "inicio",
  sidebarCollapsed: false,
  projFilter: "activos", // "activos" | "todos"
};

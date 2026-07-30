/* =========================================================================
   19. CARGA DE DATOS — WIP (PROVISION DE INGRESOS) Y PROYECCION DE FACTURACION
   ========================================================================= */

function loadDefaultWip() {
  return window.__DEFAULT_WIP__ || { _sourceFile: null };
}
function loadDefaultFacturacion() {
  return window.__DEFAULT_FACTURACION__ || { mesActualizacion: null, proyectos: {}, _sourceFile: null };
}

/** Lista unificada de proyectos con datos de WIP y/o Facturación, enriquecida
 * con nombre/cliente/gerente del registro de proyectos (mas confiable que el
 * bloque de encabezado de cada archivo .xlsb, que a veces trae metadatos
 * desactualizados de una copia de otra hoja). */
function getWipFacturacionProjects() {
  const registry = window.__PROJECTS_REGISTRY__ || [];
  const registryByCode = new Map(registry.map(p => [p.codigo, p]));
  const wip = STATE.wip.proyectos || {};
  const fact = STATE.facturacion.proyectos || {};
  const codes = uniqueSorted(Object.keys(wip).concat(Object.keys(fact)));

  return codes.map(code => {
    const reg = registryByCode.get(code);
    const w = wip[code];
    const f = fact[code];
    const nombre = (reg && reg.nombre) || (w && w.header && w.header.nombreProyecto) || (f && f.nombreProyecto) || code;
    const cliente = (reg && reg.cliente) || (w && w.header && w.header.cliente) || null;
    const gerente = (reg && reg.gerente) || (w && w.header && w.header.gerente) || null;
    const historico = (w && w.historico) || [];
    const ultimo = historico.length ? historico[historico.length - 1] : null;
    return { codigo: code, nombre, cliente, gerente, historico, ultimo, facturacion: f || null };
  });
}

/** Serie mensual de proyeccion de facturacion (real+proyectado) acumulada
 * desde el primer mes con dato, para poder compararla contra la
 * Facturación Real Acumulada del archivo WIP. */
function proyeccionAcumulada(proyeccionMensual) {
  let acum = 0;
  return (proyeccionMensual || []).map(m => {
    if (typeof m.valor === "number") acum += m.valor;
    return { mes: m.mes, valor: m.valor, acumulado: acum };
  });
}

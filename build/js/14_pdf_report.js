/* =========================================================================
   14. INFORME EJECUTIVO EN PDF (con deteccion automatica de saltos de costo)
   ========================================================================= */

function openReportConfigModal() {
  const anios = uniqueSorted(STATE.ib.rows.map(r => r.anio)).sort((a, b) => b - a);
  const proyectos = getProjectAggregates();

  const body = `
    <p class="text-dim" style="font-size:12.5px;margin-top:0;">Selecciona el alcance del informe ejecutivo. Se incluyen KPIs, tendencia, anomalías de costo detectadas automáticamente, personal involucrado y resumen por proyecto.</p>
    <div class="section-title" style="font-size:12px;margin:12px 0 6px;">Año</div>
    <div class="chip-group" id="report-anios">
      <span class="chip active" data-val="">Todos</span>
      ${anios.map(a => `<span class="chip" data-val="${a}">${a}</span>`).join("")}
    </div>
    <div class="section-title" style="font-size:12px;margin:14px 0 6px;">Proyectos</div>
    <div class="chip-group" id="report-proyectos">
      <span class="chip active" data-val="">Todos los proyectos</span>
      ${proyectos.map(p => `<span class="chip" data-val="${escapeHtml(p.codigo)}">${escapeHtml(truncateLabel(p.nombre, 26))}</span>`).join("")}
    </div>
    <button class="btn btn-primary mt-8" id="btn-generar-pdf" style="margin-top:16px;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>
      Generar y descargar PDF
    </button>`;
  openModal("Informe ejecutivo", "Dirección de Gestión de Activos", body);

  const wireChipGroup = (id, multi) => {
    const group = document.getElementById(id);
    group.querySelectorAll(".chip").forEach(chip => {
      chip.addEventListener("click", () => {
        if (chip.dataset.val === "") {
          group.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
          chip.classList.add("active");
        } else {
          group.querySelector('.chip[data-val=""]').classList.remove("active");
          chip.classList.toggle("active");
          if (!group.querySelector(".chip.active")) group.querySelector('.chip[data-val=""]').classList.add("active");
        }
      });
    });
  };
  wireChipGroup("report-anios");
  wireChipGroup("report-proyectos");

  document.getElementById("btn-generar-pdf").addEventListener("click", () => {
    const anioSel = Array.from(document.querySelectorAll("#report-anios .chip.active")).map(c => c.dataset.val).filter(Boolean);
    const proySel = Array.from(document.querySelectorAll("#report-proyectos .chip.active")).map(c => c.dataset.val).filter(Boolean);
    closeModal();
    setTimeout(() => generateExecutiveReport(anioSel, proySel), 150);
  });
}

function offscreenChartImage(config, w, h) {
  return new Promise(resolve => {
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.style.position = "fixed"; canvas.style.left = "-9999px";
    document.body.appendChild(canvas);
    config.options = config.options || {};
    config.options.responsive = false;
    config.options.animation = false;
    config.options.devicePixelRatio = 2;
    const chart = new Chart(canvas, config);
    setTimeout(() => {
      const img = canvas.toDataURL("image/png", 1.0);
      chart.destroy();
      canvas.remove();
      resolve(img);
    }, 60);
  });
}

async function generateExecutiveReport(anios, proyectos) {
  showLoading("Generando informe ejecutivo…");
  try {
    let rows = STATE.ib.rows;
    if (anios.length) rows = rows.filter(r => anios.includes(String(r.anio)));
    if (proyectos.length) rows = rows.filter(r => proyectos.includes(r.proyectoCod));

    const kpi = computeFinancieroKPIs(rows);
    const serie = monthlySeries(rows);
    const { anomalyList } = buildCostMatrix(rows);
    const personal = costoPorPersonal(rows).slice(0, 12);
    const proyectosAgg = getProjectAggregates().filter(p => !proyectos.length || proyectos.includes(p.codigo));

    const chartImg = await offscreenChartImage({
      type: "bar",
      data: {
        labels: serie.map(s => periodoToLabel(s.periodo)),
        datasets: [
          { label: "Ingresos", data: serie.map(s => s.ingresos), backgroundColor: PALETTE.secondary, borderRadius: 4 },
          { label: "Costos", data: serie.map(s => s.costos), backgroundColor: PALETTE.danger, borderRadius: 4 },
        ],
      },
      options: {
        plugins: { legend: { position: "top", labels: { color: "#334", font: { size: 12 } } } },
        scales: {
          y: { ticks: { color: "#334", callback: v => fmtCompact(v) }, grid: { color: "#e5e7eb" } },
          x: { ticks: { color: "#334" }, grid: { display: false } },
        },
        backgroundColor: "#ffffff",
      },
    }, 1000, 420);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 40;
    let y = 46;

    // ---- Encabezado
    doc.setFillColor(17, 24, 39);
    doc.rect(0, 0, pageW, 74, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold"); doc.setFontSize(16);
    doc.text("Informe ejecutivo — Dirección de Gestión de Activos", margin, 32);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    const alcance = "Alcance: " + (anios.length ? "Año(s) " + anios.join(", ") : "Todos los años") + " · " + (proyectos.length ? proyectosAgg.map(p => p.nombre).join(", ") : "Todos los proyectos");
    doc.text(alcance, margin, 50);
    doc.text("Generado el " + new Date().toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "2-digit" }) + " · ISES", margin, 64);
    doc.setTextColor(20, 20, 20);
    y = 100;

    // ---- KPIs
    doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text("Resumen financiero", margin, y); y += 8;
    doc.autoTable({
      startY: y, margin: { left: margin, right: margin },
      head: [["Ingresos", "Costos", "Margen", "Margen %", "Transacciones"]],
      body: [[fmtCOP(kpi.ingresos), fmtCOP(kpi.costos), fmtCOP(kpi.margen), fmtPct(kpi.margenPct), String(kpi.count)]],
      theme: "grid", styles: { fontSize: 9, cellPadding: 6 }, headStyles: { fillColor: [240, 166, 58], textColor: 20 },
    });
    y = doc.lastAutoTable.finalY + 22;

    // ---- Tendencia (imagen)
    doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text("Tendencia mensual — Ingresos vs. Costos", margin, y); y += 8;
    const imgW = pageW - margin * 2, imgH = imgW * (420 / 1000);
    doc.addImage(chartImg, "PNG", margin, y, imgW, imgH);
    y += imgH + 22;

    if (y > 640) { doc.addPage(); y = 40; }

    // ---- Anomalías / saltos de costo
    doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text("Anomalías de costo detectadas automáticamente", margin, y); y += 8;
    if (anomalyList.length) {
      doc.autoTable({
        startY: y, margin: { left: margin, right: margin },
        head: [["Cuenta mayor", "Mes", "Valor", "Mes anterior", "Variación"]],
        body: anomalyList.slice(0, 20).map(a => [a.cuenta, periodoToLabel(a.periodo), fmtCOP(a.value), a.prevValue ? fmtCOP(a.prevValue) : "—", isFinite(a.pctChange) ? (a.pctChange >= 0 ? "+" : "") + (a.pctChange * 100).toFixed(0) + "%" : "nuevo"]),
        theme: "striped", styles: { fontSize: 8.5, cellPadding: 5 }, headStyles: { fillColor: [239, 91, 113], textColor: 255 },
      });
      y = doc.lastAutoTable.finalY + 22;
    } else {
      doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
      doc.text("No se detectaron saltos de costo relevantes en el periodo analizado.", margin, y + 10);
      y += 30;
    }

    if (y > 620) { doc.addPage(); y = 40; }

    // ---- Personal involucrado
    doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text("Personal con mayor costo asociado", margin, y); y += 8;
    doc.autoTable({
      startY: y, margin: { left: margin, right: margin },
      head: [["Empleado", "Costo", "# Transacciones"]],
      body: personal.map(p => [p.label, fmtCOP(p.value), String(p.rows.length)]),
      theme: "grid", styles: { fontSize: 9, cellPadding: 5 }, headStyles: { fillColor: [139, 143, 245], textColor: 255 },
    });
    y = doc.lastAutoTable.finalY + 22;

    if (y > 620) { doc.addPage(); y = 40; }

    // ---- Resumen por proyecto
    doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text("Resumen por proyecto", margin, y); y += 8;
    doc.autoTable({
      startY: y, margin: { left: margin, right: margin },
      head: [["Proyecto", "Ingresos", "Costos", "Margen %"]],
      body: proyectosAgg.map(p => [p.nombre, fmtCOP(p.ingresos), fmtCOP(p.costos), fmtPct(p.margenPct)]),
      theme: "striped", styles: { fontSize: 9, cellPadding: 5 }, headStyles: { fillColor: [52, 195, 217], textColor: 20 },
    });

    // ---- Pie de pagina
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(140, 140, 140);
      doc.text("ISES · Dirección de Gestión de Activos · Página " + i + " de " + pageCount, margin, doc.internal.pageSize.getHeight() - 20);
    }

    doc.save("Informe_Ejecutivo_Gestion_Activos_" + new Date().toISOString().slice(0, 10) + ".pdf");
    showToast("Informe generado", "El PDF se descargó correctamente.", "success");
  } catch (err) {
    console.error(err);
    showToast("Error al generar el informe", err.message || String(err), "error");
  } finally {
    hideLoading();
  }
}

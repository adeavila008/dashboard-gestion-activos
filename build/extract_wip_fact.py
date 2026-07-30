"""
Extrae los datos de WIP (Provisión de Ingresos) y Proyección de Facturación
para la Dirección de Gestión de Activos, a partir de los dos Excel binarios
(.xlsb) que la dirección actualiza periódicamente:

  1. "GP-F21 Provisión de Ingresos WIP ... .xlsb"
     Vive en subcarpetas por año/mes dentro de la carpeta "WIP" del usuario
     (ej. WIP/2026/07. Julio/...), y dentro de cada mes se van guardando
     varias versiones semanales (..._S2.xlsb, ..._S3.xlsb, ..._Final.xlsb).
     Cada hoja de proyecto trae, en la sección "3. BALANCE WIP", el HISTORICO
     COMPLETO mes a mes (con detalle semanal S1-S5 para los meses recientes)
     de: Saldo WIP, WIP del mes, Ajustes, Facturación Real, Pendiente por
     Facturar, Facturación Contable, etc. Como cada archivo ya trae todo el
     historico hasta su mes de corte, NO hace falta fusionar archivos de
     meses distintos: basta con tomar el archivo más reciente (la versión
     "Final" de la carpeta de mes más reciente; si aún no hay "Final" se usa
     la última semana disponible).

  2. "GP-F08 Registro de proyecciones de facturación y costos ... .xlsb"
     Un solo archivo que el usuario reemplaza cada mes, con la hoja "GP-F08"
     que trae, por proyecto, el contrato, lo facturado a la fecha y la
     PROYECCIÓN DE FACTURACIÓN mes a mes (real + proyectado) desde enero 2025
     hasta diciembre 2027.

Uso:
    python3 extract_wip_fact.py --wip-dir "<carpeta WIP>" --fact-dir "<carpeta Facturación_&_Costos>"
    python3 extract_wip_fact.py --wip-file "<un .xlsb>" --fact-file "<un .xlsb>"   (archivos puntuales)

Salida: build/data/wip.json y build/data/facturacion.json
"""
import json
import math
import os
import re
import sys
from datetime import datetime, timedelta

from pyxlsb import open_workbook

BUILD_DIR = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BUILD_DIR, "data")

# Mismos codigos de proyecto de Gestion de Activos que usa extract_data.py
# (excluye "1012", que en el IBReport es la gerencia/overhead, no un proyecto
# con WIP/facturacion propia).
GA_PROJECT_CODES = {
    "AFN24100-101", "AFN24103-100", "AIR25103-100",
    "AIR25105-101", "CER24100-100", "ESA25101-100",
}

# El archivo GP-F08 trae, para "Actualización del Inventario de Alumbrado
# Público" (proyecto de Luminarias con AIR-E), el ID ERP "AIR24103-100" (24)
# en vez de "AIR25103-100" (25) que es el codigo real usado en el IBReport y
# en el archivo WIP. Es un typo del archivo fuente (se confirmo comparando
# nombre de proyecto y cliente); se corrige aqui explicitamente en vez de
# adivinar en general.
ID_ALIASES = {
    "AIR24103-100": "AIR25103-100",
}

EXCEL_ERROR_TOKENS = {
    "#DIV/0!", "#N/A", "#VALUE!", "#REF!", "#NAME?", "#NULL!", "#NUM!", "#ERROR!",
}


# pyxlsb (a diferencia de openpyxl) no siempre traduce las celdas de error de
# formula (#REF!, #NAME?, etc.) a su texto: para algunos errores devuelve el
# codigo de error crudo del formato BIFF como string hexadecimal (ej. "0x17"
# = 23 decimal = #REF! segun la tabla de codigos de error de Excel). Estas
# celdas rotas aparecen cuando una formula quedo referenciando una fila/celda
# que se borro en una version anterior de la hoja semanal; se tratan igual
# que cualquier otro error de formula: se descartan (None) en vez de tratarse
# como un numero real.
_HEX_ERROR_RE = re.compile(r"^0x[0-9a-fA-F]+$")


def clean_num(v):
    if v is None:
        return None
    if isinstance(v, str):
        s = v.strip()
        if not s or s.upper() in EXCEL_ERROR_TOKENS or _HEX_ERROR_RE.match(s):
            return None
        return v
    if isinstance(v, float):
        if math.isnan(v):
            return None
        return round(v, 2)
    return v


def excel_serial_to_iso(v, with_day=True):
    """Convierte un serial de fecha de Excel (o un valor ya-string) a
    'YYYY-MM-DD'. Los .xlsb siempre devuelven las fechas como numero serial
    (pyxlsb no aplica el formato de celda), asi que este es el unico camino
    esperado; se deja el fallback de string por si acaso."""
    if v is None:
        return None
    if isinstance(v, str):
        return v
    if isinstance(v, (int, float)):
        try:
            d = datetime(1899, 12, 30) + timedelta(days=float(v))
            return d.strftime("%Y-%m-%d") if with_day else d.strftime("%Y-%m")
        except (OverflowError, ValueError):
            return None
    return None


def is_date_serial(v):
    # Fechas reales en nuestro rango (2020-2035) caen entre ~43000 y ~50000.
    return isinstance(v, (int, float)) and 40000 < v < 60000


WEEK_LABELS = {"S1", "S2", "S3", "S4", "S5"}


# ---------------------------------------------------------------------------
# 1) Localizar el archivo WIP y el archivo de Facturacion mas recientes
# ---------------------------------------------------------------------------

def _version_rank(filename):
    name = filename.lower()
    if "final" in name:
        return 10_000
    m = re.search(r"[_ ]s(\d+)", name)
    if m:
        return int(m.group(1))
    return 0


def find_latest_wip_file(wip_dir):
    """Recorre WIP/<año>/<mes>/*.xlsb y devuelve la ruta del archivo mas
    reciente: primero por (año, mes) de la carpeta contenedora, y dentro del
    mismo mes por version (Final > S-mas alto > mtime)."""
    candidates = []
    for root, _dirs, files in os.walk(wip_dir):
        for fn in files:
            if not fn.lower().endswith((".xlsb", ".xlsx", ".xls")) or fn.startswith("~$"):
                continue
            path = os.path.join(root, fn)
            parent = os.path.basename(root)
            grandparent = os.path.basename(os.path.dirname(root))
            year_m = re.search(r"(20\d\d)", grandparent) or re.search(r"(20\d\d)", parent)
            month_m = re.match(r"\s*(\d{1,2})", parent)
            year = int(year_m.group(1)) if year_m else 0
            month = int(month_m.group(1)) if month_m else 0
            rank = _version_rank(fn)
            mtime = os.path.getmtime(path)
            candidates.append(((year, month, rank, mtime), path))
    if not candidates:
        raise FileNotFoundError(f"No se encontro ningun Excel de WIP en '{wip_dir}'.")
    candidates.sort(key=lambda t: t[0])
    return candidates[-1][1]


def find_latest_fact_file(fact_dir):
    candidates = []
    for fn in os.listdir(fact_dir):
        if not fn.lower().endswith((".xlsb", ".xlsx", ".xls")) or fn.startswith("~$"):
            continue
        path = os.path.join(fact_dir, fn)
        candidates.append((os.path.getmtime(path), path))
    if not candidates:
        raise FileNotFoundError(f"No se encontro ningun Excel de Facturacion en '{fact_dir}'.")
    candidates.sort()
    return candidates[-1][1]


# ---------------------------------------------------------------------------
# 2) WIP: header de cada hoja de proyecto + tabla "3. BALANCE WIP"
# ---------------------------------------------------------------------------

def _sheet_rows(ws):
    out = []
    for row in ws.rows():
        vals = [c.v for c in row]
        out.append(vals)
    return out


def _find_label_row(rows, label, col=1, limit=20):
    for i, r in enumerate(rows[:limit]):
        if len(r) > col and isinstance(r[col], str) and r[col].strip() == label:
            return i
    return None


def _extract_project_header(rows):
    def get(label, col_label=1, col_value=2):
        i = _find_label_row(rows, label, col=col_label)
        if i is None:
            return None
        return rows[i][col_value] if len(rows[i]) > col_value else None

    return {
        "nombreProyecto": get("Nombre del Proyecto:"),
        "contrato": get("N° Contrato:"),
        "idProyecto": get("ID Proyecto:"),
        "cliente": get("Cliente:"),
        "gerente": get("Gerente Asignado:"),
        "valorContrato": clean_num(get("Nombre del Proyecto:", col_label=1, col_value=9)),
        "fechaInicio": excel_serial_to_iso(get("N° Contrato:", col_label=1, col_value=9)),
        "fechaFin": excel_serial_to_iso(get("ID Proyecto:", col_label=1, col_value=9)),
    }


BALANCE_COLS = [
    "saldoWip", "wipMes", "ajustes", "wipMesAjustes",
    "facturacionRealMes", "facturacionRealAcum", "pendienteFacturarReal",
    "reversionSaldoWipMesAnterior", "reconocimientoSaldoWipMesVigente",
    "facturacionContableMes", "facturacionContableAcum", "observaciones",
]


def _extract_balance_wip(rows):
    header_idx = None
    for i, r in enumerate(rows):
        if len(r) > 2 and r[1] == "Mes" and r[2] == "Saldo WIP":
            header_idx = i
            break
    if header_idx is None:
        return []

    historico = []
    i = header_idx + 1
    while i < len(rows):
        r = rows[i]
        col1 = r[1] if len(r) > 1 else None
        if col1 is None:
            break
        if isinstance(col1, str) and col1.strip() in WEEK_LABELS:
            # fila semanal suelta sin mes "padre" (no deberia pasar, pero por si acaso)
            i += 1
            continue
        if not is_date_serial(col1):
            # fila rara que no es ni fecha ni semana: se ignora y se sigue
            i += 1
            continue
        entry = {"mes": excel_serial_to_iso(col1)}
        for j, key in enumerate(BALANCE_COLS, start=2):
            entry[key] = clean_num(r[j] if len(r) > j else None)
        entry["semanas"] = []
        i += 1
        while i < len(rows):
            wr = rows[i]
            wcol1 = wr[1] if len(wr) > 1 else None
            if not (isinstance(wcol1, str) and wcol1.strip() in WEEK_LABELS):
                break
            entry["semanas"].append({
                "semana": wcol1.strip(),
                "saldoWip": clean_num(wr[2] if len(wr) > 2 else None),
                "wipSemana": clean_num(wr[3] if len(wr) > 3 else None),
            })
            i += 1
        historico.append(entry)
    return historico


def extract_wip(path):
    proyectos = {}
    with open_workbook(path) as wb:
        for sheet_name in wb.sheets:
            if sheet_name not in GA_PROJECT_CODES:
                continue
            with wb.get_sheet(sheet_name) as ws:
                rows = _sheet_rows(ws)
            header = _extract_project_header(rows)
            historico = _extract_balance_wip(rows)
            proyectos[sheet_name] = {"header": header, "historico": historico}
    return proyectos


# ---------------------------------------------------------------------------
# 3) Facturacion: seccion INGRESOS de la hoja GP-F08
# ---------------------------------------------------------------------------

FACT_SUMMARY_COLS = [
    "idErp", "valorContratoFinal", "valorContratoInicial", "fechaFinalizacion",
    "facturacionAcumTotal", "saldoContrVsFact", "totalProyeccionFacturacion",
    "saldoContrVsFactMasProy",
]


def extract_facturacion(path):
    with open_workbook(path) as wb:
        with wb.get_sheet("GP-F08") as ws:
            rows = _sheet_rows(ws)

    meta_row = None
    for r in rows[:10]:
        if len(r) > 1 and r[1] == "FECHA DE ACTUALIZACIÓN:":
            meta_row = r
            break
    mes_actualizacion = meta_row[2] if meta_row and len(meta_row) > 2 else None

    header_idx = None
    for i, r in enumerate(rows):
        if len(r) > 1 and r[1] == "INGRESOS":
            header_idx = i
            break
    if header_idx is None:
        raise ValueError(f"'{path}': no se encontro la seccion INGRESOS en la hoja GP-F08.")

    header_row = rows[header_idx]
    month_cols = []  # (colIdx, "YYYY-MM-01")
    for j in range(10, len(header_row)):
        v = header_row[j]
        if is_date_serial(v):
            month_cols.append((j, excel_serial_to_iso(v)))

    proyectos = {}
    i = header_idx + 3  # salta header, total "REAL + PROYECTADO" y fila hibrida de subtotal
    while i < len(rows):
        r = rows[i]
        nombre = r[1] if len(r) > 1 else None
        if nombre is None:
            break
        raw_id = r[2] if len(r) > 2 else None
        cod = ID_ALIASES.get(raw_id, raw_id) if isinstance(raw_id, str) else raw_id
        if isinstance(cod, str) and cod in GA_PROJECT_CODES:
            entry = {"nombreProyecto": nombre}
            for j, key in enumerate(FACT_SUMMARY_COLS, start=2):
                val = r[j] if len(r) > j else None
                if key == "fechaFinalizacion":
                    val = excel_serial_to_iso(val)
                else:
                    val = clean_num(val)
                entry[key] = val
            proyeccion_mensual = []
            for col_idx, mes_iso in month_cols:
                v = clean_num(r[col_idx] if len(r) > col_idx else None)
                proyeccion_mensual.append({"mes": mes_iso, "valor": v})
            entry["proyeccionMensual"] = proyeccion_mensual
            proyectos[cod] = entry
        i += 1

    return {"mesActualizacion": mes_actualizacion, "proyectos": proyectos}


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    argv = sys.argv[1:]
    wip_path = None
    fact_path = None
    i = 0
    while i < len(argv):
        if argv[i] == "--wip-dir" and i + 1 < len(argv):
            wip_path = find_latest_wip_file(argv[i + 1])
            i += 2
        elif argv[i] == "--wip-file" and i + 1 < len(argv):
            wip_path = argv[i + 1]
            i += 2
        elif argv[i] == "--fact-dir" and i + 1 < len(argv):
            fact_path = find_latest_fact_file(argv[i + 1])
            i += 2
        elif argv[i] == "--fact-file" and i + 1 < len(argv):
            fact_path = argv[i + 1]
            i += 2
        else:
            raise SystemExit(f"Argumento no reconocido: {argv[i]}")

    if not wip_path and not fact_path:
        raise SystemExit(__doc__)

    os.makedirs(OUT, exist_ok=True)

    if wip_path:
        print("WIP <-", wip_path)
        proyectos = extract_wip(wip_path)
        wip_data = {"proyectos": proyectos, "_sourceFile": os.path.basename(wip_path)}
        with open(os.path.join(OUT, "wip.json"), "w", encoding="utf-8") as f:
            json.dump(wip_data, f, ensure_ascii=False, separators=(",", ":"))
        n_meses = sum(len(p["historico"]) for p in proyectos.values())
        print(f"  proyectos: {len(proyectos)} · filas mensuales totales: {n_meses}")

    if fact_path:
        print("Facturacion <-", fact_path)
        fact_data = extract_facturacion(fact_path)
        fact_data["_sourceFile"] = os.path.basename(fact_path)
        with open(os.path.join(OUT, "facturacion.json"), "w", encoding="utf-8") as f:
            json.dump(fact_data, f, ensure_ascii=False, separators=(",", ":"))
        print(f"  proyectos: {len(fact_data['proyectos'])} · mes actualizacion: {fact_data['mesActualizacion']}")


if __name__ == "__main__":
    main()

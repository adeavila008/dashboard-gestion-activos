/* =========================================================================
   03. UTILIDADES
   ========================================================================= */
const fmtCOPFull = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const fmtNumFull = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

function fmtCOP(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return fmtCOPFull.format(n);
}
function fmtNum(n, dec) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return n.toLocaleString("es-CO", { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 });
}
function fmtPct(n, dec) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return n.toLocaleString("es-CO", { minimumFractionDigits: dec === undefined ? 1 : dec, maximumFractionDigits: dec === undefined ? 1 : dec }) + "%";
}
function fmtCompact(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "MM";
  if (abs >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return String(Math.round(n));
}
function fmtDate(d) {
  if (!d) return "—";
  const dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  return dt.toLocaleDateString("es-CO", { year: "numeric", month: "short", day: "2-digit" });
}

function periodoToLabel(periodo) {
  if (!periodo) return "—";
  const s = String(periodo);
  const y = s.slice(0, 4), m = parseInt(s.slice(4, 6), 10);
  return (CFG.monthNames[m - 1] || "?") + " " + y;
}
function periodoToDate(periodo) {
  const s = String(periodo);
  const y = parseInt(s.slice(0, 4), 10), m = parseInt(s.slice(4, 6), 10);
  return new Date(y, m - 1, 1);
}
function mesToPeriodo(mesDate) {
  const d = (mesDate instanceof Date) ? mesDate : new Date(mesDate);
  return d.getFullYear() * 100 + (d.getMonth() + 1);
}

function groupBy(arr, keyFn) {
  const map = new Map();
  for (const item of arr) {
    const k = keyFn(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
}
function sumBy(arr, valFn) {
  let s = 0;
  for (const item of arr) { const v = valFn(item); if (typeof v === "number" && !isNaN(v)) s += v; }
  return s;
}
function uniqueSorted(arr) {
  return Array.from(new Set(arr.filter(v => v !== null && v !== undefined && v !== ""))).sort((a, b) => String(a).localeCompare(String(b), "es"));
}
function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function stdev(arr) {
  if (arr.length < 2) return 0;
  const m = avg(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}
function debounce(fn, wait) {
  let t;
  return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), wait); };
}
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function colorWithAlpha(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

"""
Arma el dashboard HTML final (un solo archivo) a partir de:
  - template.html          (estructura)
  - styles.css             (tema oscuro)
  - js/*.js                (concatenados en orden numerico)
  - data/*.json            (datasets por defecto, embebidos)

Uso:  python3 build.py
Salida: dist/index.html   (este es el archivo que se sube a la raíz del repo
                           de GitHub para que lo sirva GitHub Pages; el
                           index.html de la raíz del proyecto local es solo
                           un redirect a la URL en línea y build.py NUNCA lo
                           toca).
"""
import glob
import os
from datetime import datetime

BUILD_DIR = os.path.dirname(os.path.abspath(__file__))
DIST_DIR = os.path.join(BUILD_DIR, "dist")
OUT_PATH = os.path.join(DIST_DIR, "index.html")


def safe_embed(json_text: str) -> str:
    # Evita que un "</script" dentro de un string de datos cierre el <script> real.
    return json_text.replace("</", "<\\/")


def main():
    template = open(os.path.join(BUILD_DIR, "template.html"), encoding="utf-8").read()
    styles = open(os.path.join(BUILD_DIR, "styles.css"), encoding="utf-8").read()

    js_files = sorted(glob.glob(os.path.join(BUILD_DIR, "js", "*.js")))
    script = "\n\n".join(f"/* ---- {os.path.basename(f)} ---- */\n" + open(f, encoding="utf-8").read() for f in js_files)

    data_ib = safe_embed(open(os.path.join(BUILD_DIR, "data", "default_ibreport.json"), encoding="utf-8").read())
    data_baseline = safe_embed(open(os.path.join(BUILD_DIR, "data", "default_baseline.json"), encoding="utf-8").read())
    data_projects = safe_embed(open(os.path.join(BUILD_DIR, "data", "projects_registry.json"), encoding="utf-8").read())

    html = template
    html = html.replace("{{STYLES}}", styles)
    html = html.replace("{{DATA_IBREPORT}}", data_ib)
    html = html.replace("{{DATA_BASELINE}}", data_baseline)
    html = html.replace("{{DATA_PROJECTS}}", data_projects)
    html = html.replace("{{BUILD_DATE}}", datetime.now().strftime("%Y-%m-%d %H:%M"))
    html = html.replace("{{SCRIPT}}", script)

    os.makedirs(DIST_DIR, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        f.write(html)

    size_mb = os.path.getsize(OUT_PATH) / (1024 * 1024)
    print(f"OK -> {OUT_PATH} ({size_mb:.2f} MB)")
    print(f"JS modules incluidos: {len(js_files)}")
    for f in js_files:
        print("  -", os.path.basename(f))


if __name__ == "__main__":
    main()

"""
Utilidades para la actualizacion semanal automatica del dashboard de Gestion
de Activos.

IMPORTANTE sobre el diseño: procesar los 5 (o mas) Excel de la carpeta Costos
de un tiron tarda mas de lo que dura una sola llamada de shell en el entorno
donde corre la tarea programada. Por eso este script NO hace todo en un solo
proceso; se usa en varios pasos, cada uno pensado para caber comodo en una
llamada:

  1) python3 weekly_update.py check "<carpeta_costos>"
     Compara la carpeta Costos contra la huella guardada la ultima vez
     (build/.last_costos_manifest.json). Imprime "NOCHANGE" (nada que hacer) o
     "CHANGED" + la lista de archivos nuevos/modificados. No modifica nada.

  2) Por cada archivo .xlsx de la carpeta Costos (una llamada de shell por
     archivo, ~10-15s cada una):
         python3 extract_data.py --cache-file "<archivo.xlsx>" "<carpeta_cache>"

  3) python3 extract_data.py --merge-cache "<carpeta_cache>"
     Junta todos los .json de la carpeta_cache, deduplica y escribe
     build/data/default_ibreport.json (no toca baseline/projects_registry).

  4) python3 build.py
     Reconstruye build/dist/index.html con el dataset actualizado.

  5) python3 weekly_update.py finalize "<carpeta_costos>" "<carpeta_temp_repo>"
     Clona el repo de GitHub (usa el token en build/.github_token), copia
     build/dist/index.html -> index.html y build/{js,styles.css,template.html,
     extract_data.py,data} -> build/, hace commit + push, y SOLO SI el push
     fue exitoso guarda la huella nueva de Costos (para que, si algo falla a
     mitad de camino, la proxima corrida lo vuelva a intentar en vez de darlo
     por hecho).
"""
import json
import os
import subprocess
import sys

BUILD_DIR = os.path.dirname(os.path.abspath(__file__))
MANIFEST_PATH = os.path.join(BUILD_DIR, ".last_costos_manifest.json")
TOKEN_PATH = os.path.join(BUILD_DIR, ".github_token")
REPO_URL = "github.com/adeavila008/dashboard-gestion-activos.git"


def compute_manifest(costos_dir):
    manifest = {}
    for fn in sorted(os.listdir(costos_dir)):
        if not fn.lower().endswith((".xlsx", ".xls")) or fn.startswith("~$"):
            continue
        p = os.path.join(costos_dir, fn)
        st = os.stat(p)
        manifest[fn] = {"size": st.st_size, "mtime": int(st.st_mtime)}
    return manifest


def load_last_manifest():
    if os.path.exists(MANIFEST_PATH):
        with open(MANIFEST_PATH, encoding="utf-8") as f:
            return json.load(f)
    return {}


def diff_manifest(old, new):
    added = [k for k in new if k not in old]
    removed = [k for k in old if k not in new]
    changed = [k for k in new if k in old and (new[k]["size"] != old[k]["size"] or new[k]["mtime"] != old[k]["mtime"])]
    return added, removed, changed


def run(cmd, cwd=None):
    print("$", " ".join(cmd))
    result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if result.stdout:
        print(result.stdout)
    if result.returncode != 0:
        print(result.stderr)
        raise RuntimeError(f"Comando fallo ({result.returncode}): {' '.join(cmd)}")
    return result.stdout


def cmd_check(costos_dir):
    new_manifest = compute_manifest(costos_dir)
    old_manifest = load_last_manifest()
    added, removed, changed = diff_manifest(old_manifest, new_manifest)
    if not added and not removed and not changed and old_manifest:
        print("NOCHANGE")
        return
    print("CHANGED")
    for fn in added:
        print("  + nuevo:", fn)
    for fn in changed:
        print("  ~ modificado:", fn)
    for fn in removed:
        print("  - ya no esta:", fn)
    print("ARCHIVOS_A_PROCESAR:")
    for fn in sorted(new_manifest):
        print(" ", os.path.join(costos_dir, fn))


def cmd_finalize(costos_dir, tmp_repo_dir):
    dist_index = os.path.join(BUILD_DIR, "dist", "index.html")
    if not os.path.exists(dist_index):
        raise RuntimeError("No existe build/dist/index.html — corre build.py antes de finalize.")

    if not os.path.exists(TOKEN_PATH):
        raise RuntimeError(f"No se encontro el token en {TOKEN_PATH}; no se puede hacer push.")
    with open(TOKEN_PATH, encoding="utf-8") as f:
        token = f.read().strip()

    if os.path.isdir(tmp_repo_dir):
        run(["rm", "-rf", tmp_repo_dir])
    run(["git", "clone", "--quiet", f"https://x-access-token:{token}@{REPO_URL}", tmp_repo_dir])
    run(["git", "config", "user.email", "adeavila@ises.com.co"], cwd=tmp_repo_dir)
    run(["git", "config", "user.name", "Actualizacion semanal automatica"], cwd=tmp_repo_dir)

    run(["rm", "-rf", os.path.join(tmp_repo_dir, "build", "js")])
    run(["cp", "-r", os.path.join(BUILD_DIR, "js"), os.path.join(tmp_repo_dir, "build", "js")])
    run(["cp", os.path.join(BUILD_DIR, "styles.css"), os.path.join(tmp_repo_dir, "build", "styles.css")])
    run(["cp", os.path.join(BUILD_DIR, "template.html"), os.path.join(tmp_repo_dir, "build", "template.html")])
    run(["cp", os.path.join(BUILD_DIR, "extract_data.py"), os.path.join(tmp_repo_dir, "build", "extract_data.py")])
    run(["cp", os.path.join(BUILD_DIR, "weekly_update.py"), os.path.join(tmp_repo_dir, "build", "weekly_update.py")])
    run(["rm", "-rf", os.path.join(tmp_repo_dir, "build", "data")])
    run(["cp", "-r", os.path.join(BUILD_DIR, "data"), os.path.join(tmp_repo_dir, "build", "data")])
    run(["cp", dist_index, os.path.join(tmp_repo_dir, "index.html")])

    run(["git", "add", "-A"], cwd=tmp_repo_dir)
    status = run(["git", "status", "--short"], cwd=tmp_repo_dir)
    if not status.strip():
        print("No hay cambios reales para commitear (el dataset quedo igual). No se hace push.")
    else:
        run(["git", "commit", "-q", "-m", "Actualizacion semanal automatica desde carpeta Costos"], cwd=tmp_repo_dir)
        run(["git", "push", f"https://x-access-token:{token}@{REPO_URL}", "main"], cwd=tmp_repo_dir)
        print("Push realizado correctamente.")

    # Solo se guarda la huella nueva si todo lo anterior no lanzo excepcion.
    new_manifest = compute_manifest(costos_dir)
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(new_manifest, f, ensure_ascii=False, indent=2)
    print("Manifiesto actualizado.")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    sub = sys.argv[1]
    if sub == "check" and len(sys.argv) >= 3:
        cmd_check(sys.argv[2])
    elif sub == "finalize" and len(sys.argv) >= 4:
        cmd_finalize(sys.argv[2], sys.argv[3])
    else:
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()

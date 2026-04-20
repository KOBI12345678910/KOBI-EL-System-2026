"""Create 10 organized ZIP files of the entire project (excluding build artifacts)."""
import os, zipfile, time
from pathlib import Path

ROOT = Path(r"C:\Users\kobi\Projects\techno-kol-uzi-2026")
OUT  = ROOT / "_delivery" / "zips"
OUT.mkdir(parents=True, exist_ok=True)

# Directories/patterns to exclude from every zip
EXCLUDE_DIRS = {
    "node_modules", "dist", ".git", ".cache", "build", "coverage",
    ".next", ".turbo", ".vite", "tmp", ".pnpm", ".yarn", "out",
    "__pycache__", ".pytest_cache", ".vscode", ".idea",
    "zips",  # don't zip our own zips (recursion)
    "_merge-staging", "_merge-staging-final",  # archive of old copies, ~GB each
    "_external-backups", "_github-backups",    # backup snapshots
    "_audit_tmp",
    "AI-Task-Manager",  # sub-monorepo with duplicate sources + installed deps
    "venv", ".venv", "env", ".env_dir", "site-packages",
    "target", "vendor",  # rust/php/go vendor dirs
    "logs",
    ".local",  # Python/pip user cache (GPS-Connect has 30K files here)
    ".replit_cache", ".upm", ".breakpoints",
    "lib", "lib64",  # Python venv lib dirs (when sibling to .local)
    "Scripts",  # Windows venv binary dir
}
EXCLUDE_EXTS = {".log", ".tmp", ".cache", ".DS_Store"}

def should_skip(path: Path) -> bool:
    parts = path.parts
    if any(p in EXCLUDE_DIRS for p in parts):
        return True
    if path.suffix in EXCLUDE_EXTS:
        return True
    if path.name.startswith(".") and path.name in {".env", ".env.local"}:
        return True  # never zip secrets
    return False

def add_dir_to_zip(zf: zipfile.ZipFile, src_dir: Path, arc_prefix: str = ""):
    if not src_dir.exists():
        return 0
    count = 0
    for p in src_dir.rglob("*"):
        if not p.is_file():
            continue
        rel = p.relative_to(ROOT)
        if should_skip(rel):
            continue
        arc = (arc_prefix + str(rel).replace("\\", "/")) if arc_prefix else str(rel).replace("\\", "/")
        try:
            zf.write(p, arc)
            count += 1
        except ValueError:
            # Old timestamp (pre-1980) or other ZipInfo issue — fix mtime and retry
            try:
                os.utime(p, (time.time(), time.time()))
                zf.write(p, arc)
                count += 1
            except Exception:
                pass
        except (PermissionError, OSError):
            pass
    return count

def add_files_to_zip(zf: zipfile.ZipFile, files: list[Path]):
    count = 0
    for p in files:
        if not p.is_file():
            continue
        rel = p.relative_to(ROOT)
        if should_skip(rel):
            continue
        try:
            zf.write(p, str(rel).replace("\\", "/"))
            count += 1
        except ValueError:
            try:
                os.utime(p, (time.time(), time.time()))
                zf.write(p, str(rel).replace("\\", "/"))
                count += 1
            except Exception:
                pass
        except (PermissionError, OSError):
            pass
    return count

def make_zip(name: str, dirs: list[str] = None, root_globs: list[str] = None):
    out = OUT / f"{name}.zip"
    if out.exists():
        out.unlink()
    t0 = time.time()
    total = 0
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for d in (dirs or []):
            n = add_dir_to_zip(zf, ROOT / d)
            total += n
        if root_globs:
            files = []
            for pat in root_globs:
                files.extend(ROOT.glob(pat))
            total += add_files_to_zip(zf, files)
    elapsed = time.time() - t0
    size_mb = out.stat().st_size / (1024 * 1024)
    print(f"OK  {name:40s}  {total:6d} files  {size_mb:7.2f} MB  ({elapsed:.1f}s)", flush=True)
    return total, size_mb

# ============ 10 ZIPS ============
import sys
_RESUME_ONLY = ("resume" in sys.argv)

ALL_ZIPS = [
    ("01_api-server",         ["api-server"]),
    ("02_erp-app",            ["erp-app"]),
    ("03_onyx-procurement",   ["onyx-procurement"]),
    ("04_onyx-ai",            ["onyx-ai"]),
    ("05_payroll-autonomous", ["payroll-autonomous"]),
    ("06_techno-kol-ops_mobile_desktop", ["techno-kol-ops", "mobile-app", "desktop-tutorial-client", "desktop-tutorial-server"]),
    ("07_database_supabase",  ["supabase", "database"]),
    ("08_docs_master-registry_qa", ["_master-registry", "_qa-reports", "docs"]),  # _delivery excluded (would include our zips)
    ("09_packages_lib_locales", ["packages", "lib-client", "locales"]),  # AI-Task-Manager skipped (duplicates root sources + has installed node_modules)
]
ZIPS = [(n, d) for (n, d) in ALL_ZIPS if not _RESUME_ONLY or not (OUT / f"{n}.zip").exists()]
# ZIP 10 — root config & everything else
ROOT_GLOBS = [
    "*.json", "*.md", "*.js", "*.cjs", "*.mjs", "*.ts",
    "*.toml", "*.lock", "*.yaml", "*.yml", "*.cfg", "*.conf",
    "*.env.example", "*.gitignore", "*.eslintrc*", "*.prettierrc*",
    "Dockerfile*", "docker-compose*", "Makefile*", ".env.template",
    "pnpm-*", "tsconfig*",
]

print("=" * 78)
print(f"Building 10 ZIPs in: {OUT}")
print("=" * 78)
totals = []
for name, dirs in ZIPS:
    totals.append(make_zip(name, dirs))

# ZIP 10 — root config + scripts + remaining loose dirs
print("Building ZIP 10 (root config + scripts + extras)...")
out10 = OUT / "10_root-config_scripts_extras.zip"
if out10.exists(): out10.unlink()
t0 = time.time(); total10 = 0
with zipfile.ZipFile(out10, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
    # Root files
    for pat in ROOT_GLOBS:
        files = list(ROOT.glob(pat))
        total10 += add_files_to_zip(zf, files)
    # Misc dirs not yet captured
    for d in ["scripts", "docker", "k8s", "GPS-Connect", "enterprise_palantir_core",
              "nexus_engine", "palantir_realtime_core", "paradigm_engine",
              "tools", "tests", "test", ".github", ".husky", "shared",
              "store", "config", "backups"]:
        n = add_dir_to_zip(zf, ROOT / d)
        total10 += n
size10 = out10.stat().st_size / (1024 * 1024)
elapsed = time.time() - t0
print(f"OK  {'10_root-config_scripts_extras':40s}  {total10:6d} files  {size10:7.2f} MB  ({elapsed:.1f}s)", flush=True)
totals.append((total10, size10))

print("=" * 78)
total_files = sum(t[0] for t in totals)
total_mb = sum(t[1] for t in totals)
print(f"TOTAL: {total_files:,} files, {total_mb:.2f} MB across 10 ZIPs")
print("=" * 78)
print()
print("Files in", OUT, ":")
for f in sorted(OUT.glob("*.zip")):
    print(f"  {f.name:50s}  {f.stat().st_size / (1024*1024):7.2f} MB")

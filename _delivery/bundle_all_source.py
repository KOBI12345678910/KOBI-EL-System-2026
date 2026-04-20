"""Bundle ALL source code into a single massive text file for delivery."""
import os, time
from pathlib import Path

ROOT = Path(r"C:\Users\kobi\Projects\techno-kol-uzi-2026")
OUT_DIR = ROOT / "_delivery" / "all-source"
OUT_DIR.mkdir(parents=True, exist_ok=True)

EXCLUDE_DIRS = {
    "node_modules", "dist", ".git", ".cache", "build", "coverage",
    ".next", ".turbo", ".vite", "tmp", ".pnpm", ".yarn", "out",
    "__pycache__", ".pytest_cache", ".vscode", ".idea",
    "zips", "all-source",
    "_merge-staging", "_merge-staging-final",
    "_external-backups", "_github-backups", "_audit_tmp",
    "AI-Task-Manager",
    "venv", ".venv", "env", "site-packages",
    ".local", ".replit_cache", ".upm",
}

INCLUDE_EXTS = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".sql", ".md", ".json",
                ".yaml", ".yml", ".toml", ".env.example", ".sh", ".py"}

SKIP_FILES = {"pnpm-lock.yaml", "package-lock.json", "yarn.lock"}

def should_skip(path: Path) -> bool:
    if any(p in EXCLUDE_DIRS for p in path.parts):
        return True
    if path.name in SKIP_FILES:
        return True
    if path.suffix not in INCLUDE_EXTS and path.name not in {"Dockerfile", ".env.example", "Makefile"}:
        return True
    return False

# Collect all files
print("Scanning files...", flush=True)
files = []
for p in ROOT.rglob("*"):
    if not p.is_file():
        continue
    rel = p.relative_to(ROOT)
    if should_skip(rel):
        continue
    try:
        size = p.stat().st_size
        if size > 500_000:  # skip huge files (min.js, etc)
            continue
    except OSError:
        continue
    files.append((rel, size))

files.sort(key=lambda x: str(x[0]).lower())
print(f"Found {len(files)} files", flush=True)

# Split into 10 equal chunks
CHUNKS = 10
chunk_size = (len(files) + CHUNKS - 1) // CHUNKS

total_bytes = 0
for chunk_idx in range(CHUNKS):
    start = chunk_idx * chunk_size
    end = min(start + chunk_size, len(files))
    chunk_files = files[start:end]
    if not chunk_files:
        continue
    out = OUT_DIR / f"all_source_part_{chunk_idx+1:02d}_of_{CHUNKS}.txt"
    with open(out, "w", encoding="utf-8", errors="replace") as f:
        f.write(f"# KOBI-EL ERP 2026 — All Source Code (Part {chunk_idx+1}/{CHUNKS})\n")
        f.write(f"# Files in this part: {len(chunk_files)} of {len(files)} total\n")
        f.write(f"# Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write("# " + "=" * 76 + "\n\n")
        for rel, size in chunk_files:
            abs_path = ROOT / rel
            header = f"\n\n{'=' * 80}\nFILE: {rel}\nSIZE: {size:,} bytes\n{'=' * 80}\n\n"
            f.write(header)
            try:
                content = abs_path.read_text(encoding="utf-8", errors="replace")
                f.write(content)
            except Exception as e:
                f.write(f"[ERROR reading file: {e}]\n")
    bytes_written = out.stat().st_size
    total_bytes += bytes_written
    print(f"Part {chunk_idx+1:2d}/{CHUNKS}: {len(chunk_files):4d} files, {bytes_written/1024/1024:6.2f} MB -> {out.name}", flush=True)

print(f"\nTOTAL: {len(files):,} files, {total_bytes/1024/1024:.2f} MB across {CHUNKS} parts")
print(f"Output dir: {OUT_DIR}")

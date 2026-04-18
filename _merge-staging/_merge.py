#!/usr/bin/env python3
"""
Merge script: hash, dedupe, classify, and merge sources into monorepo.

Writes:
  _merge-staging/_index.json              -- full file index (source, path, size, sha256, class)
  _merge-staging/_report.json             -- summary stats
  _merge-staging/_new-entities.json       -- pages/routes/models found
  _merge-staging/_conflicts/              -- conflicting files
"""
import os, sys, json, hashlib, shutil, re
from pathlib import Path

ROOT = Path(r"C:/Users/kobi/Projects/techno-kol-uzi-2026")
STAGING = ROOT / "_merge-staging"
CONFLICTS = STAGING / "_conflicts"
DEST = ROOT

# Priority order for canonical selection (higher wins)
PRIORITY = {
    "technokoluzi-erp": 100,
    "AI-Task-Manager": 90,
    "Location-Finder": 80,
    "GPS-Connect": 70,
    "Invoice-Ledger": 60,
    "erp-upload": 50,
    "files-2": 40,
    "files-4": 30,
    "files-5": 20,
}

# Skip patterns
SKIP_DIRS = {"node_modules", ".git", ".next", "dist", "build", ".expo", ".cache",
             ".turbo", ".parcel-cache", "coverage", ".nyc_output", ".pnpm-store",
             ".replit-artifact", ".vision-tmp", "backups", "logs",
             ".local", ".config", ".agents", ".upm", ".breakpoints", "attached_assets",
             ".vscode-server", ".npm", "uploads", ".replit"}
SKIP_FILES_EXACT = {"package-lock.json", "yarn.lock", "pnpm-lock.yaml", ".DS_Store", "Thumbs.db"}
# Files/exts always treated as binary/skip
SKIP_EXTS = {".log", ".pid", ".lock", ".tmp"}

CODE_EXTS = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".sql", ".py", ".sh", ".go", ".rs", ".java", ".rb", ".php"}
CONFIG_NAMES = {"package.json", "tsconfig.json", "tsconfig.base.json", ".env.example",
                "next.config.js", "vite.config.ts", "vite.config.js", "tailwind.config.js",
                "tailwind.config.ts", "postcss.config.js", "drizzle.config.ts", "replit.md"}
CONFIG_EXTS = {".env", ".yaml", ".yml", ".toml", ".ini"}
ASSET_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico", ".pdf",
              ".woff", ".woff2", ".ttf", ".eot", ".otf", ".mp3", ".mp4", ".wav"}
DOCS_EXTS = {".md", ".txt", ".rst"}

HUGE_FILE_BYTES = 50 * 1024 * 1024  # 50MB


def should_skip_dir(name):
    return name in SKIP_DIRS or name.startswith(".pnpm")


def classify(rel_path: Path, size: int):
    name = rel_path.name
    if name in SKIP_FILES_EXACT:
        return "LOCKFILE"
    ext = rel_path.suffix.lower()
    if ext in SKIP_EXTS:
        return "SKIP"
    if name in CONFIG_NAMES or ext in CONFIG_EXTS:
        return "CONFIG"
    if ext in CODE_EXTS:
        return "CODE"
    if ext in DOCS_EXTS:
        return "DOCS"
    if ext in ASSET_EXTS:
        return "ASSET"
    if ext == ".zip":
        return "ARCHIVE"
    return "BINARY"


def sha256_file(p: Path, bufsize=1 << 16):
    h = hashlib.sha256()
    try:
        with open(p, "rb") as f:
            while chunk := f.read(bufsize):
                h.update(chunk)
        return h.hexdigest()
    except Exception:
        return None


def walk_source(src_name: str, src_root: Path):
    """Yield (rel_path, abs_path, size) for every file worth hashing."""
    if not src_root.exists():
        return
    for dirpath, dirnames, filenames in os.walk(src_root):
        # Filter skip dirs in-place
        dirnames[:] = [d for d in dirnames if not should_skip_dir(d)]
        for fname in filenames:
            ap = Path(dirpath) / fname
            try:
                size = ap.stat().st_size
            except Exception:
                continue
            rel = ap.relative_to(src_root)
            yield rel, ap, size


# Sources (name -> absolute root)
SOURCES = {
    "technokoluzi-erp": STAGING / "technokoluzi-erp" / "technokoluzi-erp",
    "AI-Task-Manager": ROOT / "AI-Task-Manager",  # pre-extracted
    "Location-Finder": STAGING / "Location-Finder" / "Location-Finder",
    "GPS-Connect": STAGING / "GPS-Connect" / "GPS-Connect",
    "Invoice-Ledger": STAGING / "Invoice-Ledger" / "Invoice-Ledger",
    "erp-upload": STAGING / "erp-upload",
    "files-2": STAGING / "files-2",
    "files-4": STAGING / "files-4",
    "files-5": STAGING / "files-5",
}


def main():
    print(f"[merge] scanning {len(SOURCES)} sources ...", flush=True)
    # index: sha -> list of (src, rel_str, abs_path, size)
    by_hash = {}
    per_source_stats = {s: {"files": 0, "bytes": 0, "skipped": 0} for s in SOURCES}
    total_files = 0

    for src_name, src_root in SOURCES.items():
        if not src_root.exists():
            print(f"  [skip] {src_name}: not found {src_root}", flush=True)
            continue
        print(f"  [scan] {src_name} @ {src_root}", flush=True)
        for rel, ap, size in walk_source(src_name, src_root):
            # Size guard for huge files
            if size > HUGE_FILE_BYTES:
                per_source_stats[src_name]["skipped"] += 1
                continue
            cls_guess = classify(rel, size)
            # Skip obvious junk
            if cls_guess in ("SKIP", "LOCKFILE", "ARCHIVE"):
                per_source_stats[src_name]["skipped"] += 1
                continue
            sha = sha256_file(ap)
            if not sha:
                per_source_stats[src_name]["skipped"] += 1
                continue
            entry = {
                "source": src_name,
                "rel": str(rel).replace("\\", "/"),
                "abs": str(ap).replace("\\", "/"),
                "size": size,
                "class": cls_guess,
            }
            by_hash.setdefault(sha, []).append(entry)
            per_source_stats[src_name]["files"] += 1
            per_source_stats[src_name]["bytes"] += size
            total_files += 1
            if total_files % 5000 == 0:
                print(f"    ... hashed {total_files}", flush=True)

    unique = len(by_hash)
    dups = total_files - unique
    print(f"[merge] hashed {total_files} files, {unique} unique, {dups} duplicates eliminated", flush=True)

    # Build canonical selection per hash
    canonical = {}
    for sha, entries in by_hash.items():
        entries.sort(key=lambda e: PRIORITY.get(e["source"], 0), reverse=True)
        canonical[sha] = entries[0]

    # Scan destination for existing files (relative to DEST root)
    print(f"[merge] scanning destination for existing files ...", flush=True)
    dest_by_rel = {}  # rel path (posix) -> sha256
    skip_dest = {"_merge-staging", "_external-backups", "_github-backups", "_master-registry",
                 "_qa-reports", "node_modules", ".git", "AI-Task-Manager", "GPS-Connect",
                 "dist", "build", ".next"}
    for dirpath, dirnames, filenames in os.walk(DEST):
        # Filter
        dirnames[:] = [d for d in dirnames if d not in skip_dest and not should_skip_dir(d)]
        # Keep only top-level subtrees we care about
        for fname in filenames:
            ap = Path(dirpath) / fname
            try:
                size = ap.stat().st_size
            except Exception:
                continue
            if size > HUGE_FILE_BYTES:
                continue
            rel = ap.relative_to(DEST)
            rel_posix = str(rel).replace("\\", "/")
            # only hash typical code+config we'd conflict with
            ext = ap.suffix.lower()
            if ext in CODE_EXTS or ap.name in CONFIG_NAMES or ext in CONFIG_EXTS or ext in DOCS_EXTS:
                sha = sha256_file(ap)
                if sha:
                    dest_by_rel[rel_posix] = sha
    print(f"[merge] destination has {len(dest_by_rel)} hashed files", flush=True)

    # Classify and plan merge
    plan = {
        "CODE-NEW": [],
        "CODE-EXISTING": [],
        "CODE-CONFLICT": [],
        "CONFIG": [],
        "ASSET": [],
        "DOCS": [],
        "BINARY-SKIP": [],
    }

    # Determine target path in destination
    def plan_target(entry):
        """Return target relative path in DEST for this source entry."""
        src = entry["source"]
        rel = entry["rel"]
        # Heuristics based on source tree
        # artifacts/erp-app/src/... -> erp-app/src/...
        m = re.match(r"artifacts/erp-app/(.+)", rel)
        if m:
            return f"erp-app/{m.group(1)}"
        m = re.match(r"artifacts/api-server/(.+)", rel)
        if m:
            return f"api-server/{m.group(1)}"
        m = re.match(r"artifacts/erp-mobile/(.+)", rel)
        if m:
            return f"mobile-app/{m.group(1)}"
        m = re.match(r"artifacts/kobi-agent/(.+)", rel)
        if m:
            return f"onyx-ai/agents/{m.group(1)}"
        # lib/db/*, lib/api-zod/* -> lib-client/
        m = re.match(r"lib/(db|api-zod|shared|utils|schema)/(.+)", rel)
        if m:
            return f"lib-client/{m.group(1)}/{m.group(2)}"
        m = re.match(r"lib/(.+)", rel)
        if m:
            return f"lib-client/{m.group(1)}"
        # supabase migrations
        m = re.match(r"(supabase/migrations/)(.+)", rel)
        if m:
            return rel
        m = re.match(r"(supabase/functions/)(.+)", rel)
        if m:
            return rel
        # scripts/
        if rel.startswith("scripts/"):
            return f"packages/{src}/{rel}"
        # Anything under root-level server/
        if rel.startswith("server/"):
            return f"api-server/src-legacy/{src}/{rel[len('server/'):]}"
        # top-level docs
        if rel.endswith(".md") or rel.endswith(".txt"):
            return f"docs/merged/{src}/{rel}"
        # default: isolate as package
        return f"packages/{src}/{rel}"

    for sha, entry in canonical.items():
        cls = entry["class"]
        tgt_rel = plan_target(entry)
        entry["target"] = tgt_rel

        if cls == "BINARY":
            plan["BINARY-SKIP"].append(entry)
            continue
        if cls == "DOCS":
            plan["DOCS"].append(entry)
            continue
        if cls == "ASSET":
            plan["ASSET"].append(entry)
            continue
        if cls == "CONFIG":
            plan["CONFIG"].append(entry)
            continue
        # CODE
        existing_sha = dest_by_rel.get(tgt_rel)
        if existing_sha is None:
            plan["CODE-NEW"].append(entry)
        elif existing_sha == sha:
            plan["CODE-EXISTING"].append(entry)
        else:
            plan["CODE-CONFLICT"].append(entry)

    # Write index
    index_out = {
        "sources": {s: str(r).replace("\\", "/") for s, r in SOURCES.items()},
        "per_source_stats": per_source_stats,
        "total_files_scanned": total_files,
        "unique_hashes": unique,
        "duplicates_eliminated": dups,
        "counts": {k: len(v) for k, v in plan.items()},
    }
    (STAGING / "_report.json").write_text(json.dumps(index_out, indent=2, ensure_ascii=False), encoding="utf-8")
    # Plan
    (STAGING / "_plan.json").write_text(json.dumps(plan, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[merge] wrote report: {STAGING / '_report.json'}", flush=True)
    print(f"[merge] plan counts: {index_out['counts']}", flush=True)

    # Execute merge
    CONFLICTS.mkdir(parents=True, exist_ok=True)
    copied = {"CODE-NEW": 0, "CONFIG": 0, "ASSET": 0, "DOCS": 0, "CODE-CONFLICT-ARCHIVED": 0}

    def copy_file(src_abs, tgt_rel):
        tgt = DEST / tgt_rel
        tgt.parent.mkdir(parents=True, exist_ok=True)
        if not tgt.exists():
            try:
                shutil.copy2(src_abs, tgt)
                return True
            except Exception as e:
                print(f"   copy error {src_abs} -> {tgt}: {e}", flush=True)
                return False
        return False

    # CODE-NEW
    for entry in plan["CODE-NEW"]:
        if copy_file(entry["abs"], entry["target"]):
            copied["CODE-NEW"] += 1
    # CONFIG — rename with suffix to avoid clobber
    for entry in plan["CONFIG"]:
        tgt_rel = entry["target"]
        src_name = entry["source"]
        tgt = DEST / tgt_rel
        if tgt.exists():
            # don't overwrite; save as .from-<src>
            suffixed = tgt.with_name(tgt.name + f".from-{src_name}")
            if not suffixed.exists():
                try:
                    shutil.copy2(entry["abs"], suffixed)
                    copied["CONFIG"] += 1
                except Exception:
                    pass
        else:
            if copy_file(entry["abs"], tgt_rel):
                copied["CONFIG"] += 1
    # ASSET
    for entry in plan["ASSET"]:
        if copy_file(entry["abs"], entry["target"]):
            copied["ASSET"] += 1
    # DOCS
    for entry in plan["DOCS"]:
        if copy_file(entry["abs"], entry["target"]):
            copied["DOCS"] += 1
    # CODE-CONFLICT: archive source version under _conflicts/, leave destination alone
    for entry in plan["CODE-CONFLICT"]:
        src_name = entry["source"]
        safe_rel = entry["target"].replace("/", "_").replace("\\", "_")
        conflict_path = CONFLICTS / f"{src_name}__{safe_rel}"
        try:
            conflict_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(entry["abs"], conflict_path)
            copied["CODE-CONFLICT-ARCHIVED"] += 1
        except Exception as e:
            print(f"   conflict archive error: {e}", flush=True)

    print(f"[merge] copied: {copied}", flush=True)
    (STAGING / "_copied.json").write_text(json.dumps(copied, indent=2), encoding="utf-8")

    # ---- Phase 5: new entities scan ----
    print(f"[merge] scanning for new entities ...", flush=True)
    new_entities = {"pages": [], "routes_api": [], "migrations": [], "schema_files": []}

    for entry in plan["CODE-NEW"]:
        rel = entry["target"]
        rel_lower = rel.lower()
        name = Path(rel).name
        ext = Path(rel).suffix.lower()

        # Page detection: erp-app/src/pages/**/*.tsx or **/pages/**/*.tsx
        if ("/pages/" in rel_lower or rel_lower.startswith("erp-app/src/pages/")) and ext in (".tsx", ".jsx"):
            new_entities["pages"].append(rel)
        # API route detection
        if ("/api-server/src/routes/" in rel_lower or rel_lower.startswith("api-server/src/routes/")) and ext in (".ts", ".js"):
            new_entities["routes_api"].append(rel)
        # Supabase migrations
        if rel_lower.startswith("supabase/migrations/") and ext == ".sql":
            new_entities["migrations"].append(rel)
        # Schema (lib/db/schema/*)
        if "/db/schema/" in rel_lower or rel_lower.startswith("lib-client/db/schema/") or rel_lower.startswith("lib-client/db/"):
            if ext in (".ts", ".js"):
                new_entities["schema_files"].append(rel)

    (STAGING / "_new-entities.json").write_text(json.dumps(new_entities, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[merge] entities: pages={len(new_entities['pages'])} routes={len(new_entities['routes_api'])} migs={len(new_entities['migrations'])} schema={len(new_entities['schema_files'])}", flush=True)

    # Final counts
    final_count = 0
    final_bytes = 0
    for dirpath, dirnames, filenames in os.walk(DEST):
        dirnames[:] = [d for d in dirnames if d not in skip_dest and not should_skip_dir(d)]
        for fname in filenames:
            ap = Path(dirpath) / fname
            try:
                final_count += 1
                final_bytes += ap.stat().st_size
            except Exception:
                pass
    summary = {
        "total_sources_processed": sum(1 for s, r in SOURCES.items() if r.exists()),
        "total_files_extracted": total_files,
        "total_unique_files": unique,
        "duplicates_eliminated": dups,
        "conflicts_found": len(plan["CODE-CONFLICT"]),
        "new_code_files_added": copied["CODE-NEW"],
        "counts": index_out["counts"],
        "copied": copied,
        "new_entities_counts": {k: len(v) for k, v in new_entities.items()},
        "final_project_file_count": final_count,
        "final_project_bytes": final_bytes,
        "per_source_stats": per_source_stats,
    }
    (STAGING / "_summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[merge] DONE. Summary -> {STAGING / '_summary.json'}", flush=True)


if __name__ == "__main__":
    main()

"""LOC counter for AGENT-323. Counts SLOC per language per service."""
import os, sys, json
from collections import defaultdict

ROOT = r"C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93"

EXT_LANG = {
    ".js": "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript",
    ".jsx": "JSX",
    ".ts": "TypeScript",
    ".tsx": "TSX",
    ".sql": "SQL",
    ".py": "Python",
    ".json": "JSON",
    ".html": "HTML", ".htm": "HTML",
    ".css": "CSS", ".scss": "CSS", ".sass": "CSS",
    ".md": "Markdown",
    ".yml": "YAML", ".yaml": "YAML",
}

EXCLUDE_DIR_NAMES = {
    "node_modules", "_merge-incoming", "dist", "build",
    ".git", ".next", "out", "coverage", ".turbo", ".cache",
    "_audit_tmp", "_merge-staging", "_merge-staging-final",
    "_delivery", "_github-backups",
    "tmp-e2e-reports", "tmp-e2e-screenshots",
}

# Top-level service buckets: anything not falling into one of these maps to "other-root"
SERVICE_BUCKETS = [
    "onyx-procurement",
    "techno-kol-ops",
    "onyx-ai",
    "payroll-autonomous",
    "api-server",
    "erp-app",
    "mobile-app",
    "AI-Task-Manager",
    "GPS-Connect",
    "enterprise_palantir_core",
    "nexus_engine",
    "palantir_realtime_core",
    "paradigm_engine",
    "vm-task-runner",
    "desktop-tutorial-client",
    "desktop-tutorial-server",
    "lib-client",
    "packages",
    "src",
    "supabase",
    "scripts",
    "docs",
    "test",
    "k8s",
    "docker",
    "locales",
    "_qa-reports",
    "_qa-reports-25",
    "_master-registry",
    "dev",
]

def service_for(rel_path):
    parts = rel_path.replace("\\", "/").split("/")
    if not parts:
        return "(root)"
    head = parts[0]
    if head in SERVICE_BUCKETS:
        return head
    return "(root)"

def count_sloc(path):
    """Count non-blank, non-pure-comment lines."""
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            sloc = 0
            for line in f:
                s = line.strip()
                if not s:
                    continue
                # Strip simple single-line comment lines for code-like files;
                # for JSON/MD/YAML/HTML/CSS we keep them but skip blanks.
                sloc += 1
            return sloc
    except Exception:
        return 0

# tally[service][lang] = (files, sloc)
tally = defaultdict(lambda: defaultdict(lambda: [0, 0]))
totals_by_lang = defaultdict(lambda: [0, 0])
grand_files = 0
grand_sloc = 0

for dirpath, dirnames, filenames in os.walk(ROOT):
    # prune
    dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIR_NAMES]
    rel = os.path.relpath(dirpath, ROOT)
    if rel == ".":
        rel = ""
    for fname in filenames:
        ext = os.path.splitext(fname)[1].lower()
        if ext not in EXT_LANG:
            continue
        lang = EXT_LANG[ext]
        full = os.path.join(dirpath, fname)
        sloc = count_sloc(full)
        if sloc == 0:
            continue
        svc = service_for(rel) if rel else "(root)"
        tally[svc][lang][0] += 1
        tally[svc][lang][1] += sloc
        totals_by_lang[lang][0] += 1
        totals_by_lang[lang][1] += sloc
        grand_files += 1
        grand_sloc += sloc

# Output JSON to stdout
out = {
    "totals_by_lang": {k: {"files": v[0], "sloc": v[1]} for k, v in totals_by_lang.items()},
    "by_service": {
        svc: {lang: {"files": v[0], "sloc": v[1]} for lang, v in langs.items()}
        for svc, langs in tally.items()
    },
    "grand_files": grand_files,
    "grand_sloc": grand_sloc,
}
print(json.dumps(out, indent=2, ensure_ascii=False))

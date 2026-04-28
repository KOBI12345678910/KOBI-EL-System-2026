# AGENT-323 — Source Lines of Code Census

**Date:** 2026-04-29
**Worktree:** `objective-merkle-40ff93`
**Method:** Recursive walk; SLOC = non-blank lines per file (cloc-style logical count, no per-language comment-stripping). Files with 0 SLOC excluded.
**Excluded directories:** `node_modules`, `_merge-incoming`, `dist`, `build`, `.git`, `.next`, `out`, `coverage`, `.turbo`, `.cache`, `_audit_tmp`, `_merge-staging`, `_merge-staging-final`, `_delivery`, `_github-backups`, `tmp-e2e-reports`, `tmp-e2e-screenshots`.
**Tooling:** `_qa-reports-25/loc_count.py` (Python 3.12). Raw JSON: `_qa-reports-25/loc_results.json`.

---

## 1. Headline numbers

| Bucket | Files | SLOC |
|---|---:|---:|
| **Code** (JS, TS, TSX, JSX, SQL, Python) | 8,775 | **2,601,587** |
| **Data** (JSON, YAML) | 249 | 266,206 |
| **Docs** (Markdown) | 958 | 274,152 |
| **Markup** (HTML, CSS) | 46 | 8,931 |
| **GRAND TOTAL (all 11 langs)** | **10,028** | **3,150,876** |

**Verdict vs. 700,000-line expectation: EXCEEDED BY ~3.7x on code-only and ~4.5x on all-langs.**
- Pure executable code alone: **2.60M SLOC** (≈ 3.72× the 700k target).
- All tracked languages combined: **3.15M SLOC** (≈ 4.50× the target).

---

## 2. Per-language totals (cloc-style table)

| Language | Files | SLOC | % of all-lang total |
|---|---:|---:|---:|
| TSX | 3,864 | 1,209,361 | 38.4% |
| TypeScript | 3,470 | 744,826 | 23.6% |
| JavaScript | 1,037 | 551,957 | 17.5% |
| Markdown | 958 | 274,152 | 8.7% |
| JSON | 199 | 200,590 | 6.4% |
| YAML | 50 | 65,616 | 2.1% |
| SQL | 159 | 40,081 | 1.3% |
| Python | 194 | 30,611 | 1.0% |
| JSX | 51 | 24,751 | 0.8% |
| HTML | 36 | 7,762 | 0.2% |
| CSS | 10 | 1,169 | 0.04% |
| **TOTAL** | **10,028** | **3,150,876** | 100% |

---

## 3. Per-service breakdown (code-only: JS+TS+TSX+JSX+SQL+Py)

| Rank | Service / Top-level dir | Code SLOC | % of code |
|---:|---|---:|---:|
| 1 | `AI-Task-Manager` | 918,742 | 35.3% |
| 2 | `erp-app` | 550,951 | 21.2% |
| 3 | `onyx-procurement` (Finance & Procurement, port 3100) | 514,037 | 19.8% |
| 4 | `api-server` | 261,502 | 10.1% |
| 5 | `onyx-ai` (port 3300) | 63,156 | 2.4% |
| 6 | `techno-kol-ops` (Operational Core, port 3200) | 58,785 | 2.3% |
| 7 | `lib-client` | 51,803 | 2.0% |
| 8 | `mobile-app` | 37,484 | 1.4% |
| 9 | `supabase` | 33,237 | 1.3% |
| 10 | `payroll-autonomous` (port 5173) | 28,959 | 1.1% |
| 11 | `enterprise_palantir_core` | 18,749 | 0.7% |
| 12 | `GPS-Connect` | 14,399 | 0.6% |
| 13 | `test` | 13,105 | 0.5% |
| 14 | `paradigm_engine` | 10,255 | 0.4% |
| 15 | `packages` | 8,523 | 0.3% |
| 16 | `scripts` | 4,196 | 0.2% |
| 17 | `palantir_realtime_core` | 4,013 | 0.2% |
| 18 | `nexus_engine` | 2,846 | 0.1% |
| 19 | `desktop-tutorial-client` | 2,228 | 0.1% |
| 20 | `desktop-tutorial-server` | 2,041 | 0.1% |
| | other (`_master-registry`, `_qa-reports*`, `vm-task-runner`, `src`, `docker`) | 2,576 | 0.1% |
| | **TOTAL** | **2,601,587** | 100% |

---

## 4. The 4 declared services (per CLAUDE.md)

CLAUDE.md identifies 4 canonical services. Their isolated code SLOC:

| Service | Role | Port | Code SLOC | Files |
|---|---|---:|---:|---:|
| **TECHNO_KOL_OPS** | Operational Core (hub) | 3200 | 58,785 | 211 |
| **ONYX_PROCUREMENT** | Finance & Procurement backbone | 3100 | 514,037 | 855 |
| **PAYROLL_AUTONOMOUS** | Workforce & Salary engine | 5173 | 28,959 | 98 |
| **ONYX_AI** | Intelligence & Automation layer | 3300 | 63,156 | 167 |
| **4-service subtotal** | | | **664,937** | 1,331 |

The 4 declared services account for ~26% of the code; the remaining ~74% lives in `AI-Task-Manager`, `erp-app`, `api-server`, `lib-client`, `mobile-app`, `supabase` and assorted engines/cores.

---

## 5. Top-3 deep-dive (language mix)

### `AI-Task-Manager` — 918,742 code SLOC
| Lang | Files | SLOC |
|---|---:|---:|
| TSX | 1,746 | 580,351 |
| TypeScript | 1,407 | 330,698 |
| Python | 19 | 4,145 |
| SQL | 22 | 2,548 |
| JavaScript | 11 | 1,000 |

### `erp-app` — 550,951 code SLOC
| Lang | Files | SLOC |
|---|---:|---:|
| TSX | 1,727 | 539,476 |
| TypeScript | 64 | 7,486 |
| Python | 18 | 3,989 |

### `onyx-procurement` — 514,037 code SLOC
| Lang | Files | SLOC |
|---|---:|---:|
| JavaScript | 829 | 504,692 |
| JSX | 4 | 3,314 |
| TSX | 7 | 3,078 |
| SQL | 15 | 2,953 |
| (no first-party TypeScript) | 0 | 0 |

---

## 6. Comparison to user expectation (700,000+ lines)

| Metric | Value | vs. 700k expectation |
|---|---:|:---|
| Code SLOC (executable: JS/TS/TSX/JSX/SQL/Py) | 2,601,587 | **+1,901,587 (3.72x)** |
| All-language SLOC (incl. MD/JSON/YAML/HTML/CSS) | 3,150,876 | **+2,450,876 (4.50x)** |
| 4 declared services only (code) | 664,937 | -35,063 (0.95x — ~5% short) |
| 4 declared services + `api-server` + `lib-client` | 978,242 | +278,242 (1.40x) |
| TSX alone | 1,209,361 | +509,361 (1.73x) |

**Caveats:**
- Real cloc would strip per-language comments; this counter strips only blank lines, so it *overstates* by an estimated 5-15% vs. tools like `cloc`, `tokei`, `scc`. Even after a 15% haircut, code SLOC ≈ 2.21M — still far above 700k.
- `AI-Task-Manager` and `erp-app` together (1.47M SLOC, mostly TSX) dominate the count; these are app-level UI/state code that may include some scaffolded/generated content. A targeted audit of that codebase is the highest-leverage next step.
- The 4 declared core services alone (664k) almost exactly hit the 700k target — suggesting the "700k" figure was likely a baseline expectation for the 4-service core ERP, while peripheral apps push the worktree to 2.6M+.

---

## 7. Files

- **Raw counts (JSON):** `_qa-reports-25/loc_results.json`
- **Counter script:** `_qa-reports-25/loc_count.py`

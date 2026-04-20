# 📦 KOBI-EL ERP 2026 — 10-ZIP Delivery Package

**Date:** 2026-04-20
**Total size:** ~32 MB across 10 ZIPs
**For:** Replit upload (each file under 10 MB ✅)

---

## 📂 Contents

| # | File | Size | Files | Contents |
|---|------|------|-------|----------|
| 01 | `01_api-server.zip` | 2.80 MB | 785 | Backend Express+TS API server (`api-server/`) |
| 02 | `02_erp-app.zip` | 9.28 MB | 1,855 | Main React+Vite frontend (`erp-app/`) |
| 03 | `03_onyx-procurement.zip` | 6.99 MB | 1,177 | Procurement service (`onyx-procurement/`) |
| 04 | `04_onyx-ai.zip` | 0.77 MB | 183 | AI orchestration service (`onyx-ai/`) |
| 05 | `05_payroll-autonomous.zip` | 0.38 MB | 108 | Payroll service (`payroll-autonomous/`) |
| 06 | `06_techno-kol-ops_mobile_desktop.zip` | 2.44 MB | 432 | Ops + mobile + desktop tutorial apps |
| 07 | `07_database_supabase.zip` | 4.40 MB | ~ | All Supabase migrations + database schemas |
| 08 | `08_docs_master-registry_qa.zip` | 3.05 MB | ~ | Documentation, master registry, QA reports |
| 09 | `09_packages_lib_locales.zip` | 0.74 MB | 939 | Shared packages, lib-client, i18n locales |
| 10 | `10_root-config_scripts_extras.zip` | 1.26 MB | 550 | Root configs, scripts, docker, k8s, .github |

**Total:** 32.10 MB · 8,029+ source files

---

## 🚫 Excluded from all ZIPs

To keep sizes Replit-friendly:
- `node_modules/`, `dist/`, `build/`, `coverage/`, `.next/`, `.turbo/`, `.vite/`
- `.git/`, `.cache/`, `__pycache__/`, `.pytest_cache/`
- `venv/`, `.venv/`, `site-packages/`, `.local/` (Python caches)
- `_merge-staging*/`, `_external-backups/`, `_github-backups/` (old archives)
- `AI-Task-Manager/` (sub-monorepo with duplicate sources + installed deps)
- `*.log`, `*.tmp`, `.DS_Store`, `.env`, `.env.local` (secrets safety)

---

## 🚀 How to Upload to Replit

1. Open your Replit project
2. Drag & drop ZIPs **in order** 01 → 10
3. After each upload, run in Replit shell:
   ```bash
   unzip -o NN_<name>.zip && rm NN_<name>.zip
   ```
4. After ZIP 10 is uploaded and extracted, install dependencies:
   ```bash
   pnpm install
   ```
5. Start the dev server:
   ```bash
   pnpm --filter @workspace/erp-app dev
   ```

---

## 🔍 Verifying Integrity

```bash
# Compare totals against the source repo:
cd techno-kol-uzi-2026
find api-server/src -type f \( -name "*.ts" -o -name "*.tsx" \) | wc -l
# Should match `wc -l` of the api-server zip's TS files
```

---

## 📝 Audit Status (as shipped)

- ✅ Supabase security advisors: **0 lints**
- ✅ All RLS policies role-gated (no `USING (true)` on authenticated)
- ✅ All FKs indexed (43 added)
- ✅ Israeli VAT date-aware throughout
- ✅ No `eval()`, no shell injection, no SQLi vectors

See `08_docs_master-registry_qa.zip` → `_master-registry/FINAL_SECURITY_AUDIT_SUMMARY.md` for full details.

---

## 🔗 GitHub Repo

```
https://github.com/KOBI12345678910/KOBI-EL-System-2026
```

Latest master commit includes all of this code + the migrations + the audit doc.

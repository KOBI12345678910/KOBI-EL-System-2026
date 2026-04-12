Legacy Migration Samples
========================
Agent-68 — ONYX Procurement

This directory contains sanitised sample files that exercise every adapter
in ../legacy-migration.js.  They are used by:

  - legacy-migration.test.js (unit tests may read these for integration runs)
  - docs/LEGACY_MIGRATION.md  (documentation walks through each file)
  - QA and onboarding — operators can "try migrate" without touching real
    customer data

Files are small (2–5 rows each) and contain ONLY synthetic Hebrew business
data. No real Techno-Kol customer or supplier records.

Inventory
---------

  hashavshevet-windows.csv   — semicolon-delimited Hebrew headers, DD/MM/YYYY
  hashavshevet-erp.csv       — comma-delimited English headers, YYYY-MM-DD
  hashavshevet-ledger.csv    — debit/credit ledger card export (חשב הנ"ה)
  hashavshevet-receipts.csv  — receipt file (תקבולים)
  priority-invoices.xml      — Priority INVOICE records
  priority-parts.csv         — Priority inventory CSV export
  priority-orders.xml        — Priority ORDER records
  excel-legacy.txt           — normalised Excel text form (see parseExcelLegacy)
  generic-mixed.csv          — fallback for any other system

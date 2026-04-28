# AGENT-176 — Keyboard Shortcuts Audit

**Date:** 2026-04-29 | **Branch:** claude/objective-merkle-40ff93
**Scope:** Save (Ctrl+S), Search (Ctrl+K), Close (Esc), Navigation, Help (?), Hebrew/RTL.

---

## 1. Executive Summary

The system has **two parallel implementations** of keyboard shortcuts and they are inconsistent across the four services. Coverage is partial: `Ctrl+K` (search) and `Esc` (close) are widely wired; `Ctrl+S` (save) is implemented in only a couple of places; the help dialog exists in two flavors (`Ctrl+/` vs button-only); navigation by Alt/Ctrl-digit is available in payroll only.

**Verdict:** Functional baseline, **MED severity gaps** in cross-service consistency and Ctrl+S coverage on the main ERP.

---

## 2. Inventory by Service

### 2.1 TECHNO_KOL_OPS (`techno-kol-ops/client`)

| Shortcut | Action | File | Line |
|---|---|---|---|
| `Ctrl+K` / `Cmd+K` | Open/close global search | `client/src/components/GlobalSearch.tsx` | 188 |
| `Esc` | Close search modal, clear query | `GlobalSearch.tsx` | 193, 221 |
| `ArrowUp` / `ArrowDown` | Navigate results | `GlobalSearch.tsx` | 213-218 |
| `Enter` | Select result / submit login | `GlobalSearch.tsx` 219, `App.tsx` 204 |
| `Enter` / `Space` | Sidebar navigation activate | `Sidebar.tsx` | 87 |
| Footer hint `Ctrl+K פתח/סגור` | Visible in search | `GlobalSearch.tsx` | 363 |
| Title attr `Ctrl+K` | TopNavbar search hint | `TopNavbar.tsx` | 85, 109 |

**Missing:** No `Ctrl+S` save. No `Ctrl+/` help dialog. No `?` shortcut. No 360-page navigation shortcuts.

### 2.2 PAYROLL_AUTONOMOUS (`payroll-autonomous`)

Most complete implementation. Single global handler in `src/App.jsx:1177-1199`.

| Shortcut | Action |
|---|---|
| `Ctrl+1..5` | Jump to Dashboard / Wage-Slips / Employees / RFQ / BI |
| `Ctrl+/` | Toggle ShortcutsModal |
| `Esc` | Close ShortcutsModal, clear errors |
| `?` button | Header opens ShortcutsModal — `App.jsx:1338` |

Help dialog: `src/components/ShortcutsModal.tsx` (lines 24-32) — RTL with `direction:'rtl'`, Hebrew labels, lists all 7 shortcuts. Closes on Escape (handler line 42-46) or backdrop click (line 53).

**Missing:** No `Ctrl+S` save shortcut. No `Ctrl+K` search (no global search component in payroll).

### 2.3 ERP-APP (`erp-app/src/components/keyboard-shortcuts.tsx`)

Hook `useGlobalKeyboardShortcuts` — most feature-complete on paper.

| Shortcut | Action | Line |
|---|---|---|
| `Ctrl+K` | "חיפוש מהיר" (label only — handler not wired in this file) | 18 |
| `Ctrl+N` | Click `[data-quick-add-fab]` | 19-22, 54-58 |
| `Ctrl+S` | Click `[data-save-btn], button[type="submit"]` — **fires even inside inputs** | 23-26, 45-50 |
| `Ctrl+/` | Toggle cheat-sheet | 27, 60-63 |
| `Esc` | Close cheat-sheet (skipped if `[role=dialog]` open) | 38-43 |
| `Alt+H` | Navigate `/` | 29, 65-68 |
| `Alt+S` | Navigate `/settings` | 30, 70-73 |
| `Alt+T` | Toggle theme | 31, 75-78 |

**Issue (BUG-K01, MED):** `Ctrl+S` handler is called *before* the `if (isInput) return` guard on line 52, so submitting a form via Ctrl+S works inside inputs (intended), but `Ctrl+N` and `Ctrl+/` are correctly blocked inside inputs. Verify desired behavior.

**Issue (BUG-K02, LOW):** `Ctrl+K` is listed in the visible cheat-sheet but no handler exists in this hook — search wiring lives elsewhere or is missing.

Page-level: `erp-app/src/pages/ai-engine/kobi-ide.tsx:375` and `kimi-terminal.tsx:2046` implement local `Ctrl+S` for editor save.

### 2.4 ONYX_AI / ONYX_PROCUREMENT

No global keyboard shortcut handlers found. `onyx-ai/agents/src/tools/uiGenTool.ts` documents `Ctrl+S` as a generated-UI feature, not a runtime shortcut.

---

## 3. Hebrew / RTL Considerations

- `?` is Shift+/ on US layout; on Hebrew layout (1452-il) Shift+/ produces `?` as well (the `/` key maps to ש but shifted is `?`). `Ctrl+/` is layout-independent — **good choice for help**.
- Letter shortcuts `Ctrl+S`, `Ctrl+K`, `Ctrl+N`: KeyboardEvent.key under Hebrew layout returns the Hebrew letter (ד, ל, מ) NOT `s`/`k`/`n`. **BUG-K03 (MED):** all current implementations use `e.key === 's'` and will silently fail when the user is in Hebrew layout. Fix: use `e.code === 'KeyS'` or check both `e.key.toLowerCase() === 's'` plus the Hebrew equivalent.
- Digit shortcuts (`Ctrl+1..5`) are layout-safe — digits are identical in HE and US layouts.
- ShortcutsModal correctly sets `direction:'rtl'` and uses `flex-direction:row-reverse` for the `+` separators (ShortcutsModal.tsx:74,123).
- Skip-link "דלג לתוכן הראשי" present in payroll (`App.jsx:1297-1304`).

---

## 4. Findings & Bugs

| ID | Severity | Service | Description |
|---|---|---|---|
| BUG-K03 | **MED** | All | Letter shortcuts (`Ctrl+S/K/N`) break on Hebrew keyboard layout — use `e.code` not `e.key`. |
| BUG-K04 | **MED** | techno-kol-ops | No `Ctrl+S` save handler; no help dialog; no `Ctrl+/`. |
| BUG-K05 | MED | payroll | No `Ctrl+K` global search. |
| BUG-K06 | MED | onyx-procurement | No global shortcut layer at all. |
| BUG-K07 | LOW | erp-app | `Ctrl+K` listed in cheat-sheet but not handled in `keyboard-shortcuts.tsx`. |
| BUG-K01 | LOW | erp-app | `Ctrl+S` fires before input-skip guard — verify intended. |
| BUG-K08 | LOW | All | No `?` (single-key) shortcut; only `Ctrl+/`. Industry convention is bare `?` opens help. |
| BUG-K09 | LOW | techno-kol-ops/Sidebar | Tab-order across 9 master 360 pages not validated. |

---

## 5. Recommendations (P1)

1. **Unify** into a shared hook (e.g. `shared/hooks/useGlobalShortcuts`) consumed by all four services.
2. Switch all letter detections to `e.code` (`KeyS`, `KeyK`, `KeyN`) for Hebrew-layout safety.
3. Add `Ctrl+S` save dispatcher to techno-kol-ops (target `[data-save-btn], form button[type=submit]`).
4. Add bare `?` shortcut (skipped inside inputs) to open the help dialog — matches GitHub/Linear convention.
5. Document the standard set in `CLAUDE.md` so 360 pages all conform.

---

## 6. Files of Interest

- `payroll-autonomous/src/App.jsx:1176-1199` (handler), `:1305,1338` (modal+button)
- `payroll-autonomous/src/components/ShortcutsModal.tsx` (canonical RTL help dialog)
- `techno-kol-ops/client/src/components/GlobalSearch.tsx:185-225`
- `techno-kol-ops/client/src/components/TopNavbar.tsx:85,109`
- `erp-app/src/components/keyboard-shortcuts.tsx` (full hook, 162 lines)
- `erp-app/src/pages/ai-engine/kobi-ide.tsx:375` (page-local Ctrl+S)

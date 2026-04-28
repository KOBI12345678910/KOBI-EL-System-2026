# AGENT-244 — Customer360 Page Wiring

**Date:** 2026-04-29
**Scope:** Build concrete Customer360 component per CLAUDE.md spec, wired to real backend.
**Service:** TECHNO_KOL_OPS (3200) consuming pipeline APIs from ONYX_PROCUREMENT (3100).
**Spec source:** `onyx-procurement/src/pipeline/wiring-spec.js` PAGE_CONTRACTS.customer360
**Entity source:** `onyx-procurement/src/pipeline/entity-map.js` ENTITY_MAP.customer

## 1. Spec Compliance

| CLAUDE.md "No Dead Pages" requirement | Section in component |
|---|---|
| Where am I? | Breadcrumb + heading |
| What is this? | Customer summary line (number, tax ID, city) |
| Current status? | `<StatusBadge>` from `c.status` (state-machines.customer) |
| What can I do? | 3 primary + 3 secondary action buttons |
| Next step? | `<NextActionCard>` driven by orchestrator |
| Related records? | quotes, projects, invoices, documents tables |
| Audit log? | last 50 events with time, action, module, user |

PAGE_CONTRACTS.customer360 declares 11 tabs and 5 widgets. This delivery covers the **P0 subset** required: header+status, primary actions, related records, documents, audit log, next recommended action.

## 2. Backend Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/customers/:id/360` | Aggregate payload (customer + relations + audit) |
| GET | `/api/orchestrator/recommend?type=customer&id=:id` | Next recommended action |
| POST | `/api/quotes` | wiring-spec line 227, body `{customerId}` |
| POST | `/api/projects` | wiring-spec line 228 |
| POST | `/api/invoices` | wiring-spec line 229, body `{customerId, direction:'output'}` |
| POST | `/api/support-tickets` | wiring-spec line 230 |

`GET /api/customers/:id` exists in `techno-kol-ops/src/routes/clients.ts` (lines 32-50). Aggregator `:id/360` and `recommend` are added below.

## 3. Component Code

File path: `techno-kol-ops/client/src/pages/360/Customer360.tsx` (replaces existing 208-line baseline).

```tsx
import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api, apiPost } from "../../lib/api-client";

type CustomerCore = {
  id: number; customer_number: string; legal_name: string; display_name: string;
  customer_type?: string|null; tax_id?: string|null; phone?: string|null;
  email?: string|null; city?: string|null; status: string;
  current_balance: number; credit_limit?: number|null; risk_level?: string|null;
  created_at: string; updated_at: string;
};
type Related = { id: number; [k: string]: any };
type AuditRow = { id: number; action_name: string; performed_at: string;
  performed_by_user_name?: string|null; source_module?: string };
type Recommendation = { action_id: string; label: string; reason: string; confidence: number };
type Payload = {
  customer: CustomerCore;
  quotes?: Related[]; projects?: Related[]; invoices?: Related[];
  documents?: Related[]; audit?: AuditRow[];
  open_balance?: number; quotes_count?: number;
  projects_count?: number; documents_count?: number;
};

const fmtILS = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });
const money = (v?: number|null) => fmtILS.format(v ?? 0);
const date  = (v?: string|null) => !v ? "—" : new Date(v).toLocaleDateString("he-IL");
const dt    = (v?: string|null) => !v ? "—" : new Date(v).toLocaleString("he-IL");

const STATUS_CLASS: Record<string, string> = {
  active:   "bg-emerald-100 text-emerald-800 border-emerald-200",
  vip:      "bg-purple-100 text-purple-800 border-purple-200",
  prospect: "bg-amber-100 text-amber-800 border-amber-200",
  inactive: "bg-slate-100 text-slate-800 border-slate-200",
  blocked:  "bg-red-100 text-red-800 border-red-200",
};

type ActionId = "create_quote"|"create_project"|"issue_invoice"|"open_support";
const ACTION_MAP: Record<ActionId, { path: string; target: string; extra?: any }> = {
  create_quote:   { path: "/api/quotes",          target: "quote" },
  create_project: { path: "/api/projects",        target: "project" },
  issue_invoice:  { path: "/api/invoices",        target: "invoice", extra: { direction: "output" } },
  open_support:   { path: "/api/support-tickets", target: "support_ticket" },
};

export default function Customer360() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const customerId = Number(id);

  const [data, setData] = useState<Payload|null>(null);
  const [rec,  setRec]  = useState<Recommendation|null>(null);
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState<string|null>(null);

  const reload = useCallback(async () => {
    if (!customerId) return;
    setBusy(true); setErr(null);
    try {
      const [payload, recommendation] = await Promise.all([
        api<Payload>(`/api/customers/${customerId}/360`),
        api<Recommendation|null>(`/api/orchestrator/recommend?type=customer&id=${customerId}`).catch(() => null),
      ]);
      setData(payload); setRec(recommendation);
    } catch (e: any) {
      setErr(e?.message ?? "טעינה נכשלה");
    } finally { setBusy(false); }
  }, [customerId]);

  useEffect(() => { reload(); }, [reload]);

  const runAction = useCallback(async (actionId: ActionId) => {
    setBusy(true);
    try {
      const cfg = ACTION_MAP[actionId];
      const created = await apiPost<{id:number}>(cfg.path, { customerId, ...(cfg.extra || {}) });
      navigate(`/${cfg.target}/${created.id}`);
    } catch (e: any) {
      setErr(e?.message ?? `${actionId} נכשל`);
    } finally { setBusy(false); }
  }, [customerId, navigate]);

  if (busy && !data) return <Loader label="טוען לקוח..." />;
  if (err)           return <ErrCard msg={err} onRetry={reload} />;
  if (!data)         return <ErrCard msg="לא נמצא לקוח" />;

  const c = data.customer;
  const openBalance = data.open_balance ?? c.current_balance ?? 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-6" dir="rtl">
      {/* Header + Status */}
      <header className="flex items-start justify-between gap-4 pb-4 border-b border-slate-700/50">
        <div>
          <nav className="text-xs text-slate-400 mb-1">
            <Link to="/customers" className="hover:underline">לקוחות</Link>
            {" › "}<span>{c.display_name || c.legal_name}</span>
          </nav>
          <h1 className="text-2xl font-bold">{c.display_name || c.legal_name}</h1>
          <p className="text-sm text-slate-400 mt-1">
            #{c.customer_number}{c.tax_id && <> · ע.מ {c.tax_id}</>}{c.city && <> · {c.city}</>}
          </p>
          <div className="text-xs text-slate-500 mt-1">נוצר {date(c.created_at)} · עדכון {dt(c.updated_at)}</div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={c.status} />
          {c.risk_level && c.risk_level !== "low" && (
            <span className="text-xs px-2 py-1 rounded bg-red-900/20 text-red-300 border border-red-500/40">
              סיכון: {c.risk_level}
            </span>
          )}
        </div>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPI label="הצעות מחיר"  value={data.quotes_count   ?? data.quotes?.length   ?? 0} />
        <KPI label="פרויקטים"   value={data.projects_count ?? data.projects?.length ?? 0} />
        <KPI label="חשבוניות"   value={data.invoices?.length ?? 0} />
        <KPI label="יתרה פתוחה" value={money(openBalance)} tone={openBalance > 0 ? "warn" : "ok"} />
        <KPI label="מסמכים"    value={data.documents_count ?? data.documents?.length ?? 0} />
      </div>

      {/* Next Recommended Action */}
      {rec && <NextActionCard rec={rec} onRun={() => runAction(rec.action_id as ActionId)} busy={busy} />}

      {/* Primary + Secondary Actions */}
      <div className="flex gap-2 flex-wrap">
        <PrimaryBtn label="הצעת מחיר חדשה" icon="📋" onClick={() => runAction("create_quote")} disabled={busy} />
        <PrimaryBtn label="פרויקט חדש"    icon="📁" onClick={() => runAction("create_project")} disabled={busy} />
        <PrimaryBtn label="חשבונית חדשה"  icon="💰" onClick={() => runAction("issue_invoice")} disabled={busy} />
        <SecondaryBtn label="כרטיס תמיכה" icon="🎫" onClick={() => runAction("open_support")} />
        <SecondaryBtn label="פורטל לקוח"  icon="🌐" onClick={() => navigate(`/customers/${customerId}/portal`)} />
        <SecondaryBtn label="הוסף מסמך"   icon="📄" onClick={() => navigate(`/documents/new?parent=customer&id=${customerId}`)} />
      </div>

      {/* Related Records */}
      <RelatedTable title="הצעות מחיר" rows={data.quotes ?? []} cols={[
        { key: "quote_number", label: "מספר" },
        { key: "quote_date", label: "תאריך", render: date },
        { key: "grand_total", label: "סה״כ", render: money },
        { key: "status", label: "סטטוס", render: (v) => <StatusBadge status={v} compact /> },
      ]} onRowClick={(r) => navigate(`/quote/${r.id}`)}
        emptyCta={{ label: "צור הצעה", onClick: () => runAction("create_quote") }} />

      <RelatedTable title="הזמנות ופרויקטים" rows={data.projects ?? []} cols={[
        { key: "project_number", label: "מספר" },
        { key: "project_name", label: "שם" },
        { key: "status", label: "סטטוס", render: (v) => <StatusBadge status={v} compact /> },
        { key: "progress_percent", label: "התקדמות", render: (v) => v != null ? `${v}%` : "—" },
        { key: "budget_total", label: "תקציב", render: money },
      ]} onRowClick={(r) => navigate(`/project/${r.id}`)}
        emptyCta={{ label: "פתח פרויקט", onClick: () => runAction("create_project") }} />

      <RelatedTable title="חשבוניות" rows={data.invoices ?? []} cols={[
        { key: "invoice_number", label: "מספר" },
        { key: "issue_date", label: "הוצאה", render: date },
        { key: "due_date", label: "פירעון", render: date },
        { key: "grand_total", label: "סה״כ", render: money },
        { key: "balance_due", label: "יתרה", render: money },
        { key: "status", label: "סטטוס", render: (v) => <StatusBadge status={v} compact /> },
      ]} onRowClick={(r) => navigate(`/invoice/${r.id}`)}
        emptyCta={{ label: "הנפק חשבונית", onClick: () => runAction("issue_invoice") }} />

      <RelatedTable title="מסמכים" rows={data.documents ?? []} cols={[
        { key: "document_number", label: "מספר" },
        { key: "filename", label: "קובץ" },
        { key: "document_type", label: "סוג" },
        { key: "uploaded_at", label: "הועלה", render: date },
      ]} onRowClick={(r) => navigate(`/documents/${r.id}`)} />

      {/* Audit Log */}
      <Section title={`יומן פעילות (${data.audit?.length ?? 0})`}>
        {(data.audit?.length ?? 0) === 0 ? (
          <p className="text-slate-500 text-sm">אין רשומות</p>
        ) : (
          <ol className="space-y-1 max-h-64 overflow-auto pr-1">
            {data.audit!.map((a) => (
              <li key={a.id} className="flex gap-3 text-xs py-1 border-b border-slate-800/40">
                <time className="text-slate-500 w-36 shrink-0 tabular-nums">{dt(a.performed_at)}</time>
                <span className="font-medium text-slate-200">{a.action_name}</span>
                {a.source_module && <span className="text-slate-500">{a.source_module}</span>}
                <span className="mr-auto text-slate-400">{a.performed_by_user_name ?? "מערכת"}</span>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  );
}

// ── Sub-components (compact) ──────────────────────────────
const Loader = ({ label }: { label: string }) =>
  <div className="flex items-center justify-center h-64 text-slate-400 animate-pulse text-sm">{label}</div>;
const ErrCard = ({ msg, onRetry }: { msg: string; onRetry?: () => void }) =>
  <div className="p-4 bg-red-900/20 border border-red-500/40 rounded text-red-300 text-sm flex justify-between items-center">
    <span>שגיאה: {msg}</span>
    {onRetry && <button onClick={onRetry} className="px-3 py-1 bg-red-600 rounded text-white">נסה שוב</button>}
  </div>;
const StatusBadge = ({ status, compact }: { status?: string; compact?: boolean }) => (
  <span className={`${compact ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-xs"} rounded border font-medium ${STATUS_CLASS[(status ?? "").toLowerCase()] ?? STATUS_CLASS.inactive}`}>{status ?? "—"}</span>
);
const KPI = ({ label, value, tone }: { label: string; value: number|string; tone?: "ok"|"warn"|"bad" }) => (
  <div className={`bg-slate-800/50 rounded-lg p-4 border ${tone === "warn" ? "border-amber-500/40" : tone === "bad" ? "border-red-500/40" : "border-slate-700/50"}`}>
    <div className="text-xs text-slate-400 mb-1">{label}</div>
    <div className="text-xl font-bold tabular-nums">{value}</div>
  </div>
);
const PrimaryBtn = ({ label, icon, onClick, disabled }: any) => (
  <button onClick={onClick} disabled={disabled} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-sm font-medium"><span className="ml-2">{icon}</span>{label}</button>
);
const SecondaryBtn = ({ label, icon, onClick }: any) => (
  <button onClick={onClick} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm"><span className="ml-2">{icon}</span>{label}</button>
);
const Section = ({ title, children }: any) => (
  <section><h2 className="text-sm font-semibold text-slate-300 mb-3 border-b border-slate-700/50 pb-2">{title}</h2>{children}</section>
);
const NextActionCard = ({ rec, onRun, busy }: { rec: Recommendation; onRun: () => void; busy: boolean }) => (
  <div className="p-4 rounded-lg bg-blue-900/15 border border-blue-500/40 flex items-start gap-4">
    <div className="text-2xl">💡</div>
    <div className="flex-1">
      <div className="text-xs text-blue-300 mb-1">צעד מומלץ הבא</div>
      <div className="font-semibold mb-1">{rec.label}</div>
      <div className="text-sm text-slate-300">{rec.reason}</div>
      <div className="text-xs text-slate-400 mt-1">ביטחון: {Math.round(rec.confidence * 100)}%</div>
    </div>
    <button onClick={onRun} disabled={busy} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-sm font-medium">בצע</button>
  </div>
);
type Col = { key: string; label: string; render?: (v: any) => React.ReactNode };
const RelatedTable = ({ title, rows, cols, onRowClick, emptyCta }: {
  title: string; rows: Related[]; cols: Col[];
  onRowClick?: (r: Related) => void; emptyCta?: { label: string; onClick: () => void };
}) => (
  <Section title={`${title} (${rows.length})`}>
    {rows.length === 0 ? (
      <div className="flex items-center gap-3 text-slate-500 text-sm py-2">
        <span>אין רשומות</span>
        {emptyCta && <button onClick={emptyCta.onClick} className="px-3 py-1 bg-blue-600 rounded text-white text-xs hover:bg-blue-500">+ {emptyCta.label}</button>}
      </div>
    ) : (
      <div className="overflow-auto rounded border border-slate-700/50">
        <table className="w-full text-sm">
          <thead><tr className="bg-slate-800/50">
            {cols.map((col) => <th key={col.key} className="text-right px-3 py-2 text-xs text-slate-400 font-medium">{col.label}</th>)}
          </tr></thead>
          <tbody>
            {rows.slice(0, 25).map((r, i) => (
              <tr key={r.id ?? i} onClick={() => onRowClick?.(r)}
                  className={`border-t border-slate-700/30 ${onRowClick ? "cursor-pointer hover:bg-slate-700/30" : ""}`}>
                {cols.map((col) => <td key={col.key} className="px-3 py-2 text-slate-200">
                  {col.render ? col.render(r[col.key]) : (r[col.key] ?? "—")}
                </td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 25 && <div className="px-3 py-2 text-xs text-slate-500 bg-slate-800/30">מציג 25 מתוך {rows.length}</div>}
      </div>
    )}
  </Section>
);
```

## 4. Backend Wiring

Append the aggregator to `techno-kol-ops/src/routes/clients.ts`:

```ts
router.get('/:id/360', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const [customer, quotes, projects, invoices, documents, audit, balance] = await Promise.all([
      query(`SELECT * FROM clients WHERE id = $1`, [id]),
      query(`SELECT id, quote_number, quote_date, grand_total, status FROM quotes
             WHERE customer_id = $1 ORDER BY quote_date DESC LIMIT 50`, [id]),
      query(`SELECT id, project_number, project_name, status, progress_percent, budget_total
             FROM projects WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 50`, [id]),
      query(`SELECT id, invoice_number, issue_date, due_date, grand_total, balance_due, status
             FROM invoices WHERE customer_id = $1 ORDER BY issue_date DESC LIMIT 50`, [id]),
      query(`SELECT id, document_number, filename, document_type, uploaded_at FROM documents
             WHERE parent_type = 'customer' AND parent_id = $1 ORDER BY uploaded_at DESC LIMIT 50`, [id]),
      query(`SELECT id, action_name, performed_at, performed_by_user_name, source_module
             FROM audit_log WHERE entity_type = 'customer' AND entity_id = $1
             ORDER BY performed_at DESC LIMIT 50`, [id]),
      query(`SELECT COALESCE(SUM(balance_due),0) AS open_balance FROM invoices
             WHERE customer_id = $1 AND status IN ('open','overdue','partially_paid')`, [id]),
    ]);
    if (!customer.rows[0]) return res.status(404).json({ error: 'Customer not found' });
    res.json({
      customer: customer.rows[0],
      quotes: quotes.rows, projects: projects.rows, invoices: invoices.rows,
      documents: documents.rows, audit: audit.rows,
      open_balance:    Number(balance.rows[0]?.open_balance ?? 0),
      quotes_count:    quotes.rows.length,
      projects_count:  projects.rows.length,
      documents_count: documents.rows.length,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch customer 360' });
  }
});
```

Add `/api/orchestrator/recommend` (new file `techno-kol-ops/src/routes/orchestrator.ts`, mount in `index.ts`):

```ts
import { Router, Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { query } from '../db/connection';
const router = Router(); router.use(authenticate);

router.get('/recommend', async (req: AuthRequest, res: Response) => {
  const { type, id } = req.query as { type: string; id: string };
  if (type !== 'customer') return res.json(null);
  const r = (await query(
    `SELECT c.*,
       COALESCE((SELECT SUM(balance_due) FROM invoices
                 WHERE customer_id=c.id AND status IN ('open','overdue')),0) AS open_balance,
       EXISTS(SELECT 1 FROM projects WHERE customer_id=c.id AND status='active') AS has_active_project
     FROM clients c WHERE c.id=$1`, [id])).rows[0];
  if (!r) return res.status(404).json({ error: 'Not found' });
  if (Number(r.open_balance) > 0) return res.json({
    action_id: 'issue_invoice', label: 'הנפק חשבונית גבייה',
    reason: `יתרה פתוחה ${r.open_balance} ש״ח`, confidence: 0.78,
  });
  if (!r.has_active_project) return res.json({
    action_id: 'create_quote', label: 'פתח הצעת מחיר',
    reason: 'אין פרויקט פעיל', confidence: 0.62,
  });
  res.json(null);
});
export default router;
```

## 5. Routing & Test Plan

Register in `techno-kol-ops/client/src/router/`: `{ path: "/customers/:id", element: <Customer360 /> }`.

- **Unit:** `runAction('create_quote')` POSTs `{customerId}` to `/api/quotes`, navigates to `/quote/<n>`. `StatusBadge` covers all 5 customer statuses. Empty related tables show CTA buttons.
- **Integration:** `GET /api/customers/123/360` returns customer + 5 related arrays + audit + open_balance. `GET /api/orchestrator/recommend?type=customer&id=123` returns recommendation or null.
- **E2E:** Visit `/customers/1` → header, 5 KPIs, action row, 4 related tables, audit log visible. Click "הצעת מחיר חדשה" → navigates to `/quote/<n>`; on reload, new quote row appears.

## 7. Files Touched

| File | Status |
|---|---|
| `techno-kol-ops/client/src/pages/360/Customer360.tsx` | REPLACE (208 → ~290 lines) |
| `techno-kol-ops/src/routes/clients.ts` | APPEND `/:id/360` handler |
| `techno-kol-ops/src/routes/orchestrator.ts` | NEW |
| `techno-kol-ops/src/index.ts` | ADD `app.use('/api/orchestrator', orchestratorRouter)` |

## 8. Out of Scope (Follow-up)

Tabs for `leads`, `payments`, `collections`, `communications`, `support` (PAGE_CONTRACTS lists 11 tabs total); real-time refresh via `tk:realtime`; inline edit; AI insights panel and contacts list (already rendered in the heavier `onyx-procurement/src/features/customers/Customer360.tsx`, 853 lines).

End of report.

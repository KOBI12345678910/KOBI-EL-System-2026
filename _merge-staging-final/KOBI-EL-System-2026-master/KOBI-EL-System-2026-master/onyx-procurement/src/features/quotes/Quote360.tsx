// ============================================================
// FILE: src/features/quotes/Quote360.tsx
// ============================================================

import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ============================================================
// TYPES
// ============================================================

type QuoteCore = {
  id: number;
  public_id: string;
  quote_number: string;
  customer_id: number;
  customer_name?: string;
  quote_date: string;
  valid_until?: string | null;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  grand_total: number;
  approval_status: string;
  state: string;
  converted_project_id?: number | null;
  internal_notes?: string | null;
  customer_notes?: string | null;
  created_at: string;
  updated_at: string;
};

type QuoteLineItem = {
  id: number;
  line_number: number;
  description: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  line_total: number;
};

type QuoteRevision = {
  id: number;
  revision_number: number;
  revision_reason?: string | null;
  created_at: string;
};

type QuoteAudit = {
  id: number;
  action_name: string;
  performed_at: string;
  source_module: string;
  performed_by_user_name?: string | null;
};

type Quote360Payload = {
  quote: QuoteCore;
  line_items?: QuoteLineItem[];
  revisions?: QuoteRevision[];
  audit?: QuoteAudit[];
};

// ============================================================
// HELPERS
// ============================================================

const quoteMoney = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

function fmtMoney(v?: number | null) { return quoteMoney.format(v ?? 0); }
function fmtDate(v?: string | null) {
  if (!v) return "—";
  try { return new Date(v).toLocaleDateString("he-IL"); } catch { return v; }
}
function fmtDateTime(v?: string | null) {
  if (!v) return "—";
  try { return new Date(v).toLocaleString("he-IL"); } catch { return v; }
}

function badgeClass(s?: string | null) {
  const v = (s || "").toLowerCase();
  if (["approved", "convertedtoproject", "paid"].includes(v))
    return "bg-emerald-100 text-emerald-800 border border-emerald-200";
  if (["rejected", "cancelled", "expired"].includes(v))
    return "bg-red-100 text-red-800 border border-red-200";
  return "bg-amber-100 text-amber-800 border border-amber-200";
}

// ============================================================
// API
// ============================================================

async function fetchQuote360(id: number): Promise<Quote360Payload> {
  const res = await fetch(`/api/quotes/${id}/360`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Quote 360 fetch failed: ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

async function approveQuote(id: number) {
  const res = await fetch(`/api/quotes/approve?quote_id=${id}`, { method: "POST", credentials: "include" });
  if (!res.ok) throw new Error("Approve failed");
  return res.json();
}

async function rejectQuote(id: number) {
  const res = await fetch(`/api/quotes/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ quote_id: id }),
  });
  if (!res.ok) throw new Error("Reject failed");
  return res.json();
}

async function convertQuoteToProject(id: number) {
  const res = await fetch(`/api/quotes/convert-to-project`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ quote_id: id }),
  });
  if (!res.ok) throw new Error("Convert failed");
  return res.json();
}

export const quote360QueryKey = (id: number) => ["quote360", id] as const;

// ============================================================
// UI
// ============================================================

function Badge({ value }: { value?: string | null }) {
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${badgeClass(value)}`}>{value || "—"}</span>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4"><div className="text-lg font-bold text-slate-900">{title}</div></div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Btn({ label, onClick, disabled, variant = "dark" }: { label: string; onClick?: () => void; disabled?: boolean; variant?: "dark" | "light" | "danger" }) {
  const cls = variant === "dark"
    ? "bg-slate-900 text-white hover:bg-slate-700"
    : variant === "danger"
    ? "bg-red-600 text-white hover:bg-red-500"
    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
  return <button type="button" onClick={onClick} disabled={disabled} className={`rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-50 ${cls}`}>{label}</button>;
}

// ============================================================
// TABS
// ============================================================

type QuoteTab = "overview" | "lines" | "revisions" | "audit";

// ============================================================
// MAIN
// ============================================================

export function Quote360({ quoteId }: { quoteId: number }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<QuoteTab>("overview");

  const query = useQuery({
    queryKey: quote360QueryKey(quoteId),
    queryFn: () => fetchQuote360(quoteId),
  });

  const approveMut = useMutation({ mutationFn: () => approveQuote(quoteId), onSuccess: () => qc.invalidateQueries({ queryKey: quote360QueryKey(quoteId) }) });
  const rejectMut = useMutation({ mutationFn: () => rejectQuote(quoteId), onSuccess: () => qc.invalidateQueries({ queryKey: quote360QueryKey(quoteId) }) });
  const convertMut = useMutation({ mutationFn: () => convertQuoteToProject(quoteId), onSuccess: () => qc.invalidateQueries({ queryKey: quote360QueryKey(quoteId) }) });

  if (query.isLoading) return <div className="p-6"><div className="h-10 w-72 rounded-xl bg-slate-200 animate-pulse" /></div>;
  if (query.isError || !query.data?.quote) {
    return <div className="p-6"><div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">שגיאה בטעינת Quote 360</div></div>;
  }

  const data = query.data;
  const quote = data.quote;
  const lines = data.line_items ?? [];
  const revisions = data.revisions ?? [];
  const audit = data.audit ?? [];

  const nextAction = useMemo(() => {
    if (quote.state === "Draft") return "שלח את ההצעה ללקוח";
    if (["Sent", "UnderReview"].includes(quote.state)) return "ממתין לאישור / דחייה";
    if (quote.state === "Approved" && !quote.converted_project_id) return "המר לפרויקט";
    if (quote.state === "ConvertedToProject") return "הצעה הומרה — עבור לפרויקט";
    return "—";
  }, [quote]);

  const canApprove = ["Sent", "UnderReview"].includes(quote.state);
  const canReject = ["Sent", "UnderReview"].includes(quote.state);
  const canConvert = quote.state === "Approved" && !quote.converted_project_id;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl p-6">
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6">
          <div className="space-y-6">
            {/* Header */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-3xl font-black text-slate-900">{quote.quote_number}</h1>
                    <Badge value={quote.state} />
                    <Badge value={quote.approval_status} />
                  </div>
                  <div className="text-sm text-slate-600">
                    לקוח: {quote.customer_name || `#${quote.customer_id}`} • תאריך: {fmtDate(quote.quote_date)} • תוקף: {fmtDate(quote.valid_until)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canApprove && <Btn label={approveMut.isPending ? "מאשר..." : "אשר"} onClick={() => approveMut.mutate()} disabled={approveMut.isPending} />}
                  {canReject && <Btn label={rejectMut.isPending ? "דוחה..." : "דחה"} onClick={() => rejectMut.mutate()} disabled={rejectMut.isPending} variant="danger" />}
                  {canConvert && <Btn label={convertMut.isPending ? "ממיר..." : "המר לפרויקט"} onClick={() => convertMut.mutate()} disabled={convertMut.isPending} variant="light" />}
                </div>
              </div>
            </div>

            {/* Totals */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-slate-500">סכום ביניים</div>
                <div className="mt-3 text-2xl font-bold">{fmtMoney(quote.subtotal)}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-slate-500">הנחות</div>
                <div className="mt-3 text-2xl font-bold text-red-600">-{fmtMoney(quote.discount_total)}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-slate-500">מע״מ</div>
                <div className="mt-3 text-2xl font-bold">{fmtMoney(quote.tax_total)}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-slate-500">סה״כ</div>
                <div className="mt-3 text-3xl font-black">{fmtMoney(quote.grand_total)}</div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setTab("overview")} className={`rounded-xl px-4 py-2 text-sm font-bold transition ${tab === "overview" ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-200"}`}>סקירה</button>
              <button type="button" onClick={() => setTab("lines")} className={`rounded-xl px-4 py-2 text-sm font-bold transition ${tab === "lines" ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-200"}`}>שורות ({lines.length})</button>
              <button type="button" onClick={() => setTab("revisions")} className={`rounded-xl px-4 py-2 text-sm font-bold transition ${tab === "revisions" ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-200"}`}>גרסאות ({revisions.length})</button>
              <button type="button" onClick={() => setTab("audit")} className={`rounded-xl px-4 py-2 text-sm font-bold transition ${tab === "audit" ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-200"}`}>Audit ({audit.length})</button>
            </div>

            {/* Content */}
            {tab === "overview" && (
              <Card title="פרטי הצעה">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-700">
                  <div><span className="text-slate-500">הערות פנימיות:</span> {quote.internal_notes || "—"}</div>
                  <div><span className="text-slate-500">הערות לקוח:</span> {quote.customer_notes || "—"}</div>
                  <div><span className="text-slate-500">פרויקט משויך:</span> {quote.converted_project_id ? `#${quote.converted_project_id}` : "לא הומר"}</div>
                  <div><span className="text-slate-500">עודכן:</span> {fmtDateTime(quote.updated_at)}</div>
                </div>
              </Card>
            )}

            {tab === "lines" && (
              <Card title="שורות הצעת מחיר">
                {lines.length === 0 ? (
                  <div className="text-sm text-slate-600">אין שורות.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <div className="min-w-[700px]">
                      <div className="grid grid-cols-6 gap-3 border-b border-slate-200 pb-3 text-xs font-bold uppercase text-slate-500">
                        <div>#</div><div className="col-span-2">תיאור</div><div>כמות</div><div>מחיר</div><div>סה״כ</div>
                      </div>
                      {lines.map((l) => (
                        <div key={l.id} className="grid grid-cols-6 gap-3 py-3 text-sm border-b border-slate-50">
                          <div>{l.line_number}</div>
                          <div className="col-span-2 font-bold text-slate-900">{l.description}</div>
                          <div>{l.quantity}</div>
                          <div>{fmtMoney(l.unit_price)}</div>
                          <div className="font-bold">{fmtMoney(l.line_total)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            )}

            {tab === "revisions" && (
              <Card title="גרסאות">
                {revisions.length === 0 ? (
                  <div className="text-sm text-slate-600">אין גרסאות.</div>
                ) : (
                  <div className="space-y-3">
                    {revisions.map((r) => (
                      <div key={r.id} className="rounded-2xl border border-slate-200 p-4 flex items-center justify-between">
                        <div>
                          <div className="font-bold text-slate-900">גרסה {r.revision_number}</div>
                          <div className="text-sm text-slate-600">{r.revision_reason || "—"}</div>
                        </div>
                        <div className="text-sm text-slate-500">{fmtDateTime(r.created_at)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {tab === "audit" && (
              <Card title="Audit Trail">
                {audit.length === 0 ? (
                  <div className="text-sm text-slate-600">אין Audit.</div>
                ) : (
                  <div className="space-y-3">
                    {audit.map((a) => (
                      <div key={a.id} className="rounded-2xl border border-slate-200 p-4 flex items-center justify-between">
                        <div>
                          <div className="font-bold text-slate-900">{a.action_name}</div>
                          <div className="text-sm text-slate-600">{a.source_module} • {a.performed_by_user_name || "—"}</div>
                        </div>
                        <div className="text-sm text-slate-500">{fmtDateTime(a.performed_at)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}
          </div>

          {/* Side */}
          <div className="space-y-6">
            <Card title="Next Best Action">
              <div className="text-sm text-slate-700">{nextAction}</div>
            </Card>
            <Card title="סיכום הצעה">
              <div className="space-y-3 text-sm text-slate-700">
                <div className="flex justify-between"><span>סטטוס</span><Badge value={quote.state} /></div>
                <div className="flex justify-between"><span>אישור</span><Badge value={quote.approval_status} /></div>
                <div className="flex justify-between"><span>סה״כ</span><span className="font-bold">{fmtMoney(quote.grand_total)}</span></div>
                <div className="flex justify-between"><span>שורות</span><span className="font-bold">{lines.length}</span></div>
                <div className="flex justify-between"><span>גרסאות</span><span className="font-bold">{revisions.length}</span></div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

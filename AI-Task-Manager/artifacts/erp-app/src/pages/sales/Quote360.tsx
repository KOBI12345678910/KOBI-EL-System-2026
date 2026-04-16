// ============================================================
// FILE: src/features/quotes/Quote360.tsx
// ============================================================

import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// ============================================================
// TYPES
// ============================================================

type QuoteCore = {
  id: number;
  public_id: string;
  quote_number: string;
  customer_id: number;
  lead_id?: number | null;
  quote_date: string;
  valid_until?: string | null;
  currency?: string | null;
  subtotal: number;
  discount_total: number;
  vat_total: number;
  grand_total: number;
  approval_status: string;
  state: string;
  converted_project_id?: number | null;
  internal_notes?: string | null;
  customer_notes?: string | null;
  created_at: string;
  updated_at: string;
};

type QuoteLine = {
  id: number;
  line_number: number;
  item_code?: string | null;
  description: string;
  quantity: number;
  unit_of_measure?: string | null;
  unit_price: number;
  discount_percent: number;
  line_subtotal: number;
  vat_percent: number;
  vat_amount: number;
  line_total: number;
};

type QuoteRevision = {
  id: number;
  revision_number: number;
  revision_reason?: string | null;
  created_at: string;
};

type QuoteApprovalRule = {
  id: number;
  rule_code: string;
  rule_name: string;
  min_total_amount?: number | null;
  max_total_amount?: number | null;
  required_role_code?: string | null;
  required_approval_count: number;
};

type QuoteDocument = {
  id: number;
  document_number: string;
  filename: string;
  document_type?: string | null;
};

type QuoteInsight = {
  id: number;
  insight_number: string;
  category?: string | null;
  confidence_score?: number | null;
  recommendation_text?: string | null;
  state: string;
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
  lines?: QuoteLine[];
  revisions?: QuoteRevision[];
  approval_rules?: QuoteApprovalRule[];
  documents?: QuoteDocument[];
  insights?: QuoteInsight[];
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

function qm(v?: number | null) { return quoteMoney.format(v ?? 0); }

function qd(v?: string | null) {
  if (!v) return "—";
  try { return new Date(v).toLocaleDateString("he-IL"); } catch { return v; }
}

function qdt(v?: string | null) {
  if (!v) return "—";
  try { return new Date(v).toLocaleString("he-IL"); } catch { return v; }
}

function quoteBadgeClass(value?: string | null): string {
  const s = (value || "").toLowerCase();
  if (["approved", "convertedtoproject"].includes(s)) return "bg-emerald-100 text-emerald-800 border border-emerald-200";
  if (["rejected", "cancelled"].includes(s)) return "bg-red-100 text-red-800 border border-red-200";
  if (["draft", "sent", "underreview", "pending"].includes(s)) return "bg-amber-100 text-amber-800 border border-amber-200";
  return "bg-slate-100 text-slate-800 border border-slate-200";
}

// ============================================================
// API
// ============================================================

async function fetchQuote360(quoteId: number): Promise<Quote360Payload> {
  const res = await fetch(`/api/quotes/${quoteId}/360`, { method: "GET", headers: { "Content-Type": "application/json" }, credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch quote 360: ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

async function sendQuote(quoteId: number) {
  const res = await fetch(`/api/quotes/${quoteId}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ quote_id: quoteId }) });
  if (!res.ok) throw new Error("Failed to send quote");
  return res.json();
}

async function rejectQuote(quoteId: number) {
  const res = await fetch(`/api/quotes/${quoteId}/reject`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ quote_id: quoteId }) });
  if (!res.ok) throw new Error("Failed to reject quote");
  return res.json();
}

async function convertQuoteToProject(quoteId: number) {
  const res = await fetch(`/api/quotes/${quoteId}/convert-to-project`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ quote_id: quoteId }) });
  if (!res.ok) throw new Error("Failed to convert quote");
  return res.json();
}

// ============================================================
// QUERY KEY
// ============================================================

export const quote360QueryKey = (quoteId: number) => ["quote360", quoteId] as const;

// ============================================================
// UI PARTS
// ============================================================

function SectionCard({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div className="text-lg font-black text-slate-900">{title}</div>
        <div>{right}</div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function SummaryCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-3 text-2xl font-black text-slate-900">{value}</div>
    </div>
  );
}

function Badge({ value }: { value?: string | null }) {
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${quoteBadgeClass(value)}`}>{value || "—"}</span>;
}

function ActionButton({ label, onClick, disabled, variant = "dark" }: { label: string; onClick?: () => void; disabled?: boolean; variant?: "dark" | "light" }) {
  const cls = variant === "dark"
    ? "rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50"
    : "rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50";
  return <button type="button" onClick={onClick} disabled={disabled} className={cls}>{label}</button>;
}

type QuoteTab = "overview" | "lines" | "revisions" | "approval" | "documents" | "ai" | "audit";

function TabButton({ active, label, onClick, count }: { active: boolean; label: string; onClick: () => void; count?: number }) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded-xl px-4 py-2 text-sm font-bold transition ${active ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"}`}>
      {label}{typeof count === "number" ? ` (${count})` : ""}
    </button>
  );
}

// ============================================================
// MAIN
// ============================================================

export function Quote360({ quoteId }: { quoteId: number }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<QuoteTab>("overview");

  const query = useQuery({ queryKey: quote360QueryKey(quoteId), queryFn: () => fetchQuote360(quoteId) });

  const sendMutation = useMutation({ mutationFn: () => sendQuote(quoteId), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: quote360QueryKey(quoteId) }); } });
  const rejectMutation = useMutation({ mutationFn: () => rejectQuote(quoteId), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: quote360QueryKey(quoteId) }); } });
  const convertMutation = useMutation({ mutationFn: () => convertQuoteToProject(quoteId), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: quote360QueryKey(quoteId) }); } });

  // FIX: useMemo MUST be called before any early returns (Rules of Hooks)
  const nextBestAction = useMemo(() => {
    if (!query.data) return "";
    const q = query.data.quote;
    if (q.state === "Draft") return "שלח את ההצעה ללקוח";
    if (q.state === "Sent") return "עקוב אחרי הלקוח או אשר / דחה";
    if (q.state === "Approved" && !q.converted_project_id) return "המר את ההצעה לפרויקט";
    if (q.state === "Rejected") return "צור revision חדש או כפול הצעה";
    return "המשך ניהול תהליך הצעת המחיר";
  }, [query.data]);

  if (query.isLoading) {
    return <div className="p-6"><div className="h-10 w-72 rounded-xl bg-slate-200 animate-pulse" /></div>;
  }

  if (query.isError || !query.data?.quote) {
    return <div className="p-6"><div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">שגיאה בטעינת Quote360</div></div>;
  }

  const data = query.data;
  const quote = data.quote;
  const lines = data.lines ?? [];
  const revisions = data.revisions ?? [];
  const approvalRules = data.approval_rules ?? [];
  const documents = data.documents ?? [];
  const insights = data.insights ?? [];
  const audit = data.audit ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl p-6">
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6">
          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-3xl font-black text-slate-900">{quote.quote_number}</h1>
                    <Badge value={quote.state} />
                  </div>
                  <div className="text-sm text-slate-600">Customer #{quote.customer_id} • Lead #{quote.lead_id || "—"} • Currency: {quote.currency || "ILS"}</div>
                  <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                    <span>Quote Date: {qd(quote.quote_date)}</span>
                    <span>Valid Until: {qd(quote.valid_until)}</span>
                    <span>Approval: {quote.approval_status}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ActionButton label={sendMutation.isPending ? "שולח..." : "Send Quote"} onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending} />
                  <ActionButton label={rejectMutation.isPending ? "דוחה..." : "Reject Quote"} variant="light" onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending} />
                  <ActionButton label={convertMutation.isPending ? "ממיר..." : "Convert To Project"} variant="light" onClick={() => convertMutation.mutate()} disabled={convertMutation.isPending} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <SummaryCard title="Subtotal" value={qm(quote.subtotal)} />
              <SummaryCard title="VAT" value={qm(quote.vat_total)} />
              <SummaryCard title="Grand Total" value={qm(quote.grand_total)} />
              <SummaryCard title="Lines" value={String(lines.length)} />
            </div>

            <div className="flex flex-wrap gap-2">
              <TabButton active={activeTab === "overview"} label="סקירה" onClick={() => setActiveTab("overview")} />
              <TabButton active={activeTab === "lines"} label="שורות" onClick={() => setActiveTab("lines")} count={lines.length} />
              <TabButton active={activeTab === "revisions"} label="Revisions" onClick={() => setActiveTab("revisions")} count={revisions.length} />
              <TabButton active={activeTab === "approval"} label="Approval" onClick={() => setActiveTab("approval")} count={approvalRules.length} />
              <TabButton active={activeTab === "documents"} label="מסמכים" onClick={() => setActiveTab("documents")} count={documents.length} />
              <TabButton active={activeTab === "ai"} label="AI" onClick={() => setActiveTab("ai")} count={insights.length} />
              <TabButton active={activeTab === "audit"} label="Audit" onClick={() => setActiveTab("audit")} count={audit.length} />
            </div>

            {activeTab === "overview" && (
              <div className="grid grid-cols-1 gap-6">
                <SectionCard title="תמונת הצעה">
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    <div className="rounded-2xl bg-slate-50 p-4"><div className="text-sm text-slate-500">Discount</div><div className="mt-2 text-xl font-bold text-slate-900">{qm(quote.discount_total)}</div></div>
                    <div className="rounded-2xl bg-slate-50 p-4"><div className="text-sm text-slate-500">Approval Status</div><div className="mt-2 text-xl font-bold text-slate-900">{quote.approval_status}</div></div>
                    <div className="rounded-2xl bg-slate-50 p-4"><div className="text-sm text-slate-500">Converted Project</div><div className="mt-2 text-xl font-bold text-slate-900">{quote.converted_project_id || "—"}</div></div>
                    <div className="rounded-2xl bg-slate-50 p-4"><div className="text-sm text-slate-500">Currency</div><div className="mt-2 text-xl font-bold text-slate-900">{quote.currency || "ILS"}</div></div>
                  </div>
                </SectionCard>
                <SectionCard title="3 שורות ראשונות">
                  {lines.length === 0 ? <div className="text-sm text-slate-600">אין שורות להצעה.</div> : (
                    <div className="space-y-3">
                      {lines.slice(0, 3).map((line) => (
                        <div key={line.id} className="rounded-2xl border border-slate-200 p-4">
                          <div className="font-bold text-slate-900">#{line.line_number} • {line.description}</div>
                          <div className="mt-2 text-sm text-slate-600">Qty: {line.quantity} {line.unit_of_measure || ""} • Unit Price: {qm(line.unit_price)} • Total: {qm(line.line_total)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>
              </div>
            )}

            {activeTab === "lines" && (
              <SectionCard title="שורות הצעה">
                {lines.length === 0 ? <div className="text-sm text-slate-600">אין שורות.</div> : (
                  <div className="space-y-3">
                    {lines.map((line) => (
                      <div key={line.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="font-bold text-slate-900">#{line.line_number} • {line.description}</div>
                        <div className="mt-2 text-sm text-slate-600">Item Code: {line.item_code || "—"} • Qty: {line.quantity} {line.unit_of_measure || ""} • Unit Price: {qm(line.unit_price)}</div>
                        <div className="mt-1 text-sm text-slate-600">Discount: {line.discount_percent}% • VAT: {line.vat_percent}% • Line Total: {qm(line.line_total)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}

            {activeTab === "revisions" && (
              <SectionCard title="Revisions">
                {revisions.length === 0 ? <div className="text-sm text-slate-600">אין revisions.</div> : (
                  <div className="space-y-3">
                    {revisions.map((rev) => (
                      <div key={rev.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="font-bold text-slate-900">Revision #{rev.revision_number}</div>
                        <div className="mt-2 text-sm text-slate-600">Created: {qdt(rev.created_at)}</div>
                        {rev.revision_reason ? <div className="mt-2 text-sm text-slate-700">{rev.revision_reason}</div> : null}
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}

            {activeTab === "approval" && (
              <SectionCard title="Approval Rules">
                {approvalRules.length === 0 ? <div className="text-sm text-slate-600">אין approval rules.</div> : (
                  <div className="space-y-3">
                    {approvalRules.map((rule) => (
                      <div key={rule.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="font-bold text-slate-900">{rule.rule_name}</div>
                        <div className="mt-2 text-sm text-slate-600">Code: {rule.rule_code} • Amount Range: {qm(rule.min_total_amount)} - {qm(rule.max_total_amount)}</div>
                        <div className="mt-1 text-sm text-slate-600">Role: {rule.required_role_code || "—"} • Approvals: {rule.required_approval_count}</div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}

            {activeTab === "documents" && (
              <SectionCard title="מסמכים">
                {documents.length === 0 ? <div className="text-sm text-slate-600">אין מסמכים.</div> : (
                  <div className="space-y-3">
                    {documents.map((doc) => (
                      <div key={doc.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="font-bold text-slate-900">{doc.filename}</div>
                        <div className="text-sm text-slate-600">{doc.document_number} • {doc.document_type || "ללא סוג"}</div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}

            {activeTab === "ai" && (
              <SectionCard title="AI Insights">
                {insights.length === 0 ? <div className="text-sm text-slate-600">אין תובנות AI.</div> : (
                  <div className="space-y-3">
                    {insights.map((insight) => (
                      <div key={insight.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:justify-between">
                          <div><div className="font-bold text-slate-900">{insight.insight_number} • {insight.category || "Insight"}</div><div className="mt-2 text-sm text-slate-700">{insight.recommendation_text || "—"}</div><div className="mt-2 text-xs text-slate-500">Confidence: {insight.confidence_score ?? "—"}</div></div>
                          <Badge value={insight.state} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}

            {activeTab === "audit" && (
              <SectionCard title="Audit">
                {audit.length === 0 ? <div className="text-sm text-slate-600">אין Audit.</div> : (
                  <div className="space-y-3">
                    {audit.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex flex-col gap-2 md:flex-row md:justify-between">
                          <div><div className="font-bold text-slate-900">{item.action_name}</div><div className="text-sm text-slate-600">מודול: {item.source_module} • משתמש: {item.performed_by_user_name || "—"}</div></div>
                          <div className="text-sm text-slate-500">{qdt(item.performed_at)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}
          </div>

          <div className="space-y-6">
            <SectionCard title="Next Best Action">
              <div className="text-sm text-slate-700">{nextBestAction}</div>
            </SectionCard>
            <SectionCard title="מצב הצעה">
              <div className="space-y-3 text-sm text-slate-700">
                <div className="flex items-center justify-between"><span>סטטוס</span><Badge value={quote.state} /></div>
                <div className="flex items-center justify-between"><span>Approval</span><span className="font-bold">{quote.approval_status}</span></div>
                <div className="flex items-center justify-between"><span>Total</span><span className="font-bold">{qm(quote.grand_total)}</span></div>
                <div className="flex items-center justify-between"><span>Converted Project</span><span className="font-bold">{quote.converted_project_id || "—"}</span></div>
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
    </div>
  );
}

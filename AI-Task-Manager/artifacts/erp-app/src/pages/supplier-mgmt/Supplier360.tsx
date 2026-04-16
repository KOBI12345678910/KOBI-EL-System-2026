// ============================================================
// FILE: src/features/procurement/Supplier360.tsx
// ============================================================

import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// ============================================================
// TYPES
// ============================================================

type SupplierCore = {
  id: number;
  public_id: string;
  supplier_number: string;
  legal_name: string;
  display_name: string;
  supplier_type?: string | null;
  tax_id?: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  status: string;
  payment_terms?: string | null;
  preferred_currency?: string | null;
  risk_level?: string | null;
  created_at: string;
  updated_at: string;
};

type SupplierContact = {
  id: number;
  contact_number: string;
  full_name: string;
  role_title?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  is_primary: boolean;
  receives_rfq: boolean;
  receives_po: boolean;
  status: string;
};

type SupplierRFQInvite = {
  id: number;
  rfq_id: number;
  invited_at: string;
  response_status: string;
  responded_at?: string | null;
};

type SupplierPO = {
  id: number;
  po_number: string;
  order_date: string;
  expected_delivery_date?: string | null;
  grand_total: number;
  receiving_status: string;
  payment_status: string;
  state: string;
};

type SupplierScorecard = {
  id: number;
  score_period: string;
  quality_score: number;
  delivery_score: number;
  price_score: number;
  responsiveness_score: number;
  overall_score: number;
  calculated_at: string;
};

type SupplierContractMilestone = {
  id: number;
  milestone_name: string;
  due_date?: string | null;
  achieved_at?: string | null;
  state: string;
};

type SupplierDocument = {
  id: number;
  document_number: string;
  filename: string;
  document_type?: string | null;
};

type SupplierInsight = {
  id: number;
  insight_number: string;
  category?: string | null;
  confidence_score?: number | null;
  recommendation_text?: string | null;
  state: string;
};

type SupplierAudit = {
  id: number;
  action_name: string;
  performed_at: string;
  source_module: string;
  performed_by_user_name?: string | null;
};

type Supplier360Payload = {
  supplier: SupplierCore;
  contacts?: SupplierContact[];
  rfq_invites?: SupplierRFQInvite[];
  purchase_orders?: SupplierPO[];
  scorecards?: SupplierScorecard[];
  contract_milestones?: SupplierContractMilestone[];
  documents?: SupplierDocument[];
  insights?: SupplierInsight[];
  audit?: SupplierAudit[];
};

// ============================================================
// HELPERS
// ============================================================

const supplierMoney = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

function sm(v?: number | null) {
  return supplierMoney.format(v ?? 0);
}

function sd(v?: string | null) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleDateString("he-IL");
  } catch {
    return v;
  }
}

function sdt(v?: string | null) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString("he-IL");
  } catch {
    return v;
  }
}

function supplierBadgeClass(value?: string | null): string {
  const s = (value || "").toLowerCase();

  if (["active", "approved", "completed", "good"].includes(s)) {
    return "bg-emerald-100 text-emerald-800 border border-emerald-200";
  }

  if (["blocked", "suspended", "high", "cancelled"].includes(s)) {
    return "bg-red-100 text-red-800 border border-red-200";
  }

  if (["pending", "draft", "medium"].includes(s)) {
    return "bg-amber-100 text-amber-800 border border-amber-200";
  }

  return "bg-slate-100 text-slate-800 border border-slate-200";
}

// ============================================================
// API
// ============================================================

async function fetchSupplier360(supplierId: number): Promise<Supplier360Payload> {
  const res = await fetch(`/api/suppliers/${supplierId}/360`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  if (!res.ok) throw new Error(`Failed to fetch supplier 360: ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

async function blockSupplier(supplierId: number) {
  const res = await fetch(`/api/suppliers/${supplierId}/block`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ supplier_id: supplierId }),
  });

  if (!res.ok) throw new Error("Failed to block supplier");
  return res.json();
}

// ============================================================
// QUERY KEY
// ============================================================

export const supplier360QueryKey = (supplierId: number) => ["supplier360", supplierId] as const;

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
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${supplierBadgeClass(value)}`}>
      {value || "—"}
    </span>
  );
}

function ActionButton({ label, onClick, disabled, variant = "dark" }: { label: string; onClick?: () => void; disabled?: boolean; variant?: "dark" | "light" }) {
  const cls =
    variant === "dark"
      ? "rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50"
      : "rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50";
  return <button type="button" onClick={onClick} disabled={disabled} className={cls}>{label}</button>;
}

type SupplierTab = "overview" | "contacts" | "rfq" | "po" | "scorecards" | "contracts" | "documents" | "ai" | "audit";

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

export function Supplier360({ supplierId }: { supplierId: number }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<SupplierTab>("overview");

  const query = useQuery({
    queryKey: supplier360QueryKey(supplierId),
    queryFn: () => fetchSupplier360(supplierId),
  });

  const blockSupplierMutation = useMutation({
    mutationFn: () => blockSupplier(supplierId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: supplier360QueryKey(supplierId) });
    },
  });

  // FIX: useMemo MUST be called before any early returns (Rules of Hooks)
  const nextBestAction = useMemo(() => {
    if (!query.data) return "";
    const supplier = query.data.supplier;
    const pos = query.data.purchase_orders ?? [];
    const sc = query.data.scorecards ?? [];
    if (supplier.risk_level === "high") return "בדוק סיכון ספק ושקול חסימה או הקטנת חשיפה";
    if (pos.some((x) => x.receiving_status === "not_received" && x.state === "SentToSupplier")) {
      return "עקוב אחרי הזמנות פתוחות לספק";
    }
    if (sc.length === 0) return "חשב scorecard לספק";
    return "המשך מעקב ביצועים, RFQ ו־PO";
  }, [query.data]);

  const averageScore = useMemo(() => {
    const sc = query.data?.scorecards ?? [];
    return sc.length > 0 ? sc.reduce((sum, x) => sum + (x.overall_score ?? 0), 0) / sc.length : 0;
  }, [query.data?.scorecards]);

  if (query.isLoading) {
    return <div className="p-6"><div className="h-10 w-72 rounded-xl bg-slate-200 animate-pulse" /></div>;
  }

  if (query.isError || !query.data?.supplier) {
    return <div className="p-6"><div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">שגיאה בטעינת Supplier360</div></div>;
  }

  const data = query.data;
  const supplier = data.supplier;
  const contacts = data.contacts ?? [];
  const rfqInvites = data.rfq_invites ?? [];
  const purchaseOrders = data.purchase_orders ?? [];
  const scorecards = data.scorecards ?? [];
  const contractMilestones = data.contract_milestones ?? [];
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
                    <h1 className="text-3xl font-black text-slate-900">{supplier.display_name}</h1>
                    <Badge value={supplier.status} />
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{supplier.supplier_number}</span>
                  </div>
                  <div className="text-sm text-slate-600">{supplier.legal_name} • {supplier.tax_id || "—"}</div>
                  <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                    <span>Email: {supplier.email || "—"}</span>
                    <span>Phone: {supplier.phone || "—"}</span>
                    <span>Location: {[supplier.city, supplier.region, supplier.country].filter(Boolean).join(", ") || "—"}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ActionButton variant="light" label="Create RFQ Invite" />
                  <ActionButton label={blockSupplierMutation.isPending ? "חוסם..." : "Block Supplier"} onClick={() => blockSupplierMutation.mutate()} disabled={blockSupplierMutation.isPending} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <SummaryCard title="PO Count" value={String(purchaseOrders.length)} />
              <SummaryCard title="RFQ Invites" value={String(rfqInvites.length)} />
              <SummaryCard title="Avg Score" value={averageScore.toFixed(2)} />
              <SummaryCard title="Open PO Value" value={sm(purchaseOrders.reduce((sum, x) => sum + (x.grand_total ?? 0), 0))} />
            </div>

            <div className="flex flex-wrap gap-2">
              <TabButton active={activeTab === "overview"} label="סקירה" onClick={() => setActiveTab("overview")} />
              <TabButton active={activeTab === "contacts"} label="אנשי קשר" onClick={() => setActiveTab("contacts")} count={contacts.length} />
              <TabButton active={activeTab === "rfq"} label="RFQ" onClick={() => setActiveTab("rfq")} count={rfqInvites.length} />
              <TabButton active={activeTab === "po"} label="PO" onClick={() => setActiveTab("po")} count={purchaseOrders.length} />
              <TabButton active={activeTab === "scorecards"} label="Scorecards" onClick={() => setActiveTab("scorecards")} count={scorecards.length} />
              <TabButton active={activeTab === "contracts"} label="Contracts" onClick={() => setActiveTab("contracts")} count={contractMilestones.length} />
              <TabButton active={activeTab === "documents"} label="מסמכים" onClick={() => setActiveTab("documents")} count={documents.length} />
              <TabButton active={activeTab === "ai"} label="AI" onClick={() => setActiveTab("ai")} count={insights.length} />
              <TabButton active={activeTab === "audit"} label="Audit" onClick={() => setActiveTab("audit")} count={audit.length} />
            </div>

            {activeTab === "overview" && (
              <div className="grid grid-cols-1 gap-6">
                <SectionCard title="תמונת ספק">
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    <div className="rounded-2xl bg-slate-50 p-4"><div className="text-sm text-slate-500">Supplier Type</div><div className="mt-2 text-xl font-bold text-slate-900">{supplier.supplier_type || "—"}</div></div>
                    <div className="rounded-2xl bg-slate-50 p-4"><div className="text-sm text-slate-500">Risk Level</div><div className="mt-2 text-xl font-bold text-slate-900">{supplier.risk_level || "—"}</div></div>
                    <div className="rounded-2xl bg-slate-50 p-4"><div className="text-sm text-slate-500">Payment Terms</div><div className="mt-2 text-xl font-bold text-slate-900">{supplier.payment_terms || "—"}</div></div>
                    <div className="rounded-2xl bg-slate-50 p-4"><div className="text-sm text-slate-500">Currency</div><div className="mt-2 text-xl font-bold text-slate-900">{supplier.preferred_currency || "ILS"}</div></div>
                  </div>
                </SectionCard>
                <SectionCard title="PO אחרונות">
                  {purchaseOrders.length === 0 ? <div className="text-sm text-slate-600">אין PO.</div> : (
                    <div className="space-y-3">
                      {purchaseOrders.slice(0, 5).map((po) => (
                        <div key={po.id} className="rounded-2xl border border-slate-200 p-4">
                          <div className="flex flex-col gap-3 md:flex-row md:justify-between">
                            <div><div className="font-bold text-slate-900">{po.po_number}</div><div className="text-sm text-slate-600">Date: {sd(po.order_date)} • Expected: {sd(po.expected_delivery_date)} • Total: {sm(po.grand_total)}</div></div>
                            <Badge value={po.state} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>
              </div>
            )}

            {activeTab === "contacts" && (
              <SectionCard title="אנשי קשר">
                {contacts.length === 0 ? <div className="text-sm text-slate-600">אין אנשי קשר.</div> : (
                  <div className="space-y-3">
                    {contacts.map((contact) => (
                      <div key={contact.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:justify-between">
                          <div><div className="font-bold text-slate-900">{contact.full_name}</div><div className="text-sm text-slate-600">{contact.role_title || "—"} • {contact.email || "—"} • {contact.mobile || contact.phone || "—"}</div></div>
                          <div className="flex items-center gap-2">
                            {contact.is_primary ? <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">Primary</span> : null}
                            <Badge value={contact.status} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}

            {activeTab === "rfq" && (
              <SectionCard title="RFQ Invites">
                {rfqInvites.length === 0 ? <div className="text-sm text-slate-600">אין RFQ invites.</div> : (
                  <div className="space-y-3">
                    {rfqInvites.map((invite) => (
                      <div key={invite.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:justify-between">
                          <div><div className="font-bold text-slate-900">RFQ #{invite.rfq_id}</div><div className="text-sm text-slate-600">Invited: {sdt(invite.invited_at)} • Responded: {sdt(invite.responded_at)}</div></div>
                          <Badge value={invite.response_status} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}

            {activeTab === "po" && (
              <SectionCard title="Purchase Orders">
                {purchaseOrders.length === 0 ? <div className="text-sm text-slate-600">אין PO.</div> : (
                  <div className="space-y-3">
                    {purchaseOrders.map((po) => (
                      <div key={po.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:justify-between">
                          <div><div className="font-bold text-slate-900">{po.po_number}</div><div className="text-sm text-slate-600">Date: {sd(po.order_date)} • Expected: {sd(po.expected_delivery_date)} • Total: {sm(po.grand_total)}</div><div className="mt-1 text-sm text-slate-600">Receiving: {po.receiving_status} • Payment: {po.payment_status}</div></div>
                          <Badge value={po.state} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}

            {activeTab === "scorecards" && (
              <SectionCard title="Supplier Scorecards">
                {scorecards.length === 0 ? <div className="text-sm text-slate-600">אין scorecards.</div> : (
                  <div className="space-y-3">
                    {scorecards.map((score) => (
                      <div key={score.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="font-bold text-slate-900">{score.score_period}</div>
                        <div className="mt-2 text-sm text-slate-600">Quality: {score.quality_score} • Delivery: {score.delivery_score} • Price: {score.price_score} • Responsiveness: {score.responsiveness_score}</div>
                        <div className="mt-1 text-sm text-slate-700">Overall: <span className="font-bold">{score.overall_score}</span> • Calculated: {sd(score.calculated_at)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}

            {activeTab === "contracts" && (
              <SectionCard title="Contract Milestones">
                {contractMilestones.length === 0 ? <div className="text-sm text-slate-600">אין milestones.</div> : (
                  <div className="space-y-3">
                    {contractMilestones.map((milestone) => (
                      <div key={milestone.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:justify-between">
                          <div><div className="font-bold text-slate-900">{milestone.milestone_name}</div><div className="text-sm text-slate-600">Due: {sd(milestone.due_date)} • Achieved: {sd(milestone.achieved_at)}</div></div>
                          <Badge value={milestone.state} />
                        </div>
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
                          <div className="text-sm text-slate-500">{sdt(item.performed_at)}</div>
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
            <SectionCard title="בריאות ספק">
              <div className="space-y-3 text-sm text-slate-700">
                <div className="flex items-center justify-between"><span>סטטוס</span><Badge value={supplier.status} /></div>
                <div className="flex items-center justify-between"><span>Risk</span><span className="font-bold">{supplier.risk_level || "—"}</span></div>
                <div className="flex items-center justify-between"><span>Payment Terms</span><span className="font-bold">{supplier.payment_terms || "—"}</span></div>
                <div className="flex items-center justify-between"><span>Avg Score</span><span className="font-bold">{averageScore.toFixed(2)}</span></div>
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
    </div>
  );
}

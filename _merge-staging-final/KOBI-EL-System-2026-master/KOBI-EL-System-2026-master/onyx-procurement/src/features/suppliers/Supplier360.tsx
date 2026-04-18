// ============================================================
// FILE: src/features/suppliers/Supplier360.tsx
// ============================================================

import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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
  credit_rating?: string | null;
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
  status: string;
};

type SupplierScorecard = {
  id: number;
  score_period: string;
  quality_score: number;
  delivery_score: number;
  price_score: number;
  responsiveness_score: number;
  overall_score: number;
};

type SupplierPO = {
  id: number;
  po_number: string;
  state: string;
  grand_total: number;
  created_at: string;
};

type SupplierRFQInvite = {
  id: number;
  rfq_id: number;
  rfq_number?: string;
  response_status: string;
};

type Supplier360Payload = {
  supplier: SupplierCore;
  contacts?: SupplierContact[];
  scorecards?: SupplierScorecard[];
  open_pos?: SupplierPO[];
  rfq_invites?: SupplierRFQInvite[];
  open_rfqs?: number;
  open_pos_count?: number;
};

// ============================================================
// HELPERS
// ============================================================

const supplierMoney = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

function fmtMoney(v?: number | null) {
  return supplierMoney.format(v ?? 0);
}

function fmtDate(v?: string | null) {
  if (!v) return "—";
  try { return new Date(v).toLocaleDateString("he-IL"); } catch { return v; }
}

function badgeClass(s?: string | null) {
  const v = (s || "").toLowerCase();
  if (["active", "approved", "completed", "paid"].includes(v))
    return "bg-emerald-100 text-emerald-800 border border-emerald-200";
  if (["blocked", "rejected", "cancelled", "overdue"].includes(v))
    return "bg-red-100 text-red-800 border border-red-200";
  return "bg-amber-100 text-amber-800 border border-amber-200";
}

// ============================================================
// API
// ============================================================

async function fetchSupplier360(id: number): Promise<Supplier360Payload> {
  const res = await fetch(`/api/suppliers/${id}/360`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Supplier 360 fetch failed: ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

export const supplier360QueryKey = (id: number) => ["supplier360", id] as const;

// ============================================================
// UI
// ============================================================

function Badge({ value }: { value?: string | null }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${badgeClass(value)}`}>
      {value || "—"}
    </span>
  );
}

function Card({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div className="text-lg font-bold text-slate-900">{title}</div>
        <div>{right}</div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-3 text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
}

// ============================================================
// TABS
// ============================================================

type SupplierTab = "overview" | "contacts" | "scorecards" | "pos" | "rfqs";

function TabBtn({ active, label, onClick, count }: { active: boolean; label: string; onClick: () => void; count?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-4 py-2 text-sm font-bold transition ${active ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"}`}
    >
      {label}{typeof count === "number" ? ` (${count})` : ""}
    </button>
  );
}

// ============================================================
// MAIN
// ============================================================

export function Supplier360({ supplierId }: { supplierId: number }) {
  const [tab, setTab] = useState<SupplierTab>("overview");

  const query = useQuery({
    queryKey: supplier360QueryKey(supplierId),
    queryFn: () => fetchSupplier360(supplierId),
  });

  if (query.isLoading) return <div className="p-6"><div className="h-10 w-72 rounded-xl bg-slate-200 animate-pulse" /></div>;
  if (query.isError || !query.data?.supplier) {
    return <div className="p-6"><div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">שגיאה בטעינת Supplier 360</div></div>;
  }

  const data = query.data;
  const supplier = data.supplier;
  const contacts = data.contacts ?? [];
  const scorecards = data.scorecards ?? [];
  const openPOs = data.open_pos ?? [];
  const rfqInvites = data.rfq_invites ?? [];

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
                    <h1 className="text-3xl font-black text-slate-900">{supplier.display_name}</h1>
                    <Badge value={supplier.status} />
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{supplier.supplier_number}</span>
                  </div>
                  <div className="text-sm text-slate-600">
                    {supplier.legal_name} {supplier.tax_id ? `• ח.פ: ${supplier.tax_id}` : ""}
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                    <span>טלפון: {supplier.phone || "—"}</span>
                    <span>מייל: {supplier.email || "—"}</span>
                    <span>מיקום: {[supplier.city, supplier.region, supplier.country].filter(Boolean).join(", ") || "—"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <Metric title="RFQs פתוחים" value={String(data.open_rfqs ?? rfqInvites.length)} />
              <Metric title="POs פתוחים" value={String(data.open_pos_count ?? openPOs.length)} />
              <Metric title="תנאי תשלום" value={supplier.payment_terms || "—"} />
              <Metric title="דירוג אשראי" value={supplier.credit_rating || "—"} />
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap gap-2">
              <TabBtn active={tab === "overview"} label="סקירה" onClick={() => setTab("overview")} />
              <TabBtn active={tab === "contacts"} label="אנשי קשר" onClick={() => setTab("contacts")} count={contacts.length} />
              <TabBtn active={tab === "scorecards"} label="Scorecards" onClick={() => setTab("scorecards")} count={scorecards.length} />
              <TabBtn active={tab === "pos"} label="הזמנות רכש" onClick={() => setTab("pos")} count={openPOs.length} />
              <TabBtn active={tab === "rfqs"} label="RFQs" onClick={() => setTab("rfqs")} count={rfqInvites.length} />
            </div>

            {/* Content */}
            {tab === "overview" && (
              <div className="space-y-6">
                <Card title="Scorecard אחרון">
                  {scorecards.length === 0 ? (
                    <div className="text-sm text-slate-600">אין Scorecard עדיין.</div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      {["quality", "delivery", "price", "responsiveness", "overall"].map((key) => (
                        <div key={key} className="rounded-2xl bg-slate-50 p-4 text-center">
                          <div className="text-xs text-slate-500 capitalize">{key}</div>
                          <div className="mt-2 text-xl font-bold text-slate-900">
                            {(scorecards[0] as Record<string, number>)[`${key}_score`]?.toFixed(1) ?? "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                <Card title="3 POs אחרונים">
                  {openPOs.length === 0 ? (
                    <div className="text-sm text-slate-600">אין הזמנות רכש.</div>
                  ) : (
                    <div className="space-y-3">
                      {openPOs.slice(0, 3).map((po) => (
                        <div key={po.id} className="rounded-2xl border border-slate-200 p-4 flex items-center justify-between">
                          <div>
                            <div className="font-bold text-slate-900">{po.po_number}</div>
                            <div className="text-sm text-slate-600">{fmtMoney(po.grand_total)} • {fmtDate(po.created_at)}</div>
                          </div>
                          <Badge value={po.state} />
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            )}

            {tab === "contacts" && (
              <Card title="אנשי קשר">
                {contacts.length === 0 ? (
                  <div className="text-sm text-slate-600">לא הוגדרו אנשי קשר.</div>
                ) : (
                  <div className="space-y-3">
                    {contacts.map((c) => (
                      <div key={c.id} className="rounded-2xl border border-slate-200 p-4 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{c.full_name}</span>
                            {c.is_primary && <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-bold text-blue-700">ראשי</span>}
                          </div>
                          <div className="text-sm text-slate-600">{c.role_title || "—"} • {c.email || "—"} • {c.mobile || c.phone || "—"}</div>
                        </div>
                        <Badge value={c.status} />
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {tab === "scorecards" && (
              <Card title="Scorecards">
                {scorecards.length === 0 ? (
                  <div className="text-sm text-slate-600">אין Scorecards.</div>
                ) : (
                  <div className="space-y-3">
                    {scorecards.map((sc) => (
                      <div key={sc.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="font-bold text-slate-900 mb-2">תקופה: {sc.score_period}</div>
                        <div className="grid grid-cols-5 gap-2 text-center text-sm">
                          <div><div className="text-slate-500">Quality</div><div className="font-bold">{sc.quality_score.toFixed(1)}</div></div>
                          <div><div className="text-slate-500">Delivery</div><div className="font-bold">{sc.delivery_score.toFixed(1)}</div></div>
                          <div><div className="text-slate-500">Price</div><div className="font-bold">{sc.price_score.toFixed(1)}</div></div>
                          <div><div className="text-slate-500">Response</div><div className="font-bold">{sc.responsiveness_score.toFixed(1)}</div></div>
                          <div><div className="text-slate-500">Overall</div><div className="font-bold text-lg">{sc.overall_score.toFixed(1)}</div></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {tab === "pos" && (
              <Card title="הזמנות רכש">
                {openPOs.length === 0 ? (
                  <div className="text-sm text-slate-600">אין הזמנות רכש.</div>
                ) : (
                  <div className="space-y-3">
                    {openPOs.map((po) => (
                      <div key={po.id} className="rounded-2xl border border-slate-200 p-4 flex items-center justify-between">
                        <div>
                          <div className="font-bold text-slate-900">{po.po_number}</div>
                          <div className="text-sm text-slate-600">{fmtMoney(po.grand_total)} • {fmtDate(po.created_at)}</div>
                        </div>
                        <Badge value={po.state} />
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {tab === "rfqs" && (
              <Card title="הזמנות להצעת מחיר (RFQ)">
                {rfqInvites.length === 0 ? (
                  <div className="text-sm text-slate-600">אין הזמנות RFQ.</div>
                ) : (
                  <div className="space-y-3">
                    {rfqInvites.map((inv) => (
                      <div key={inv.id} className="rounded-2xl border border-slate-200 p-4 flex items-center justify-between">
                        <div className="font-bold text-slate-900">RFQ #{inv.rfq_id} {inv.rfq_number ? `• ${inv.rfq_number}` : ""}</div>
                        <Badge value={inv.response_status} />
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}
          </div>

          {/* Side */}
          <div className="space-y-6">
            <Card title="בריאות ספק">
              <div className="space-y-3 text-sm text-slate-700">
                <div className="flex justify-between"><span>סטטוס</span><Badge value={supplier.status} /></div>
                <div className="flex justify-between"><span>דירוג</span><span className="font-bold">{supplier.credit_rating || "—"}</span></div>
                <div className="flex justify-between"><span>מטבע</span><span className="font-bold">{supplier.preferred_currency || "ILS"}</span></div>
                <div className="flex justify-between"><span>תנאי תשלום</span><span className="font-bold">{supplier.payment_terms || "—"}</span></div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

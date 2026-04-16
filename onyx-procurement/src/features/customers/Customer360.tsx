// ============================================================
// FILE: src/features/customers/Customer360.tsx
// ============================================================

import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ============================================================
// TYPES
// ============================================================

type CustomerCore = {
  id: number;
  public_id: string;
  customer_number: string;
  legal_name: string;
  display_name: string;
  customer_type?: string | null;
  tax_id?: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  status: string;
  current_balance: number;
  credit_limit?: number | null;
  preferred_currency?: string | null;
  risk_level?: string | null;
  created_at: string;
  updated_at: string;
};

type CustomerContact = {
  id: number;
  contact_number: string;
  full_name: string;
  role_title?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  is_primary: boolean;
  receives_quotes: boolean;
  receives_invoices: boolean;
  receives_support_updates: boolean;
  status: string;
};

type CustomerQuoteSummary = {
  id: number;
  quote_number: string;
  quote_date: string;
  valid_until?: string | null;
  grand_total: number;
  state: string;
  approval_status: string;
};

type CustomerProjectSummary = {
  id: number;
  project_number: string;
  project_name: string;
  state: string;
  progress_percent: number;
  budget_amount: number;
  actual_cost: number;
};

type CustomerInvoiceSummary = {
  id: number;
  invoice_number: string;
  issue_date?: string | null;
  due_date?: string | null;
  grand_total: number;
  balance_due: number;
  state: string;
};

type CustomerDocumentSummary = {
  id: number;
  document_number: string;
  filename: string;
  document_type?: string | null;
  classification_status?: string | null;
  ocr_status?: string | null;
};

type CustomerInsightSummary = {
  id: number;
  insight_number: string;
  category?: string | null;
  confidence_score?: number | null;
  recommendation_text?: string | null;
  state: string;
};

type CustomerAuditSummary = {
  id: number;
  action_name: string;
  performed_at: string;
  source_module: string;
  performed_by_user_name?: string | null;
};

type Customer360Payload = {
  customer: CustomerCore;
  contacts?: CustomerContact[];
  quotes?: CustomerQuoteSummary[];
  projects?: CustomerProjectSummary[];
  invoices?: CustomerInvoiceSummary[];
  documents?: CustomerDocumentSummary[];
  insights?: CustomerInsightSummary[];
  audit?: CustomerAuditSummary[];
  quotes_count?: number;
  projects_count?: number;
  open_balance?: number;
  documents_count?: number;
  ai_insights_count?: number;
};

// ============================================================
// HELPERS
// ============================================================

const currencyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

function formatMoney(value?: number | null): string {
  return currencyFormatter.format(value ?? 0);
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("he-IL");
  } catch {
    return value;
  }
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("he-IL");
  } catch {
    return value;
  }
}

function getStateBadgeClass(state?: string | null): string {
  const s = (state || "").toLowerCase();

  if (["approved", "paid", "active", "completed"].includes(s)) {
    return "bg-emerald-100 text-emerald-800 border border-emerald-200";
  }

  if (["overdue", "rejected", "blocked", "cancelled"].includes(s)) {
    return "bg-red-100 text-red-800 border border-red-200";
  }

  if (["draft", "planning", "pending", "underreview", "sent"].includes(s)) {
    return "bg-amber-100 text-amber-800 border border-amber-200";
  }

  return "bg-slate-100 text-slate-800 border border-slate-200";
}

// ============================================================
// API
// ============================================================

async function fetchCustomer360(customerId: number): Promise<Customer360Payload> {
  const res = await fetch(`/api/customers/${customerId}/360`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch customer 360: ${res.status}`);
  }

  const json = await res.json();
  return json.data ?? json;
}

async function createQuoteForCustomer(customerId: number) {
  const res = await fetch(`/api/quotes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      customer_id: customerId,
      quote_date: new Date().toISOString().slice(0, 10),
    }),
  });

  if (!res.ok) {
    throw new Error("Failed to create quote");
  }

  return res.json();
}

async function createProjectForCustomer(customerId: number) {
  const res = await fetch(`/api/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      customer_id: customerId,
      project_name: `פרויקט חדש ללקוח ${customerId}`,
    }),
  });

  if (!res.ok) {
    throw new Error("Failed to create project");
  }

  return res.json();
}

async function createInvoiceForCustomer(customerId: number) {
  const res = await fetch(`/api/invoices`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      customer_id: customerId,
      invoice_type: "customer_invoice",
      issue_date: new Date().toISOString().slice(0, 10),
    }),
  });

  if (!res.ok) {
    throw new Error("Failed to create invoice");
  }

  return res.json();
}

// ============================================================
// QUERY KEYS
// ============================================================

export const customer360QueryKey = (customerId: number) => ["customer360", customerId] as const;

// ============================================================
// SMALL UI PARTS
// ============================================================

function PageLoading() {
  return (
    <div className="p-6 space-y-4">
      <div className="h-10 w-72 rounded-xl bg-slate-200 animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={idx} className="h-28 rounded-2xl bg-slate-200 animate-pulse" />
        ))}
      </div>
      <div className="h-96 rounded-2xl bg-slate-200 animate-pulse" />
    </div>
  );
}

function PageError({ message }: { message: string }) {
  return (
    <div className="p-6">
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
        <div className="text-lg font-bold mb-2">שגיאה בטעינת לקוח 360</div>
        <div>{message}</div>
      </div>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
      <div className="text-lg font-bold text-slate-900">{title}</div>
      <div className="mt-2 text-slate-600">{description}</div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  subValue,
}: {
  title: string;
  value: string;
  subValue?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-3 text-2xl font-bold text-slate-900">{value}</div>
      {subValue ? <div className="mt-2 text-sm text-slate-500">{subValue}</div> : null}
    </div>
  );
}

function StateBadge({ value }: { value?: string | null }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getStateBadgeClass(value)}`}>
      {value || "—"}
    </span>
  );
}

function SectionCard({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
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

function ActionButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  );
}

// ============================================================
// TABS
// ============================================================

type CustomerTab =
  | "overview"
  | "contacts"
  | "quotes"
  | "projects"
  | "invoices"
  | "documents"
  | "insights"
  | "audit";

function TabButton({
  active,
  label,
  onClick,
  count,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
        active
          ? "bg-slate-900 text-white"
          : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
      }`}
    >
      {label}
      {typeof count === "number" ? ` (${count})` : ""}
    </button>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function Customer360({ customerId }: { customerId: number }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<CustomerTab>("overview");

  const query = useQuery({
    queryKey: customer360QueryKey(customerId),
    queryFn: () => fetchCustomer360(customerId),
  });

  const createQuoteMutation = useMutation({
    mutationFn: () => createQuoteForCustomer(customerId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: customer360QueryKey(customerId) });
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: () => createProjectForCustomer(customerId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: customer360QueryKey(customerId) });
    },
  });

  const createInvoiceMutation = useMutation({
    mutationFn: () => createInvoiceForCustomer(customerId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: customer360QueryKey(customerId) });
    },
  });

  const data = query.data;

  const nextBestAction = useMemo(() => {
    if (!data?.customer) return "—";

    if ((data.open_balance ?? 0) > 0) {
      return "בדוק גבייה וחשבוניות פתוחות";
    }

    if ((data.quotes?.length ?? 0) === 0) {
      return "צור הצעת מחיר ראשונה ללקוח";
    }

    if ((data.projects?.length ?? 0) === 0) {
      return "המר הזדמנות לפרויקט פעיל";
    }

    return "בדוק הזדמנות Upsell / פרויקט חדש";
  }, [data]);

  if (query.isLoading) return <PageLoading />;
  if (query.isError) return <PageError message={(query.error as Error).message} />;
  if (!data?.customer) {
    return <EmptyState title="לא נמצא לקוח" description="לא נמצאו נתוני לקוח לתצוגת 360." />;
  }

  const customer = data.customer;
  const contacts = data.contacts ?? [];
  const quotes = data.quotes ?? [];
  const projects = data.projects ?? [];
  const invoices = data.invoices ?? [];
  const documents = data.documents ?? [];
  const insights = data.insights ?? [];
  const audit = data.audit ?? [];

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
                    <h1 className="text-3xl font-black text-slate-900">{customer.display_name}</h1>
                    <StateBadge value={customer.status} />
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                      {customer.customer_number}
                    </span>
                  </div>

                  <div className="text-sm text-slate-600">
                    {customer.legal_name} {customer.tax_id ? `• ח.פ/ע.מ: ${customer.tax_id}` : ""}
                  </div>

                  <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                    <span>טלפון: {customer.phone || "—"}</span>
                    <span>מייל: {customer.email || "—"}</span>
                    <span>מיקום: {[customer.city, customer.region, customer.country].filter(Boolean).join(", ") || "—"}</span>
                    <span>עודכן: {formatDateTime(customer.updated_at)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <ActionButton
                    label={createQuoteMutation.isPending ? "יוצר..." : "צור הצעת מחיר"}
                    onClick={() => createQuoteMutation.mutate()}
                    disabled={createQuoteMutation.isPending}
                  />
                  <ActionButton
                    label={createProjectMutation.isPending ? "יוצר..." : "צור פרויקט"}
                    onClick={() => createProjectMutation.mutate()}
                    disabled={createProjectMutation.isPending}
                  />
                  <ActionButton
                    label={createInvoiceMutation.isPending ? "יוצר..." : "צור חשבונית"}
                    onClick={() => createInvoiceMutation.mutate()}
                    disabled={createInvoiceMutation.isPending}
                  />
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <SummaryCard title="יתרה פתוחה" value={formatMoney(data.open_balance)} />
              <SummaryCard title="הצעות מחיר" value={String(data.quotes_count ?? quotes.length)} />
              <SummaryCard title="פרויקטים" value={String(data.projects_count ?? projects.length)} />
              <SummaryCard title="תובנות AI" value={String(data.ai_insights_count ?? insights.length)} />
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap gap-2">
              <TabButton active={activeTab === "overview"} label="סקירה" onClick={() => setActiveTab("overview")} />
              <TabButton active={activeTab === "contacts"} label="אנשי קשר" onClick={() => setActiveTab("contacts")} count={contacts.length} />
              <TabButton active={activeTab === "quotes"} label="הצעות מחיר" onClick={() => setActiveTab("quotes")} count={quotes.length} />
              <TabButton active={activeTab === "projects"} label="פרויקטים" onClick={() => setActiveTab("projects")} count={projects.length} />
              <TabButton active={activeTab === "invoices"} label="חשבוניות" onClick={() => setActiveTab("invoices")} count={invoices.length} />
              <TabButton active={activeTab === "documents"} label="מסמכים" onClick={() => setActiveTab("documents")} count={documents.length} />
              <TabButton active={activeTab === "insights"} label="AI" onClick={() => setActiveTab("insights")} count={insights.length} />
              <TabButton active={activeTab === "audit"} label="Audit" onClick={() => setActiveTab("audit")} count={audit.length} />
            </div>

            {/* Tab Content */}
            {activeTab === "overview" && (
              <div className="grid grid-cols-1 gap-6">
                <SectionCard title="תמונת מצב">
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-sm text-slate-500">רמת סיכון</div>
                      <div className="mt-2 text-xl font-bold text-slate-900">{customer.risk_level || "normal"}</div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-sm text-slate-500">מטבע מועדף</div>
                      <div className="mt-2 text-xl font-bold text-slate-900">{customer.preferred_currency || "ILS"}</div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-sm text-slate-500">מסגרת אשראי</div>
                      <div className="mt-2 text-xl font-bold text-slate-900">{formatMoney(customer.credit_limit)}</div>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard title="3 הצעות מחיר אחרונות">
                  {quotes.length === 0 ? (
                    <EmptyState title="אין הצעות מחיר" description="עדיין לא נוצרו הצעות מחיר ללקוח הזה." />
                  ) : (
                    <div className="space-y-3">
                      {quotes.slice(0, 3).map((q) => (
                        <div key={q.id} className="rounded-2xl border border-slate-200 p-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                              <div className="font-bold text-slate-900">{q.quote_number}</div>
                              <div className="text-sm text-slate-600">
                                תאריך: {formatDate(q.quote_date)} • עד: {formatDate(q.valid_until)}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="font-bold text-slate-900">{formatMoney(q.grand_total)}</div>
                              <StateBadge value={q.state} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>

                <SectionCard title="3 פרויקטים אחרונים">
                  {projects.length === 0 ? (
                    <EmptyState title="אין פרויקטים" description="עדיין אין פרויקטים ללקוח הזה." />
                  ) : (
                    <div className="space-y-3">
                      {projects.slice(0, 3).map((p) => (
                        <div key={p.id} className="rounded-2xl border border-slate-200 p-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                              <div className="font-bold text-slate-900">
                                {p.project_number} • {p.project_name}
                              </div>
                              <div className="text-sm text-slate-600">
                                התקדמות: {p.progress_percent ?? 0}% • תקציב: {formatMoney(p.budget_amount)}
                              </div>
                            </div>
                            <StateBadge value={p.state} />
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
                {contacts.length === 0 ? (
                  <EmptyState title="אין אנשי קשר" description="לא הוגדרו אנשי קשר ללקוח הזה." />
                ) : (
                  <div className="space-y-3">
                    {contacts.map((contact) => (
                      <div key={contact.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <div className="font-bold text-slate-900">{contact.full_name}</div>
                              {contact.is_primary ? (
                                <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-bold text-blue-700">
                                  ראשי
                                </span>
                              ) : null}
                            </div>
                            <div className="text-sm text-slate-600">
                              {contact.role_title || "—"} • {contact.email || "—"} • {contact.mobile || contact.phone || "—"}
                            </div>
                          </div>
                          <StateBadge value={contact.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}

            {activeTab === "quotes" && (
              <SectionCard title="הצעות מחיר">
                {quotes.length === 0 ? (
                  <EmptyState title="אין הצעות מחיר" description="לא נמצאו הצעות מחיר ללקוח הזה." />
                ) : (
                  <div className="overflow-x-auto">
                    <div className="min-w-[760px]">
                      <div className="grid grid-cols-6 gap-3 border-b border-slate-200 pb-3 text-xs font-bold uppercase text-slate-500">
                        <div>מספר</div>
                        <div>תאריך</div>
                        <div>עד</div>
                        <div>סכום</div>
                        <div>אישור</div>
                        <div>סטטוס</div>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {quotes.map((q) => (
                          <div key={q.id} className="grid grid-cols-6 gap-3 py-4 text-sm">
                            <div className="font-bold text-slate-900">{q.quote_number}</div>
                            <div>{formatDate(q.quote_date)}</div>
                            <div>{formatDate(q.valid_until)}</div>
                            <div>{formatMoney(q.grand_total)}</div>
                            <div>{q.approval_status}</div>
                            <div><StateBadge value={q.state} /></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </SectionCard>
            )}

            {activeTab === "projects" && (
              <SectionCard title="פרויקטים">
                {projects.length === 0 ? (
                  <EmptyState title="אין פרויקטים" description="לא נמצאו פרויקטים ללקוח הזה." />
                ) : (
                  <div className="space-y-3">
                    {projects.map((p) => (
                      <div key={p.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <div className="font-bold text-slate-900">
                              {p.project_number} • {p.project_name}
                            </div>
                            <div className="text-sm text-slate-600">
                              התקדמות: {p.progress_percent ?? 0}% • תקציב: {formatMoney(p.budget_amount)} • עלות בפועל: {formatMoney(p.actual_cost)}
                            </div>
                          </div>
                          <StateBadge value={p.state} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}

            {activeTab === "invoices" && (
              <SectionCard title="חשבוניות">
                {invoices.length === 0 ? (
                  <EmptyState title="אין חשבוניות" description="לא נמצאו חשבוניות ללקוח הזה." />
                ) : (
                  <div className="space-y-3">
                    {invoices.map((i) => (
                      <div key={i.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <div className="font-bold text-slate-900">{i.invoice_number}</div>
                            <div className="text-sm text-slate-600">
                              תאריך: {formatDate(i.issue_date)} • יעד: {formatDate(i.due_date)}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <div className="text-sm text-slate-500">יתרה</div>
                              <div className="font-bold text-slate-900">{formatMoney(i.balance_due)}</div>
                            </div>
                            <StateBadge value={i.state} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}

            {activeTab === "documents" && (
              <SectionCard title="מסמכים">
                {documents.length === 0 ? (
                  <EmptyState title="אין מסמכים" description="לא נמצאו מסמכים משויכים ללקוח הזה." />
                ) : (
                  <div className="space-y-3">
                    {documents.map((d) => (
                      <div key={d.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="font-bold text-slate-900">{d.filename}</div>
                            <div className="text-sm text-slate-600">
                              {d.document_number} • {d.document_type || "ללא סוג"} • OCR: {d.ocr_status || "—"}
                            </div>
                          </div>
                          <div className="text-sm text-slate-600">{d.classification_status || "לא מסווג"}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}

            {activeTab === "insights" && (
              <SectionCard title="תובנות AI">
                {insights.length === 0 ? (
                  <EmptyState title="אין תובנות AI" description="עדיין לא נוצרו תובנות AI ללקוח הזה." />
                ) : (
                  <div className="space-y-3">
                    {insights.map((ai) => (
                      <div key={ai.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="font-bold text-slate-900">
                              {ai.insight_number} • {ai.category || "Insight"}
                            </div>
                            <div className="mt-2 text-sm text-slate-700">
                              {ai.recommendation_text || "—"}
                            </div>
                            <div className="mt-2 text-xs text-slate-500">
                              Confidence: {ai.confidence_score ?? "—"}
                            </div>
                          </div>
                          <StateBadge value={ai.state} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}

            {activeTab === "audit" && (
              <SectionCard title="Audit Trail">
                {audit.length === 0 ? (
                  <EmptyState title="אין Audit" description="לא נמצאו פעולות Audit ללקוח הזה." />
                ) : (
                  <div className="space-y-3">
                    {audit.map((a) => (
                      <div key={a.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="font-bold text-slate-900">{a.action_name}</div>
                            <div className="text-sm text-slate-600">
                              מודול: {a.source_module} • משתמש: {a.performed_by_user_name || "—"}
                            </div>
                          </div>
                          <div className="text-sm text-slate-500">{formatDateTime(a.performed_at)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}
          </div>

          {/* Side Panel */}
          <div className="space-y-6">
            <SectionCard title="Next Best Action">
              <div className="text-sm text-slate-700">{nextBestAction}</div>
            </SectionCard>

            <SectionCard title="קישורים מהירים">
              <div className="flex flex-col gap-2">
                <button className="rounded-xl border border-slate-200 px-4 py-3 text-right text-sm font-bold text-slate-700 hover:bg-slate-50">
                  עבור לכל ההצעות של הלקוח
                </button>
                <button className="rounded-xl border border-slate-200 px-4 py-3 text-right text-sm font-bold text-slate-700 hover:bg-slate-50">
                  עבור לכל הפרויקטים של הלקוח
                </button>
                <button className="rounded-xl border border-slate-200 px-4 py-3 text-right text-sm font-bold text-slate-700 hover:bg-slate-50">
                  עבור לגבייה וחשבוניות
                </button>
              </div>
            </SectionCard>

            <SectionCard title="בריאות לקוח">
              <div className="space-y-3 text-sm text-slate-700">
                <div className="flex items-center justify-between">
                  <span>סטטוס</span>
                  <StateBadge value={customer.status} />
                </div>
                <div className="flex items-center justify-between">
                  <span>רמת סיכון</span>
                  <span className="font-bold">{customer.risk_level || "normal"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>יתרה פתוחה</span>
                  <span className="font-bold">{formatMoney(data.open_balance)}</span>
                </div>
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { LoadingOverlay } from "@/components/ui/unified-states";
import { useLocation } from "wouter";
import { Building2, LogOut, FileText, Package, Ticket, Loader2, Plus, Clock, CheckCircle, AlertTriangle, DollarSign, Download, RefreshCw, X } from "lucide-react";

const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(Math.round(Number(n) || 0));
const fmtC = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(Number(n) || 0);
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("he-IL") : "-";

const ORDER_STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: "טיוטה", color: "bg-muted/30 text-muted-foreground" },
  confirmed: { label: "מאושר", color: "bg-blue-500/20 text-blue-400" },
  shipped: { label: "נשלח", color: "bg-purple-500/20 text-purple-400" },
  delivered: { label: "נמסר", color: "bg-green-500/20 text-green-400" },
  cancelled: { label: "בוטל", color: "bg-red-500/20 text-red-400" },
};

const TICKET_STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  open: { label: "פתוח", color: "bg-amber-500/20 text-amber-400", icon: Clock },
  in_progress: { label: "בטיפול", color: "bg-blue-500/20 text-blue-400", icon: RefreshCw },
  resolved: { label: "נפתר", color: "bg-green-500/20 text-green-400", icon: CheckCircle },
  closed: { label: "סגור", color: "bg-muted/20 text-muted-foreground", icon: CheckCircle },
};

const TICKET_PRIORITY_MAP: Record<string, { label: string; color: string }> = {
  low: { label: "נמוכה", color: "text-green-400" },
  medium: { label: "בינונית", color: "text-amber-400" },
  high: { label: "גבוהה", color: "text-red-400" },
  urgent: { label: "דחוף", color: "text-red-500" },
};

function getToken() { return localStorage.getItem("customer_portal_token") || ""; }
function getUser() {
  try { return JSON.parse(localStorage.getItem("customer_portal_user") || "{}"); } catch { return {}; }
}

async function portalFetch(url: string, options: RequestInit = {}) {
  return fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(options.headers || {}) },
  });
}

function NewTicketModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ subject: "", description: "", category: "general", priority: "medium" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const r = await portalFetch("/api/portal/customer/tickets", { method: "POST", body: JSON.stringify(form) });
      const d = await r.json();
      if (!r.ok || d.error) { setError(d.error || "שגיאה"); return; }
      onCreated();
    } catch { setError("שגיאה בחיבור לשרת"); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-card border rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold">פנייה חדשה</h3>
          <button onClick={onClose} className="btn btn-ghost btn-xs"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">נושא *</label>
            <input className="input input-bordered w-full input-sm" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} required />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">תיאור</label>
            <textarea className="textarea textarea-bordered w-full text-sm" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">קטגוריה</label>
              <select className="select select-bordered w-full select-sm" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                <option value="general">כללי</option>
                <option value="order">הזמנה</option>
                <option value="invoice">חשבונית</option>
                <option value="delivery">משלוח</option>
                <option value="quality">איכות מוצר</option>
                <option value="other">אחר</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">עדיפות</label>
              <select className="select select-bordered w-full select-sm" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                <option value="low">נמוכה</option>
                <option value="medium">בינונית</option>
                <option value="high">גבוהה</option>
                <option value="urgent">דחוף</option>
              </select>
            </div>
          </div>
          {error && <div className="text-red-400 text-sm bg-red-500/10 p-2 rounded">{error}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">ביטול</button>
            <button type="submit" disabled={loading} className="btn btn-primary btn-sm">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "שלח פנייה"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CustomerPortalDashboard() {
  const [, setLocation] = useLocation();
  const [user, setUser] = useState<any>(getUser());
  const [tab, setTab] = useState("orders");
  const [orders, setOrders] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNewTicket, setShowNewTicket] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) { setLocation("/portal/customer/login"); return; }
    verifyUser();
  }, []);

  const verifyUser = async () => {
    try {
      const r = await portalFetch("/api/portal/customer/me");
      if (!r.ok) { logout(); return; }
      const u = await r.json();
      setUser(u);
      localStorage.setItem("customer_portal_user", JSON.stringify(u));
    } catch { logout(); }
  };

  const loadOrders = async () => {
    setLoading(true);
    try {
      const r = await portalFetch("/api/portal/customer/orders");
      if (r.ok) setOrders(await r.json());
    } catch {} finally { setLoading(false); }
  };

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const r = await portalFetch("/api/portal/customer/invoices");
      if (r.ok) setInvoices(await r.json());
    } catch {} finally { setLoading(false); }
  };

  const loadTickets = async () => {
    setLoading(true);
    try {
      const r = await portalFetch("/api/portal/customer/tickets");
      if (r.ok) setTickets(await r.json());
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => {
    if (tab === "orders") loadOrders();
    else if (tab === "invoices") loadInvoices();
    else if (tab === "tickets") loadTickets();
  }, [tab]);

  const logout = () => {
    portalFetch("/api/portal/customer/logout", { method: "POST" }).catch(() => {});
    localStorage.removeItem("customer_portal_token");
    localStorage.removeItem("customer_portal_user");
    setLocation("/portal/customer/login");
  };

  const tabs = [
    { key: "orders", label: "הזמנות", icon: Package },
    { key: "invoices", label: "חשבוניות", icon: FileText },
    { key: "tickets", label: "פניות", icon: Ticket },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 to-blue-950" dir="rtl">
      {showNewTicket && (
        <NewTicketModal
          onClose={() => setShowNewTicket(false)}
          onCreated={() => { setShowNewTicket(false); setTab("tickets"); loadTickets(); }}
        />
      )}

      <header className="border-b border-white/10 bg-black/20 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-foreground" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">פורטל לקוחות</div>
              <div className="text-xs text-blue-300/60">{user.customer_name || user.full_name || user.email}</div>
            </div>
          </div>
          <button onClick={logout} className="btn btn-ghost btn-sm text-muted-foreground flex items-center gap-1">
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">יציאה</span>
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-xl font-bold text-foreground">שלום, {user.full_name || user.email}</h1>
          <p className="text-blue-300/60 text-sm">{user.customer_name || "לקוח"}</p>
        </div>

        <div className="flex gap-1 border-b border-white/10 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab === t.key ? "border-blue-400 text-blue-300" : "border-transparent text-blue-300/50 hover:text-blue-200"}`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        {loading && <LoadingOverlay className="min-h-[150px]" />}

        {!loading && tab === "orders" && (
          <div className="space-y-3">
            <h2 className="text-foreground font-medium">הזמנות שלי ({orders.length})</h2>
            {orders.length === 0 && <div className="text-center text-blue-300/50 py-12">אין הזמנות</div>}
            {orders.map((o: any) => {
              const st = ORDER_STATUS_MAP[o.status] || { label: o.status, color: "bg-muted/20 text-muted-foreground" };
              return (
                <div key={o.id} className="bg-card/40 border border-white/10 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-mono text-blue-300 text-sm">{o.order_number}</div>
                    <span className={`text-xs px-2 py-0.5 rounded ${st.color}`}>{st.label}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                    <div><span className="text-blue-300/50 text-xs">תאריך</span><br /><span className="text-foreground">{fmtDate(o.order_date)}</span></div>
                    <div><span className="text-blue-300/50 text-xs">סכום</span><br /><span className="text-foreground">{fmtC(o.total)}</span></div>
                    <div><span className="text-blue-300/50 text-xs">תשלום</span><br /><span className={o.payment_status === "paid" ? "text-green-400" : "text-amber-400"}>{o.payment_status === "paid" ? "שולם" : "ממתין"}</span></div>
                    {o.delivery_date && <div><span className="text-blue-300/50 text-xs">תאריך משלוח</span><br /><span className="text-foreground">{fmtDate(o.delivery_date)}</span></div>}
                    {o.notes && <div className="col-span-2 sm:col-span-3"><span className="text-blue-300/50 text-xs">הערות</span><br /><span className="text-blue-200/70 text-xs">{o.notes}</span></div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && tab === "invoices" && (
          <div className="space-y-3">
            <h2 className="text-foreground font-medium">חשבוניות ({invoices.length})</h2>
            {invoices.length === 0 && <div className="text-center text-blue-300/50 py-12">אין חשבוניות</div>}
            {invoices.map((inv: any) => (
              <div key={inv.id} className="bg-card/40 border border-white/10 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-mono text-blue-300 text-sm">{inv.invoice_number}</div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${inv.payment_status === "paid" ? "bg-green-500/20 text-green-400" : "bg-amber-500/20 text-amber-400"}`}>
                      {inv.payment_status === "paid" ? "שולם" : "ממתין לתשלום"}
                    </span>
                    <button
                      className="btn btn-ghost btn-xs text-blue-400"
                      title="הורד חשבונית"
                      onClick={() => {
                        const url = `/api/portal/customer/invoices/${inv.id}/download`;
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `invoice-${inv.invoice_number}.pdf`;
                        a.setAttribute("data-auth", getToken());
                        fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } })
                          .then(r => r.blob())
                          .then(blob => {
                            const blobUrl = URL.createObjectURL(blob);
                            a.href = blobUrl;
                            a.click();
                            URL.revokeObjectURL(blobUrl);
                          });
                      }}
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                  <div><span className="text-blue-300/50 text-xs">תאריך</span><br /><span className="text-foreground">{fmtDate(inv.invoice_date)}</span></div>
                  <div><span className="text-blue-300/50 text-xs">לתשלום עד</span><br /><span className="text-foreground">{fmtDate(inv.due_date)}</span></div>
                  <div><span className="text-blue-300/50 text-xs">סכום</span><br /><span className="text-foreground font-medium">{fmtC(inv.total)}</span></div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && tab === "tickets" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-foreground font-medium">פניות ({tickets.length})</h2>
              <button onClick={() => setShowNewTicket(true)} className="btn btn-primary btn-sm flex items-center gap-1">
                <Plus className="w-4 h-4" />
                פנייה חדשה
              </button>
            </div>
            {tickets.length === 0 && (
              <div className="text-center py-12">
                <Ticket className="w-10 h-10 text-blue-300/20 mx-auto mb-3" />
                <p className="text-blue-300/50 text-sm">אין פניות</p>
                <button onClick={() => setShowNewTicket(true)} className="btn btn-outline btn-sm mt-3 text-blue-400 border-blue-400/30">פנייה ראשונה</button>
              </div>
            )}
            {tickets.map((t: any) => {
              const st = TICKET_STATUS_MAP[t.status] || TICKET_STATUS_MAP.open;
              const pr = TICKET_PRIORITY_MAP[t.priority] || TICKET_PRIORITY_MAP.medium;
              const StIcon = st.icon;
              return (
                <div key={t.id} className="bg-card/40 border border-white/10 rounded-xl p-4">
                  <div className="flex items-start gap-2 mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-blue-300/50 text-xs">{t.ticket_number}</span>
                        <span className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 ${st.color}`}>
                          <StIcon className="w-3 h-3" />{st.label}
                        </span>
                        <span className={`text-xs ${pr.color}`}>{pr.label}</span>
                      </div>
                      <div className="font-medium text-foreground mt-1">{t.subject}</div>
                    </div>
                  </div>
                  {t.description && <p className="text-blue-200/60 text-sm mb-2">{t.description}</p>}
                  <div className="text-xs text-blue-300/40">נפתח: {fmtDate(t.created_at)}</div>
                  {t.resolution && (
                    <div className="mt-2 bg-green-500/10 border border-green-500/20 rounded-lg p-2 text-sm text-green-300">
                      <strong>תשובה:</strong> {t.resolution}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

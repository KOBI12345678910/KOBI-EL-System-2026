import { useState, useEffect } from "react";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import {
  FileText, Package, Receipt, MessageSquare, Share2, Users, Download,
  Plug, DollarSign, ShoppingCart, Truck, Star, Zap, Crown,
  RefreshCw, AlertCircle, Globe, ArrowUpDown
} from "lucide-react";

const API = "/api";
const getHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("erp_token") || ""}`
});
const fmtC = (n: number) =>
  new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n);
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("he-IL") : "-";

const STATUS_QUOTE: Record<string, { label: string; color: string }> = {
  draft: { label: "טיוטה", color: "bg-muted/20 text-muted-foreground" },
  sent: { label: "נשלחה", color: "bg-blue-500/20 text-blue-400" },
  approved: { label: "אושרה", color: "bg-green-500/20 text-green-400" },
  rejected: { label: "נדחתה", color: "bg-red-500/20 text-red-400" },
  pending: { label: "ממתינה", color: "bg-amber-500/20 text-amber-400" },
};
const STATUS_INVOICE: Record<string, { label: string; color: string }> = {
  draft: { label: "טיוטה", color: "bg-muted/20 text-muted-foreground" },
  sent: { label: "נשלחה", color: "bg-blue-500/20 text-blue-400" },
  paid: { label: "שולמה", color: "bg-green-500/20 text-green-400" },
  overdue: { label: "באיחור", color: "bg-red-500/20 text-red-400" },
  partial: { label: "חלקי", color: "bg-amber-500/20 text-amber-400" },
};
const STATUS_ORDER: Record<string, { label: string; color: string }> = {
  pending: { label: "ממתין", color: "bg-amber-500/20 text-amber-400" },
  confirmed: { label: "אושר", color: "bg-blue-500/20 text-blue-400" },
  in_production: { label: "בייצור", color: "bg-purple-500/20 text-purple-400" },
  shipped: { label: "נשלח", color: "bg-cyan-500/20 text-cyan-400" },
  delivered: { label: "נמסר", color: "bg-green-500/20 text-green-400" },
  cancelled: { label: "בוטל", color: "bg-red-500/20 text-red-400" },
};
const STATUS_TICKET: Record<string, { label: string; color: string }> = {
  open: { label: "פתוח", color: "bg-blue-500/20 text-blue-400" },
  "in-progress": { label: "בטיפול", color: "bg-amber-500/20 text-amber-400" },
  resolved: { label: "נפתר", color: "bg-green-500/20 text-green-400" },
  closed: { label: "סגור", color: "bg-muted/20 text-muted-foreground" },
};

function StatusBadge({ status, map }: { status: string; map: Record<string, { label: string; color: string }> }) {
  const s = map[status] || { label: status, color: "bg-muted/20 text-muted-foreground" };
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${s.color}`}>{s.label}</span>;
}


const getProductionProgress: any[] = [];
export default function CustomerPortal() {
  const [activeTab, setActiveTab] = useState("quotes");
  const [quotes, setQuotes] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [isLive, setIsLive] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    let anyFailed = false;

    const safeFetch = async (url: string, fallback: any) => {
      try {
        const res = await authFetch(url, { headers: getHeaders() });
        if (!res.ok) { anyFailed = true; return fallback; }
        return await res.json();
      } catch {
        anyFailed = true;
        return fallback;
      }
    };

    const [q, inv, ord, tck, st] = await Promise.all([
      safeFetch(`${API}/sales/quotations`, []),
      safeFetch(`${API}/sales/invoices`, []),
      safeFetch(`${API}/sales/orders`, []),
      safeFetch(`${API}/sales/tickets`, []),
      safeFetch(`${API}/sales/customers/stats`, {}),
    ]);

    setQuotes(Array.isArray(q) ? q : []);
    setInvoices(Array.isArray(inv) ? inv : []);
    setOrders(Array.isArray(ord) ? ord : []);
    setTickets(Array.isArray(tck) ? tck : []);
    setStats(st || {});
    setIsLive(!anyFailed);
    setLoading(false);
    setLastRefresh(new Date());
  };

  useEffect(() => { load(); }, []);

  const kpis = [
    { label: "חשבוניות", value: invoices.length, icon: Receipt, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
    { label: "הצעות מחיר", value: quotes.length, icon: FileText, color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
    { label: "הזמנות", value: orders.length, icon: ShoppingCart, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
    { label: "תעודות משלוח", value: orders.filter((o: any) => o.status === "shipped" || o.status === "delivered").length, icon: Truck, color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20" },
    { label: "טיקטי תמיכה", value: tickets.length, icon: MessageSquare, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
    { label: "חשבוניות פתוחות", value: invoices.filter((i: any) => i.status === "sent" || i.status === "overdue").length, icon: AlertCircle, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
    { label: "לקוחות פעילים", value: stats.active_count || 0, icon: Users, color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
    { label: "הכנסה כוללת", value: fmtC(stats.total_revenue || 0), icon: DollarSign, color: "text-indigo-400", bg: "bg-indigo-500/10 border-indigo-500/20" },
  ];

  const tabs = [
    { id: "quotes", label: "הצעות מחיר", icon: FileText },
    { id: "production", label: "סטטוס ייצור", icon: Package },
    { id: "invoices", label: "חשבוניות", icon: Receipt },
    { id: "tickets", label: "טיקטי תמיכה", icon: MessageSquare },
  ];

  const sidebarItems = [
    { label: "שיתוף רשומות", icon: Share2, desc: "שתף נתונים עם לקוחות" },
    { label: "בקשות גישה", icon: Users, desc: "נהל הרשאות גישה" },
    { label: "שיתוף פעולה צוותי", icon: Star, desc: "עבודה משותפת בצוות" },
    { label: "ייבוא / ייצוא", icon: ArrowUpDown, desc: "ייבוא וייצוא נתונים" },
    { label: "חיבור API", icon: Plug, desc: "אינטגרציה עם מערכות חיצוניות" },
  ];

  return (
    <div className="min-h-screen" dir="rtl">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/30 to-purple-500/30 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
              <Globe className="w-7 h-7 text-blue-400" />
            </div>
            <div>
              <h1 className="text-lg sm:text-2xl font-bold">Customer Portal</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                ללקוחות יכולת לצפות בהצעות מחיר, הזמנות, חשבוניות וטיקטים שלהם
              </p>
              <div className="flex items-center gap-2 mt-2">
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${isLive ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
                  {isLive ? "Live Data" : "מנותק"}
                </div>
                <span className="text-xs text-muted-foreground">
                  עודכן: {lastRefresh.toLocaleTimeString("he-IL")}
                </span>
                <button onClick={load} className="text-xs text-muted-foreground hover:text-foreground transition flex items-center gap-1">
                  <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
                  רענן
                </button>
              </div>
            </div>
          </div>

          {/* Pro Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 text-amber-400 text-sm font-medium hover:from-amber-500/30 hover:to-orange-500/30 transition">
              <Crown className="w-4 h-4" />
              שדרוג ניהולי
            </button>
            <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500/20 to-blue-500/20 border border-purple-500/30 text-purple-400 text-sm font-medium hover:from-purple-500/30 hover:to-blue-500/30 transition">
              <Zap className="w-4 h-4" />
              גישה מתקדמת
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {kpis.map((k, i) => (
            <div key={i} className={`border rounded-xl p-3 text-center ${k.bg}`}>
              <k.icon className={`w-5 h-5 mx-auto mb-2 ${k.color}`} />
              <div className="text-lg font-bold leading-tight">{k.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{k.label}</div>
            </div>
          ))}
        </div>

        {/* Main Content + Sidebar */}
        <div className="flex gap-4">
          {/* Main Content */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Tabs */}
            <div className="flex gap-1 bg-muted/30 rounded-lg p-1 w-fit">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition ${
                    activeTab === tab.id
                      ? "bg-card text-foreground shadow-sm border"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Quotes Tab */}
            {activeTab === "quotes" && (
              <div className="space-y-3">
                <h2 className="text-base font-semibold">My Quotes</h2>
                {quotes.length === 0 ? (
                  <div className="border rounded-xl p-10 text-center text-muted-foreground">אין הצעות מחיר להצגה</div>
                ) : (
                  <div className="space-y-2">
                    {quotes.map((q: any) => (
                      <div key={q.id} className="border rounded-xl p-4 bg-card hover:bg-muted/20 transition">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center flex-shrink-0">
                              <FileText className="w-4 h-4 text-purple-400" />
                            </div>
                            <div>
                              <div className="font-medium text-sm">{q.quotation_number || `QT-${String(q.id).padStart(3, "0")}`}</div>
                              <div className="text-xs text-muted-foreground">{q.customer_name || "לקוח"}</div>
                              <div className="text-xs text-muted-foreground">{fmtDate(q.quotation_date || q.created_at)}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <StatusBadge status={q.status || "draft"} map={STATUS_QUOTE} />
                            <div className="text-right">
                              <div className="font-bold text-sm">{fmtC(q.total_amount || 0)}</div>
                            </div>
                            <button className="text-muted-foreground hover:text-foreground transition p-1.5 rounded-lg hover:bg-muted">
                              <Download className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Production Status Tab */}
            {activeTab === "production" && (
              <div className="space-y-3">
                <h2 className="text-base font-semibold">סטטוס ייצור הזמנות</h2>
                {orders.length === 0 ? (
                  <div className="border rounded-xl p-10 text-center text-muted-foreground">אין הזמנות להצגה</div>
                ) : (
                  <div className="space-y-2">
                    {orders.map((o: any) => (
                      <div key={o.id} className="border rounded-xl p-4 bg-card hover:bg-muted/20 transition">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                              <Package className="w-4 h-4 text-emerald-400" />
                            </div>
                            <div>
                              <div className="font-medium text-sm">{o.order_number || `SO-${String(o.id).padStart(3, "0")}`}</div>
                              <div className="text-xs text-muted-foreground">{o.customer_name || "לקוח"}</div>
                              <div className="text-xs text-muted-foreground">{fmtDate(o.order_date || o.created_at)}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <StatusBadge status={o.status || "pending"} map={STATUS_ORDER} />
                            <div className="text-right">
                              <div className="font-bold text-sm">{fmtC(o.total_amount || 0)}</div>
                            </div>
                          </div>
                        </div>
                        {/* Production Progress Bar */}
                        <div className="mt-3">
                          <div className="flex justify-between text-xs text-muted-foreground mb-1">
                            <span>התקדמות ייצור</span>
                            <span>{getProductionProgress(o.status)}%</span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-1.5">
                            <div
                              className="h-1.5 rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all"
                              style={{ width: `${getProductionProgress(o.status)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Invoices Tab */}
            {activeTab === "invoices" && (
              <div className="space-y-3">
                <h2 className="text-base font-semibold">חשבוניות</h2>
                {invoices.length === 0 ? (
                  <div className="border rounded-xl p-10 text-center text-muted-foreground">אין חשבוניות להצגה</div>
                ) : (
                  <div className="space-y-2">
                    {invoices.map((inv: any) => (
                      <div key={inv.id} className="border rounded-xl p-4 bg-card hover:bg-muted/20 transition">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
                              <Receipt className="w-4 h-4 text-blue-400" />
                            </div>
                            <div>
                              <div className="font-medium text-sm">{inv.invoice_number || `INV-${String(inv.id).padStart(3, "0")}`}</div>
                              <div className="text-xs text-muted-foreground">{inv.customer_name || "לקוח"}</div>
                              <div className="text-xs text-muted-foreground">{fmtDate(inv.invoice_date || inv.created_at)}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <StatusBadge status={inv.status || "draft"} map={STATUS_INVOICE} />
                            <div className="text-right">
                              <div className="font-bold text-sm">{fmtC(inv.total_amount || 0)}</div>
                              {inv.due_date && <div className="text-xs text-muted-foreground">לתשלום: {fmtDate(inv.due_date)}</div>}
                            </div>
                            <button className="text-muted-foreground hover:text-foreground transition p-1.5 rounded-lg hover:bg-muted">
                              <Download className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Support Tickets Tab */}
            {activeTab === "tickets" && (
              <div className="space-y-3">
                <h2 className="text-base font-semibold">טיקטי תמיכה</h2>
                {tickets.length === 0 ? (
                  <div className="border rounded-xl p-10 text-center text-muted-foreground">אין טיקטים להצגה</div>
                ) : (
                  <div className="space-y-2">
                    {tickets.map((t: any) => (
                      <div key={t.id} className="border rounded-xl p-4 bg-card hover:bg-muted/20 transition">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                              <MessageSquare className="w-4 h-4 text-amber-400" />
                            </div>
                            <div>
                              <div className="font-medium text-sm">{t.ticket_number || `TK-${String(t.id).padStart(3, "0")}`}</div>
                              <div className="text-xs text-muted-foreground">{t.subject || t.title || "טיקט תמיכה"}</div>
                              <div className="text-xs text-muted-foreground">{fmtDate(t.created_at)}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <StatusBadge status={t.status || "open"} map={STATUS_TICKET} />
                            {t.priority && (
                              <span className={`px-2 py-0.5 rounded text-xs ${
                                t.priority === "high" || t.priority === "urgent" ? "bg-red-500/20 text-red-400" :
                                t.priority === "medium" ? "bg-amber-500/20 text-amber-400" :
                                "bg-muted/20 text-muted-foreground"
                              }`}>
                                {t.priority === "high" || t.priority === "urgent" ? "דחוף" : t.priority === "medium" ? "בינוני" : "רגיל"}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Sidebar */}
          <div className="w-64 flex-shrink-0 hidden lg:block">
            <div className="border rounded-xl overflow-hidden bg-card">
              <div className="px-4 py-3 border-b bg-muted/30">
                <h3 className="text-sm font-semibold">כלי פורטל</h3>
              </div>
              <div className="divide-y">
                {sidebarItems.map((item, i) => (
                  <button
                    key={i}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition text-right"
                  >
                    <div className="w-8 h-8 rounded-lg bg-muted border flex items-center justify-center flex-shrink-0">
                      <item.icon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{item.label}</div>
                      <div className="text-xs text-muted-foreground truncate">{item.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="customer-portal" entityId="all" />
        <RelatedRecords entityType="customer-portal" entityId="all" />
      </div>
    </div>
  );
}
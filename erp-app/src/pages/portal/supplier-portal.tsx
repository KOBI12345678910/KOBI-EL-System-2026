import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";

interface PortalUser {
  id: number;
  email: string;
  fullName: string;
  userType: string;
  linkedEntityId: number | null;
}

interface PurchaseOrder {
  id: number;
  status: string;
  createdAt: string;
  data: any;
}

interface Shipment {
  id: number;
  poNumber: string;
  status: string;
  carrier: string | null;
  trackingNumber: string | null;
  estimatedDelivery: string | null;
  createdAt: string;
}

interface Document {
  id: number;
  documentName: string;
  documentType: string;
  fileUrl: string | null;
  notes: string | null;
  createdAt: string;
}

interface Message {
  id: number;
  subject: string;
  content: string | null;
  direction: string;
  status: string;
  sentBy: string | null;
  sentAt: string | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  approved: { bg: "bg-green-100", text: "text-green-700", label: "מאושר" },
  active: { bg: "bg-green-100", text: "text-green-700", label: "פעיל" },
  closed: { bg: "bg-muted/50", text: "text-muted-foreground", label: "סגורה" },
  draft: { bg: "bg-yellow-100", text: "text-yellow-700", label: "טיוטה" },
  pending: { bg: "bg-blue-100", text: "text-blue-700", label: "ממתין" },
  cancelled: { bg: "bg-red-100", text: "text-red-600", label: "בוטל" },
  open: { bg: "bg-blue-100", text: "text-blue-700", label: "פתוח" },
};

const SHIPMENT_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  "בהכנה": { bg: "bg-yellow-100", text: "text-yellow-700" },
  "נשלח": { bg: "bg-blue-100", text: "text-blue-700" },
  "התקבל": { bg: "bg-green-100", text: "text-green-700" },
  "בוטל": { bg: "bg-red-100", text: "text-red-600" },
};

const DOC_TYPE_ICONS: Record<string, string> = {
  invoice: "🧾",
  delivery_note: "📦",
  certificate: "📜",
  contract: "📋",
  other: "📄",
};

function getStatusBadge(status: string) {
  const s = STATUS_COLORS[status?.toLowerCase()] || { bg: "bg-muted/50", text: "text-muted-foreground", label: status };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function getPONumber(po: PurchaseOrder): string {
  return po.data?.po_number || po.data?.number || `PO-${String(po.id).padStart(3, "0")}`;
}

function getPOAmount(po: PurchaseOrder): string {
  const amt = po.data?.total_amount || po.data?.amount || po.data?.total || null;
  if (!amt) return "-";
  return `₪${Number(amt).toLocaleString("he-IL")}`;
}

function getPOItemCount(po: PurchaseOrder): number {
  if (Array.isArray(po.data?.items)) return po.data.items.length;
  if (po.data?.items_count) return Number(po.data.items_count);
  return 0;
}

function getPODueDate(po: PurchaseOrder): string {
  const d = po.data?.expected_delivery || po.data?.due_date || po.data?.delivery_date || null;
  if (!d) return "-";
  return new Date(d).toLocaleDateString("he-IL");
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("he-IL");
}

export default function SupplierPortalPage() {
  const [, setLocation] = useLocation();
  const [user, setUser] = useState<PortalUser | null>(null);
  const [dashboard, setDashboard] = useState<any>(null);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("orders");

  const [docForm, setDocForm] = useState({ documentName: "", documentType: "invoice", notes: "" });
  const [uploading, setUploading] = useState(false);
  const [docSuccess, setDocSuccess] = useState(false);

  const [msgForm, setMsgForm] = useState({ subject: "", content: "" });
  const [sendingMsg, setSendingMsg] = useState(false);
  const [msgSuccess, setMsgSuccess] = useState(false);

  const [confirmPO, setConfirmPO] = useState<number | null>(null);
  const [expandedPO, setExpandedPO] = useState<number | null>(null);

  const token = localStorage.getItem("portal_token");

  const logout = useCallback(() => {
    if (token) authFetch("/api/portal/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    localStorage.removeItem("portal_token");
    localStorage.removeItem("portal_user");
    setLocation("/portal/login");
  }, [token, setLocation]);

  useEffect(() => {
    if (!token) { setLocation("/portal/login"); return; }
    authFetch("/api/portal/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (data.user) setUser(data.user); else logout(); })
      .catch(() => logout());
  }, [token, setLocation, logout]);

  const loadDashboard = useCallback(() => {
    if (!token) return;
    authFetch("/api/portal/supplier/dashboard", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => setDashboard(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const loadShipments = useCallback(() => {
    if (!token) return;
    authFetch("/api/portal/supplier/shipments", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => setShipments(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [token]);

  const loadMessages = useCallback(() => {
    if (!token) return;
    authFetch("/api/portal/supplier/messages", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => setMessages(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!user) return;
    loadDashboard();
    loadShipments();
    loadMessages();
  }, [user, loadDashboard, loadShipments, loadMessages]);

  async function uploadDocument(e: React.FormEvent) {
    e.preventDefault();
    if (!docForm.documentName.trim()) return;
    setUploading(true);
    try {
      const res = await authFetch("/api/portal/supplier/documents", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(docForm),
      });
      if (res.ok) {
        setDocForm({ documentName: "", documentType: "invoice", notes: "" });
        setDocSuccess(true);
        setTimeout(() => setDocSuccess(false), 3000);
        loadDashboard();
      }
    } catch {} finally { setUploading(false); }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!msgForm.subject.trim() || !msgForm.content.trim()) return;
    setSendingMsg(true);
    try {
      const res = await authFetch("/api/portal/supplier/messages", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(msgForm),
      });
      if (res.ok) {
        setMsgForm({ subject: "", content: "" });
        setMsgSuccess(true);
        setTimeout(() => setMsgSuccess(false), 3000);
        loadMessages();
      }
    } catch {} finally { setSendingMsg(false); }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center" dir="rtl">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm">טוען פורטל ספקים...</p>
        </div>
      </div>
    );
  }

  const purchaseOrders: PurchaseOrder[] = dashboard?.purchaseOrders || [];
  const documents: Document[] = dashboard?.documents || [];
  const supplier = dashboard?.supplier;

  const tabs = [
    { id: "orders", label: "Purchase Orders", icon: "📋", count: purchaseOrders.length },
    { id: "shipments", label: "Shipments", icon: "🚚", count: shipments.length },
    { id: "documents", label: "Documents", icon: "📁", count: documents.length },
    { id: "messages", label: "Messages", icon: "💬", count: messages.length },
  ];

  return (
    <div className="min-h-screen bg-muted/30" dir="rtl" style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <header className="bg-card border-b border-border sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <h1 className="text-base font-bold text-foreground leading-tight">Supplier Portal</h1>
                <p className="text-xs text-muted-foreground leading-tight">
                  {supplier?.name || user?.fullName}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-foreground">{user?.fullName}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-sm">
              {user?.fullName?.charAt(0) || "S"}
            </div>
            <button
              onClick={logout}
              className="text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg border border-border hover:border-border transition"
            >
              התנתק
            </button>
          </div>
        </div>

        {supplier && (
          <div className="max-w-7xl mx-auto px-6 pb-1">
            <p className="text-xs text-muted-foreground">
              ספקים יכולים לאשר הזמנות, לעקוב אחר משלוחים, ולהעלות מסמכים
            </p>
          </div>
        )}
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex items-center gap-1 border-b border-border mb-6 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.count > 0 && (
                <span className={`text-xs rounded-full px-1.5 py-0.5 font-medium ${activeTab === tab.id ? "bg-blue-100 text-blue-700" : "bg-muted/50 text-muted-foreground"}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === "orders" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">My Purchase Orders</h2>
              <span className="text-sm text-muted-foreground">{purchaseOrders.length} הזמנות</span>
            </div>

            {purchaseOrders.length === 0 ? (
              <div className="bg-card rounded-xl border border-border p-12 text-center">
                <div className="text-4xl mb-3">📋</div>
                <p className="text-muted-foreground font-medium">אין הזמנות רכש</p>
                <p className="text-muted-foreground text-sm mt-1">הזמנות רכש יופיעו כאן כשיוצרו</p>
              </div>
            ) : (
              <div className="space-y-3">
                {purchaseOrders.map((po) => {
                  const poNum = getPONumber(po);
                  const amount = getPOAmount(po);
                  const itemCount = getPOItemCount(po);
                  const dueDate = getPODueDate(po);
                  const status = po.status || po.data?.status || "draft";
                  const isExpanded = expandedPO === po.id;

                  return (
                    <div key={po.id} className="bg-card rounded-xl border border-border hover:border-border transition shadow-sm">
                      <div className="p-5">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-foreground">{poNum}</span>
                                {getStatusBadge(status)}
                              </div>
                              <div className="flex items-center gap-3 mt-0.5 text-sm text-muted-foreground">
                                {itemCount > 0 && <span>{itemCount} פריטים</span>}
                                {supplier?.name && <span>• {supplier.name}</span>}
                              </div>
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-lg font-bold text-foreground">{amount}</div>
                            {dueDate !== "-" && (
                              <div className="text-xs text-muted-foreground mt-0.5">Due: {dueDate}</div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 mt-4">
                          <button
                            onClick={() => setExpandedPO(isExpanded ? null : po.id)}
                            className="px-4 py-1.5 text-sm border border-border rounded-lg text-muted-foreground hover:bg-muted/30 hover:border-border transition"
                          >
                            {isExpanded ? "סגור" : "צפה"}
                          </button>
                          {(status === "pending" || status === "draft" || status === "open") && (
                            <button
                              onClick={() => setConfirmPO(confirmPO === po.id ? null : po.id)}
                              className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
                            >
                              אשר
                            </button>
                          )}
                        </div>

                        {confirmPO === po.id && (
                          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <p className="text-sm text-blue-800 font-medium mb-2">לאשר הזמנה {poNum}?</p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setConfirmPO(null)}
                                className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                              >
                                אשר
                              </button>
                              <button
                                onClick={() => setConfirmPO(null)}
                                className="px-3 py-1 text-xs border border-border text-muted-foreground rounded-lg hover:bg-muted/50 transition"
                              >
                                בטל
                              </button>
                            </div>
                          </div>
                        )}

                        {isExpanded && (
                          <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 md:grid-cols-4 gap-3">
                            {po.data?.notes && (
                              <div className="col-span-2 md:col-span-4">
                                <span className="text-xs text-muted-foreground uppercase tracking-wide">הערות</span>
                                <p className="text-sm text-foreground mt-0.5">{po.data.notes}</p>
                              </div>
                            )}
                            <div>
                              <span className="text-xs text-muted-foreground">נוצר</span>
                              <p className="text-sm text-foreground">{formatDate(po.createdAt)}</p>
                            </div>
                            {po.data?.payment_terms && (
                              <div>
                                <span className="text-xs text-muted-foreground">תנאי תשלום</span>
                                <p className="text-sm text-foreground">{po.data.payment_terms}</p>
                              </div>
                            )}
                            {po.data?.currency && (
                              <div>
                                <span className="text-xs text-muted-foreground">מטבע</span>
                                <p className="text-sm text-foreground">{po.data.currency}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "shipments" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Shipments</h2>
              <span className="text-sm text-muted-foreground">{shipments.length} משלוחים</span>
            </div>

            {shipments.length === 0 ? (
              <div className="bg-card rounded-xl border border-border p-12 text-center">
                <div className="text-4xl mb-3">🚚</div>
                <p className="text-muted-foreground font-medium">אין משלוחים</p>
                <p className="text-muted-foreground text-sm mt-1">משלוחים יופיעו כאן לאחר יצירת הזמנות</p>
              </div>
            ) : (
              <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b border-border">
                    <tr>
                      <th className="px-5 py-3.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">מספר הזמנה</th>
                      <th className="px-5 py-3.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">סטטוס</th>
                      <th className="px-5 py-3.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">חברת שינוע</th>
                      <th className="px-5 py-3.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">מספר מעקב</th>
                      <th className="px-5 py-3.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">תאריך צפוי</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {shipments.map(shipment => {
                      const sc = SHIPMENT_STATUS_COLORS[shipment.status] || { bg: "bg-muted/50", text: "text-muted-foreground" };
                      return (
                        <tr key={shipment.id} className="hover:bg-muted/30 transition">
                          <td className="px-5 py-4 font-medium text-foreground">{shipment.poNumber}</td>
                          <td className="px-5 py-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${sc.bg} ${sc.text}`}>
                              {shipment.status}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-muted-foreground hidden md:table-cell">{shipment.carrier || "-"}</td>
                          <td className="px-5 py-4 text-muted-foreground hidden md:table-cell">{shipment.trackingNumber || "-"}</td>
                          <td className="px-5 py-4 text-muted-foreground">{formatDate(shipment.estimatedDelivery)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "documents" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Documents</h2>
              <span className="text-sm text-muted-foreground">{documents.length} מסמכים</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">מסמכים קיימים</h3>
                {documents.length === 0 ? (
                  <div className="bg-card rounded-xl border border-border p-8 text-center">
                    <div className="text-3xl mb-2">📁</div>
                    <p className="text-muted-foreground text-sm">אין מסמכים עדיין</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {documents.map(doc => (
                      <div key={doc.id} className="bg-card rounded-xl border border-border p-4 hover:border-border transition shadow-sm flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="text-2xl">{DOC_TYPE_ICONS[doc.documentType] || "📄"}</div>
                          <div>
                            <p className="font-medium text-foreground text-sm">{doc.documentName}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-muted-foreground">{doc.documentType}</span>
                              <span className="text-xs text-muted-foreground">•</span>
                              <span className="text-xs text-muted-foreground">{formatDate(doc.createdAt)}</span>
                            </div>
                            {doc.notes && <p className="text-xs text-muted-foreground mt-0.5">{doc.notes}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {doc.fileUrl ? (
                            <a
                              href={doc.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1.5 text-xs bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-500/10 transition font-medium"
                            >
                              הורד
                            </a>
                          ) : (
                            <span className="px-3 py-1.5 text-xs text-muted-foreground bg-muted/30 rounded-lg">אין קובץ</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">העלאת מסמך חדש</h3>
                <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
                  {docSuccess && (
                    <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm font-medium">
                      ✓ המסמך הועלה בהצלחה
                    </div>
                  )}
                  <form onSubmit={uploadDocument} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">שם המסמך *</label>
                      <input
                        type="text"
                        value={docForm.documentName}
                        onChange={e => setDocForm(p => ({ ...p, documentName: e.target.value }))}
                        placeholder="לדוגמה: חשבונית ינואר 2026"
                        className="w-full px-4 py-2.5 bg-card border border-border rounded-lg text-foreground text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">סוג מסמך</label>
                      <select
                        value={docForm.documentType}
                        onChange={e => setDocForm(p => ({ ...p, documentType: e.target.value }))}
                        className="w-full px-4 py-2.5 bg-card border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                      >
                        <option value="invoice">🧾 חשבונית</option>
                        <option value="delivery_note">📦 תעודת משלוח</option>
                        <option value="certificate">📜 תעודה</option>
                        <option value="contract">📋 חוזה</option>
                        <option value="other">📄 אחר</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">הערות</label>
                      <textarea
                        value={docForm.notes}
                        onChange={e => setDocForm(p => ({ ...p, notes: e.target.value }))}
                        rows={3}
                        placeholder="הערות נוספות..."
                        className="w-full px-4 py-2.5 bg-card border border-border rounded-lg text-foreground text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition resize-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={uploading || !docForm.documentName.trim()}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {uploading ? "מעלה..." : "העלה מסמך"}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "messages" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Messages</h2>
              <span className="text-sm text-muted-foreground">{messages.length} הודעות</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">היסטוריית הודעות</h3>
                {messages.length === 0 ? (
                  <div className="bg-card rounded-xl border border-border p-8 text-center">
                    <div className="text-3xl mb-2">💬</div>
                    <p className="text-muted-foreground text-sm">אין הודעות עדיין</p>
                    <p className="text-muted-foreground text-xs mt-1">שלח הודעה לצוות הרכש</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {messages.map(msg => (
                      <div
                        key={msg.id}
                        className={`rounded-xl border p-4 shadow-sm ${
                          msg.direction === "incoming"
                            ? "bg-blue-50 border-blue-200"
                            : "bg-card border-border"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-foreground text-sm">{msg.subject}</p>
                            {msg.content && (
                              <p className="text-muted-foreground text-sm mt-1">{msg.content}</p>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              msg.direction === "incoming"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-muted/50 text-muted-foreground"
                            }`}>
                              {msg.direction === "incoming" ? "ממני" : "מהצוות"}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                          {msg.sentBy && <span>{msg.sentBy}</span>}
                          <span>•</span>
                          <span>{formatDate(msg.createdAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">שלח הודעה חדשה</h3>
                <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
                  {msgSuccess && (
                    <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm font-medium">
                      ✓ ההודעה נשלחה בהצלחה
                    </div>
                  )}
                  <form onSubmit={sendMessage} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">נושא *</label>
                      <input
                        type="text"
                        value={msgForm.subject}
                        onChange={e => setMsgForm(p => ({ ...p, subject: e.target.value }))}
                        placeholder="לדוגמה: שאלה על הזמנה PO-001"
                        className="w-full px-4 py-2.5 bg-card border border-border rounded-lg text-foreground text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">תוכן ההודעה *</label>
                      <textarea
                        value={msgForm.content}
                        onChange={e => setMsgForm(p => ({ ...p, content: e.target.value }))}
                        rows={5}
                        placeholder="כתוב את ההודעה שלך כאן..."
                        className="w-full px-4 py-2.5 bg-card border border-border rounded-lg text-foreground text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition resize-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={sendingMsg || !msgForm.subject.trim() || !msgForm.content.trim()}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sendingMsg ? "שולח..." : "שלח הודעה"}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        )}

        <ActivityLog entityType="supplier-portal" compact />
      </div>
    </div>
  );
}

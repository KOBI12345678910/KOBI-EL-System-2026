import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

interface PortalUser {
  id: number;
  email: string;
  fullName: string;
  userType: string;
  linkedEntityId: number | null;
}

interface PurchaseOrder {
  id: number;
  orderNumber?: string;
  status: string;
  createdAt: string;
  expectedDelivery?: string | null;
  totalAmount?: string | null;
  currency?: string;
  notes?: string | null;
  data?: any;
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
  expiryDate?: string | null;
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
  "בהמתנה": { bg: "bg-yellow-100", text: "text-yellow-700", label: "בהמתנה" },
  "אושר": { bg: "bg-green-100", text: "text-green-700", label: "אושר" },
  "התקבל": { bg: "bg-green-100", text: "text-green-700", label: "התקבל" },
  "נשלח": { bg: "bg-blue-100", text: "text-blue-700", label: "נשלח" },
  "טיוטה": { bg: "bg-yellow-100", text: "text-yellow-700", label: "טיוטה" },
  "בוטל": { bg: "bg-red-100", text: "text-red-600", label: "בוטל" },
};

const DOC_TYPE_ICONS: Record<string, string> = {
  invoice: "🧾",
  delivery_note: "📦",
  certificate: "📜",
  contract: "📋",
  other: "📄",
};

function getStatusBadge(status: string) {
  const s = STATUS_COLORS[status?.toLowerCase()] || STATUS_COLORS[status] || { bg: "bg-muted/50", text: "text-muted-foreground", label: status };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      {s.label || status}
    </span>
  );
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("he-IL");
}

function formatAmount(amount: string | null | undefined, currency?: string) {
  if (!amount) return "-";
  const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : "₪";
  return `${sym}${Number(amount).toLocaleString("he-IL")}`;
}

export default function SupplierPortalPage() {
  const [, setLocation] = useLocation();
  const [user, setUser] = useState<PortalUser | null>(null);
  const [dashboard, setDashboard] = useState<any>(null);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [certifications, setCertifications] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("orders");

  const [docForm, setDocForm] = useState({ documentName: "", documentType: "invoice", notes: "" });
  const [uploading, setUploading] = useState(false);
  const [docSuccess, setDocSuccess] = useState(false);

  const [invoiceForm, setInvoiceForm] = useState({ invoiceNumber: "", amount: "", currency: "ILS", dueDate: "", poId: "", notes: "", fileUrl: "" });
  const [submittingInvoice, setSubmittingInvoice] = useState(false);
  const [invoiceSuccess, setInvoiceSuccess] = useState(false);
  const [invoiceError, setInvoiceError] = useState("");
  const invoiceValidation = useFormValidation<typeof invoiceForm>({
    invoiceNumber: { required: true, message: "מספר חשבונית חובה" },
    amount: { required: true, message: "סכום חובה" },
  });
  const [invoiceFileUploading, setInvoiceFileUploading] = useState(false);
  const [invoiceFileName, setInvoiceFileName] = useState("");
  const invoiceFileInputRef = useRef<HTMLInputElement>(null);

  const [deliveryForm, setDeliveryForm] = useState({ poId: "", newEta: "", status: "", trackingNumber: "", notes: "" });
  const [submittingDelivery, setSubmittingDelivery] = useState(false);
  const [deliverySuccess, setDeliverySuccess] = useState(false);
  const [deliveryError, setDeliveryError] = useState("");

  const [certForm, setCertForm] = useState({ certificationName: "", certificationNumber: "", expiryDate: "", issuingBody: "", fileUrl: "", notes: "" });
  const [submittingCert, setSubmittingCert] = useState(false);
  const [certSuccess, setCertSuccess] = useState(false);
  const [certError, setCertError] = useState("");
  const [certFileUploading, setCertFileUploading] = useState(false);
  const [certFileName, setCertFileName] = useState("");
  const certFileInputRef = useRef<HTMLInputElement>(null);

  const [msgForm, setMsgForm] = useState({ subject: "", content: "" });
  const [sendingMsg, setSendingMsg] = useState(false);
  const [msgSuccess, setMsgSuccess] = useState(false);

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

  const loadOrders = useCallback(() => {
    if (!token) return;
    authFetch("/api/portal/supplier/purchase-orders", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => setPurchaseOrders(Array.isArray(data) ? data : []))
      .catch(() => {});
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

  const loadCertifications = useCallback(() => {
    if (!token) return;
    authFetch("/api/portal/supplier/certifications", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => setCertifications(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!user) return;
    loadDashboard();
    loadOrders();
    loadShipments();
    loadMessages();
    loadCertifications();
  }, [user, loadDashboard, loadOrders, loadShipments, loadMessages, loadCertifications]);

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

  async function handleInvoiceFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setInvoiceFileUploading(true);
    setInvoiceError("");
    try {
      const urlRes = await authFetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlRes.ok) throw new Error("שגיאה בקבלת URL להעלאה");
      const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };
      const putRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!putRes.ok) throw new Error("שגיאה בהעלאת הקובץ");
      setInvoiceForm(f => ({ ...f, fileUrl: `/api/storage${objectPath}` }));
      setInvoiceFileName(file.name);
    } catch (err: unknown) {
      setInvoiceError(err instanceof Error ? err.message : "שגיאה בהעלאת קובץ");
    } finally {
      setInvoiceFileUploading(false);
    }
  }

  async function submitInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (!invoiceValidation.validate(invoiceForm)) return;
    setSubmittingInvoice(true);
    setInvoiceError("");
    try {
      const res = await authFetch("/api/portal/supplier/invoices", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(invoiceForm),
      });
      const data = await res.json();
      if (res.ok) {
        setInvoiceForm({ invoiceNumber: "", amount: "", currency: "ILS", dueDate: "", poId: "", notes: "", fileUrl: "" });
        setInvoiceFileName("");
        setInvoiceSuccess(true);
        setTimeout(() => setInvoiceSuccess(false), 4000);
        loadDashboard();
      } else {
        setInvoiceError(data.error || "שגיאה בהגשת חשבונית");
      }
    } catch { setInvoiceError("שגיאת רשת"); } finally { setSubmittingInvoice(false); }
  }

  async function submitDeliveryUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!deliveryForm.poId) return;
    setSubmittingDelivery(true);
    setDeliveryError("");
    try {
      const res = await authFetch("/api/portal/supplier/delivery-update", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(deliveryForm),
      });
      const data = await res.json();
      if (res.ok) {
        setDeliveryForm({ poId: "", newEta: "", status: "", trackingNumber: "", notes: "" });
        setDeliverySuccess(true);
        setTimeout(() => setDeliverySuccess(false), 4000);
        loadOrders();
      } else {
        setDeliveryError(data.error || "שגיאה בעדכון אספקה");
      }
    } catch { setDeliveryError("שגיאת רשת"); } finally { setSubmittingDelivery(false); }
  }

  async function handleCertFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCertFileUploading(true);
    setCertError("");
    try {
      const urlRes = await authFetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlRes.ok) throw new Error("שגיאה בקבלת URL להעלאה");
      const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };
      const putRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!putRes.ok) throw new Error("שגיאה בהעלאת הקובץ");
      setCertForm(f => ({ ...f, fileUrl: `/api/storage${objectPath}` }));
      setCertFileName(file.name);
    } catch (err: unknown) {
      setCertError(err instanceof Error ? err.message : "שגיאה בהעלאת קובץ");
    } finally {
      setCertFileUploading(false);
    }
  }

  async function submitCertification(e: React.FormEvent) {
    e.preventDefault();
    if (!certForm.certificationName.trim()) return;
    setSubmittingCert(true);
    setCertError("");
    try {
      const res = await authFetch("/api/portal/supplier/certifications", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(certForm),
      });
      const data = await res.json();
      if (res.ok) {
        setCertForm({ certificationName: "", certificationNumber: "", expiryDate: "", issuingBody: "", fileUrl: "", notes: "" });
        setCertFileName("");
        setCertSuccess(true);
        setTimeout(() => setCertSuccess(false), 4000);
        loadCertifications();
      } else {
        setCertError(data.error || "שגיאה בהגשת תעודה");
      }
    } catch { setCertError("שגיאת רשת"); } finally { setSubmittingCert(false); }
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

  const documents: Document[] = dashboard?.documents || [];
  const supplier = dashboard?.supplier;

  const tabs = [
    { id: "orders", label: "הזמנות רכש", icon: "📋", count: purchaseOrders.length },
    { id: "invoices", label: "הגשת חשבוניות", icon: "🧾", count: 0 },
    { id: "delivery", label: "עדכוני אספקה", icon: "🚚", count: shipments.length },
    { id: "certifications", label: "תעודות", icon: "📜", count: certifications.length },
    { id: "documents", label: "מסמכים", icon: "📁", count: documents.length },
    { id: "messages", label: "הודעות", icon: "💬", count: messages.length },
  ];

  const inputClass = "w-full px-4 py-2.5 bg-card border border-border rounded-lg text-foreground text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition";
  const labelClass = "block text-sm font-medium text-foreground mb-1.5";

  return (
    <div className="min-h-screen bg-muted/30" dir="rtl" style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <header className="bg-card border-b border-border sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
                <svg className="w-5 h-5 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <h1 className="text-base font-bold text-foreground leading-tight">פורטל ספקים</h1>
                <p className="text-xs text-muted-foreground leading-tight">{supplier?.name || user?.fullName}</p>
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
            <button onClick={logout} className="text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg border border-border hover:border-border transition">
              התנתק
            </button>
          </div>
        </div>
        {supplier && (
          <div className="max-w-7xl mx-auto px-6 pb-1">
            <p className="text-xs text-muted-foreground">ספקים יכולים לאשר הזמנות, להגיש חשבוניות, לעדכן תאריכי אספקה ולהעלות תעודות</p>
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
              <h2 className="text-lg font-semibold text-foreground">הזמנות הרכש שלי</h2>
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
                {purchaseOrders.map((po) => (
                  <div key={po.id} className="bg-card rounded-xl border border-border p-5 shadow-sm hover:border-border/70 transition">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-sm font-semibold text-foreground">{po.orderNumber || `PO-${String(po.id).padStart(4,"0")}`}</span>
                          {getStatusBadge(po.status)}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                          <span>תאריך: {formatDate(po.createdAt)}</span>
                          {po.expectedDelivery && <span>אספקה משוערת: {formatDate(po.expectedDelivery)}</span>}
                          {po.totalAmount && <span className="font-medium text-foreground">{formatAmount(po.totalAmount, po.currency)}</span>}
                        </div>
                        {po.notes && <p className="text-xs text-muted-foreground mt-1">{po.notes}</p>}
                      </div>
                      <button
                        onClick={() => { setDeliveryForm(f => ({ ...f, poId: String(po.id) })); setActiveTab("delivery"); }}
                        className="px-3 py-1.5 text-xs bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-500/10 transition font-medium"
                      >
                        עדכן אספקה
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "invoices" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-4">הגשת חשבונית חדשה</h2>
              <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
                {invoiceSuccess && (
                  <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm font-medium">✓ החשבונית הוגשה בהצלחה</div>
                )}
                {invoiceError && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{invoiceError}</div>
                )}
                <form onSubmit={submitInvoice} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>מספר חשבונית <RequiredMark /></label>
                      <input type="text" value={invoiceForm.invoiceNumber} onChange={e => setInvoiceForm(f => ({ ...f, invoiceNumber: e.target.value }))} placeholder="INV-2026-001" className={`${inputClass} ${invoiceValidation.errors.invoiceNumber ? "border-red-500" : ""}`} />
                      <FormFieldError error={invoiceValidation.errors.invoiceNumber} />
                    </div>
                    <div>
                      <label className={labelClass}>סכום <RequiredMark /></label>
                      <input type="number" step="0.01" value={invoiceForm.amount} onChange={e => setInvoiceForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" className={`${inputClass} ${invoiceValidation.errors.amount ? "border-red-500" : ""}`} />
                      <FormFieldError error={invoiceValidation.errors.amount} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>מטבע</label>
                      <select value={invoiceForm.currency} onChange={e => setInvoiceForm(f => ({ ...f, currency: e.target.value }))} className={inputClass}>
                        <option value="ILS">₪ שקל (ILS)</option>
                        <option value="USD">$ דולר (USD)</option>
                        <option value="EUR">€ יורו (EUR)</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>תאריך פירעון</label>
                      <input type="date" value={invoiceForm.dueDate} onChange={e => setInvoiceForm(f => ({ ...f, dueDate: e.target.value }))} className={inputClass} />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>מזהה הזמנת רכש (PO)</label>
                    <select value={invoiceForm.poId} onChange={e => setInvoiceForm(f => ({ ...f, poId: e.target.value }))} className={inputClass}>
                      <option value="">בחר הזמנה (אופציונלי)</option>
                      {purchaseOrders.map(po => (
                        <option key={po.id} value={String(po.id)}>{po.orderNumber || `PO-${String(po.id).padStart(4,"0")}`}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>הערות</label>
                    <textarea value={invoiceForm.notes} onChange={e => setInvoiceForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="פרטים נוספים לגבי החשבונית..." className={`${inputClass} resize-none`} />
                  </div>
                  <div>
                    <label className={labelClass}>קובץ חשבונית (PDF / תמונה)</label>
                    <input
                      ref={invoiceFileInputRef}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.tiff,.webp"
                      className="hidden"
                      onChange={handleInvoiceFileChange}
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => invoiceFileInputRef.current?.click()}
                        disabled={invoiceFileUploading}
                        className="px-3 py-2 border border-border rounded-lg text-sm text-foreground hover:bg-muted/30 transition disabled:opacity-50"
                      >
                        {invoiceFileUploading ? "מעלה..." : "בחר קובץ"}
                      </button>
                      {invoiceFileName ? (
                        <span className="text-sm text-green-600">✓ {invoiceFileName}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">לא נבחר קובץ (אופציונלי)</span>
                      )}
                    </div>
                  </div>
                  <button type="submit" disabled={submittingInvoice || invoiceFileUploading || !invoiceForm.invoiceNumber.trim() || !invoiceForm.amount} className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-foreground rounded-lg text-sm font-medium transition disabled:opacity-50">
                    {submittingInvoice ? "מגיש..." : "הגש חשבונית"}
                  </button>
                </form>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">חשבוניות שהוגשו</h3>
              {documents.filter(d => d.documentType === "invoice").length === 0 ? (
                <div className="bg-card rounded-xl border border-border p-8 text-center">
                  <div className="text-3xl mb-2">🧾</div>
                  <p className="text-muted-foreground text-sm">אין חשבוניות שהוגשו עדיין</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.filter(d => d.documentType === "invoice").map(doc => (
                    <div key={doc.id} className="bg-card rounded-xl border border-border p-4">
                      <div className="font-medium text-sm text-foreground">{doc.documentName}</div>
                      <div className="text-xs text-muted-foreground mt-1">{formatDate(doc.createdAt)}</div>
                      {doc.notes && <div className="text-xs text-muted-foreground mt-0.5">{doc.notes}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "delivery" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-4">עדכון תאריך אספקה (ETA)</h2>
              <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
                {deliverySuccess && (
                  <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm font-medium">✓ עדכון האספקה נשמר בהצלחה</div>
                )}
                {deliveryError && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{deliveryError}</div>
                )}
                <form onSubmit={submitDeliveryUpdate} className="space-y-4">
                  <div>
                    <label className={labelClass}>הזמנת רכש *</label>
                    <select value={deliveryForm.poId} onChange={e => setDeliveryForm(f => ({ ...f, poId: e.target.value }))} className={inputClass} required>
                      <option value="">בחר הזמנה</option>
                      {purchaseOrders.map(po => (
                        <option key={po.id} value={String(po.id)}>{po.orderNumber || `PO-${String(po.id).padStart(4,"0")}`} ({po.status})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>תאריך אספקה חדש (ETA)</label>
                    <input type="date" value={deliveryForm.newEta} onChange={e => setDeliveryForm(f => ({ ...f, newEta: e.target.value }))} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>סטטוס משלוח</label>
                    <select value={deliveryForm.status} onChange={e => setDeliveryForm(f => ({ ...f, status: e.target.value }))} className={inputClass}>
                      <option value="">בחר סטטוס (אופציונלי)</option>
                      <option value="בהכנה">בהכנה</option>
                      <option value="נשלח">נשלח</option>
                      <option value="בדרך">בדרך</option>
                      <option value="עיכוב">עיכוב</option>
                      <option value="בשגר">בשגר</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>מספר מעקב (Tracking)</label>
                    <input type="text" value={deliveryForm.trackingNumber} onChange={e => setDeliveryForm(f => ({ ...f, trackingNumber: e.target.value }))} placeholder="מספר מעקב לשגרה" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>הערות</label>
                    <textarea value={deliveryForm.notes} onChange={e => setDeliveryForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="הסבר לגבי שינוי מועד האספקה..." className={`${inputClass} resize-none`} />
                  </div>
                  <button type="submit" disabled={submittingDelivery || !deliveryForm.poId} className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-foreground rounded-lg text-sm font-medium transition disabled:opacity-50">
                    {submittingDelivery ? "שומר..." : "שמור עדכון אספקה"}
                  </button>
                </form>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">הזמנות פעילות</h3>
              {purchaseOrders.filter(p => !["cancelled","בוטל","closed"].includes(p.status)).length === 0 ? (
                <div className="bg-card rounded-xl border border-border p-8 text-center">
                  <div className="text-3xl mb-2">🚚</div>
                  <p className="text-muted-foreground text-sm">אין הזמנות פעילות</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {purchaseOrders.filter(p => !["cancelled","בוטל","closed"].includes(p.status)).map(po => (
                    <div key={po.id} className="bg-card rounded-xl border border-border p-4 cursor-pointer hover:border-border/70 transition" onClick={() => setDeliveryForm(f => ({ ...f, poId: String(po.id) }))}>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm font-semibold">{po.orderNumber || `PO-${String(po.id).padStart(4,"0")}`}</span>
                        {getStatusBadge(po.status)}
                      </div>
                      {po.expectedDelivery && (
                        <div className="text-xs text-muted-foreground mt-1">ETA נוכחי: {formatDate(po.expectedDelivery)}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "certifications" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-4">הגשת תעודה / הסמכה</h2>
              <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
                {certSuccess && (
                  <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm font-medium">✓ התעודה הוגשה בהצלחה</div>
                )}
                {certError && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{certError}</div>
                )}
                <form onSubmit={submitCertification} className="space-y-4">
                  <div>
                    <label className={labelClass}>שם התעודה / הסמכה *</label>
                    <input type="text" value={certForm.certificationName} onChange={e => setCertForm(f => ({ ...f, certificationName: e.target.value }))} placeholder="לדוגמה: ISO 9001:2015" className={inputClass} required />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>מספר תעודה</label>
                      <input type="text" value={certForm.certificationNumber} onChange={e => setCertForm(f => ({ ...f, certificationNumber: e.target.value }))} placeholder="CERT-12345" className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>תאריך פקיעה</label>
                      <input type="date" value={certForm.expiryDate} onChange={e => setCertForm(f => ({ ...f, expiryDate: e.target.value }))} className={inputClass} />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>גוף מנפיק</label>
                    <input type="text" value={certForm.issuingBody} onChange={e => setCertForm(f => ({ ...f, issuingBody: e.target.value }))} placeholder="לדוגמה: ISO International" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>קובץ תעודה (PDF / תמונה)</label>
                    <input
                      ref={certFileInputRef}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.tiff,.webp"
                      className="hidden"
                      onChange={handleCertFileChange}
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => certFileInputRef.current?.click()}
                        disabled={certFileUploading}
                        className="px-3 py-2 border border-border rounded-lg text-sm text-foreground hover:bg-muted/30 transition disabled:opacity-50"
                      >
                        {certFileUploading ? "מעלה..." : "בחר קובץ"}
                      </button>
                      {certFileName ? (
                        <span className="text-sm text-green-600">✓ {certFileName}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">לא נבחר קובץ (אופציונלי)</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>הערות</label>
                    <textarea value={certForm.notes} onChange={e => setCertForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="פרטים נוספים..." className={`${inputClass} resize-none`} />
                  </div>
                  <button type="submit" disabled={submittingCert || certFileUploading || !certForm.certificationName.trim()} className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-foreground rounded-lg text-sm font-medium transition disabled:opacity-50">
                    {submittingCert ? "מגיש..." : "הגש תעודה"}
                  </button>
                </form>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">תעודות קיימות ({certifications.length})</h3>
              {certifications.length === 0 ? (
                <div className="bg-card rounded-xl border border-border p-8 text-center">
                  <div className="text-3xl mb-2">📜</div>
                  <p className="text-muted-foreground text-sm">לא הוגשו תעודות עדיין</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {certifications.map(cert => {
                    const expired = cert.expiryDate && new Date(cert.expiryDate) < new Date();
                    const expiringSoon = cert.expiryDate && !expired && (new Date(cert.expiryDate).getTime() - Date.now()) < 30 * 86400000;
                    return (
                      <div key={cert.id} className={`bg-card rounded-xl border p-4 ${expired ? "border-red-500/30" : expiringSoon ? "border-yellow-500/30" : "border-border"}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-medium text-sm text-foreground">📜 {cert.documentName}</div>
                            {cert.expiryDate && (
                              <div className={`text-xs mt-0.5 ${expired ? "text-red-500" : expiringSoon ? "text-yellow-500" : "text-muted-foreground"}`}>
                                {expired ? "⚠ פג תוקף: " : expiringSoon ? "⚡ עומד לפוג: " : "תוקף עד: "}
                                {formatDate(cert.expiryDate)}
                              </div>
                            )}
                            {cert.notes && <div className="text-xs text-muted-foreground mt-0.5">{cert.notes}</div>}
                          </div>
                          {cert.fileUrl && (
                            <a href={cert.fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline shrink-0">הורד</a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "documents" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">מסמכים</h2>
              <span className="text-sm text-muted-foreground">{documents.length} מסמכים</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">רשימת מסמכים</h3>
                {documents.length === 0 ? (
                  <div className="bg-card rounded-xl border border-border p-8 text-center">
                    <div className="text-3xl mb-2">📁</div>
                    <p className="text-muted-foreground text-sm">אין מסמכים עדיין</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {documents.map(doc => (
                      <div key={doc.id} className="bg-card rounded-xl border border-border p-4 flex items-center justify-between gap-3">
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
                            <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 text-xs bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-500/10 transition font-medium">הורד</a>
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
                    <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm font-medium">✓ המסמך הועלה בהצלחה</div>
                  )}
                  <form onSubmit={uploadDocument} className="space-y-4">
                    <div>
                      <label className={labelClass}>שם המסמך *</label>
                      <input type="text" value={docForm.documentName} onChange={e => setDocForm(p => ({ ...p, documentName: e.target.value }))} placeholder="לדוגמה: חשבונית ינואר 2026" className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>סוג מסמך</label>
                      <select value={docForm.documentType} onChange={e => setDocForm(p => ({ ...p, documentType: e.target.value }))} className={inputClass}>
                        <option value="invoice">🧾 חשבונית</option>
                        <option value="delivery_note">📦 תעודת משלוח</option>
                        <option value="certificate">📜 תעודה</option>
                        <option value="contract">📋 חוזה</option>
                        <option value="other">📄 אחר</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>הערות</label>
                      <textarea value={docForm.notes} onChange={e => setDocForm(p => ({ ...p, notes: e.target.value }))} rows={3} placeholder="הערות נוספות..." className={`${inputClass} resize-none`} />
                    </div>
                    <button type="submit" disabled={uploading || !docForm.documentName.trim()} className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-foreground rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed">
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
              <h2 className="text-lg font-semibold text-foreground">הודעות</h2>
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
                      <div key={msg.id} className={`rounded-xl border p-4 shadow-sm ${msg.direction === "incoming" ? "bg-blue-50 border-blue-200" : "bg-card border-border"}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-foreground text-sm">{msg.subject}</p>
                            {msg.content && <p className="text-muted-foreground text-sm mt-1">{msg.content}</p>}
                          </div>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${msg.direction === "incoming" ? "bg-blue-100 text-blue-700" : "bg-muted/50 text-muted-foreground"}`}>
                            {msg.direction === "incoming" ? "ממני" : "מהצוות"}
                          </span>
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
                    <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm font-medium">✓ ההודעה נשלחה בהצלחה</div>
                  )}
                  <form onSubmit={sendMessage} className="space-y-4">
                    <div>
                      <label className={labelClass}>נושא *</label>
                      <input type="text" value={msgForm.subject} onChange={e => setMsgForm(p => ({ ...p, subject: e.target.value }))} placeholder="לדוגמה: שאלה על הזמנה PO-001" className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>תוכן ההודעה *</label>
                      <textarea value={msgForm.content} onChange={e => setMsgForm(p => ({ ...p, content: e.target.value }))} rows={5} placeholder="כתוב את ההודעה שלך כאן..." className={`${inputClass} resize-none`} />
                    </div>
                    <button type="submit" disabled={sendingMsg || !msgForm.subject.trim() || !msgForm.content.trim()} className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-foreground rounded-lg text-sm font-medium transition disabled:opacity-50">
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

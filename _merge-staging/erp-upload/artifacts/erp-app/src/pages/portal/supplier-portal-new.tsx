import { useState, useEffect, useCallback } from "react";

/* ─── Types ──────────────────────────────────────────────────────────────────── */
interface DashboardData {
  supplier: { name: string; email: string; categories: string[] };
  stats: { total_pos: number; total_documents: number; pending_confirmations: number };
  recent_pos: POConfirmation[];
  recent_documents: SupplierDoc[];
}
interface POConfirmation {
  id: number; po_number: string; items: any[]; total_amount: number;
  status: string; confirmed_delivery_date: string | null; notes: string | null;
  confirmed_at: string | null; created_at: string;
}
interface SupplierDoc {
  id: number; document_type: string; title: string; file_url: string;
  uploaded_at: string; status: string;
}
interface PaymentData {
  orders: POConfirmation[];
  summary: { total_confirmed: number; total_pending: number; total_orders: number };
}

const API = "/api";

const PO_STATUS_MAP: Record<string, { label: string; bg: string; text: string }> = {
  pending: { label: "ממתין לאישור", bg: "bg-yellow-100", text: "text-yellow-700" },
  confirmed: { label: "מאושר", bg: "bg-green-100", text: "text-green-700" },
  partially_confirmed: { label: "אושר חלקית", bg: "bg-orange-100", text: "text-orange-700" },
  rejected: { label: "נדחה", bg: "bg-red-100", text: "text-red-600" },
};

const DOC_STATUS_MAP: Record<string, { label: string; bg: string; text: string }> = {
  pending_review: { label: "ממתין לבדיקה", bg: "bg-yellow-100", text: "text-yellow-700" },
  approved: { label: "מאושר", bg: "bg-green-100", text: "text-green-700" },
  rejected: { label: "נדחה", bg: "bg-red-100", text: "text-red-600" },
};

/* ─── Component ──────────────────────────────────────────────────────────────── */
export default function SupplierPortalPage() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("portal_supplier_token"));
  const [tab, setTab] = useState("dashboard");
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [registerForm, setRegisterForm] = useState({ supplier_name: "", email: "", phone: "", password: "" });
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [orders, setOrders] = useState<POConfirmation[]>([]);
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ po: POConfirmation; status: string; delivery_date: string; notes: string } | null>(null);
  const [uploadForm, setUploadForm] = useState({ document_type: "invoice", title: "", file_url: "" });
  const [issueForm, setIssueForm] = useState({ po_id: "", issue_type: "", description: "" });

  const authFetch = useCallback(async (url: string, opts?: RequestInit) => {
    const res = await fetch(url, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers || {}) },
    });
    if (res.status === 401) { setToken(null); localStorage.removeItem("portal_supplier_token"); }
    return res;
  }, [token]);

  const handleLogin = async () => {
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${API}/supplier-portal/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setToken(data.token); localStorage.setItem("portal_supplier_token", data.token);
    } catch { setError("שגיאת חיבור"); } finally { setLoading(false); }
  };

  const handleRegister = async () => {
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${API}/supplier-portal/register`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registerForm),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setIsRegistering(false); setLoginForm({ email: registerForm.email, password: registerForm.password });
    } catch { setError("שגיאת חיבור"); } finally { setLoading(false); }
  };

  const loadDashboard = useCallback(async () => {
    const res = await authFetch(`${API}/supplier-portal/dashboard`);
    if (res.ok) setDashboard(await res.json());
  }, [authFetch]);

  const loadOrders = useCallback(async () => {
    const res = await authFetch(`${API}/supplier-portal/my-orders`);
    if (res.ok) setOrders(await res.json());
  }, [authFetch]);

  const loadPayments = useCallback(async () => {
    const res = await authFetch(`${API}/supplier-portal/payment-status`);
    if (res.ok) setPaymentData(await res.json());
  }, [authFetch]);

  useEffect(() => { if (token) loadDashboard(); }, [token, loadDashboard]);
  useEffect(() => {
    if (token && tab === "orders") loadOrders();
    if (token && tab === "payments") loadPayments();
  }, [token, tab, loadOrders, loadPayments]);

  const confirmPO = async () => {
    if (!confirmModal) return;
    await authFetch(`${API}/supplier-portal/confirm-po/${confirmModal.po.id}`, {
      method: "POST",
      body: JSON.stringify({ status: confirmModal.status, confirmed_delivery_date: confirmModal.delivery_date, notes: confirmModal.notes }),
    });
    setConfirmModal(null); loadOrders(); loadDashboard();
  };

  const uploadDocument = async () => {
    if (!uploadForm.file_url) return;
    await authFetch(`${API}/supplier-portal/upload-document`, {
      method: "POST", body: JSON.stringify(uploadForm),
    });
    setUploadForm({ document_type: "invoice", title: "", file_url: "" }); loadDashboard();
  };

  const reportIssue = async () => {
    if (!issueForm.description) return;
    await authFetch(`${API}/supplier-portal/report-issue`, {
      method: "POST", body: JSON.stringify(issueForm),
    });
    setIssueForm({ po_id: "", issue_type: "", description: "" }); setTab("dashboard");
  };

  const logout = () => { setToken(null); localStorage.removeItem("portal_supplier_token"); };

  /* ─── Login Screen ───────────────────────────────────────────────────────── */
  if (!token) {
    return (
      <div dir="rtl" className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
          <div className="text-center mb-6">
            <div className="text-4xl mb-2">📦</div>
            <h1 className="text-2xl font-bold text-gray-800">פורטל ספקים</h1>
            <p className="text-gray-500 text-sm">TechnoKoluzi ERP</p>
          </div>
          {error && <div className="bg-red-50 text-red-600 rounded-lg p-3 mb-4 text-sm">{error}</div>}
          {!isRegistering ? (
            <>
              <input className="w-full border rounded-lg p-3 mb-3 text-right" type="email" placeholder="אימייל"
                value={loginForm.email} onChange={e => setLoginForm({ ...loginForm, email: e.target.value })} />
              <input className="w-full border rounded-lg p-3 mb-4 text-right" type="password" placeholder="סיסמה"
                value={loginForm.password} onChange={e => setLoginForm({ ...loginForm, password: e.target.value })} />
              <button onClick={handleLogin} disabled={loading}
                className="w-full bg-emerald-600 text-white rounded-lg p-3 font-medium hover:bg-emerald-700 disabled:opacity-50">
                {loading ? "מתחבר..." : "כניסה"}
              </button>
              <button onClick={() => setIsRegistering(true)} className="w-full text-emerald-600 mt-3 text-sm hover:underline">
                ספק חדש? הירשם כאן
              </button>
            </>
          ) : (
            <>
              <input className="w-full border rounded-lg p-3 mb-3 text-right" placeholder="שם הספק"
                value={registerForm.supplier_name} onChange={e => setRegisterForm({ ...registerForm, supplier_name: e.target.value })} />
              <input className="w-full border rounded-lg p-3 mb-3 text-right" type="email" placeholder="אימייל"
                value={registerForm.email} onChange={e => setRegisterForm({ ...registerForm, email: e.target.value })} />
              <input className="w-full border rounded-lg p-3 mb-3 text-right" placeholder="טלפון"
                value={registerForm.phone} onChange={e => setRegisterForm({ ...registerForm, phone: e.target.value })} />
              <input className="w-full border rounded-lg p-3 mb-4 text-right" type="password" placeholder="סיסמה"
                value={registerForm.password} onChange={e => setRegisterForm({ ...registerForm, password: e.target.value })} />
              <button onClick={handleRegister} disabled={loading}
                className="w-full bg-teal-600 text-white rounded-lg p-3 font-medium hover:bg-teal-700 disabled:opacity-50">
                {loading ? "נרשם..." : "הרשמה"}
              </button>
              <button onClick={() => setIsRegistering(false)} className="w-full text-gray-500 mt-3 text-sm hover:underline">חזרה</button>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ─── Tabs ───────────────────────────────────────────────────────────────── */
  const TABS = [
    { key: "dashboard", label: "דשבורד", icon: "📊" },
    { key: "orders", label: "הזמנות רכש", icon: "📋" },
    { key: "payments", label: "מעקב תשלומים", icon: "💰" },
    { key: "documents", label: "מסמכים", icon: "📄" },
    { key: "issues", label: "דיווח בעיה", icon: "⚠️" },
  ];

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📦</span>
            <div>
              <h1 className="font-bold text-gray-800">פורטל ספקים</h1>
              <p className="text-xs text-gray-500">{dashboard?.supplier?.name}</p>
            </div>
          </div>
          <button onClick={logout} className="text-sm text-red-500 hover:text-red-700">התנתק</button>
        </div>
      </header>

      <nav className="bg-white border-b overflow-x-auto">
        <div className="max-w-6xl mx-auto px-4 flex gap-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === t.key ? "border-emerald-600 text-emerald-600" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}>
              <span className="ml-1">{t.icon}</span>{t.label}
              {t.key === "orders" && dashboard && dashboard.stats.pending_confirmations > 0 && (
                <span className="mr-1 bg-orange-500 text-white rounded-full px-1.5 py-0.5 text-xs">
                  {dashboard.stats.pending_confirmations}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-4">
        {/* Dashboard */}
        {tab === "dashboard" && dashboard && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: "הזמנות רכש", value: dashboard.stats.total_pos, icon: "📋", color: "emerald" },
                { label: "ממתינים לאישור", value: dashboard.stats.pending_confirmations, icon: "⏳", color: "orange" },
                { label: "מסמכים", value: dashboard.stats.total_documents, icon: "📄", color: "blue" },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-xl shadow-sm p-5 border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-3xl">{s.icon}</span>
                    <span className={`text-3xl font-bold text-${s.color}-600`}>{s.value}</span>
                  </div>
                  <p className="text-sm text-gray-500">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Recent POs */}
            <div className="bg-white rounded-xl shadow-sm p-6 border">
              <h2 className="font-bold text-lg mb-4">הזמנות רכש אחרונות</h2>
              {dashboard.recent_pos.length === 0 ? (
                <p className="text-gray-400 text-center py-6">אין הזמנות</p>
              ) : (
                <div className="space-y-3">
                  {dashboard.recent_pos.map(po => {
                    const st = PO_STATUS_MAP[po.status] || { label: po.status, bg: "bg-gray-100", text: "text-gray-600" };
                    return (
                      <div key={po.id} className="border rounded-lg p-4 flex items-center justify-between">
                        <div>
                          <span className="font-medium">הזמנה #{po.po_number || po.id}</span>
                          <p className="text-sm text-gray-500">
                            {Number(po.total_amount).toLocaleString("he-IL", { style: "currency", currency: "ILS" })}
                          </p>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${st.bg} ${st.text}`}>{st.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Orders */}
        {tab === "orders" && (
          <div className="bg-white rounded-xl shadow-sm p-6 border">
            <h2 className="font-bold text-lg mb-4">הזמנות רכש</h2>
            {orders.length === 0 ? (
              <p className="text-gray-400 text-center py-8">אין הזמנות רכש</p>
            ) : (
              <div className="space-y-4">
                {orders.map(po => {
                  const st = PO_STATUS_MAP[po.status] || { label: po.status, bg: "bg-gray-100", text: "text-gray-600" };
                  return (
                    <div key={po.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <span className="font-bold text-lg">הזמנה #{po.po_number || po.id}</span>
                          <span className={`mr-3 px-2.5 py-1 rounded-full text-xs font-medium ${st.bg} ${st.text}`}>{st.label}</span>
                        </div>
                        <span className="text-lg font-bold text-emerald-600">
                          {Number(po.total_amount).toLocaleString("he-IL", { style: "currency", currency: "ILS" })}
                        </span>
                      </div>
                      {po.confirmed_delivery_date && (
                        <p className="text-sm text-gray-500 mb-2">תאריך אספקה מאושר: {po.confirmed_delivery_date}</p>
                      )}
                      {po.notes && <p className="text-sm text-gray-500 mb-2">הערות: {po.notes}</p>}
                      {po.status === "pending" && (
                        <div className="flex gap-2 mt-3">
                          <button onClick={() => setConfirmModal({ po, status: "confirmed", delivery_date: "", notes: "" })}
                            className="bg-green-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-600">אישור</button>
                          <button onClick={() => setConfirmModal({ po, status: "partially_confirmed", delivery_date: "", notes: "" })}
                            className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-orange-600">אישור חלקי</button>
                          <button onClick={() => setConfirmModal({ po, status: "rejected", delivery_date: "", notes: "" })}
                            className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-600">דחייה</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {/* Confirm Modal */}
            {confirmModal && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl p-6 w-full max-w-md">
                  <h3 className="font-bold text-lg mb-4">
                    {{ confirmed: "אישור הזמנה", partially_confirmed: "אישור חלקי", rejected: "דחיית הזמנה" }[confirmModal.status]}
                  </h3>
                  <input type="date" className="w-full border rounded-lg p-3 mb-3 text-right" placeholder="תאריך אספקה"
                    value={confirmModal.delivery_date} onChange={e => setConfirmModal({ ...confirmModal, delivery_date: e.target.value })} />
                  <textarea className="w-full border rounded-lg p-3 mb-4 text-right h-24 resize-none" placeholder="הערות..."
                    value={confirmModal.notes} onChange={e => setConfirmModal({ ...confirmModal, notes: e.target.value })} />
                  <div className="flex gap-2">
                    <button onClick={confirmPO} className="flex-1 bg-emerald-600 text-white rounded-lg p-3 hover:bg-emerald-700">אישור</button>
                    <button onClick={() => setConfirmModal(null)} className="flex-1 bg-gray-200 rounded-lg p-3 hover:bg-gray-300">ביטול</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Payments */}
        {tab === "payments" && paymentData && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl shadow-sm p-5 border text-center">
                <p className="text-sm text-gray-500">סה"כ מאושר</p>
                <p className="text-2xl font-bold text-green-600">
                  {paymentData.summary.total_confirmed.toLocaleString("he-IL", { style: "currency", currency: "ILS" })}
                </p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-5 border text-center">
                <p className="text-sm text-gray-500">ממתין</p>
                <p className="text-2xl font-bold text-orange-600">
                  {paymentData.summary.total_pending.toLocaleString("he-IL", { style: "currency", currency: "ILS" })}
                </p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-5 border text-center">
                <p className="text-sm text-gray-500">סה"כ הזמנות</p>
                <p className="text-2xl font-bold text-blue-600">{paymentData.summary.total_orders}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-6 border">
              <h2 className="font-bold text-lg mb-4">פירוט הזמנות</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-right">
                    <th className="py-2 px-3">מספר</th><th className="py-2 px-3">סכום</th>
                    <th className="py-2 px-3">סטטוס</th><th className="py-2 px-3">תאריך אספקה</th>
                  </tr></thead>
                  <tbody>
                    {paymentData.orders.map(o => {
                      const st = PO_STATUS_MAP[o.status] || { label: o.status, bg: "bg-gray-100", text: "text-gray-600" };
                      return (
                        <tr key={o.id} className="border-b">
                          <td className="py-2 px-3 font-medium">{o.po_number || `#${o.id}`}</td>
                          <td className="py-2 px-3">{Number(o.total_amount).toLocaleString("he-IL", { style: "currency", currency: "ILS" })}</td>
                          <td className="py-2 px-3"><span className={`px-2 py-0.5 rounded-full text-xs ${st.bg} ${st.text}`}>{st.label}</span></td>
                          <td className="py-2 px-3">{o.confirmed_delivery_date || "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Documents Upload */}
        {tab === "documents" && (
          <div className="bg-white rounded-xl shadow-sm p-6 border max-w-xl mx-auto">
            <h2 className="font-bold text-lg mb-4">📄 העלאת מסמך</h2>
            <div className="space-y-3">
              <select className="w-full border rounded-lg p-3 text-right bg-white"
                value={uploadForm.document_type} onChange={e => setUploadForm({ ...uploadForm, document_type: e.target.value })}>
                <option value="invoice">חשבונית</option>
                <option value="delivery_note">תעודת משלוח</option>
                <option value="price_list">מחירון</option>
                <option value="catalog">קטלוג</option>
                <option value="certificate">תעודה/אישור</option>
                <option value="insurance">ביטוח</option>
              </select>
              <input className="w-full border rounded-lg p-3 text-right" placeholder="כותרת המסמך"
                value={uploadForm.title} onChange={e => setUploadForm({ ...uploadForm, title: e.target.value })} />
              <input className="w-full border rounded-lg p-3 text-right" placeholder="קישור לקובץ (URL)"
                value={uploadForm.file_url} onChange={e => setUploadForm({ ...uploadForm, file_url: e.target.value })} />
              <button onClick={uploadDocument}
                className="w-full bg-emerald-600 text-white rounded-lg p-3 font-medium hover:bg-emerald-700">
                העלה מסמך
              </button>
            </div>

            {/* Recent docs */}
            {dashboard?.recent_documents && dashboard.recent_documents.length > 0 && (
              <div className="mt-6">
                <h3 className="font-bold mb-3">מסמכים אחרונים</h3>
                <div className="space-y-2">
                  {dashboard.recent_documents.map(d => {
                    const ds = DOC_STATUS_MAP[d.status] || { label: d.status, bg: "bg-gray-100", text: "text-gray-600" };
                    return (
                      <div key={d.id} className="border rounded-lg p-3 flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{d.title}</p>
                          <p className="text-xs text-gray-500">{new Date(d.uploaded_at).toLocaleDateString("he-IL")}</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${ds.bg} ${ds.text}`}>{ds.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Report Issue */}
        {tab === "issues" && (
          <div className="bg-white rounded-xl shadow-sm p-6 border max-w-xl mx-auto">
            <h2 className="font-bold text-lg mb-4">⚠️ דיווח בעיה</h2>
            <div className="space-y-3">
              <input className="w-full border rounded-lg p-3 text-right" placeholder="מספר הזמנת רכש (אופציונלי)"
                value={issueForm.po_id} onChange={e => setIssueForm({ ...issueForm, po_id: e.target.value })} />
              <select className="w-full border rounded-lg p-3 text-right bg-white"
                value={issueForm.issue_type} onChange={e => setIssueForm({ ...issueForm, issue_type: e.target.value })}>
                <option value="">סוג הבעיה</option>
                <option value="איחור באספקה">איחור באספקה</option>
                <option value="בעיית איכות">בעיית איכות</option>
                <option value="חוסר בפריטים">חוסר בפריטים</option>
                <option value="מחיר שגוי">מחיר שגוי</option>
                <option value="אחר">אחר</option>
              </select>
              <textarea className="w-full border rounded-lg p-3 text-right h-32 resize-none" placeholder="תאר את הבעיה..."
                value={issueForm.description} onChange={e => setIssueForm({ ...issueForm, description: e.target.value })} />
              <button onClick={reportIssue}
                className="w-full bg-red-500 text-white rounded-lg p-3 font-medium hover:bg-red-600">
                שלח דיווח
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

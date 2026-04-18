import { useState, useEffect, useCallback } from "react";

/* ─── Types ──────────────────────────────────────────────────────────────────── */
interface DashboardData {
  customer: { name: string; email: string };
  stats: {
    total_messages: number; total_documents: number;
    unread_messages: number; pending_signatures: number; active_projects: number;
  };
  recent_projects: ProjectSummary[];
  pipeline_steps: PipelineStep[];
}
interface ProjectSummary {
  id: number; name: string; status: string; current_step: number; step_name: string;
}
interface PipelineStep {
  step: number; name: string; icon: string; status?: string;
}
interface DocAccess {
  id: number; document_type: string; title: string; url: string;
  requires_signature: boolean; signed: boolean; signed_at: string | null; created_at: string;
}
interface Message {
  id: number; direction: string; subject: string; message: string;
  read: boolean; created_at: string; attachments: any[];
}
interface ProjectPipeline {
  project: { id: number; name: string; status: string; current_step: number };
  pipeline: PipelineStep[];
}

const API = "/api";

/* ─── Component ──────────────────────────────────────────────────────────────── */
export default function CustomerPortal() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("portal_customer_token"));
  const [tab, setTab] = useState<string>("dashboard");
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [registerForm, setRegisterForm] = useState({ customer_name: "", email: "", phone: "", password: "" });
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Data
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [documents, setDocuments] = useState<DocAccess[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectPipeline | null>(null);
  const [newMessage, setNewMessage] = useState({ subject: "", message: "" });
  const [serviceForm, setServiceForm] = useState({ issue_type: "", description: "", urgency: "normal", preferred_date: "" });

  const authFetch = useCallback(async (url: string, opts?: RequestInit) => {
    const res = await fetch(url, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers || {}) },
    });
    if (res.status === 401) { setToken(null); localStorage.removeItem("portal_customer_token"); }
    return res;
  }, [token]);

  // Login
  const handleLogin = async () => {
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${API}/portal/customers/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setToken(data.token); localStorage.setItem("portal_customer_token", data.token);
    } catch { setError("שגיאת חיבור"); } finally { setLoading(false); }
  };

  // Register
  const handleRegister = async () => {
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${API}/portal/customers/register`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registerForm),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setIsRegistering(false); setError(""); setLoginForm({ email: registerForm.email, password: registerForm.password });
    } catch { setError("שגיאת חיבור"); } finally { setLoading(false); }
  };

  // Load data
  const loadDashboard = useCallback(async () => {
    const res = await authFetch(`${API}/portal/dashboard`);
    if (res.ok) setDashboard(await res.json());
  }, [authFetch]);

  const loadDocuments = useCallback(async () => {
    const res = await authFetch(`${API}/portal/my-documents`);
    if (res.ok) setDocuments(await res.json());
  }, [authFetch]);

  const loadMessages = useCallback(async () => {
    const res = await authFetch(`${API}/portal/messages`);
    if (res.ok) setMessages(await res.json());
  }, [authFetch]);

  const loadProjectPipeline = useCallback(async (projectId: number) => {
    const res = await authFetch(`${API}/portal/project-status/${projectId}`);
    if (res.ok) setSelectedProject(await res.json());
  }, [authFetch]);

  useEffect(() => {
    if (token) { loadDashboard(); }
  }, [token, loadDashboard]);

  useEffect(() => {
    if (token && tab === "documents") loadDocuments();
    if (token && tab === "messages") loadMessages();
  }, [token, tab, loadDocuments, loadMessages]);

  const signDocument = async (docId: number) => {
    const res = await authFetch(`${API}/portal/sign-document/${docId}`, { method: "POST" });
    if (res.ok) loadDocuments();
  };

  const sendMessage = async () => {
    if (!newMessage.message) return;
    await authFetch(`${API}/portal/messages`, {
      method: "POST", body: JSON.stringify(newMessage),
    });
    setNewMessage({ subject: "", message: "" }); loadMessages();
  };

  const submitServiceRequest = async () => {
    if (!serviceForm.description) return;
    await authFetch(`${API}/portal/service-request`, {
      method: "POST", body: JSON.stringify(serviceForm),
    });
    setServiceForm({ issue_type: "", description: "", urgency: "normal", preferred_date: "" });
    setTab("messages");
  };

  const logout = () => { setToken(null); localStorage.removeItem("portal_customer_token"); };

  /* ─── Login / Register Screen ────────────────────────────────────────────── */
  if (!token) {
    return (
      <div dir="rtl" className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
          <div className="text-center mb-6">
            <div className="text-4xl mb-2">🏗️</div>
            <h1 className="text-2xl font-bold text-gray-800">פורטל לקוחות</h1>
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
                className="w-full bg-blue-600 text-white rounded-lg p-3 font-medium hover:bg-blue-700 disabled:opacity-50">
                {loading ? "מתחבר..." : "כניסה"}
              </button>
              <button onClick={() => setIsRegistering(true)} className="w-full text-blue-600 mt-3 text-sm hover:underline">
                לקוח חדש? הירשם כאן
              </button>
            </>
          ) : (
            <>
              <input className="w-full border rounded-lg p-3 mb-3 text-right" placeholder="שם מלא"
                value={registerForm.customer_name} onChange={e => setRegisterForm({ ...registerForm, customer_name: e.target.value })} />
              <input className="w-full border rounded-lg p-3 mb-3 text-right" type="email" placeholder="אימייל"
                value={registerForm.email} onChange={e => setRegisterForm({ ...registerForm, email: e.target.value })} />
              <input className="w-full border rounded-lg p-3 mb-3 text-right" placeholder="טלפון"
                value={registerForm.phone} onChange={e => setRegisterForm({ ...registerForm, phone: e.target.value })} />
              <input className="w-full border rounded-lg p-3 mb-4 text-right" type="password" placeholder="סיסמה"
                value={registerForm.password} onChange={e => setRegisterForm({ ...registerForm, password: e.target.value })} />
              <button onClick={handleRegister} disabled={loading}
                className="w-full bg-green-600 text-white rounded-lg p-3 font-medium hover:bg-green-700 disabled:opacity-50">
                {loading ? "נרשם..." : "הרשמה"}
              </button>
              <button onClick={() => setIsRegistering(false)} className="w-full text-gray-500 mt-3 text-sm hover:underline">
                חזרה לכניסה
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ─── Tabs ───────────────────────────────────────────────────────────────── */
  const TABS = [
    { key: "dashboard", label: "דשבורד", icon: "📊" },
    { key: "projects", label: "פרויקטים", icon: "🏗️" },
    { key: "documents", label: "מסמכים", icon: "📄" },
    { key: "messages", label: "הודעות", icon: "💬" },
    { key: "service", label: "בקשת שירות", icon: "🔧" },
  ];

  /* ─── Main Portal ────────────────────────────────────────────────────────── */
  return (
    <div dir="rtl" className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏗️</span>
            <div>
              <h1 className="font-bold text-gray-800">פורטל לקוחות</h1>
              <p className="text-xs text-gray-500">{dashboard?.customer?.name || ""}</p>
            </div>
          </div>
          <button onClick={logout} className="text-sm text-red-500 hover:text-red-700">התנתק</button>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="bg-white border-b overflow-x-auto">
        <div className="max-w-6xl mx-auto px-4 flex gap-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === t.key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}>
              <span className="ml-1">{t.icon}</span>{t.label}
              {t.key === "messages" && dashboard && dashboard.stats.unread_messages > 0 && (
                <span className="mr-1 bg-red-500 text-white rounded-full px-1.5 py-0.5 text-xs">
                  {dashboard.stats.unread_messages}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-6xl mx-auto p-4">
        {/* Dashboard */}
        {tab === "dashboard" && dashboard && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { label: "פרויקטים פעילים", value: dashboard.stats.active_projects, color: "blue", icon: "🏗️" },
                { label: "מסמכים", value: dashboard.stats.total_documents, color: "green", icon: "📄" },
                { label: "הודעות", value: dashboard.stats.total_messages, color: "purple", icon: "💬" },
                { label: "ממתינים לחתימה", value: dashboard.stats.pending_signatures, color: "orange", icon: "✍️" },
                { label: "הודעות שלא נקראו", value: dashboard.stats.unread_messages, color: "red", icon: "🔔" },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-xl shadow-sm p-4 border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-2xl">{s.icon}</span>
                    <span className={`text-2xl font-bold text-${s.color}-600`}>{s.value}</span>
                  </div>
                  <p className="text-xs text-gray-500">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Recent Projects with mini-pipeline */}
            <div className="bg-white rounded-xl shadow-sm p-6 border">
              <h2 className="font-bold text-lg mb-4">פרויקטים אחרונים</h2>
              {dashboard.recent_projects.length === 0 ? (
                <p className="text-gray-400 text-center py-8">אין פרויקטים פעילים</p>
              ) : (
                <div className="space-y-4">
                  {dashboard.recent_projects.map(p => (
                    <div key={p.id} className="border rounded-lg p-4 hover:bg-blue-50 cursor-pointer transition-colors"
                      onClick={() => { loadProjectPipeline(p.id); setTab("projects"); }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">{p.name}</span>
                        <span className="text-sm text-blue-600">שלב {p.current_step}/18 - {p.step_name}</span>
                      </div>
                      {/* Mini progress bar */}
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${(p.current_step / 18) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Projects / Pipeline */}
        {tab === "projects" && (
          <div className="space-y-6">
            {selectedProject ? (
              <div className="bg-white rounded-xl shadow-sm p-6 border">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="font-bold text-lg">{selectedProject.project.name}</h2>
                  <button onClick={() => setSelectedProject(null)} className="text-sm text-gray-500 hover:text-gray-700">
                    חזרה לרשימה
                  </button>
                </div>
                {/* Full Pipeline View */}
                <div className="space-y-2">
                  {selectedProject.pipeline.map((step, idx) => (
                    <div key={step.step} className={`flex items-center gap-4 p-3 rounded-lg transition-colors ${
                      step.status === "completed" ? "bg-green-50" : step.status === "current" ? "bg-blue-50 border-2 border-blue-300" : "bg-gray-50"
                    }`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        step.status === "completed" ? "bg-green-500 text-white" :
                        step.status === "current" ? "bg-blue-500 text-white animate-pulse" : "bg-gray-300 text-gray-600"
                      }`}>
                        {step.status === "completed" ? "✓" : step.step}
                      </div>
                      <div className="flex-1">
                        <span className={`font-medium ${step.status === "current" ? "text-blue-700" : step.status === "completed" ? "text-green-700" : "text-gray-500"}`}>
                          {step.name}
                        </span>
                      </div>
                      {step.status === "current" && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">שלב נוכחי</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm p-6 border">
                <h2 className="font-bold text-lg mb-4">הפרויקטים שלי</h2>
                {dashboard?.recent_projects?.length === 0 ? (
                  <p className="text-gray-400 text-center py-8">אין פרויקטים</p>
                ) : (
                  <div className="space-y-3">
                    {(dashboard?.recent_projects || []).map(p => (
                      <div key={p.id} onClick={() => loadProjectPipeline(p.id)}
                        className="border rounded-lg p-4 cursor-pointer hover:bg-blue-50 flex items-center justify-between">
                        <div>
                          <span className="font-medium">{p.name}</span>
                          <p className="text-sm text-gray-500">שלב {p.current_step}/18</p>
                        </div>
                        <span className="text-blue-600 text-sm">צפה בצינור &larr;</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Documents */}
        {tab === "documents" && (
          <div className="bg-white rounded-xl shadow-sm p-6 border">
            <h2 className="font-bold text-lg mb-4">המסמכים שלי</h2>
            {documents.length === 0 ? (
              <p className="text-gray-400 text-center py-8">אין מסמכים</p>
            ) : (
              <div className="space-y-3">
                {documents.map(d => (
                  <div key={d.id} className="border rounded-lg p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">
                        {{ quote: "💰", invoice: "🧾", contract: "📋", delivery_note: "📦", measurement: "📐",
                           installation_report: "🔧", warranty: "🛡️" }[d.document_type] || "📄"}
                      </span>
                      <div>
                        <p className="font-medium">{d.title}</p>
                        <p className="text-xs text-gray-500">
                          {{ quote: "הצעת מחיר", invoice: "חשבונית", contract: "חוזה", delivery_note: "תעודת משלוח",
                             measurement: "דוח מדידה", installation_report: "דוח התקנה", warranty: "אחריות" }[d.document_type] || d.document_type}
                          {" | "}{new Date(d.created_at).toLocaleDateString("he-IL")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {d.url && (
                        <a href={d.url} target="_blank" rel="noreferrer"
                          className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg">צפייה</a>
                      )}
                      {d.requires_signature && !d.signed && (
                        <button onClick={() => signDocument(d.id)}
                          className="text-sm bg-orange-500 text-white px-3 py-1.5 rounded-lg hover:bg-orange-600">
                          חתום
                        </button>
                      )}
                      {d.signed && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">נחתם ✓</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Messages */}
        {tab === "messages" && (
          <div className="space-y-4">
            {/* Compose */}
            <div className="bg-white rounded-xl shadow-sm p-6 border">
              <h3 className="font-bold mb-3">שלח הודעה</h3>
              <input className="w-full border rounded-lg p-2.5 mb-2 text-right" placeholder="נושא"
                value={newMessage.subject} onChange={e => setNewMessage({ ...newMessage, subject: e.target.value })} />
              <textarea className="w-full border rounded-lg p-2.5 mb-2 text-right h-24 resize-none" placeholder="הודעה..."
                value={newMessage.message} onChange={e => setNewMessage({ ...newMessage, message: e.target.value })} />
              <button onClick={sendMessage} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">שלח</button>
            </div>
            {/* Message List */}
            <div className="bg-white rounded-xl shadow-sm p-6 border">
              <h3 className="font-bold mb-3">היסטוריית הודעות</h3>
              {messages.length === 0 ? (
                <p className="text-gray-400 text-center py-6">אין הודעות</p>
              ) : (
                <div className="space-y-2">
                  {messages.map(m => (
                    <div key={m.id} className={`border rounded-lg p-3 ${
                      m.direction === "company_to_customer" ? "bg-blue-50 border-blue-200" : "bg-gray-50"
                    } ${!m.read && m.direction === "company_to_customer" ? "border-r-4 border-r-blue-500" : ""}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-gray-500">
                          {m.direction === "company_to_customer" ? "מהחברה" : "שלי"}
                        </span>
                        <span className="text-xs text-gray-400">{new Date(m.created_at).toLocaleString("he-IL")}</span>
                      </div>
                      {m.subject && <p className="font-medium text-sm">{m.subject}</p>}
                      <p className="text-sm text-gray-600">{m.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Service Request */}
        {tab === "service" && (
          <div className="bg-white rounded-xl shadow-sm p-6 border max-w-xl mx-auto">
            <h2 className="font-bold text-lg mb-4">🔧 בקשת שירות</h2>
            <div className="space-y-3">
              <select className="w-full border rounded-lg p-3 text-right bg-white"
                value={serviceForm.issue_type} onChange={e => setServiceForm({ ...serviceForm, issue_type: e.target.value })}>
                <option value="">סוג הבעיה</option>
                <option value="תקלה">תקלה</option>
                <option value="תחזוקה">תחזוקה</option>
                <option value="אחריות">אחריות</option>
                <option value="שינוי/תוספת">שינוי/תוספת</option>
                <option value="אחר">אחר</option>
              </select>
              <select className="w-full border rounded-lg p-3 text-right bg-white"
                value={serviceForm.urgency} onChange={e => setServiceForm({ ...serviceForm, urgency: e.target.value })}>
                <option value="normal">דחיפות רגילה</option>
                <option value="urgent">דחוף</option>
              </select>
              <input type="date" className="w-full border rounded-lg p-3 text-right"
                value={serviceForm.preferred_date} onChange={e => setServiceForm({ ...serviceForm, preferred_date: e.target.value })} />
              <textarea className="w-full border rounded-lg p-3 text-right h-32 resize-none" placeholder="תאר את הבעיה..."
                value={serviceForm.description} onChange={e => setServiceForm({ ...serviceForm, description: e.target.value })} />
              <button onClick={submitServiceRequest}
                className="w-full bg-orange-500 text-white rounded-lg p-3 font-medium hover:bg-orange-600">
                שלח בקשת שירות
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

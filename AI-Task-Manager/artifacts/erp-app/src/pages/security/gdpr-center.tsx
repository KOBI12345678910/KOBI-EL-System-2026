import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Plus, Search, Eye, CheckCircle, Clock, X, Save, AlertTriangle, Users, FileText, Trash2, Download, RefreshCw, CheckSquare } from "lucide-react";
import { authFetch } from "@/lib/utils";

const API = "/api";

const DSAR_TYPES: Record<string, string> = {
  access: "בקשת גישה",
  erasure: "מחיקה / שכחה",
  rectification: "תיקון נתונים",
  portability: "ניוד נתונים",
  restriction: "הגבלת עיבוד",
  objection: "התנגדות לעיבוד",
};

const DSAR_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: "ממתין", color: "bg-amber-500/20 text-amber-400" },
  in_progress: { label: "בטיפול", color: "bg-blue-500/20 text-blue-400" },
  completed: { label: "הושלם", color: "bg-green-500/20 text-green-400" },
  rejected: { label: "נדחה", color: "bg-red-500/20 text-red-400" },
};

const PURPOSES = [
  "שיווק ישיר", "שירות לקוחות", "עיבוד עסקאות", "ניתוח נתונים",
  "ציות לחוק", "אבטחת מידע", "גיוס עובדים", "ניהול ספקים",
];

const LEGAL_BASES = [
  { value: "consent", label: "הסכמה (Consent)" },
  { value: "contract", label: "חוזה (Contract)" },
  { value: "legal_obligation", label: "חובה חוקית (Legal Obligation)" },
  { value: "legitimate_interest", label: "אינטרס לגיטימי (Legitimate Interest)" },
  { value: "vital_interest", label: "אינטרס חיוני (Vital Interest)" },
  { value: "public_task", label: "משימה ציבורית (Public Task)" },
];

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("he-IL");
}

function Tab({ label, active, onClick, count }: any) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
    >
      {label}{count !== undefined && <span className="ml-1.5 text-xs opacity-80">({count})</span>}
    </button>
  );
}

export default function GdprCenter() {
  const [tab, setTab] = useState<"dsar" | "consent">("dsar");

  const [dsarList, setDsarList] = useState<any[]>([]);
  const [dsarTotal, setDsarTotal] = useState(0);
  const [dsarLoading, setDsarLoading] = useState(true);
  const [dsarSearch, setDsarSearch] = useState("");
  const [dsarStatus, setDsarStatus] = useState("all");
  const [showDsarForm, setShowDsarForm] = useState(false);
  const [selectedDsar, setSelectedDsar] = useState<any>(null);
  const [dsarForm, setDsarForm] = useState<any>({});
  const [dsarSaving, setDsarSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [anonymizing, setAnonymizing] = useState(false);

  const [consentList, setConsentList] = useState<any[]>([]);
  const [consentTotal, setConsentTotal] = useState(0);
  const [consentLoading, setConsentLoading] = useState(true);
  const [consentSearch, setConsentSearch] = useState("");
  const [showConsentForm, setShowConsentForm] = useState(false);
  const [consentForm, setConsentForm] = useState<any>({});
  const [consentSaving, setConsentSaving] = useState(false);

  const loadDsar = async () => {
    setDsarLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (dsarStatus !== "all") params.set("status", dsarStatus);
      if (dsarSearch) params.set("search", dsarSearch);
      const res = await authFetch(`${API}/security/gdpr/dsar?${params}`);
      if (res.ok) { const d = await res.json(); setDsarList(d.data || []); setDsarTotal(d.total || 0); }
    } catch { }
    setDsarLoading(false);
  };

  const loadConsent = async () => {
    setConsentLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (consentSearch) params.set("search", consentSearch);
      const res = await authFetch(`${API}/security/gdpr/consent?${params}`);
      if (res.ok) { const d = await res.json(); setConsentList(d.data || []); setConsentTotal(d.total || 0); }
    } catch { }
    setConsentLoading(false);
  };

  useEffect(() => { loadDsar(); }, [dsarStatus, dsarSearch]);
  useEffect(() => { loadConsent(); }, [consentSearch]);

  const saveDsar = async () => {
    setDsarSaving(true);
    try {
      await authFetch(`${API}/security/gdpr/dsar`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dsarForm)
      });
      setShowDsarForm(false);
      setDsarForm({});
      loadDsar();
    } catch { }
    setDsarSaving(false);
  };

  const updateDsar = async (id: number, data: any) => {
    await authFetch(`${API}/security/gdpr/dsar/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data)
    });
    loadDsar();
    if (selectedDsar?.id === id) setSelectedDsar((p: any) => ({ ...p, ...data }));
  };

  const generateExport = async (id: number) => {
    setGenerating(true);
    try {
      const res = await authFetch(`${API}/security/gdpr/dsar/${id}/generate-export`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (res.ok) {
        const d = await res.json();
        const blob = new Blob([JSON.stringify(d.export, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `dsar_export_${id}.json`; a.click();
        loadDsar();
      }
    } catch { }
    setGenerating(false);
  };

  const anonymize = async (id: number) => {
    if (!confirm("פעולה זו תמחק/תאנונם את כל הנתונים האישיים של מגיש הבקשה. האם להמשיך?")) return;
    setAnonymizing(true);
    try {
      await authFetch(`${API}/security/gdpr/dsar/${id}/anonymize`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      loadDsar();
      setSelectedDsar(null);
    } catch { }
    setAnonymizing(false);
  };

  const saveConsent = async () => {
    setConsentSaving(true);
    try {
      await authFetch(`${API}/security/gdpr/consent`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...consentForm, consented: true })
      });
      setShowConsentForm(false);
      setConsentForm({});
      loadConsent();
    } catch { }
    setConsentSaving(false);
  };

  const withdrawConsent = async (id: number) => {
    await authFetch(`${API}/security/gdpr/consent/${id}/withdraw`, { method: "PUT" });
    loadConsent();
  };

  const pendingCount = dsarList.filter(d => d.status === "pending").length;

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="text-purple-400" size={26} />
            מרכז GDPR והגנת פרטיות
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול בקשות נושאי מידע, הסכמות וזכות לשכחה</p>
        </div>
        <button onClick={() => { loadDsar(); loadConsent(); }} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground btn-ghost">
          <RefreshCw size={13} /> רענון
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'סה"כ בקשות DSAR', value: dsarTotal, icon: Users, color: "text-blue-400" },
          { label: "ממתינות לטיפול", value: pendingCount, icon: Clock, color: "text-amber-400" },
          { label: "הושלמו", value: dsarList.filter(d => d.status === "completed").length, icon: CheckCircle, color: "text-green-400" },
          { label: "רשומות הסכמה", value: consentTotal, icon: Shield, color: "text-purple-400" },
        ].map((k, i) => (
          <div key={i} className="bg-card border border-border/50 rounded-xl p-4">
            <k.icon size={18} className={`${k.color} mb-2`} />
            <div className="text-xl font-bold text-foreground">{k.value}</div>
            <div className="text-xs text-muted-foreground">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 border-b border-border pb-3">
        <Tab label="בקשות DSAR" active={tab === "dsar"} onClick={() => setTab("dsar")} count={dsarTotal} />
        <Tab label="ניהול הסכמות" active={tab === "consent"} onClick={() => setTab("consent")} count={consentTotal} />
      </div>

      {tab === "dsar" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="flex gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                <input value={dsarSearch} onChange={e => setDsarSearch(e.target.value)} placeholder="חיפוש שם / אימייל..." className="pr-9 pl-3 py-2 bg-card border border-border rounded-lg text-sm w-52" />
              </div>
              <select value={dsarStatus} onChange={e => setDsarStatus(e.target.value)} className="bg-card border border-border rounded-lg px-3 py-2 text-sm">
                <option value="all">כל הסטטוסים</option>
                {Object.entries(DSAR_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <button onClick={() => { setDsarForm({}); setShowDsarForm(true); }} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium">
              <Plus size={16} /> בקשה חדשה
            </button>
          </div>

          {dsarLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 bg-muted/20 rounded-lg animate-pulse" />)}</div>
          ) : dsarList.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Shield size={40} className="mx-auto mb-3 opacity-30" />
              <p>אין בקשות DSAR</p>
            </div>
          ) : (
            <div className="border border-border/50 rounded-2xl overflow-hidden bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b border-border/50">
                  <tr>
                    <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">נושא המידע</th>
                    <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">סוג בקשה</th>
                    <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">תאריך</th>
                    <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">מועד אחרון</th>
                    <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">סטטוס</th>
                    <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {dsarList.map(row => {
                    const st = DSAR_STATUS[row.status] || DSAR_STATUS.pending;
                    const isOverdue = row.due_date && new Date(row.due_date) < new Date() && row.status === "pending";
                    return (
                      <tr key={row.id} className={`border-b border-border/20 hover:bg-muted/20 ${isOverdue ? "bg-red-500/5" : ""}`}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">{row.data_subject_name}</div>
                          <div className="text-xs text-muted-foreground">{row.data_subject_email || "—"}</div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{DSAR_TYPES[row.request_type] || row.request_type}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(row.created_at)}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs ${isOverdue ? "text-red-400 font-bold" : "text-muted-foreground"}`}>
                            {isOverdue && <AlertTriangle size={12} className="inline ml-1" />}
                            {formatDate(row.due_date)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button onClick={() => setSelectedDsar(row)} className="p-1.5 hover:bg-muted rounded-lg" title="פרטים">
                              <Eye size={14} className="text-muted-foreground" />
                            </button>
                            {row.status === "pending" && (
                              <button onClick={() => updateDsar(row.id, { status: "in_progress" })} className="p-1.5 hover:bg-muted rounded-lg" title="התחל טיפול">
                                <CheckSquare size={14} className="text-blue-400" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "consent" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
              <input value={consentSearch} onChange={e => setConsentSearch(e.target.value)} placeholder="חיפוש אימייל / מטרה..." className="pr-9 pl-3 py-2 bg-card border border-border rounded-lg text-sm w-64" />
            </div>
            <button onClick={() => { setConsentForm({}); setShowConsentForm(true); }} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium">
              <Plus size={16} /> הסכמה חדשה
            </button>
          </div>

          {consentLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 bg-muted/20 rounded-lg animate-pulse" />)}</div>
          ) : consentList.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Shield size={40} className="mx-auto mb-3 opacity-30" />
              <p>אין רשומות הסכמה</p>
            </div>
          ) : (
            <div className="border border-border/50 rounded-2xl overflow-hidden bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b border-border/50">
                  <tr>
                    <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">נושא המידע</th>
                    <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">מטרת עיבוד</th>
                    <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">בסיס משפטי</th>
                    <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">תאריך</th>
                    <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">סטטוס</th>
                    <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {consentList.map(row => (
                    <tr key={row.id} className="border-b border-border/20 hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{row.data_subject_email}</div>
                        <div className="text-xs text-muted-foreground">{row.data_subject_name || "—"}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{row.purpose}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{LEGAL_BASES.find(b => b.value === row.legal_basis)?.label || row.legal_basis}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(row.consent_date)}</td>
                      <td className="px-4 py-3">
                        {row.withdrawn_at ? (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-red-500/20 text-red-400">בוטלה</span>
                        ) : row.consented ? (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-400">פעילה</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-muted/40 text-muted-foreground">לא הוסכם</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {!row.withdrawn_at && row.consented && (
                          <button onClick={() => { if (confirm("לבטל הסכמה זו?")) withdrawConsent(row.id); }} className="p-1.5 hover:bg-muted rounded-lg text-xs text-red-400" title="ביטול הסכמה">
                            <X size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {showDsarForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowDsarForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="font-bold text-foreground">בקשת DSAR חדשה</h2>
                <button onClick={() => setShowDsarForm(false)} className="p-1 hover:bg-muted rounded-lg"><X size={18} /></button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">שם נושא המידע *</label>
                  <input value={dsarForm.data_subject_name || ""} onChange={e => setDsarForm({ ...dsarForm, data_subject_name: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm" placeholder="שם מלא" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">אימייל</label>
                  <input type="email" value={dsarForm.data_subject_email || ""} onChange={e => setDsarForm({ ...dsarForm, data_subject_email: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm" dir="ltr" placeholder="email@example.com" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">סוג בקשה *</label>
                  <select value={dsarForm.request_type || "access"} onChange={e => setDsarForm({ ...dsarForm, request_type: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm">
                    {Object.entries(DSAR_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">הערות</label>
                  <textarea value={dsarForm.notes || ""} onChange={e => setDsarForm({ ...dsarForm, notes: e.target.value })} rows={3} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm resize-none" />
                </div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowDsarForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={saveDsar} disabled={dsarSaving || !dsarForm.data_subject_name} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50">
                  <Save size={14} />{dsarSaving ? "שומר..." : "שמור"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showConsentForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowConsentForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="font-bold text-foreground">רישום הסכמה חדשה</h2>
                <button onClick={() => setShowConsentForm(false)} className="p-1 hover:bg-muted rounded-lg"><X size={18} /></button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">אימייל נושא המידע *</label>
                  <input type="email" value={consentForm.data_subject_email || ""} onChange={e => setConsentForm({ ...consentForm, data_subject_email: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm" dir="ltr" placeholder="email@example.com" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">שם</label>
                  <input value={consentForm.data_subject_name || ""} onChange={e => setConsentForm({ ...consentForm, data_subject_name: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm" placeholder="שם מלא" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">מטרת עיבוד *</label>
                  <select value={consentForm.purpose || ""} onChange={e => setConsentForm({ ...consentForm, purpose: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm">
                    <option value="">-- בחר מטרה --</option>
                    {PURPOSES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">בסיס משפטי *</label>
                  <select value={consentForm.legal_basis || "consent"} onChange={e => setConsentForm({ ...consentForm, legal_basis: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm">
                    {LEGAL_BASES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">תאריך פקיעה</label>
                  <input type="date" value={consentForm.expiry_date || ""} onChange={e => setConsentForm({ ...consentForm, expiry_date: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowConsentForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={saveConsent} disabled={consentSaving || !consentForm.data_subject_email || !consentForm.purpose} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50">
                  <Save size={14} />{consentSaving ? "שומר..." : "שמור"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {selectedDsar && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setSelectedDsar(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="font-bold text-foreground">בקשת DSAR #{selectedDsar.id}</h2>
                <button onClick={() => setSelectedDsar(null)} className="p-1 hover:bg-muted rounded-lg"><X size={18} /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-background rounded-lg p-3"><div className="text-xs text-muted-foreground">שם</div><div className="text-sm text-foreground font-medium mt-0.5">{selectedDsar.data_subject_name}</div></div>
                  <div className="bg-background rounded-lg p-3"><div className="text-xs text-muted-foreground">אימייל</div><div className="text-sm text-foreground font-medium mt-0.5 break-all">{selectedDsar.data_subject_email || "—"}</div></div>
                  <div className="bg-background rounded-lg p-3"><div className="text-xs text-muted-foreground">סוג</div><div className="text-sm text-foreground font-medium mt-0.5">{DSAR_TYPES[selectedDsar.request_type] || selectedDsar.request_type}</div></div>
                  <div className="bg-background rounded-lg p-3"><div className="text-xs text-muted-foreground">מועד אחרון</div><div className="text-sm text-foreground font-medium mt-0.5">{formatDate(selectedDsar.due_date)}</div></div>
                </div>
                {selectedDsar.notes && (
                  <div className="bg-background rounded-lg p-3"><div className="text-xs text-muted-foreground">הערות</div><div className="text-sm text-foreground mt-0.5">{selectedDsar.notes}</div></div>
                )}
                <div className="flex flex-wrap gap-2 pt-2">
                  {selectedDsar.status === "pending" && (
                    <button onClick={() => updateDsar(selectedDsar.id, { status: "in_progress" })} className="flex items-center gap-1.5 px-3 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30">
                      <CheckSquare size={14} /> התחל טיפול
                    </button>
                  )}
                  {(selectedDsar.status === "pending" || selectedDsar.status === "in_progress") && (
                    <>
                      {selectedDsar.request_type === "access" && (
                        <button onClick={() => generateExport(selectedDsar.id)} disabled={generating} className="flex items-center gap-1.5 px-3 py-2 bg-green-500/20 text-green-400 rounded-lg text-sm hover:bg-green-500/30 disabled:opacity-50">
                          <Download size={14} /> {generating ? "מייצא..." : "ייצא נתונים"}
                        </button>
                      )}
                      {selectedDsar.request_type === "erasure" && (
                        <button onClick={() => anonymize(selectedDsar.id)} disabled={anonymizing} className="flex items-center gap-1.5 px-3 py-2 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30 disabled:opacity-50">
                          <Trash2 size={14} /> {anonymizing ? "מאנונם..." : "אנונם/מחק נתונים"}
                        </button>
                      )}
                      <button onClick={() => updateDsar(selectedDsar.id, { status: "completed" })} className="flex items-center gap-1.5 px-3 py-2 bg-green-500/20 text-green-400 rounded-lg text-sm hover:bg-green-500/30">
                        <CheckCircle size={14} /> סמן כהושלם
                      </button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

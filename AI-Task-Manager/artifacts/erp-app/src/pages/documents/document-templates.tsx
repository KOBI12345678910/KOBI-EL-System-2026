import { useState, useEffect } from "react";
import {
  FileText, PlusCircle, Edit2, Trash2, Save, X, Send, Eye, Download,
  Pen, Search, Filter, CheckCircle, Clock, Mail, MessageSquare,
  Copy, ChevronDown, BarChart3, File, Printer, Settings
} from "lucide-react";
import { authFetch } from "@/lib/utils";

interface Template {
  id: number;
  template_name: string;
  template_type: string;
  content_html: string;
  variables: { key: string; label: string; type: string }[];
  header_html: string;
  footer_html: string;
  css: string;
  language: string;
  version: number;
  status: string;
  created_at: string;
}

interface GeneratedDoc {
  id: number;
  template_id: number;
  template_name: string;
  template_type: string;
  entity_type: string;
  entity_id: number;
  title: string;
  generated_html: string;
  pdf_url: string;
  variables_used: Record<string, string>;
  status: string;
  sent_to_email: string;
  sent_to_whatsapp: string;
  created_at: string;
}

interface Signature {
  id: number;
  document_id: number;
  signer_name: string;
  signer_email: string;
  signer_phone: string;
  signer_role: string;
  signed_at: string;
  status: string;
}

interface DashboardData {
  total_templates: number;
  total_generated: number;
  generated_today: number;
  documents_by_type: { template_type: string; count: number }[];
  documents_by_status: { status: string; count: number }[];
  pending_signatures: number;
  signed_today: number;
}

const TYPE_LABELS: Record<string, string> = {
  quote: "הצעת מחיר", invoice: "חשבונית", contract: "חוזה", work_order: "הזמנת עבודה",
  delivery_note: "תעודת משלוח", measurement_report: "דוח מדידה", installation_report: "דוח התקנה",
  warranty_certificate: "תעודת אחריות", receipt: "קבלה",
};
const TYPE_COLORS: Record<string, string> = {
  quote: "bg-blue-100 text-blue-700", invoice: "bg-green-100 text-green-700", contract: "bg-purple-100 text-purple-700",
  work_order: "bg-orange-100 text-orange-700", delivery_note: "bg-yellow-100 text-yellow-700",
  measurement_report: "bg-teal-100 text-teal-700", installation_report: "bg-indigo-100 text-indigo-700",
  warranty_certificate: "bg-pink-100 text-pink-700", receipt: "bg-gray-100 text-gray-700",
};
const STATUS_LABELS: Record<string, string> = { draft: "טיוטה", active: "פעיל", archived: "ארכיון", generated: "נוצר", sent: "נשלח", viewed: "נצפה", signed: "נחתם" };
const ROLE_LABELS: Record<string, string> = { customer: "לקוח", employee: "עובד", supplier: "ספק", contractor: "קבלן" };

export default function DocumentTemplatesPage() {
  const [tab, setTab] = useState<"templates" | "generated" | "generate" | "signatures" | "dashboard">("templates");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [documents, setDocuments] = useState<GeneratedDoc[]>([]);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [editTmpl, setEditTmpl] = useState<Template | null>(null);
  const [filterType, setFilterType] = useState("");
  const [previewDoc, setPreviewDoc] = useState<GeneratedDoc | null>(null);

  // Generate wizard state
  const [selTemplateId, setSelTemplateId] = useState<number | null>(null);
  const [genVars, setGenVars] = useState<Record<string, string>>({});
  const [genTitle, setGenTitle] = useState("");
  const [genResult, setGenResult] = useState<GeneratedDoc | null>(null);
  const [sending, setSending] = useState(false);

  const token = localStorage.getItem("erp_token") || "";

  useEffect(() => { loadTemplates(); }, []);
  useEffect(() => { if (tab === "generated") loadDocuments(); }, [tab]);
  useEffect(() => { if (tab === "dashboard") loadDashboard(); }, [tab]);

  async function loadTemplates() {
    try {
      let url = `/api/documents/templates?token=${token}`;
      if (filterType) url += `&type=${filterType}`;
      const r = await authFetch(url); const d = await r.json();
      setTemplates(d.templates || []);
    } catch { setTemplates([]); }
  }

  async function saveTemplate(t: Template) {
    try {
      const method = t.id ? "PUT" : "POST";
      const url = t.id ? `/api/documents/templates/${t.id}?token=${token}` : `/api/documents/templates?token=${token}`;
      await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(t) });
      setEditTmpl(null); loadTemplates();
    } catch {}
  }

  async function deleteTemplate(id: number) {
    try { await authFetch(`/api/documents/templates/${id}?token=${token}`, { method: "DELETE" }); loadTemplates(); } catch {}
  }

  async function loadDocuments() {
    try { const r = await authFetch(`/api/documents/generated?token=${token}`); const d = await r.json(); setDocuments(d.documents || []); } catch {}
  }

  async function generateDocument() {
    if (!selTemplateId) return;
    try {
      const r = await authFetch(`/api/documents/generate?token=${token}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: selTemplateId, title: genTitle, variables: genVars }),
      });
      const d = await r.json(); setGenResult(d.document || null);
    } catch {}
  }

  async function sendDocument(docId: number, via: "email" | "whatsapp", target: string) {
    setSending(true);
    try {
      await authFetch(`/api/documents/send/${docId}?token=${token}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(via === "email" ? { email: target } : { whatsapp: target }),
      });
      loadDocuments();
    } catch {}
    setSending(false);
  }

  async function generatePdf(docId: number) {
    try { await authFetch(`/api/documents/pdf/${docId}?token=${token}`, { method: "POST" }); loadDocuments(); } catch {}
  }

  async function loadSignatures(docId: number) {
    try { const r = await authFetch(`/api/documents/signatures/${docId}?token=${token}`); const d = await r.json(); setSignatures(d.signatures || []); } catch {}
  }

  async function loadDashboard() {
    try { const r = await authFetch(`/api/documents/dashboard?token=${token}`); const d = await r.json(); setDashboard(d); } catch {}
  }

  const selectedTemplate = templates.find(t => t.id === selTemplateId);

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="p-4 bg-white border-b shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="w-7 h-7 text-indigo-600" />
            <h1 className="text-2xl font-bold text-gray-800">מנוע תבניות מסמכים</h1>
          </div>
          <div className="flex gap-2">
            {(["templates", "generate", "generated", "signatures", "dashboard"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === t ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
                {t === "templates" ? "תבניות" : t === "generate" ? "הפקה" : t === "generated" ? "מסמכים" : t === "signatures" ? "חתימות" : "דשבורד"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Templates */}
      {tab === "templates" && (
        <div className="p-6 max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold">תבניות</h2>
              <select value={filterType} onChange={e => { setFilterType(e.target.value); setTimeout(loadTemplates, 100); }} className="text-sm border rounded px-3 py-1.5">
                <option value="">כל הסוגים</option>
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <button onClick={() => setEditTmpl({ id: 0, template_name: "", template_type: "quote", content_html: "", variables: [], header_html: "", footer_html: "", css: "", language: "he", version: 1, status: "draft", created_at: "" })}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
              <PlusCircle className="w-4 h-4" /> תבנית חדשה
            </button>
          </div>

          {editTmpl && (
            <div className="bg-white p-5 rounded-xl shadow mb-4 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <input value={editTmpl.template_name} onChange={e => setEditTmpl({ ...editTmpl, template_name: e.target.value })}
                  placeholder="שם התבנית" className="border rounded px-3 py-2 text-sm" />
                <select value={editTmpl.template_type} onChange={e => setEditTmpl({ ...editTmpl, template_type: e.target.value })} className="border rounded px-3 py-2 text-sm">
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select value={editTmpl.status} onChange={e => setEditTmpl({ ...editTmpl, status: e.target.value })} className="border rounded px-3 py-2 text-sm">
                  <option value="draft">טיוטה</option><option value="active">פעיל</option><option value="archived">ארכיון</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">תוכן HTML (השתמש ב-{"{{משתנה}}"} למשתנים)</label>
                <textarea value={editTmpl.content_html} onChange={e => setEditTmpl({ ...editTmpl, content_html: e.target.value })}
                  className="w-full border rounded px-3 py-2 text-sm font-mono h-40" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Header HTML</label>
                  <textarea value={editTmpl.header_html} onChange={e => setEditTmpl({ ...editTmpl, header_html: e.target.value })}
                    className="w-full border rounded px-3 py-2 text-sm font-mono h-20" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Footer HTML</label>
                  <textarea value={editTmpl.footer_html} onChange={e => setEditTmpl({ ...editTmpl, footer_html: e.target.value })}
                    className="w-full border rounded px-3 py-2 text-sm font-mono h-20" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">CSS</label>
                <textarea value={editTmpl.css} onChange={e => setEditTmpl({ ...editTmpl, css: e.target.value })}
                  className="w-full border rounded px-3 py-2 text-sm font-mono h-20" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">משתנים (JSON): [{"{ key, label, type }"}]</label>
                <textarea value={JSON.stringify(editTmpl.variables, null, 2)}
                  onChange={e => { try { setEditTmpl({ ...editTmpl, variables: JSON.parse(e.target.value) }); } catch {} }}
                  className="w-full border rounded px-3 py-2 text-sm font-mono h-20" />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setEditTmpl(null)} className="px-4 py-1.5 bg-gray-100 rounded text-sm">ביטול</button>
                <button onClick={() => saveTemplate(editTmpl)} className="flex items-center gap-1 px-4 py-1.5 bg-indigo-600 text-white rounded text-sm"><Save className="w-4 h-4" /> שמור</button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {templates.map(t => (
              <div key={t.id} className="bg-white p-4 rounded-xl shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <File className="w-5 h-5 text-indigo-500" />
                    <span className="font-semibold text-sm">{t.template_name}</span>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setEditTmpl(t)} className="p-1.5 hover:bg-gray-100 rounded"><Edit2 className="w-4 h-4 text-gray-500" /></button>
                    <button onClick={() => deleteTemplate(t.id)} className="p-1.5 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${TYPE_COLORS[t.template_type] || "bg-gray-100"}`}>{TYPE_LABELS[t.template_type] || t.template_type}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${t.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100"}`}>{STATUS_LABELS[t.status] || t.status}</span>
                  <span className="text-xs text-gray-400">v{t.version}</span>
                </div>
                <div className="text-xs text-gray-500 mt-2">{(t.variables || []).length} משתנים</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Generate wizard */}
      {tab === "generate" && (
        <div className="p-6 max-w-3xl mx-auto">
          <h2 className="text-xl font-bold mb-4">הפקת מסמך חדש</h2>
          <div className="bg-white p-5 rounded-xl shadow space-y-4">
            <div>
              <label className="text-sm font-medium block mb-1">בחר תבנית</label>
              <select value={selTemplateId || ""} onChange={e => { setSelTemplateId(Number(e.target.value)); setGenVars({}); setGenResult(null); }}
                className="w-full border rounded px-3 py-2 text-sm">
                <option value="">-- בחר --</option>
                {templates.filter(t => t.status === "active").map(t => (
                  <option key={t.id} value={t.id}>{t.template_name} ({TYPE_LABELS[t.template_type]})</option>
                ))}
              </select>
            </div>

            {selectedTemplate && (
              <>
                <div>
                  <label className="text-sm font-medium block mb-1">כותרת מסמך</label>
                  <input value={genTitle} onChange={e => setGenTitle(e.target.value)} placeholder="כותרת..."
                    className="w-full border rounded px-3 py-2 text-sm" />
                </div>

                {(selectedTemplate.variables || []).length > 0 && (
                  <div>
                    <label className="text-sm font-medium block mb-2">מילוי משתנים</label>
                    <div className="grid grid-cols-2 gap-3">
                      {selectedTemplate.variables.map((v, i) => (
                        <div key={i}>
                          <label className="text-xs text-gray-500">{v.label || v.key}</label>
                          <input value={genVars[v.key] || ""} onChange={e => setGenVars({ ...genVars, [v.key]: e.target.value })}
                            placeholder={v.key} className="w-full border rounded px-3 py-1.5 text-sm" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button onClick={generateDocument} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
                  <FileText className="w-4 h-4" /> הפק מסמך
                </button>
              </>
            )}

            {genResult && (
              <div className="border-t pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-green-700">המסמך נוצר בהצלחה!</h3>
                  <div className="flex gap-2">
                    <button onClick={() => setPreviewDoc(genResult as any)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 rounded text-sm"><Eye className="w-4 h-4" /> תצוגה</button>
                    <button onClick={() => generatePdf(genResult.id)} className="flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-700 rounded text-sm"><Download className="w-4 h-4" /> PDF</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Generated documents */}
      {tab === "generated" && (
        <div className="p-6 max-w-5xl mx-auto">
          <h2 className="text-xl font-bold mb-4">מסמכים שנוצרו</h2>
          <div className="space-y-2">
            {documents.map(d => (
              <div key={d.id} className="bg-white p-4 rounded-xl shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-indigo-500" />
                  <div>
                    <div className="font-semibold text-sm">{d.title}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${TYPE_COLORS[d.template_type] || "bg-gray-100"}`}>{TYPE_LABELS[d.template_type] || d.template_type}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${d.status === "signed" ? "bg-green-100 text-green-700" : d.status === "sent" ? "bg-blue-100 text-blue-700" : "bg-gray-100"}`}>
                        {STATUS_LABELS[d.status] || d.status}
                      </span>
                      <span className="text-xs text-gray-400">{new Date(d.created_at).toLocaleDateString("he-IL")}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setPreviewDoc(d)} className="p-1.5 hover:bg-blue-50 rounded" title="תצוגה"><Eye className="w-4 h-4 text-blue-500" /></button>
                  <button onClick={() => generatePdf(d.id)} className="p-1.5 hover:bg-green-50 rounded" title="PDF"><Download className="w-4 h-4 text-green-500" /></button>
                  <button onClick={() => { setTab("signatures"); loadSignatures(d.id); }} className="p-1.5 hover:bg-purple-50 rounded" title="חתימות"><Pen className="w-4 h-4 text-purple-500" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Signatures */}
      {tab === "signatures" && (
        <div className="p-6 max-w-4xl mx-auto">
          <h2 className="text-xl font-bold mb-4">מעקב חתימות</h2>
          {signatures.length > 0 ? (
            <div className="space-y-2">
              {signatures.map(s => (
                <div key={s.id} className="bg-white p-4 rounded-xl shadow-sm flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Pen className={`w-5 h-5 ${s.status === "signed" ? "text-green-600" : s.status === "declined" ? "text-red-600" : "text-yellow-500"}`} />
                    <div>
                      <div className="font-semibold text-sm">{s.signer_name}</div>
                      <div className="text-xs text-gray-500">{s.signer_email} | {ROLE_LABELS[s.signer_role] || s.signer_role}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${s.status === "signed" ? "bg-green-100 text-green-700" : s.status === "declined" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                      {s.status === "signed" ? "חתם" : s.status === "declined" ? "דחה" : "ממתין"}
                    </span>
                    {s.signed_at && <span className="text-xs text-gray-400">{new Date(s.signed_at).toLocaleString("he-IL")}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-center mt-8">בחר מסמך מהרשימה לצפייה בחתימות</p>
          )}
        </div>
      )}

      {/* Dashboard */}
      {tab === "dashboard" && dashboard && (
        <div className="p-6 max-w-5xl mx-auto">
          <h2 className="text-xl font-bold mb-4">דשבורד מסמכים</h2>
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-4 rounded-xl shadow-sm text-center">
              <File className="w-6 h-6 mx-auto text-indigo-600 mb-1" />
              <div className="text-2xl font-bold">{dashboard.total_templates}</div>
              <div className="text-xs text-gray-500">תבניות פעילות</div>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm text-center">
              <FileText className="w-6 h-6 mx-auto text-green-600 mb-1" />
              <div className="text-2xl font-bold">{dashboard.total_generated}</div>
              <div className="text-xs text-gray-500">מסמכים שנוצרו</div>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm text-center">
              <Clock className="w-6 h-6 mx-auto text-blue-600 mb-1" />
              <div className="text-2xl font-bold">{dashboard.generated_today}</div>
              <div className="text-xs text-gray-500">נוצרו היום</div>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm text-center">
              <Pen className="w-6 h-6 mx-auto text-purple-600 mb-1" />
              <div className="text-2xl font-bold">{dashboard.pending_signatures}</div>
              <div className="text-xs text-gray-500">ממתינים לחתימה</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-xl shadow-sm">
              <h3 className="font-bold mb-3">מסמכים לפי סוג</h3>
              {dashboard.documents_by_type.map(d => (
                <div key={d.template_type} className="flex items-center justify-between py-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${TYPE_COLORS[d.template_type] || "bg-gray-100"}`}>{TYPE_LABELS[d.template_type] || d.template_type}</span>
                  <span className="font-semibold">{d.count}</span>
                </div>
              ))}
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm">
              <h3 className="font-bold mb-3">מסמכים לפי סטטוס</h3>
              {dashboard.documents_by_status.map(d => (
                <div key={d.status} className="flex items-center justify-between py-1">
                  <span className="text-sm">{STATUS_LABELS[d.status] || d.status}</span>
                  <span className="font-semibold">{d.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Preview modal */}
      {previewDoc && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-bold">{previewDoc.title}</h3>
              <button onClick={() => setPreviewDoc(null)} className="p-1.5 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <iframe srcDoc={previewDoc.generated_html} className="w-full h-full min-h-[600px] border rounded" title="preview" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

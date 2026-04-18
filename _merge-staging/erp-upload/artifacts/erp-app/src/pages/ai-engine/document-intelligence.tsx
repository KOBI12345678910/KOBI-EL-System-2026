import { useState, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/utils";
import {
  FileText, Upload, CheckCircle, XCircle, Clock, RefreshCw, Eye,
  AlertTriangle, BarChart3, Zap, FileSearch, Settings, Plus,
  ArrowRight, Search, Layers, Sparkles, FileCheck, FilePlus,
  ChevronDown, Percent, Brain, Target, Loader2
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";

interface Job {
  id: number; job_code: string; document_name: string; document_type: string;
  status: string; confidence: number; processing_time_ms: number;
  extracted_data: any; verified_by: string; created_at: string; source: string;
}
interface Template { id: number; name: string; document_type: string; sample_count: number; accuracy: number; active: boolean; }
interface Dashboard { stats: any; byType: any[]; byStatus: any[]; recentJobs: any[]; templates: any[]; }

const STATUS_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  uploaded: { icon: Upload, color: "text-blue-400", label: "הועלה" },
  queued: { icon: Clock, color: "text-yellow-400", label: "בתור" },
  processing: { icon: Loader2, color: "text-cyan-400", label: "בעיבוד" },
  extracted: { icon: Sparkles, color: "text-emerald-400", label: "חולץ" },
  verified: { icon: CheckCircle, color: "text-green-400", label: "אומת" },
  failed: { icon: XCircle, color: "text-red-400", label: "נכשל" },
  archived: { icon: Layers, color: "text-gray-400", label: "בארכיון" },
};

const TYPE_LABELS: Record<string, string> = {
  invoice: "חשבונית", po: "הזמנת רכש", quote: "הצעת מחיר", contract: "חוזה",
  drawing: "תכנית", certificate: "תעודה", measurement_sheet: "גיליון מדידה",
  delivery_note: "תעודת משלוח", receipt: "קבלה", other: "אחר"
};

const PIE_COLORS = ["#3B82F6", "#10B981", "#EAB308", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4", "#F97316"];

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round((confidence || 0) * 100);
  const color = pct >= 90 ? "text-emerald-400 bg-emerald-500/20" : pct >= 70 ? "text-yellow-400 bg-yellow-500/20" : "text-red-400 bg-red-500/20";
  return <span className={`px-2 py-0.5 rounded text-xs font-mono ${color}`}>{pct}%</span>;
}

function formatDate(d: string) { return d ? new Date(d).toLocaleDateString("he-IL") : "-"; }

export default function DocumentIntelligencePage() {
  const [tab, setTab] = useState<"dashboard" | "jobs" | "upload" | "templates">("dashboard");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [processing, setProcessing] = useState<number | null>(null);

  // Upload form
  const [uploadForm, setUploadForm] = useState({ document_name: "", document_type: "invoice", document_url: "", source: "manual" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, jobsRes, tplRes] = await Promise.all([
        authFetch("/api/doc-intel/dashboard"), authFetch("/api/doc-intel/jobs"),
        authFetch("/api/doc-intel/templates")
      ]);
      setDashboard(await dashRes.json()); setJobs(await jobsRes.json()); setTemplates(await tplRes.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const uploadDoc = async () => {
    const res = await authFetch("/api/doc-intel/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(uploadForm) });
    const job = await res.json();
    setUploadForm({ document_name: "", document_type: "invoice", document_url: "", source: "manual" });
    load();
    // Auto-process
    processJob(job.id);
  };

  const processJob = async (id: number) => {
    setProcessing(id);
    try {
      const res = await authFetch(`/api/doc-intel/process/${id}`, { method: "POST" });
      const result = await res.json();
      setSelectedJob(result);
      load();
    } catch (e) { console.error(e); }
    setProcessing(null);
  };

  const verifyJob = async (id: number) => {
    await authFetch(`/api/doc-intel/verify/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verified_by: "user", accuracy_feedback: 0.9 }) });
    setSelectedJob(null);
    load();
  };

  const viewJobDetails = async (id: number) => {
    const res = await authFetch(`/api/doc-intel/jobs/${id}`);
    setSelectedJob(await res.json());
  };

  const d = dashboard;

  return (
    <div className="min-h-screen bg-background text-foreground p-4 space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">מנוע מסמכים חכם</h1>
            <p className="text-sm text-muted-foreground">Advanced Document Intelligence</p>
          </div>
        </div>
        <button onClick={load} className="p-2 rounded-lg bg-card hover:bg-accent transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-card rounded-lg p-1">
        {([["dashboard", "דשבורד", BarChart3], ["jobs", "משימות", FileText], ["upload", "העלאה", Upload], ["templates", "תבניות", Settings]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key as any)} className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${tab === key ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {/* DASHBOARD */}
      {tab === "dashboard" && d && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              { label: 'סה"כ', value: d.stats?.total_jobs || 0, icon: FileText, color: "from-blue-500/20" },
              { label: "הצלחה", value: d.stats?.successful || 0, icon: CheckCircle, color: "from-emerald-500/20" },
              { label: "נכשלו", value: d.stats?.failed || 0, icon: XCircle, color: "from-red-500/20" },
              { label: "בעיבוד", value: d.stats?.in_progress || 0, icon: Loader2, color: "from-cyan-500/20" },
              { label: "אמינות ממוצעת", value: `${Math.round((d.stats?.avg_confidence || 0) * 100)}%`, icon: Target, color: "from-purple-500/20" },
              { label: "זמן עיבוד", value: `${d.stats?.avg_processing_ms || 0}ms`, icon: Zap, color: "from-yellow-500/20" },
              { label: "היום", value: d.stats?.today || 0, icon: Clock, color: "from-indigo-500/20" },
            ].map((kpi, i) => (
              <div key={i} className={`bg-gradient-to-br ${kpi.color} to-transparent border border-border/50 rounded-xl p-3`}>
                <div className="flex items-center gap-2 mb-1"><kpi.icon className="w-4 h-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">{kpi.label}</span></div>
                <div className="text-xl font-bold">{kpi.value}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* By Type */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-3">מסמכים לפי סוג</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={(d.byType || []).map(t => ({ name: TYPE_LABELS[t.document_type] || t.document_type, count: Number(t.count), confidence: Number(t.avg_conf || 0) * 100 }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* By Status */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-3">סטטוס משימות</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={(d.byStatus || []).map((s, i) => ({ name: STATUS_CONFIG[s.status]?.label || s.status, value: Number(s.count) }))} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                    {(d.byStatus || []).map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 justify-center">
                {(d.byStatus || []).map((s: any, i: number) => (
                  <span key={i} className="flex items-center gap-1 text-xs"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />{STATUS_CONFIG[s.status]?.label || s.status}: {s.count}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Recent Jobs */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3">משימות אחרונות</h3>
            <div className="space-y-2">
              {(d.recentJobs || []).map((j: any) => {
                const cfg = STATUS_CONFIG[j.status] || STATUS_CONFIG.uploaded;
                return (
                  <div key={j.id} className="flex items-center justify-between p-2 rounded-lg bg-background/50 hover:bg-accent/50 cursor-pointer" onClick={() => viewJobDetails(j.id)}>
                    <div className="flex items-center gap-3">
                      <cfg.icon className={`w-4 h-4 ${cfg.color} ${j.status === 'processing' ? 'animate-spin' : ''}`} />
                      <div>
                        <div className="text-sm font-medium">{j.document_name || j.job_code}</div>
                        <div className="text-xs text-muted-foreground">{TYPE_LABELS[j.document_type] || j.document_type} - {formatDate(j.created_at)}</div>
                      </div>
                    </div>
                    {j.confidence > 0 && <ConfidenceBadge confidence={j.confidence} />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* JOBS TAB */}
      {tab === "jobs" && (
        <div className="space-y-3">
          <h3 className="font-semibold">כל המשימות ({jobs.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-right">
                  <th className="px-3 py-2">קוד</th><th className="px-3 py-2">מסמך</th><th className="px-3 py-2">סוג</th>
                  <th className="px-3 py-2">סטטוס</th><th className="px-3 py-2">אמינות</th><th className="px-3 py-2">מקור</th>
                  <th className="px-3 py-2">תאריך</th><th className="px-3 py-2">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(j => {
                  const cfg = STATUS_CONFIG[j.status] || STATUS_CONFIG.uploaded;
                  return (
                    <tr key={j.id} className="border-b border-border/50 hover:bg-accent/50">
                      <td className="px-3 py-2 font-mono text-xs">{j.job_code}</td>
                      <td className="px-3 py-2">{j.document_name || "-"}</td>
                      <td className="px-3 py-2"><span className="px-2 py-0.5 bg-accent rounded text-xs">{TYPE_LABELS[j.document_type] || j.document_type}</span></td>
                      <td className="px-3 py-2"><span className={`flex items-center gap-1 ${cfg.color}`}><cfg.icon className={`w-3 h-3 ${j.status === 'processing' ? 'animate-spin' : ''}`} />{cfg.label}</span></td>
                      <td className="px-3 py-2">{j.confidence > 0 ? <ConfidenceBadge confidence={j.confidence} /> : "-"}</td>
                      <td className="px-3 py-2 text-xs">{j.source}</td>
                      <td className="px-3 py-2 text-xs">{formatDate(j.created_at)}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <button onClick={() => viewJobDetails(j.id)} className="p-1 rounded hover:bg-accent"><Eye className="w-3.5 h-3.5" /></button>
                          {j.status === "uploaded" && (
                            <button onClick={() => processJob(j.id)} disabled={processing === j.id} className="p-1 rounded hover:bg-accent text-cyan-400">
                              {processing === j.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          {j.status === "extracted" && (
                            <button onClick={() => verifyJob(j.id)} className="p-1 rounded hover:bg-accent text-emerald-400"><FileCheck className="w-3.5 h-3.5" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* UPLOAD TAB */}
      {tab === "upload" && (
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="bg-card border border-dashed border-border rounded-xl p-8 text-center">
            <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-semibold mb-1">העלה מסמך לעיבוד</h3>
            <p className="text-sm text-muted-foreground mb-4">המנוע החכם יזהה, יסווג ויחלץ נתונים אוטומטית</p>
            <div className="space-y-3 text-right">
              <input placeholder="שם מסמך" className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm" value={uploadForm.document_name} onChange={e => setUploadForm({ ...uploadForm, document_name: e.target.value })} />
              <input placeholder="URL / נתיב מסמך" className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm" value={uploadForm.document_url} onChange={e => setUploadForm({ ...uploadForm, document_url: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <select className="bg-background border border-border rounded-lg px-4 py-2.5 text-sm" value={uploadForm.document_type} onChange={e => setUploadForm({ ...uploadForm, document_type: e.target.value })}>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select className="bg-background border border-border rounded-lg px-4 py-2.5 text-sm" value={uploadForm.source} onChange={e => setUploadForm({ ...uploadForm, source: e.target.value })}>
                  {["manual", "email", "whatsapp", "api", "scanner", "mobile"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <button onClick={uploadDoc} className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg font-medium flex items-center justify-center gap-2">
                <Sparkles className="w-4 h-4" /> העלה ועבד
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TEMPLATES TAB */}
      {tab === "templates" && (
        <div className="space-y-3">
          <h3 className="font-semibold">תבניות חילוץ ({templates.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {templates.map(t => (
              <div key={t.id} className={`bg-card border rounded-xl p-4 ${t.active ? "border-border" : "border-border/30 opacity-60"}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm">{t.name}</span>
                  {t.active ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="px-2 py-0.5 bg-accent rounded">{TYPE_LABELS[t.document_type] || t.document_type}</span>
                  <span>דגימות: {t.sample_count}</span>
                  <span className={`font-mono ${t.accuracy >= 0.9 ? "text-emerald-400" : t.accuracy >= 0.7 ? "text-yellow-400" : "text-red-400"}`}>{Math.round(t.accuracy * 100)}%</span>
                </div>
              </div>
            ))}
            {templates.length === 0 && <p className="text-muted-foreground text-center py-8 col-span-full">אין תבניות - צור תבנית חדשה</p>}
          </div>
        </div>
      )}

      {/* Job Detail Modal */}
      {selectedJob && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setSelectedJob(null)}>
          <div className="bg-card border border-border rounded-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()} dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">פרטי משימה - {selectedJob.job_code}</h3>
              <button onClick={() => setSelectedJob(null)} className="text-muted-foreground hover:text-foreground">&times;</button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              <div><span className="text-muted-foreground">מסמך:</span> {selectedJob.document_name}</div>
              <div><span className="text-muted-foreground">סוג:</span> {TYPE_LABELS[selectedJob.document_type] || selectedJob.document_type}</div>
              <div><span className="text-muted-foreground">סטטוס:</span> {STATUS_CONFIG[selectedJob.status]?.label}</div>
              <div><span className="text-muted-foreground">אמינות:</span> {selectedJob.confidence ? <ConfidenceBadge confidence={selectedJob.confidence} /> : "-"}</div>
            </div>
            {selectedJob.extracted_data && Object.keys(selectedJob.extracted_data).length > 0 && (
              <div>
                <h4 className="font-semibold text-sm mb-2">נתונים שחולצו</h4>
                <div className="space-y-1">
                  {Object.entries(selectedJob.extracted_data).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between p-2 bg-background rounded-lg text-sm">
                      <span className="text-muted-foreground">{k.replace(/_/g, " ")}</span>
                      <span className="font-mono">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {selectedJob.extracted_fields && (
              <div className="mt-4">
                <h4 className="font-semibold text-sm mb-2">שדות מפורטים</h4>
                <div className="space-y-1">
                  {selectedJob.extracted_fields.map((f: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-background rounded-lg text-sm">
                      <span className="text-muted-foreground">{f.field_name || f.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{f.field_value || f.value}</span>
                        <ConfidenceBadge confidence={f.confidence} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {selectedJob.status === "extracted" && (
              <button onClick={() => verifyJob(selectedJob.id)} className="mt-4 w-full bg-emerald-600 text-white py-2 rounded-lg flex items-center justify-center gap-2">
                <FileCheck className="w-4 h-4" /> אשר ואמת
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

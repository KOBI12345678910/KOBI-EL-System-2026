import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Plus, CheckCircle, XCircle, RefreshCw, X, Download, AlertTriangle, Play } from "lucide-react";
import { authFetch } from "@/lib/utils";

const API = "/api";

const REPORT_TYPES: Record<string, { label: string; desc: string; color: string; icon: string }> = {
  iso27001: { label: "ISO 27001", desc: "Information Security Management", color: "bg-blue-600", icon: "🔐" },
  soc2: { label: "SOC 2 Type II", desc: "Service Organization Controls", color: "bg-purple-600", icon: "🛡️" },
  privacy_law_il: { label: "חוק הגנת הפרטיות", desc: "חוק הגנת הפרטיות הישראלי", color: "bg-cyan-600", icon: "🇮🇱" },
  gdpr: { label: "GDPR", desc: "General Data Protection Regulation", color: "bg-green-600", icon: "🇪🇺" },
};

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  completed: { label: "הושלם", color: "bg-green-500/20 text-green-400" },
  draft: { label: "טיוטה", color: "bg-muted/40 text-muted-foreground" },
  generating: { label: "מייצר...", color: "bg-blue-500/20 text-blue-400" },
};

function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#f59e0b" : "#ef4444";
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div className="relative w-16 h-16 flex items-center justify-center">
      <svg width="64" height="64" viewBox="0 0 64 64" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="32" cy="32" r={r} fill="none" stroke="#1e293b" strokeWidth="6" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="6" strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      </svg>
      <div className="absolute text-sm font-bold text-foreground">{score}%</div>
    </div>
  );
}

export default function ComplianceReportsPage() {
  const [reports, setReports] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showGenForm, setShowGenForm] = useState(false);
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [genForm, setGenForm] = useState<any>({ report_type: "iso27001" });

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API}/security/compliance-reports?limit=50`);
      if (res.ok) { const d = await res.json(); setReports(d.data || []); setTotal(d.total || 0); }
    } catch { }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const generateReport = async () => {
    setGenerating(true);
    try {
      const payload = {
        ...genForm,
        period_start: genForm.period_start || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        period_end: genForm.period_end || new Date().toISOString().split("T")[0],
        generated_by: "Admin",
      };
      const res = await authFetch(`${API}/security/compliance-reports/generate`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
      });
      if (res.ok) {
        const newReport = await res.json();
        setSelectedReport(newReport);
        setShowGenForm(false);
        load();
      }
    } catch { }
    setGenerating(false);
  };

  const exportReport = (report: any) => {
    const content = `COMPLIANCE REPORT
=================
Type: ${REPORT_TYPES[report.report_type]?.label || report.report_type}
Generated: ${new Date(report.generated_at || report.created_at).toLocaleString("he-IL")}
Period: ${report.period_start || "—"} to ${report.period_end || "—"}
Score: ${report.score}%

FINDINGS:
${(report.findings || []).map((f: any) => `[${(f.status || "").toUpperCase()}] ${f.control}: ${f.description}`).join("\n")}

EVIDENCE:
${JSON.stringify(report.evidence || {}, null, 2)}
`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `compliance_${report.report_type}_${report.id}.txt`;
    a.click();
  };

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="text-cyan-400" size={26} />
            דוחות תאימות
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ISO 27001 | SOC 2 | חוק הגנת הפרטיות הישראלי | GDPR</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground btn-ghost">
            <RefreshCw size={13} /> רענון
          </button>
          <button onClick={() => { setGenForm({ report_type: "iso27001" }); setShowGenForm(true); }} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium">
            <Play size={16} /> ייצר דוח חדש
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Object.entries(REPORT_TYPES).map(([key, rt]) => {
          const reportsOfType = reports.filter(r => r.report_type === key);
          const latest = reportsOfType[0];
          return (
            <div key={key} className={`${rt.color}/10 border border-${rt.color.replace("bg-", "")}/30 rounded-2xl p-4`}>
              <div className="text-xl mb-1">{rt.icon}</div>
              <div className="font-bold text-foreground text-sm">{rt.label}</div>
              <div className="text-xs text-muted-foreground">{rt.desc}</div>
              {latest && (
                <div className="mt-2 text-xs">
                  <span className="text-muted-foreground">ציון אחרון: </span>
                  <span className={`font-bold ${latest.score >= 80 ? "text-green-400" : latest.score >= 60 ? "text-amber-400" : "text-red-400"}`}>{latest.score}%</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 bg-muted/20 rounded-xl animate-pulse" />)}</div>
      ) : reports.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText size={48} className="mx-auto mb-4 opacity-20" />
          <p className="font-medium">אין דוחות תאימות עדיין</p>
          <p className="text-sm mt-1">לחץ על "ייצר דוח חדש" להתחלה</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map(report => {
            const rt = REPORT_TYPES[report.report_type];
            const st = STATUS_MAP[report.status] || STATUS_MAP.draft;
            const findings = report.findings || [];
            const passed = findings.filter((f: any) => f.status === "pass").length;
            return (
              <motion.div
                key={report.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card border border-border/50 rounded-2xl p-4 hover:border-primary/30 transition-colors cursor-pointer"
                onClick={() => setSelectedReport(report)}
              >
                <div className="flex items-center gap-4">
                  <ScoreRing score={report.score || 0} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-foreground">{rt?.label || report.report_type}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${st.color}`}>{st.label}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{rt?.desc}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      תקופה: {report.period_start || "—"} עד {report.period_end || "—"} |
                      {" "}{passed}/{findings.length} בקרות עברו |
                      {" "}הופק ע"י {report.generated_by || "מערכת"}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={e => { e.stopPropagation(); exportReport(report); }} className="p-2 hover:bg-muted rounded-lg" title="ייצא">
                      <Download size={15} className="text-muted-foreground" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {showGenForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowGenForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="font-bold text-foreground">ייצור דוח תאימות</h2>
                <button onClick={() => setShowGenForm(false)} className="p-1 hover:bg-muted rounded-lg"><X size={18} /></button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">סוג דוח *</label>
                  <select value={genForm.report_type || "iso27001"} onChange={e => setGenForm({ ...genForm, report_type: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm">
                    {Object.entries(REPORT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label} — {v.desc}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1.5">מתאריך</label>
                    <input type="date" value={genForm.period_start || ""} onChange={e => setGenForm({ ...genForm, period_start: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1.5">עד תאריך</label>
                    <input type="date" value={genForm.period_end || ""} onChange={e => setGenForm({ ...genForm, period_end: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="bg-muted/20 rounded-xl p-3 text-xs text-muted-foreground">
                  <AlertTriangle size={12} className="inline ml-1 text-amber-400" />
                  הדוח ייאסף נתונים אוטומטית מ: יומן ביקורת, ניהול משתמשים, הגדרות הצפנה, גיבויים ובקשות DSAR
                </div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowGenForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={generateReport} disabled={generating} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50">
                  <Play size={14} />{generating ? "מייצר..." : "ייצר דוח"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {selectedReport && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setSelectedReport(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="font-bold text-foreground">
                  {REPORT_TYPES[selectedReport.report_type]?.icon} {REPORT_TYPES[selectedReport.report_type]?.label || selectedReport.report_type}
                </h2>
                <div className="flex gap-2">
                  <button onClick={() => exportReport(selectedReport)} className="flex items-center gap-1.5 px-3 py-1.5 bg-muted hover:bg-muted/80 rounded-lg text-xs text-muted-foreground">
                    <Download size={13} /> ייצא
                  </button>
                  <button onClick={() => setSelectedReport(null)} className="p-1 hover:bg-muted rounded-lg"><X size={18} /></button>
                </div>
              </div>
              <div className="p-5 space-y-5">
                <div className="flex items-center gap-6">
                  <ScoreRing score={selectedReport.score || 0} />
                  <div>
                    <div className="text-2xl font-bold text-foreground">{selectedReport.score}% ציון תאימות</div>
                    <div className="text-sm text-muted-foreground mt-0.5">
                      תקופה: {selectedReport.period_start || "—"} — {selectedReport.period_end || "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      הופק ע"י {selectedReport.generated_by || "מערכת"} ב-{new Date(selectedReport.generated_at || selectedReport.created_at).toLocaleString("he-IL")}
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground mb-3">ממצאי בקרה</h3>
                  <div className="space-y-2">
                    {(selectedReport.findings || []).map((f: any, i: number) => (
                      <div key={i} className={`flex items-start gap-3 p-3 rounded-xl ${f.status === "pass" ? "bg-green-500/10 border border-green-500/20" : f.status === "fail" ? "bg-red-500/10 border border-red-500/20" : "bg-muted/20"}`}>
                        {f.status === "pass" ? <CheckCircle size={16} className="text-green-400 mt-0.5 shrink-0" /> : f.status === "fail" ? <XCircle size={16} className="text-red-400 mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />}
                        <div>
                          <div className="text-sm font-medium text-foreground">{f.control}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{f.description}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {selectedReport.evidence && (
                  <div>
                    <h3 className="font-semibold text-foreground mb-3">ראיות שנאספו</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(selectedReport.evidence).map(([k, v]: any) => (
                        <div key={k} className="bg-background rounded-lg p-3">
                          <div className="text-xs text-muted-foreground">{k.replace(/_/g, " ")}</div>
                          <div className="text-sm font-bold text-foreground mt-0.5">{String(v)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

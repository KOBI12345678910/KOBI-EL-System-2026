import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Plus, Play, Calendar, Clock, Trash2, Edit2,
  Download, Eye, ChevronDown, ChevronUp, Sparkles, Brain,
  BarChart3, TrendingUp, Package, Users, Factory, CheckCircle2,
  AlertTriangle, ArrowUpRight, X, RefreshCw, Bell, Settings,
} from "lucide-react";
import { authFetch } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || "";
const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

const REPORT_TYPES = [
  { value: "full_report", label: "דוח כולל", icon: BarChart3, color: "text-violet-400", bg: "bg-violet-500/10" },
  { value: "sales_summary", label: "סיכום מכירות", icon: TrendingUp, color: "text-blue-400", bg: "bg-blue-500/10" },
  { value: "financial_health", label: "בריאות פיננסית", icon: TrendingUp, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { value: "inventory_status", label: "מצב מלאי", icon: Package, color: "text-amber-400", bg: "bg-amber-500/10" },
  { value: "production_efficiency", label: "יעילות ייצור", icon: Factory, color: "text-orange-400", bg: "bg-orange-500/10" },
  { value: "hr_metrics", label: "מדדי HR", icon: Users, color: "text-cyan-400", bg: "bg-cyan-500/10" },
];

const SCHEDULE_TYPES = [
  { value: "daily", label: "יומי" },
  { value: "weekly", label: "שבועי" },
  { value: "monthly", label: "חודשי" },
];

function fmt(n: number, currency = true) {
  if (currency) return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);
  return new Intl.NumberFormat("he-IL").format(n);
}

interface ScheduledReport {
  id: number;
  name: string;
  description: string;
  report_type: string;
  schedule_type: string;
  schedule_day: number | null;
  schedule_hour: number;
  is_active: boolean;
  last_run: string | null;
  next_run: string | null;
  created_at: string;
}

interface GeneratedReport {
  id: number;
  schedule_id: number | null;
  report_type: string;
  title: string;
  period_label: string;
  start_date: string;
  end_date: string;
  content: any;
  narrative: any;
  narrative_parsed?: any;
  action_items: any[];
  status: string;
  generated_at: string;
}

function ReportViewer({ report, onClose }: { report: GeneratedReport; onClose: () => void }) {
  const parsed = report.narrative_parsed || (typeof report.narrative === "object" ? report.narrative : null);
  const kpi = report.content || {};
  const actionItems = Array.isArray(report.action_items) ? report.action_items :
    (typeof report.action_items === "string" ? JSON.parse(report.action_items) : []);
  const reportType = REPORT_TYPES.find(t => t.value === report.report_type);
  const ReportIcon = reportType?.icon || BarChart3;

  const handleExportPDF = () => {
    const content = document.getElementById("report-viewer-content");
    if (content) window.print();
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center overflow-y-auto pt-4 pb-8" dir="rtl">
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-slate-900 border border-border rounded-2xl w-full max-w-3xl mx-4 shadow-2xl"
        id="report-viewer-content"
      >
        <div className="flex items-center justify-between p-5 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${reportType?.bg || "bg-violet-500/10"}`}>
              <ReportIcon className={`w-4 h-4 ${reportType?.color || "text-violet-400"}`} />
            </div>
            <div>
              <h2 className="font-bold text-foreground text-base">{report.title}</h2>
              <p className="text-xs text-muted-foreground">
                {report.start_date} — {report.end_date} | נוצר: {new Date(report.generated_at).toLocaleString("he-IL")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleExportPDF}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded-xl hover:bg-blue-500/20 transition-colors">
              <Download className="w-3.5 h-3.5" /> PDF
            </button>
            <button onClick={onClose}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/20 rounded-lg transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {parsed?.executive_summary && (
            <div className="bg-gradient-to-br from-violet-500/10 to-indigo-500/10 border border-violet-500/20 rounded-xl p-4">
              <h3 className="font-bold text-foreground text-sm mb-2 flex items-center gap-2">
                <Brain className="w-4 h-4 text-violet-400" /> סיכום מנהלים
              </h3>
              <p className="text-sm text-foreground/80 leading-relaxed">{parsed.executive_summary}</p>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {kpi.revenue > 0 && (
              <div className="bg-card border border-border rounded-xl p-3">
                <div className="text-xs text-muted-foreground mb-1">הכנסות</div>
                <div className="text-lg font-bold text-emerald-400">{fmt(kpi.revenue)}</div>
              </div>
            )}
            {kpi.expenses > 0 && (
              <div className="bg-card border border-border rounded-xl p-3">
                <div className="text-xs text-muted-foreground mb-1">הוצאות</div>
                <div className="text-lg font-bold text-red-400">{fmt(kpi.expenses)}</div>
              </div>
            )}
            {kpi.grossProfit !== undefined && (
              <div className="bg-card border border-border rounded-xl p-3">
                <div className="text-xs text-muted-foreground mb-1">רווח גולמי</div>
                <div className={`text-lg font-bold ${kpi.grossProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {fmt(kpi.grossProfit)}
                </div>
              </div>
            )}
            {kpi.profitMargin !== undefined && (
              <div className="bg-card border border-border rounded-xl p-3">
                <div className="text-xs text-muted-foreground mb-1">שולי רווח</div>
                <div className="text-lg font-bold text-blue-400">{kpi.profitMargin}%</div>
              </div>
            )}
            {kpi.invoiceCount > 0 && (
              <div className="bg-card border border-border rounded-xl p-3">
                <div className="text-xs text-muted-foreground mb-1">חשבוניות</div>
                <div className="text-lg font-bold text-foreground">{fmt(kpi.invoiceCount, false)}</div>
              </div>
            )}
            {kpi.activeEmployees > 0 && (
              <div className="bg-card border border-border rounded-xl p-3">
                <div className="text-xs text-muted-foreground mb-1">עובדים פעילים</div>
                <div className="text-lg font-bold text-cyan-400">{fmt(kpi.activeEmployees, false)}</div>
              </div>
            )}
            {kpi.productionOrders > 0 && (
              <div className="bg-card border border-border rounded-xl p-3">
                <div className="text-xs text-muted-foreground mb-1">הוראות עבודה</div>
                <div className="text-lg font-bold text-amber-400">{fmt(kpi.productionOrders, false)}</div>
              </div>
            )}
            {kpi.lowStockCount > 0 && (
              <div className="bg-card border border-border rounded-xl p-3">
                <div className="text-xs text-muted-foreground mb-1">מלאי נמוך</div>
                <div className="text-lg font-bold text-orange-400">{fmt(kpi.lowStockCount, false)}</div>
              </div>
            )}
          </div>

          {parsed?.strengths?.length > 0 && (
            <div>
              <h3 className="font-semibold text-foreground text-sm mb-2 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" /> נקודות חוזק
              </h3>
              <div className="space-y-2">
                {parsed.strengths.map((s: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                    <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-foreground/80">{s}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {parsed?.improvements?.length > 0 && (
            <div>
              <h3 className="font-semibold text-foreground text-sm mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" /> תחומים לשיפור
              </h3>
              <div className="space-y-2">
                {parsed.improvements.map((s: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-foreground/80">{s}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {actionItems.length > 0 && (
            <div>
              <h3 className="font-semibold text-foreground text-sm mb-2 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-400" /> פריטי פעולה
              </h3>
              <div className="space-y-2">
                {actionItems.map((item: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-card border border-border rounded-xl">
                    <span className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full font-semibold mt-0.5 ${
                      item.priority === "high" ? "bg-red-500/10 text-red-400" :
                      item.priority === "medium" ? "bg-amber-500/10 text-amber-400" :
                      "bg-blue-500/10 text-blue-400"
                    }`}>
                      {item.priority === "high" ? "גבוה" : item.priority === "medium" ? "בינוני" : "נמוך"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{item.title}</p>
                      {item.description && <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>}
                      {(item.owner || item.due_days) && (
                        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                          {item.owner && <span className="flex items-center gap-1"><Users className="w-3 h-3" />{item.owner}</span>}
                          {item.due_days && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />תוך {item.due_days} ימים</span>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function ScheduleModal({ onClose, onSaved, existing }: {
  onClose: () => void;
  onSaved: () => void;
  existing?: ScheduledReport | null;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(existing?.name || "");
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [description, setDescription] = useState(existing?.description || "");
  const [reportType, setReportType] = useState(existing?.report_type || "full_report");
  const [scheduleType, setScheduleType] = useState(existing?.schedule_type || "weekly");
  const [scheduleHour, setScheduleHour] = useState(existing?.schedule_hour ?? 7);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "שגיאה", description: "שם הדוח נדרש", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body = { name, description, report_type: reportType, schedule_type: scheduleType, schedule_hour: scheduleHour };
      const url = existing ? `${API}/ai-biz-auto/scheduled-reports/${existing.id}` : `${API}/ai-biz-auto/scheduled-reports`;
      const method = existing ? "PUT" : "POST";
      const r = await authFetch(url, { method, headers: headers(), body: JSON.stringify(body) });
      if (!r.ok) throw new Error("Save failed");
      toast({ title: "נשמר", description: "הגדרות הדוח נשמרו בהצלחה" });
      onSaved();
    } catch {
      toast({ title: "שגיאה", description: "שמירה נכשלה", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center" dir="rtl">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-slate-900 border border-border rounded-2xl w-full max-w-md mx-4 shadow-2xl"
      >
        <div className="flex items-center justify-between p-5 border-b border-border/50">
          <h2 className="font-bold text-foreground">{existing ? "עריכת לוח זמנים" : "דוח מתוזמן חדש"}</h2>
          <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">שם הדוח</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="דוח שבועי מנהלים"
              className="w-full bg-muted/30 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">תיאור (אופציונלי)</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="תיאור קצר של הדוח"
              className="w-full bg-muted/30 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">סוג הדוח</label>
            <select
              value={reportType}
              onChange={e => setReportType(e.target.value)}
              className="w-full bg-muted/30 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground"
            >
              {REPORT_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">תדירות</label>
              <select
                value={scheduleType}
                onChange={e => setScheduleType(e.target.value)}
                className="w-full bg-muted/30 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground"
              >
                {SCHEDULE_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">שעת שליחה</label>
              <input
                type="number"
                min={0}
                max={23}
                value={scheduleHour}
                onChange={e => setScheduleHour(Number(e.target.value))}
                className="w-full bg-muted/30 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 p-5 border-t border-border/50">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-muted/20 hover:bg-muted/40 text-muted-foreground rounded-xl text-sm transition-colors">
            ביטול
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 border border-violet-500/40 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            שמור
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function AIAutomatedReports() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [activeTab, setActiveTab] = useState<"reports" | "schedules">("reports");
  const [viewingReport, setViewingReport] = useState<GeneratedReport | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduledReport | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [generatePeriod, setGeneratePeriod] = useState("monthly");
  const [generateType, setGenerateType] = useState("full_report");

  const { data: reports = [], isLoading: reportsLoading } = useQuery<GeneratedReport[]>({
    queryKey: ["ai-generated-reports"],
    queryFn: async () => {
      const r = await authFetch(`${API}/ai-biz-auto/reports`, { headers: headers() });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: schedules = [], isLoading: schedulesLoading } = useQuery<ScheduledReport[]>({
    queryKey: ["ai-scheduled-reports"],
    queryFn: async () => {
      const r = await authFetch(`${API}/ai-biz-auto/scheduled-reports`, { headers: headers() });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const deleteScheduleMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API}/ai-biz-auto/scheduled-reports/${id}`, {
        method: "DELETE", headers: headers(),
      });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-scheduled-reports"] });
      toast({ title: "נמחק", description: "הלוח זמנים נמחק" });
    },
  });

  const handleGenerateReport = async () => {
    setGenerating("generating");
    try {
      const r = await authFetch(`${API}/ai-biz-auto/reports/generate`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ report_type: generateType, period: generatePeriod }),
      });
      if (!r.ok) throw new Error("Generation failed");
      const data = await r.json();
      queryClient.invalidateQueries({ queryKey: ["ai-generated-reports"] });
      toast({ title: "דוח נוצר", description: data.title });
      setViewingReport(data);
    } catch {
      toast({ title: "שגיאה", description: "יצירת הדוח נכשלה", variant: "destructive" });
    } finally {
      setGenerating(null);
    }
  };

  const handleViewReport = async (report: GeneratedReport) => {
    try {
      const r = await authFetch(`${API}/ai-biz-auto/reports/${report.id}`, { headers: headers() });
      if (r.ok) {
        const fullReport = await r.json();
        setViewingReport(fullReport);
      } else {
        setViewingReport(report);
      }
    } catch {
      setViewingReport(report);
    }
  };

  const reportTypeConfig = (type: string) => REPORT_TYPES.find(t => t.value === type) || REPORT_TYPES[0];

  return (
    <div className="space-y-6 pb-8" dir="rtl">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30 flex items-center justify-center">
            <FileText className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">דוחות אוטומטיים AI</h1>
            <p className="text-xs text-muted-foreground">יצירת דוחות עסקיים בעברית עם תובנות AI ופריטי פעולה</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 p-1 bg-muted/20 rounded-xl w-fit">
        {(["reports", "schedules"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              activeTab === tab
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "reports" ? "דוחות שנוצרו" : "לוחות זמנים"}
          </button>
        ))}
      </div>

      {activeTab === "reports" && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-2xl p-5">
            <h3 className="font-semibold text-foreground text-sm mb-4 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-400" />
              יצירת דוח מיידית
            </h3>
            <div className="flex items-center gap-3 flex-wrap">
              <select
                value={generateType}
                onChange={e => setGenerateType(e.target.value)}
                className="bg-muted/30 border border-border rounded-xl px-3 py-2 text-sm text-foreground"
              >
                {REPORT_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <select
                value={generatePeriod}
                onChange={e => setGeneratePeriod(e.target.value)}
                className="bg-muted/30 border border-border rounded-xl px-3 py-2 text-sm text-foreground"
              >
                <option value="daily">יומי</option>
                <option value="weekly">שבועי</option>
                <option value="monthly">חודשי</option>
                <option value="quarterly">רבעוני</option>
              </select>
              <button
                onClick={handleGenerateReport}
                disabled={!!generating}
                className="flex items-center gap-2 px-4 py-2 bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 border border-violet-500/30 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {generating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {generating ? "מייצר..." : "צור דוח AI"}
              </button>
            </div>
          </div>

          {reportsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-muted/20" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-4 w-1/2 rounded bg-muted/20" />
                    <div className="h-3 w-1/3 rounded bg-muted/15" />
                  </div>
                </div>
              ))}
            </div>
          ) : reports.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">אין דוחות שנוצרו עדיין</p>
              <p className="text-muted-foreground/60 text-xs mt-1">לחץ "צור דוח AI" כדי להתחיל</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map(report => {
                const config = reportTypeConfig(report.report_type);
                const ReportIcon = config.icon;
                return (
                  <motion.div
                    key={report.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-card border border-border hover:border-primary/30 rounded-xl p-4 flex items-center gap-4 transition-colors"
                  >
                    <div className={`p-2.5 rounded-xl ${config.bg} flex-shrink-0`}>
                      <ReportIcon className={`w-4 h-4 ${config.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="font-semibold text-foreground text-sm truncate">{report.title}</h3>
                        <span className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full ${config.bg} ${config.color} font-semibold`}>
                          {config.label}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {report.start_date} — {report.end_date}
                        <span className="mx-1.5">·</span>
                        {new Date(report.generated_at).toLocaleString("he-IL")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleViewReport(report)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-xl text-xs font-semibold transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" /> צפה
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === "schedules" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{schedules.length} לוחות זמנים מוגדרים</p>
            <button
              onClick={() => { setEditingSchedule(null); setShowScheduleModal(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-xl text-sm font-semibold transition-colors"
            >
              <Plus className="w-4 h-4" />
              לוח זמנים חדש
            </button>
          </div>

          {schedulesLoading ? (
            <div className="space-y-3">
              {[1, 2].map(i => (
                <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse h-20" />
              ))}
            </div>
          ) : schedules.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">אין לוחות זמנים מוגדרים</p>
              <button
                onClick={() => { setEditingSchedule(null); setShowScheduleModal(true); }}
                className="mt-3 px-4 py-2 bg-primary/10 text-primary border border-primary/30 rounded-xl text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5 inline ml-1" />
                צור לוח זמנים
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {schedules.map(schedule => {
                const config = reportTypeConfig(schedule.report_type);
                const ScheduleIcon = config.icon;
                const schedLabel = SCHEDULE_TYPES.find(s => s.value === schedule.schedule_type)?.label || schedule.schedule_type;
                return (
                  <motion.div
                    key={schedule.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-card border border-border rounded-xl p-4 flex items-center gap-4"
                  >
                    <div className={`p-2.5 rounded-xl ${config.bg} flex-shrink-0`}>
                      <ScheduleIcon className={`w-4 h-4 ${config.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="font-semibold text-foreground text-sm">{schedule.name}</h3>
                        <span className={`flex-shrink-0 w-2 h-2 rounded-full ${schedule.is_active ? "bg-emerald-400" : "bg-slate-600"}`} />
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{schedLabel}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{schedule.schedule_hour}:00</span>
                        {schedule.last_run && (
                          <span>ריצה אחרונה: {new Date(schedule.last_run).toLocaleDateString("he-IL")}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => { setEditingSchedule(schedule); setShowScheduleModal(true); }}
                        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/20 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      {isSuperAdmin && <button
                        onClick={async () => {
                          const ok = await globalConfirm("למחוק לוח זמנים זה?"); if (ok) deleteScheduleMutation.mutate(schedule.id);
                        }}
                        className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {viewingReport && (
        <ReportViewer report={viewingReport} onClose={() => setViewingReport(null)} />
      )}

      {showScheduleModal && (
        <ScheduleModal
          existing={editingSchedule}
          onClose={() => { setShowScheduleModal(false); setEditingSchedule(null); }}
          onSaved={() => {
            setShowScheduleModal(false);
            setEditingSchedule(null);
            queryClient.invalidateQueries({ queryKey: ["ai-scheduled-reports"] });
          }}
        />
      )}
    </div>
  );
}

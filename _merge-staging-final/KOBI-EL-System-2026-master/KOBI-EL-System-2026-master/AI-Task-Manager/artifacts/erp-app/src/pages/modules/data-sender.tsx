import { usePermissions } from "@/hooks/use-permissions";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import {
  Send, Download, FileText, Calendar, Clock, CheckCircle2,
  AlertCircle, X, Plus, Trash2, Settings, Database, Globe,
  Mail, Webhook, RefreshCw, Play, Pause, Eye, Search,
  BarChart3, ArrowRight, ChevronDown, FileJson, Sheet,
  Filter, Bell, Zap
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";

interface ExportJob {
  id: number;
  name: string;
  dataSource: string;
  format: "csv" | "excel" | "json";
  status: "ready" | "running" | "completed" | "failed";
  createdAt: string;
  completedAt?: string;
  rowCount?: number;
  fileSize?: number;
}

interface ScheduledReport {
  id: number;
  name: string;
  dataSource: string;
  format: "csv" | "excel" | "json";
  frequency: "daily" | "weekly" | "monthly";
  recipients: string[];
  isActive: boolean;
  lastSentAt?: string;
  nextSendAt: string;
  sendTime: string;
}

interface WebhookConfig {
  id: number;
  name: string;
  url: string;
  dataSource: string;
  trigger: "on_create" | "on_update" | "on_delete" | "scheduled";
  isActive: boolean;
  lastTriggeredAt?: string;
  successCount: number;
  failureCount: number;
  headers: Record<string, string>;
}

interface SendLog {
  id: number;
  type: "export" | "scheduled" | "webhook" | "api";
  name: string;
  status: "success" | "failed" | "pending";
  recipient?: string;
  sentAt: string;
  details?: string;
  rowCount?: number;
}

const API = "/api";

const FORMAT_ICONS = {
  csv: FileText,
  excel: Sheet,
  json: FileJson,
};

const FORMAT_COLORS = {
  csv: "text-green-400",
  excel: "text-emerald-400",
  json: "text-orange-400",
};

const FORMAT_BG = {
  csv: "bg-green-900/30 border-green-700/50",
  excel: "bg-emerald-900/30 border-emerald-700/50",
  json: "bg-orange-900/30 border-orange-700/50",
};


const tabs = [
  { id: "export", label: "ייצוא נתונים", icon: Download },
  { id: "scheduled", label: "שליחות מתוזמנות", icon: Calendar },
  { id: "webhooks", label: "Webhooks", icon: Webhook },
  { id: "logs", label: "לוג שליחות", icon: BarChart3 },
];

export default function DataSenderPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [activeTab, setActiveTab] = useState("export");
  const [exports, setExports] = useState<ExportJob[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledReport[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [logs] = useState<SendLog[]>([]);
  const [showExportForm, setShowExportForm] = useState(false);

  const { data: entitiesRaw = [] } = useQuery({
    queryKey: ["platform-entities-for-data-sender"],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/entities`);
      if (!r.ok) return [];
      const d = await r.json();
      return Array.isArray(d) ? d : (d?.data || []);
    },
  });

  const DATA_SOURCES: string[] = useMemo(() => {
    const fromEntities = entitiesRaw
      .filter((e: any) => e.isActive !== false)
      .map((e: any) => e.nameHe || e.namePlural || e.name)
      .filter(Boolean);
    return fromEntities.length > 0 ? fromEntities : [
      "לקוחות", "הזמנות מכירה", "חשבוניות", "ספקים", "הזמנות רכש", "מלאי",
    ];
  }, [entitiesRaw]);
  const [showScheduledForm, setShowScheduledForm] = useState(false);
  const [showWebhookForm, setShowWebhookForm] = useState(false);
  const [exportForm, setExportForm] = useState({ name: "", dataSource: "", format: "excel" as "csv" | "excel" | "json", dateFrom: "", dateTo: "" });
  const [scheduledForm, setScheduledForm] = useState({ name: "", dataSource: "", format: "excel" as "csv" | "excel" | "json", frequency: "weekly" as "daily" | "weekly" | "monthly", recipients: "", sendTime: "08:00" });
  const [webhookForm, setWebhookForm] = useState({ name: "", url: "", dataSource: "", trigger: "on_create" as "on_create" | "on_update" | "on_delete" | "scheduled", headerKey: "", headerValue: "" });
  const [runningExport, setRunningExport] = useState<number | null>(null);
  const [searchLog, setSearchLog] = useState("");

  const stats = {
    totalExports: exports.filter(e => e.status === "completed").length,
    activeScheduled: scheduled.filter(s => s.isActive).length,
    activeWebhooks: webhooks.filter(w => w.isActive).length,
    successRate: logs.length > 0 ? Math.round((logs.filter(l => l.status === "success").length / logs.length) * 100) : 0,
  };

  const runExport = (id: number) => {
    setRunningExport(id);
    setExports(prev => prev.map(e => e.id === id ? { ...e, status: "running" } : e));
    setTimeout(() => {
      setExports(prev => prev.map(e => e.id === id ? { ...e, status: "completed", completedAt: new Date().toISOString().slice(0, 16).replace("T", " "), rowCount: Math.floor(Math.random() * 500) + 50, fileSize: Math.floor(Math.random() * 100) * 1024 } : e));
      setRunningExport(null);
    }, 2000);
  };

  const createExport = () => {
    if (!exportForm.name || !exportForm.dataSource) return;
    const job: ExportJob = {
      id: Date.now(),
      name: exportForm.name,
      dataSource: exportForm.dataSource,
      format: exportForm.format,
      status: "ready",
      createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    };
    setExports(prev => [job, ...prev]);
    setExportForm({ name: "", dataSource: "", format: "excel", dateFrom: "", dateTo: "" });
    setShowExportForm(false);
  };

  const createScheduled = () => {
    if (!scheduledForm.name || !scheduledForm.dataSource || !scheduledForm.recipients) return;
    const report: ScheduledReport = {
      id: Date.now(),
      name: scheduledForm.name,
      dataSource: scheduledForm.dataSource,
      format: scheduledForm.format,
      frequency: scheduledForm.frequency,
      recipients: scheduledForm.recipients.split(",").map(r => r.trim()),
      isActive: true,
      nextSendAt: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      sendTime: scheduledForm.sendTime,
    };
    setScheduled(prev => [report, ...prev]);
    setScheduledForm({ name: "", dataSource: "", format: "excel", frequency: "weekly", recipients: "", sendTime: "08:00" });
    setShowScheduledForm(false);
  };

  const createWebhook = () => {
    if (!webhookForm.name || !webhookForm.url || !webhookForm.dataSource) return;
    const hook: WebhookConfig = {
      id: Date.now(),
      name: webhookForm.name,
      url: webhookForm.url,
      dataSource: webhookForm.dataSource,
      trigger: webhookForm.trigger,
      isActive: true,
      successCount: 0,
      failureCount: 0,
      headers: webhookForm.headerKey ? { [webhookForm.headerKey]: webhookForm.headerValue } : {},
    };
    setWebhooks(prev => [hook, ...prev]);
    setWebhookForm({ name: "", url: "", dataSource: "", trigger: "on_create", headerKey: "", headerValue: "" });
    setShowWebhookForm(false);
  };

  const toggleScheduled = (id: number) => {
    setScheduled(prev => prev.map(s => s.id === id ? { ...s, isActive: !s.isActive } : s));
  };

  const toggleWebhook = (id: number) => {
    setWebhooks(prev => prev.map(w => w.id === id ? { ...w, isActive: !w.isActive } : w));
  };

  const downloadExport = (job: ExportJob) => {
    const content = `id,name,status\n1,example,active`;
    const mimeTypes = { csv: "text/csv", excel: "application/vnd.ms-excel", json: "application/json" };
    const blob = new Blob([content], { type: mimeTypes[job.format] });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${job.name}.${job.format === "excel" ? "xlsx" : job.format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filteredLogs = logs.filter(l => !searchLog || l.name.toLowerCase().includes(searchLog.toLowerCase()) || l.type.includes(searchLog.toLowerCase()));

  const freqLabel = (f: string) => ({ daily: "יומי", weekly: "שבועי", monthly: "חודשי" }[f] || f);
  const triggerLabel = (t: string) => ({ on_create: "יצירה", on_update: "עדכון", on_delete: "מחיקה", scheduled: "מתוזמן" }[t] || t);
  const formatSize = (bytes: number) => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-700 flex items-center justify-center">
                <Send className="w-6 h-6 text-foreground" />
              </div>
              שולח נתונים
            </h1>
            <p className="text-muted-foreground mt-1">ייצוא ושליחת נתונים מרכזית — CSV, Excel, JSON, Webhooks ו-API</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "ייצואים שהושלמו", value: stats.totalExports, icon: CheckCircle2, color: "text-emerald-400" },
            { label: "שליחות מתוזמנות פעילות", value: stats.activeScheduled, icon: Calendar, color: "text-blue-400" },
            { label: "Webhooks פעילים", value: stats.activeWebhooks, icon: Webhook, color: "text-purple-400" },
            { label: "אחוז הצלחה", value: `${stats.successRate}%`, icon: BarChart3, color: "text-cyan-400" },
          ].map(s => (
            <div key={s.label} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <s.icon className={`w-4 h-4 ${s.color}`} />
                <p className="text-muted-foreground text-xs">{s.label}</p>
              </div>
              <p className={`text-lg sm:text-2xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-1 bg-card border border-border rounded-xl p-1 w-fit">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id ? "bg-cyan-600 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "export" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-foreground">ייצוא נתונים</h2>
              <button onClick={() => setShowExportForm(true)} className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-foreground rounded-lg text-sm font-medium">
                <Plus className="w-4 h-4" /> ייצוא חדש
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {(["csv", "excel", "json"] as const).map(fmt => {
                const FmtIcon = FORMAT_ICONS[fmt];
                return (
                  <div key={fmt} className={`border rounded-xl p-4 ${FORMAT_BG[fmt]}`}>
                    <div className="flex items-center gap-3 mb-3">
                      <FmtIcon className={`w-6 h-6 ${FORMAT_COLORS[fmt]}`} />
                      <div>
                        <p className="text-foreground font-medium uppercase">{fmt}</p>
                        <p className="text-muted-foreground text-xs">{fmt === "csv" ? "נתונים גולמיים" : fmt === "excel" ? "גיליון אלקטרוני" : "פורמט API"}</p>
                      </div>
                    </div>
                    <p className={`text-lg sm:text-2xl font-bold ${FORMAT_COLORS[fmt]}`}>
                      {exports.filter(e => e.format === fmt && e.status === "completed").length}
                    </p>
                    <p className="text-muted-foreground text-xs mt-1">ייצואים הושלמו</p>
                  </div>
                );
              })}
            </div>
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-right text-muted-foreground font-medium">שם</th>
                    <th className="px-4 py-3 text-right text-muted-foreground font-medium">מקור נתונים</th>
                    <th className="px-4 py-3 text-right text-muted-foreground font-medium">פורמט</th>
                    <th className="px-4 py-3 text-right text-muted-foreground font-medium">סטטוס</th>
                    <th className="px-4 py-3 text-right text-muted-foreground font-medium">שורות</th>
                    <th className="px-4 py-3 text-right text-muted-foreground font-medium">גודל</th>
                    <th className="px-4 py-3 text-right text-muted-foreground font-medium">תאריך</th>
                    <th className="px-4 py-3 text-right text-muted-foreground font-medium">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {exports.map(job => {
                    const FmtIcon = FORMAT_ICONS[job.format];
                    return (
                      <tr key={job.id} className="border-b border-border hover:bg-muted/40 transition-colors">
                        <td className="px-4 py-3 text-foreground font-medium">{job.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{job.dataSource}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <FmtIcon className={`w-4 h-4 ${FORMAT_COLORS[job.format]}`} />
                            <span className={`text-xs uppercase font-mono ${FORMAT_COLORS[job.format]}`}>{job.format}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {job.status === "completed" && <span className="flex items-center gap-1 text-emerald-400 text-xs"><CheckCircle2 className="w-3.5 h-3.5" /> הושלם</span>}
                          {job.status === "failed" && <span className="flex items-center gap-1 text-red-400 text-xs"><AlertCircle className="w-3.5 h-3.5" /> נכשל</span>}
                          {job.status === "running" && <span className="flex items-center gap-1 text-blue-400 text-xs"><RefreshCw className="w-3.5 h-3.5 animate-spin" /> מריץ</span>}
                          {job.status === "ready" && <span className="flex items-center gap-1 text-muted-foreground text-xs"><Clock className="w-3.5 h-3.5" /> מוכן</span>}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{job.rowCount ? job.rowCount.toLocaleString() : "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{job.fileSize ? formatSize(job.fileSize) : "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{job.createdAt}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            {(job.status === "ready" || job.status === "failed") && (
                              <button onClick={() => runExport(job.id)} disabled={runningExport === job.id} className="p-1.5 text-cyan-400 hover:bg-muted rounded" title="הרץ">
                                <Play className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {job.status === "completed" && (
                              <button onClick={() => downloadExport(job)} className="p-1.5 text-emerald-400 hover:bg-muted rounded" title="הורד">
                                <Download className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button onClick={() => setExports(prev => prev.filter(e => e.id !== job.id))} className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-muted rounded" title="מחק">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
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

        {activeTab === "scheduled" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-foreground">שליחות מתוזמנות</h2>
              <button onClick={() => setShowScheduledForm(true)} className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-foreground rounded-lg text-sm font-medium">
                <Plus className="w-4 h-4" /> שליחה מתוזמנת חדשה
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {scheduled.map(report => {
                const FmtIcon = FORMAT_ICONS[report.format];
                return (
                  <motion.div
                    key={report.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-card border border-border rounded-xl p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-foreground font-medium">{report.name}</h3>
                        <p className="text-muted-foreground text-sm">{report.dataSource}</p>
                      </div>
                      <button
                        onClick={() => toggleScheduled(report.id)}
                        className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors ${report.isActive ? "bg-emerald-900/50 text-emerald-400 border border-emerald-700/50" : "bg-muted text-muted-foreground border border-border"}`}
                      >
                        {report.isActive ? <><Play className="w-3 h-3" /> פעיל</> : <><Pause className="w-3 h-3" /> מושהה</>}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-input rounded-lg p-2">
                        <p className="text-muted-foreground">תדירות</p>
                        <p className="text-foreground">{freqLabel(report.frequency)}</p>
                      </div>
                      <div className="bg-input rounded-lg p-2">
                        <p className="text-muted-foreground">שעת שליחה</p>
                        <p className="text-foreground">{report.sendTime}</p>
                      </div>
                      <div className="bg-input rounded-lg p-2">
                        <p className="text-muted-foreground">שליחה הבאה</p>
                        <p className="text-foreground">{report.nextSendAt}</p>
                      </div>
                      <div className="bg-input rounded-lg p-2">
                        <p className="text-muted-foreground">פורמט</p>
                        <div className="flex items-center gap-1">
                          <FmtIcon className={`w-3 h-3 ${FORMAT_COLORS[report.format]}`} />
                          <span className={`${FORMAT_COLORS[report.format]} uppercase font-mono`}>{report.format}</span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs mb-1">נמענים</p>
                      <div className="flex flex-wrap gap-1">
                        {report.recipients.map(r => (
                          <span key={r} className="text-xs bg-blue-900/30 text-blue-300 border border-blue-700/50 px-2 py-0.5 rounded-full">{r}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1 border-t border-border">
                      <button className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300">
                        <Send className="w-3 h-3" /> שלח עכשיו
                      </button>
                      <button onClick={() => setScheduled(prev => prev.filter(s => s.id !== report.id))} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-400 mr-auto">
                        <Trash2 className="w-3 h-3" /> מחק
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "webhooks" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-foreground">Webhooks</h2>
              <button onClick={() => setShowWebhookForm(true)} className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-foreground rounded-lg text-sm font-medium">
                <Plus className="w-4 h-4" /> Webhook חדש
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {webhooks.map(hook => (
                <motion.div
                  key={hook.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-card border border-border rounded-xl p-4 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Webhook className="w-5 h-5 text-purple-400" />
                      <div>
                        <h3 className="text-foreground font-medium">{hook.name}</h3>
                        <p className="text-muted-foreground text-xs font-mono truncate max-w-[250px]">{hook.url}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => toggleWebhook(hook.id)}
                      className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors ${hook.isActive ? "bg-emerald-900/50 text-emerald-400 border border-emerald-700/50" : "bg-muted text-muted-foreground border border-border"}`}
                    >
                      {hook.isActive ? <><Zap className="w-3 h-3" /> פעיל</> : <><Pause className="w-3 h-3" /> מושהה</>}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <div className="bg-input rounded-lg p-2">
                      <p className="text-muted-foreground">מקור</p>
                      <p className="text-foreground">{hook.dataSource}</p>
                    </div>
                    <div className="bg-input rounded-lg p-2">
                      <p className="text-muted-foreground">טריגר</p>
                      <p className="text-foreground">{triggerLabel(hook.trigger)}</p>
                    </div>
                    <div className="bg-input rounded-lg p-2">
                      <p className="text-muted-foreground">הצלחות/כישלונות</p>
                      <p className="text-foreground"><span className="text-emerald-400">{hook.successCount}</span> / <span className="text-red-400">{hook.failureCount}</span></p>
                    </div>
                  </div>
                  {hook.lastTriggeredAt && (
                    <p className="text-muted-foreground text-xs">הופעל לאחרונה: {hook.lastTriggeredAt}</p>
                  )}
                  {Object.keys(hook.headers).length > 0 && (
                    <div className="bg-input rounded-lg p-2 text-xs font-mono">
                      <p className="text-muted-foreground mb-1">Headers:</p>
                      {Object.entries(hook.headers).map(([k, v]) => (
                        <p key={k} className="text-gray-300">{k}: {v}</p>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 pt-1 border-t border-border">
                    <button className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300">
                      <Play className="w-3 h-3" /> בדוק
                    </button>
                    <button onClick={() => setWebhooks(prev => prev.filter(w => w.id !== hook.id))} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-400 mr-auto">
                      <Trash2 className="w-3 h-3" /> מחק
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "logs" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-foreground">לוג שליחות</h2>
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute right-3 top-2.5 text-muted-foreground w-4 h-4" />
                <input value={searchLog} onChange={e => setSearchLog(e.target.value)} placeholder="חיפוש בלוג..." className="w-full pr-9 pl-4 py-2 bg-card border border-border rounded-lg text-foreground placeholder-gray-500 text-sm focus:outline-none" />
              </div>
            </div>
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-right text-muted-foreground font-medium">שם</th>
                    <th className="px-4 py-3 text-right text-muted-foreground font-medium">סוג</th>
                    <th className="px-4 py-3 text-right text-muted-foreground font-medium">סטטוס</th>
                    <th className="px-4 py-3 text-right text-muted-foreground font-medium">נמען</th>
                    <th className="px-4 py-3 text-right text-muted-foreground font-medium">שורות</th>
                    <th className="px-4 py-3 text-right text-muted-foreground font-medium">זמן</th>
                    <th className="px-4 py-3 text-right text-muted-foreground font-medium">פרטים</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map(log => (
                    <tr key={log.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-foreground font-medium">{log.name}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          log.type === "export" ? "bg-blue-900/40 text-blue-300" :
                          log.type === "scheduled" ? "bg-purple-900/40 text-purple-300" :
                          log.type === "webhook" ? "bg-orange-900/40 text-orange-300" :
                          "bg-cyan-900/40 text-cyan-300"
                        }`}>
                          {log.type === "export" ? "ייצוא" : log.type === "scheduled" ? "מתוזמן" : log.type === "webhook" ? "Webhook" : "API"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {log.status === "success" && <span className="flex items-center gap-1 text-emerald-400 text-xs"><CheckCircle2 className="w-3.5 h-3.5" /> הצלחה</span>}
                        {log.status === "failed" && <span className="flex items-center gap-1 text-red-400 text-xs"><AlertCircle className="w-3.5 h-3.5" /> נכשל</span>}
                        {log.status === "pending" && <span className="flex items-center gap-1 text-yellow-400 text-xs"><Clock className="w-3.5 h-3.5" /> ממתין</span>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{log.recipient || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{log.rowCount ? log.rowCount.toLocaleString() : "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{log.sentAt}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{log.details || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showExportForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center" onClick={() => setShowExportForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()} dir="rtl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <h2 className="text-xl font-bold text-foreground">ייצוא חדש</h2>
                <button onClick={() => setShowExportForm(false)} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">שם הייצוא *</label>
                  <input value={exportForm.name} onChange={e => setExportForm({ ...exportForm, name: e.target.value })} placeholder='למשל: לקוחות פעילים Q1' className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground placeholder-gray-500 focus:outline-none focus:border-cyan-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">מקור נתונים *</label>
                  <select value={exportForm.dataSource} onChange={e => setExportForm({ ...exportForm, dataSource: e.target.value })} className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:outline-none focus:border-cyan-500">
                    <option value="">בחר מקור...</option>
                    {DATA_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">פורמט</label>
                  <div className="flex gap-2">
                    {(["csv", "excel", "json"] as const).map(fmt => {
                      const FmtIcon = FORMAT_ICONS[fmt];
                      return (
                        <button key={fmt} onClick={() => setExportForm({ ...exportForm, format: fmt })} className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium flex-1 justify-center transition-all ${exportForm.format === fmt ? `${FORMAT_BG[fmt]} ${FORMAT_COLORS[fmt]} border-current` : "border-border text-muted-foreground hover:border-gray-500"}`}>
                          <FmtIcon className="w-4 h-4" /> <span className="uppercase">{fmt}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">מתאריך</label>
                    <input type="date" value={exportForm.dateFrom} onChange={e => setExportForm({ ...exportForm, dateFrom: e.target.value })} className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:outline-none focus:border-cyan-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">עד תאריך</label>
                    <input type="date" value={exportForm.dateTo} onChange={e => setExportForm({ ...exportForm, dateTo: e.target.value })} className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:outline-none focus:border-cyan-500" />
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={createExport} className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-foreground rounded-lg font-medium text-sm">
                    צור ייצוא
                  </button>
                  <button onClick={() => setShowExportForm(false)} className="px-4 py-2.5 text-muted-foreground hover:text-foreground text-sm">ביטול</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showScheduledForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center" onClick={() => setShowScheduledForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()} dir="rtl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <h2 className="text-xl font-bold text-foreground">שליחה מתוזמנת חדשה</h2>
                <button onClick={() => setShowScheduledForm(false)} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">שם *</label>
                  <input value={scheduledForm.name} onChange={e => setScheduledForm({ ...scheduledForm, name: e.target.value })} placeholder="למשל: דוח שבועי לקוחות" className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground placeholder-gray-500 focus:outline-none focus:border-cyan-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">מקור נתונים *</label>
                  <select value={scheduledForm.dataSource} onChange={e => setScheduledForm({ ...scheduledForm, dataSource: e.target.value })} className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:outline-none focus:border-cyan-500">
                    <option value="">בחר מקור...</option>
                    {DATA_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">פורמט</label>
                    <select value={scheduledForm.format} onChange={e => setScheduledForm({ ...scheduledForm, format: e.target.value as "csv" | "excel" | "json" })} className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:outline-none">
                      <option value="excel">Excel</option>
                      <option value="csv">CSV</option>
                      <option value="json">JSON</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">תדירות</label>
                    <select value={scheduledForm.frequency} onChange={e => setScheduledForm({ ...scheduledForm, frequency: e.target.value as "daily" | "weekly" | "monthly" })} className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:outline-none">
                      <option value="daily">יומי</option>
                      <option value="weekly">שבועי</option>
                      <option value="monthly">חודשי</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">שעת שליחה</label>
                  <input type="time" value={scheduledForm.sendTime} onChange={e => setScheduledForm({ ...scheduledForm, sendTime: e.target.value })} className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:outline-none focus:border-cyan-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">נמענים (מופרדים בפסיק) *</label>
                  <input value={scheduledForm.recipients} onChange={e => setScheduledForm({ ...scheduledForm, recipients: e.target.value })} placeholder="email1@co.com, email2@co.com" dir="ltr" className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground placeholder-gray-500 focus:outline-none focus:border-cyan-500 text-left" />
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={createScheduled} className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-foreground rounded-lg font-medium text-sm">
                    צור שליחה
                  </button>
                  <button onClick={() => setShowScheduledForm(false)} className="px-4 py-2.5 text-muted-foreground hover:text-foreground text-sm">ביטול</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showWebhookForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center" onClick={() => setShowWebhookForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()} dir="rtl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <h2 className="text-xl font-bold text-foreground">Webhook חדש</h2>
                <button onClick={() => setShowWebhookForm(false)} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">שם *</label>
                  <input value={webhookForm.name} onChange={e => setWebhookForm({ ...webhookForm, name: e.target.value })} placeholder="למשל: עדכון CRM" className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground placeholder-gray-500 focus:outline-none focus:border-cyan-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">URL *</label>
                  <input value={webhookForm.url} onChange={e => setWebhookForm({ ...webhookForm, url: e.target.value })} placeholder="https://example.com/webhook" dir="ltr" className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground placeholder-gray-500 focus:outline-none focus:border-cyan-500 text-left" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">מקור נתונים *</label>
                    <select value={webhookForm.dataSource} onChange={e => setWebhookForm({ ...webhookForm, dataSource: e.target.value })} className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:outline-none">
                      <option value="">בחר...</option>
                      {DATA_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">טריגר</label>
                    <select value={webhookForm.trigger} onChange={e => setWebhookForm({ ...webhookForm, trigger: e.target.value as "on_create" | "on_update" | "on_delete" | "scheduled" })} className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:outline-none">
                      <option value="on_create">יצירה</option>
                      <option value="on_update">עדכון</option>
                      <option value="on_delete">מחיקה</option>
                      <option value="scheduled">מתוזמן</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Header (אופציונלי)</label>
                  <div className="flex gap-2">
                    <input value={webhookForm.headerKey} onChange={e => setWebhookForm({ ...webhookForm, headerKey: e.target.value })} placeholder="Authorization" dir="ltr" className="flex-1 px-3 py-2 bg-input border border-border rounded-lg text-foreground placeholder-gray-500 focus:outline-none focus:border-cyan-500 text-left text-sm" />
                    <input value={webhookForm.headerValue} onChange={e => setWebhookForm({ ...webhookForm, headerValue: e.target.value })} placeholder="Bearer ..." dir="ltr" className="flex-1 px-3 py-2 bg-input border border-border rounded-lg text-foreground placeholder-gray-500 focus:outline-none focus:border-cyan-500 text-left text-sm" />
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={createWebhook} className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-foreground rounded-lg font-medium text-sm">
                    צור Webhook
                  </button>
                  <button onClick={() => setShowWebhookForm(false)} className="px-4 py-2.5 text-muted-foreground hover:text-foreground text-sm">ביטול</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="p-6 space-y-6">
        <RelatedRecords
          tabs={[
            {
              key: "exports",
              label: "ייצואים אחרונים",
              endpoint: `${API}/platform/entities/1/records?limit=10`,
              columns: [
                { key: "name", label: "שם" },
                { key: "status", label: "סטטוס" },
                { key: "created_at", label: "תאריך" },
              ],
            },
          ]}
        />
        <ActivityLog entityType="data-sender" />
      </div>
    </div>
  );
}

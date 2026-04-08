import { useState, useMemo, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/utils";
import {
  Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle2,
  Loader2, X, ChevronLeft, ChevronRight, Search, Activity,
  Wifi, WifiOff, BarChart3, Clock, AlertTriangle, Shield,
  RefreshCw, FileText, Database, ArrowUpRight, ArrowDownLeft,
  Zap, Eye, Play, TrendingUp, TrendingDown, Server,
} from "lucide-react";

const API = "/api";

interface EntityInfo {
  key: string;
  label: string;
  columns: string[];
}

interface ValidationResult {
  totalRows: number;
  validRows: number;
  errorCount: number;
  errors: { row: number; field: string; message: string }[];
  preview: Record<string, unknown>[];
}

interface ImportResult {
  success?: boolean;
  inserted?: number;
  failed?: number;
  failedRows?: { row: number; error: string }[];
  total?: number;
  dryRun?: boolean;
  wouldInsert?: number;
  wouldSkip?: number;
}

interface MonitoringDashboard {
  summary: {
    activeConnections: number;
    totalConnections: number;
    totalSyncs24h: number;
    successSyncs24h: number;
    failedSyncs24h: number;
    recordsProcessed24h: number;
    overallHealthScore: number;
  };
  connections: {
    connectionId: number;
    connectionName: string;
    slug: string;
    isActive: boolean;
    lastSync: string | null;
    syncs24h: number;
    success24h: number;
    failed24h: number;
    records24h: number;
    avgDuration: number;
    healthScore: number;
    recentErrors: string[];
  }[];
  daily7d: { date: string; success: number; failed: number; records: number }[];
  alerts: { level: string; message: string; connectionId?: number; time: string }[];
  recentLogs: {
    id: number;
    connectionId: number;
    direction: string;
    status: string;
    recordsProcessed: number;
    recordsFailed: number;
    errorMessage: string | null;
    startedAt: string | null;
    completedAt: string | null;
  }[];
}

type TabKey = "import" | "export" | "monitoring" | "history";

const COLUMN_LABELS: Record<string, string> = {
  name: "שם", email: "אימייל", phone: "טלפון", address: "כתובת",
  city: "עיר", contact_person: "איש קשר", tax_id: "ח.פ / ת.ז",
  notes: "הערות", rating: "דירוג", sku: "מק״ט", description: "תיאור",
  category: "קטגוריה", unit_price: "מחיר יחידה", cost_price: "מחיר עלות",
  unit_of_measure: "יחידת מידה", min_stock: "מלאי מינימלי", max_stock: "מלאי מקסימלי",
  current_stock: "מלאי נוכחי", first_name: "שם פרטי", last_name: "שם משפחה",
  department: "מחלקה", position: "תפקיד", hire_date: "תאריך קליטה",
  salary: "שכר", code: "קוד", manager_name: "שם מנהל", capacity: "קיבולת",
  _skip: "דלג על עמודה",
};

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split("\n").filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"(.*)"$/, "$1"));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(",").map(v => v.trim().replace(/^"(.*)"$/, "$1"));
    const row: Record<string, string> = {};
    headers.forEach((h, j) => { row[h] = vals[j] || ""; });
    rows.push(row);
  }
  return { headers, rows };
}

function HealthBadge({ score }: { score: number }) {
  const color = score >= 80 ? "text-green-400 bg-green-500/10 border-green-500/20"
    : score >= 50 ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20"
    : "text-red-400 bg-red-500/10 border-red-500/20";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${color}`}>
      {score >= 80 ? <CheckCircle2 className="w-3 h-3" /> : score >= 50 ? <AlertTriangle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
      {score}%
    </span>
  );
}

function MiniBar({ data, maxH = 32 }: { data: { success: number; failed: number }[]; maxH?: number }) {
  const maxVal = Math.max(...data.map(d => d.success + d.failed), 1);
  return (
    <div className="flex items-end gap-0.5" style={{ height: maxH }}>
      {data.map((d, i) => {
        const total = d.success + d.failed;
        const h = Math.max((total / maxVal) * maxH, 2);
        const failRatio = total > 0 ? d.failed / total : 0;
        return (
          <div key={i} className="flex-1 flex flex-col items-stretch gap-px" style={{ height: h }}>
            {failRatio > 0 && <div className="bg-red-500/60 rounded-t-sm" style={{ height: `${failRatio * 100}%` }} />}
            <div className="bg-green-500/60 rounded-t-sm flex-1" />
          </div>
        );
      })}
    </div>
  );
}

export default function ImportExportPage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<TabKey>("import");
  const [step, setStep] = useState(0);
  const [selectedEntity, setSelectedEntity] = useState("");
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [fileRows, setFileRows] = useState<Record<string, string>[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [exportEntity, setExportEntity] = useState("");
  const [exportSearch, setExportSearch] = useState("");

  const { data: entities = [] } = useQuery<EntityInfo[]>({
    queryKey: ["import-export-entities"],
    queryFn: async () => {
      const res = await authFetch(`${API}/data-import-export/entities`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!token,
  });

  const { data: monitoring, isLoading: monitoringLoading, refetch: refetchMonitoring } = useQuery<MonitoringDashboard>({
    queryKey: ["integration-monitoring"],
    queryFn: async () => {
      const res = await authFetch(`${API}/integration-monitoring/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!token && activeTab === "monitoring",
    refetchInterval: 30000,
  });

  const { data: history = [] } = useQuery<Record<string, unknown>[]>({
    queryKey: ["import-export-history"],
    queryFn: async () => {
      const res = await authFetch(`${API}/data-import-export/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!token && activeTab === "history",
  });

  const validateMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch(`${API}/data-import-export/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ entity: selectedEntity, rows: fileRows, columnMapping }),
      });
      if (!res.ok) throw new Error("Validation failed");
      return res.json() as Promise<ValidationResult>;
    },
    onSuccess: (data) => {
      setValidationResult(data);
      setStep(3);
    },
    onError: () => {
      toast({ title: "שגיאה", description: "אימות הנתונים נכשל", variant: "destructive" });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (dryRun: boolean) => {
      const res = await authFetch(`${API}/data-import-export/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ entity: selectedEntity, rows: fileRows, columnMapping, dryRun }),
      });
      if (!res.ok) throw new Error("Import failed");
      return res.json() as Promise<ImportResult>;
    },
    onSuccess: (data) => {
      setImportResult(data);
      if (!data.dryRun) {
        setStep(4);
        toast({ title: "ייבוא הושלם", description: `${data.inserted} רשומות יובאו בהצלחה` });
        queryClient.invalidateQueries({ queryKey: ["import-export-history"] });
      }
    },
    onError: () => {
      toast({ title: "שגיאה", description: "הייבוא נכשל", variant: "destructive" });
    },
  });

  const exportMutation = useMutation({
    mutationFn: async (format: "csv" | "json") => {
      const res = await authFetch(`${API}/data-import-export/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ entity: exportEntity, format, filters: { search: exportSearch } }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "שגיאת ייצוא" }));
        throw new Error(err.error || "שגיאת ייצוא");
      }
      if (format === "csv") {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${exportEntity}_export.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: "ייצוא הושלם", description: "הקובץ הורד בהצלחה" });
        return null;
      }
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${exportEntity}_export.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "ייצוא הושלם", description: `${data.count} רשומות יוצאו בהצלחה` });
      queryClient.invalidateQueries({ queryKey: ["import-export-history"] });
      return data;
    },
    onError: (e: Error) => {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    },
  });

  const testAllMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch(`${API}/integration-monitoring/test-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "בדיקה הושלמה", description: `${data.tested} חיבורים נבדקו` });
      refetchMonitoring();
    },
  });

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { headers, rows } = parseCsv(text);
      setFileHeaders(headers);
      setFileRows(rows);
      const autoMap: Record<string, string> = {};
      const entityCols = entities.find(en => en.key === selectedEntity)?.columns || [];
      headers.forEach(h => {
        const lower = h.toLowerCase().replace(/[\s_-]/g, "");
        const match = entityCols.find(c => c.toLowerCase().replace(/[\s_-]/g, "") === lower);
        autoMap[h] = match || "_skip";
      });
      setColumnMapping(autoMap);
      setStep(2);
    };
    reader.readAsText(file);
  }, [selectedEntity, entities]);

  const resetImport = () => {
    setStep(0);
    setSelectedEntity("");
    setFileHeaders([]);
    setFileRows([]);
    setColumnMapping({});
    setValidationResult(null);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const entityColumns = entities.find(e => e.key === selectedEntity)?.columns || [];
  const tabs: { key: TabKey; label: string; icon: typeof Upload }[] = [
    { key: "import", label: "ייבוא נתונים", icon: Upload },
    { key: "export", label: "ייצוא נתונים", icon: Download },
    { key: "monitoring", label: "ניטור אינטגרציות", icon: Activity },
    { key: "history", label: "היסטוריה", icon: Clock },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Database className="w-6 h-6 text-primary" />
            ייבוא / ייצוא וניטור
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            ייבוא וייצוא נתונים, ניטור בריאות אינטגרציות וסנכרונים
          </p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap mb-6 border-b border-border pb-3">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "import" && (
        <div className="space-y-6">
          <div className="flex items-center gap-3 mb-4">
            {[
              { n: 0, l: "בחר ישות" },
              { n: 1, l: "העלה קובץ" },
              { n: 2, l: "מיפוי עמודות" },
              { n: 3, l: "אימות" },
              { n: 4, l: "סיום" },
            ].map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  step > s.n ? "bg-green-500 text-foreground"
                    : step === s.n ? "bg-primary text-primary-foreground"
                    : "bg-muted/30 text-muted-foreground"
                }`}>
                  {step > s.n ? <CheckCircle2 className="w-4 h-4" /> : s.n + 1}
                </div>
                <span className={`text-sm ${step === s.n ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                  {s.l}
                </span>
                {i < 4 && <ChevronLeft className="w-4 h-4 text-muted-foreground" />}
              </div>
            ))}
          </div>

          {step === 0 && (
            <div className="bg-card border border-border rounded-xl p-6">
              <h3 className="font-semibold mb-4">בחר את סוג הנתונים לייבוא</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {entities.map(ent => (
                  <button
                    key={ent.key}
                    onClick={() => { setSelectedEntity(ent.key); setStep(1); }}
                    className={`p-4 rounded-xl border text-center transition-all hover:border-primary/50 ${
                      selectedEntity === ent.key ? "border-primary bg-primary/5" : "border-border bg-card"
                    }`}
                  >
                    <Database className="w-6 h-6 mx-auto mb-2 text-primary" />
                    <p className="text-sm font-medium">{ent.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{ent.columns.length} שדות</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="bg-card border border-border rounded-xl p-6">
              <h3 className="font-semibold mb-4">העלה קובץ CSV</h3>
              <div className="border-2 border-dashed border-border rounded-xl p-12 text-center hover:border-primary/50 transition-colors">
                <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-4">גרור קובץ CSV לכאן או לחץ לבחירה</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg cursor-pointer hover:bg-primary/90 text-sm"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  בחר קובץ
                </label>
              </div>
              <div className="flex items-center gap-2 mt-4">
                <button onClick={resetImport} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <ChevronRight className="w-4 h-4" />
                  חזור
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">מיפוי עמודות — {fileRows.length} שורות זוהו</h3>
                <span className="text-xs text-muted-foreground">{fileHeaders.length} עמודות בקובץ</span>
              </div>
              <div className="space-y-3 mb-6">
                {fileHeaders.map(header => (
                  <div key={header} className="flex items-center gap-4 bg-muted/10 rounded-lg px-4 py-3">
                    <div className="w-1/3">
                      <p className="text-sm font-medium">{header}</p>
                      <p className="text-[10px] text-muted-foreground">
                        דוגמה: {fileRows[0]?.[header] || "—"}
                      </p>
                    </div>
                    <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                    <select
                      value={columnMapping[header] || "_skip"}
                      onChange={e => setColumnMapping({ ...columnMapping, [header]: e.target.value })}
                      className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="_skip">דלג על עמודה</option>
                      {entityColumns.map(col => (
                        <option key={col} value={col}>{COLUMN_LABELS[col] || col}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {fileRows.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium mb-2">תצוגה מקדימה (5 שורות ראשונות)</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border">
                          {fileHeaders.map(h => (
                            <th key={h} className="p-2 text-right text-muted-foreground font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {fileRows.slice(0, 5).map((row, i) => (
                          <tr key={i} className="border-b border-border/50">
                            {fileHeaders.map(h => (
                              <td key={h} className="p-2">{row[h] || "—"}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <button onClick={() => setStep(1)} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <ChevronRight className="w-4 h-4" />
                  חזור
                </button>
                <button
                  onClick={() => validateMutation.mutate()}
                  disabled={validateMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50"
                >
                  {validateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  אמת ועבור הלאה
                </button>
              </div>
            </div>
          )}

          {step === 3 && validationResult && (
            <div className="bg-card border border-border rounded-xl p-6">
              <h3 className="font-semibold mb-4">תוצאות אימות</h3>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-muted/10 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-foreground">{validationResult.totalRows}</p>
                  <p className="text-xs text-muted-foreground">סה״כ שורות</p>
                </div>
                <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-green-400">{validationResult.validRows}</p>
                  <p className="text-xs text-muted-foreground">תקינות</p>
                </div>
                <div className={`rounded-lg p-4 text-center ${validationResult.errorCount > 0 ? "bg-red-500/5 border border-red-500/20" : "bg-muted/10"}`}>
                  <p className={`text-2xl font-bold ${validationResult.errorCount > 0 ? "text-red-400" : "text-foreground"}`}>
                    {validationResult.errorCount}
                  </p>
                  <p className="text-xs text-muted-foreground">שגיאות</p>
                </div>
              </div>

              {validationResult.errors.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-sm font-medium mb-2 text-red-400">שגיאות שנמצאו:</h4>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {validationResult.errors.slice(0, 20).map((err, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs bg-red-500/5 border border-red-500/10 rounded px-3 py-2">
                        <AlertCircle className="w-3 h-3 text-red-400 flex-shrink-0" />
                        <span>שורה {err.row}: {COLUMN_LABELS[err.field] || err.field} — {err.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <button onClick={() => setStep(2)} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <ChevronRight className="w-4 h-4" />
                  חזור
                </button>
                <button
                  onClick={() => importMutation.mutate(true)}
                  disabled={importMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-muted/20 text-foreground border border-border rounded-lg text-sm hover:bg-muted/30"
                >
                  <Eye className="w-4 h-4" />
                  הרצת ניסיון (Dry Run)
                </button>
                <button
                  onClick={() => importMutation.mutate(false)}
                  disabled={importMutation.isPending || validationResult.validRows === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-foreground rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
                >
                  {importMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  ייבא {validationResult.validRows} רשומות
                </button>
              </div>

              {importResult?.dryRun && (
                <div className="mt-4 p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                  <p className="text-sm font-medium text-blue-400 mb-1">תוצאת ניסיון:</p>
                  <p className="text-xs text-muted-foreground">
                    {importResult.wouldInsert} רשומות ייובאו | {importResult.wouldSkip} רשומות ידלגו
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 4 && importResult && !importResult.dryRun && (
            <div className="bg-card border border-green-500/20 rounded-xl p-6 text-center">
              <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-green-400" />
              <h3 className="text-xl font-bold mb-2">הייבוא הושלם בהצלחה!</h3>
              <div className="flex items-center justify-center gap-6 text-sm mb-6">
                <div>
                  <p className="text-2xl font-bold text-green-400">{importResult.inserted}</p>
                  <p className="text-muted-foreground">יובאו</p>
                </div>
                {(importResult.failed || 0) > 0 && (
                  <div>
                    <p className="text-2xl font-bold text-red-400">{importResult.failed}</p>
                    <p className="text-muted-foreground">נכשלו</p>
                  </div>
                )}
                <div>
                  <p className="text-2xl font-bold">{importResult.total}</p>
                  <p className="text-muted-foreground">סה״כ</p>
                </div>
              </div>
              <button
                onClick={resetImport}
                className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90"
              >
                ייבוא נוסף
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === "export" && (
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-xl p-6">
            <h3 className="font-semibold mb-4">ייצוא נתונים</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
              {entities.map(ent => (
                <button
                  key={ent.key}
                  onClick={() => setExportEntity(ent.key)}
                  className={`p-4 rounded-xl border text-center transition-all hover:border-primary/50 ${
                    exportEntity === ent.key ? "border-primary bg-primary/5" : "border-border bg-card"
                  }`}
                >
                  <FileSpreadsheet className="w-6 h-6 mx-auto mb-2 text-primary" />
                  <p className="text-sm font-medium">{ent.label}</p>
                </button>
              ))}
            </div>

            {exportEntity && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={exportSearch}
                      onChange={e => setExportSearch(e.target.value)}
                      placeholder="סינון לפי שם (אופציונלי)..."
                      className="w-full bg-background border border-border rounded-lg pr-10 pl-4 py-2 text-sm"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => exportMutation.mutate("csv")}
                    disabled={exportMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-foreground rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
                  >
                    {exportMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    ייצא CSV
                  </button>
                  <button
                    onClick={() => exportMutation.mutate("json")}
                    disabled={exportMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-foreground rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                  >
                    <FileText className="w-4 h-4" />
                    ייצא JSON
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "monitoring" && (
        <div className="space-y-6">
          {monitoringLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : monitoring ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { l: "חיבורים פעילים", v: monitoring.summary.activeConnections, c: "text-green-400", icon: Wifi },
                  { l: "סנכרונים 24ש", v: monitoring.summary.totalSyncs24h, c: "text-blue-400", icon: Activity },
                  { l: "הצליחו", v: monitoring.summary.successSyncs24h, c: "text-emerald-400", icon: CheckCircle2 },
                  { l: "נכשלו", v: monitoring.summary.failedSyncs24h, c: "text-red-400", icon: AlertCircle },
                  { l: "רשומות עובדו", v: monitoring.summary.recordsProcessed24h.toLocaleString("he-IL"), c: "text-cyan-400", icon: Database },
                  { l: "בריאות כללית", v: `${monitoring.summary.overallHealthScore}%`, c: monitoring.summary.overallHealthScore >= 80 ? "text-green-400" : "text-yellow-400", icon: Shield },
                ].map((k, i) => (
                  <div key={i} className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <k.icon className={`w-4 h-4 ${k.c}`} />
                      <p className="text-[11px] text-muted-foreground">{k.l}</p>
                    </div>
                    <p className={`text-xl font-bold font-mono ${k.c}`}>{k.v}</p>
                  </div>
                ))}
              </div>

              {monitoring.alerts.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-5">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-yellow-400" />
                    התראות ({monitoring.alerts.length})
                  </h3>
                  <div className="space-y-2">
                    {monitoring.alerts.map((alert, i) => (
                      <div
                        key={i}
                        className={`flex items-center gap-3 text-sm rounded-lg px-4 py-2.5 border ${
                          alert.level === "critical"
                            ? "bg-red-500/5 border-red-500/20 text-red-400"
                            : "bg-yellow-500/5 border-yellow-500/20 text-yellow-400"
                        }`}
                      >
                        {alert.level === "critical" ? <AlertCircle className="w-4 h-4 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
                        {alert.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-primary" />
                    מגמת 7 ימים
                  </h3>
                </div>
                <div className="h-24">
                  <MiniBar data={monitoring.daily7d} maxH={80} />
                </div>
                <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
                  {monitoring.daily7d.map((d, i) => (
                    <span key={i}>{new Date(d.date).toLocaleDateString("he-IL", { day: "numeric", month: "numeric" })}</span>
                  ))}
                </div>
              </div>

              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Server className="w-5 h-5 text-primary" />
                    חיבורים ({monitoring.connections.length})
                  </h3>
                  <button
                    onClick={() => testAllMutation.mutate()}
                    disabled={testAllMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs hover:bg-primary/20 disabled:opacity-50"
                  >
                    {testAllMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    בדוק הכל
                  </button>
                </div>
                {monitoring.connections.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <WifiOff className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>אין חיבורי אינטגרציה מוגדרים</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {monitoring.connections.map(conn => (
                      <div key={conn.connectionId} className="flex items-center justify-between bg-muted/5 border border-border/50 rounded-lg px-4 py-3">
                        <div className="flex items-center gap-3 flex-1">
                          <div className={`w-2 h-2 rounded-full ${conn.isActive ? "bg-green-400" : "bg-red-400"}`} />
                          <div>
                            <p className="text-sm font-medium">{conn.connectionName}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {conn.slug} • {conn.lastSync ? new Date(conn.lastSync).toLocaleString("he-IL") : "טרם סונכרן"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <div className="text-center">
                            <p className="font-mono text-foreground">{conn.syncs24h}</p>
                            <p>סנכרונים</p>
                          </div>
                          <div className="text-center">
                            <p className="font-mono text-green-400">{conn.success24h}</p>
                            <p>הצליחו</p>
                          </div>
                          {conn.failed24h > 0 && (
                            <div className="text-center">
                              <p className="font-mono text-red-400">{conn.failed24h}</p>
                              <p>נכשלו</p>
                            </div>
                          )}
                          <div className="text-center">
                            <p className="font-mono">{conn.records24h.toLocaleString("he-IL")}</p>
                            <p>רשומות</p>
                          </div>
                          <HealthBadge score={conn.healthScore} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {monitoring.recentLogs.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-5">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-primary" />
                    לוגים אחרונים
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border text-muted-foreground">
                          <th className="p-2 text-right">זמן</th>
                          <th className="p-2 text-right">כיוון</th>
                          <th className="p-2 text-right">סטטוס</th>
                          <th className="p-2 text-right">רשומות</th>
                          <th className="p-2 text-right">שגיאות</th>
                          <th className="p-2 text-right">הודעה</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monitoring.recentLogs.slice(0, 20).map(log => (
                          <tr key={log.id} className="border-b border-border/30 hover:bg-muted/5">
                            <td className="p-2">{log.startedAt ? new Date(log.startedAt).toLocaleString("he-IL") : "—"}</td>
                            <td className="p-2">
                              <span className="flex items-center gap-1">
                                {log.direction === "outbound" || log.direction === "push" ? (
                                  <ArrowUpRight className="w-3 h-3 text-blue-400" />
                                ) : (
                                  <ArrowDownLeft className="w-3 h-3 text-green-400" />
                                )}
                                {log.direction}
                              </span>
                            </td>
                            <td className="p-2">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                                log.status === "success" ? "bg-green-500/10 text-green-400"
                                  : log.status === "error" || log.status === "failed" ? "bg-red-500/10 text-red-400"
                                  : "bg-yellow-500/10 text-yellow-400"
                              }`}>
                                {log.status}
                              </span>
                            </td>
                            <td className="p-2 font-mono">{log.recordsProcessed}</td>
                            <td className="p-2 font-mono text-red-400">{log.recordsFailed > 0 ? log.recordsFailed : "—"}</td>
                            <td className="p-2 text-muted-foreground max-w-[200px] truncate">{log.errorMessage || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-16 text-muted-foreground">
              <WifiOff className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>לא ניתן לטעון נתוני ניטור</p>
            </div>
          )}
        </div>
      )}

      {activeTab === "history" && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            היסטוריית פעולות
          </h3>
          {history.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>אין פעולות ייבוא/ייצוא עדיין</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="p-3 text-right">סוג</th>
                    <th className="p-3 text-right">תיאור</th>
                    <th className="p-3 text-right">רשומות</th>
                    <th className="p-3 text-right">סטטוס</th>
                    <th className="p-3 text-right">תאריך</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item, i) => (
                    <tr key={i} className="border-b border-border/30 hover:bg-muted/5">
                      <td className="p-3">
                        <span className={`flex items-center gap-1.5 ${
                          String(item.flow_id) === "data-import" ? "text-blue-400" : "text-green-400"
                        }`}>
                          {String(item.flow_id) === "data-import" ? <Upload className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
                          {String(item.flow_id) === "data-import" ? "ייבוא" : "ייצוא"}
                        </span>
                      </td>
                      <td className="p-3">{String(item.flow_name || "")}</td>
                      <td className="p-3 font-mono">{String(item.affected || "")}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          String(item.status) === "success" ? "bg-green-500/10 text-green-400"
                            : String(item.status) === "error" ? "bg-red-500/10 text-red-400"
                            : "bg-yellow-500/10 text-yellow-400"
                        }`}>
                          {String(item.status) === "success" ? "הצליח" : String(item.status) === "error" ? "נכשל" : "חלקי"}
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {item.created_at ? new Date(String(item.created_at)).toLocaleString("he-IL") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

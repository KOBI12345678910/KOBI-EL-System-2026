import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Plus, Search, Download, Eye, Edit2, Trash2, ChevronRight, ChevronLeft,
  Clock, CheckCircle2, XCircle, Play, RefreshCw, Mail, Calendar,
  FileText, FileSpreadsheet, X, History, MoreVertical, AlarmClock
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API_BASE = "/api";

const SCHEDULE_TYPES = [
  { value: "daily", label: "יומי" },
  { value: "weekly", label: "שבועי" },
  { value: "monthly", label: "חודשי" },
  { value: "quarterly", label: "רבעוני" },
  { value: "custom", label: "מותאם (Cron)" },
];

const OUTPUT_FORMATS = [
  { value: "pdf", label: "PDF", icon: FileText },
  { value: "excel", label: "Excel", icon: FileSpreadsheet },
  { value: "csv", label: "CSV", icon: Download },
];

const REPORT_TYPES = [
  { value: "financial", label: "פיננסי" },
  { value: "sales", label: "מכירות" },
  { value: "production", label: "ייצור" },
  { value: "hr", label: "משאבי אנוש" },
  { value: "kpis", label: "מדדי ביצוע" },
  { value: "risks", label: "ניתוח סיכונים" },
];

function statusBadge(status: string | null | undefined) {
  if (!status) return <Badge className="bg-gray-500/20 text-gray-300">לא הופעל</Badge>;
  if (status === "success") return <Badge className="bg-green-500/20 text-green-300"><CheckCircle2 className="w-3 h-3 ml-1" />הצלחה</Badge>;
  if (status === "error" || status === "failed") return <Badge className="bg-red-500/20 text-red-300"><XCircle className="w-3 h-3 ml-1" />שגיאה</Badge>;
  return <Badge className="bg-blue-500/20 text-blue-300">{status}</Badge>;
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return dateStr; }
}

function ScheduleModal({ schedule, onClose, onSave }: { schedule?: any; onClose: () => void; onSave: (data: any) => void }) {
  const [form, setForm] = useState({
    reportName: schedule?.reportName || "",
    reportType: schedule?.reportType || "financial",
    scheduleType: schedule?.scheduleType || "daily",
    cronExpression: schedule?.cronExpression || "",
    outputFormat: schedule?.outputFormat || "pdf",
    recipients: Array.isArray(schedule?.recipients) ? schedule.recipients.join(", ") : "",
    subject: schedule?.subject || "",
    isActive: schedule?.isActive !== false,
  });

  const handleSave = () => {
    if (!form.reportName.trim()) { alert("שם הדוח חובה"); return; }
    const recipients = form.recipients.split(/[\n,]+/).map(e => e.trim()).filter(Boolean);
    onSave({ ...form, recipients, cronExpression: form.scheduleType === "custom" ? form.cronExpression : null });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" dir="rtl">
      <Card className="w-full max-w-lg bg-card border-border shadow-xl">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground">{schedule ? "עריכת תזמון" : "תזמון חדש"}</h2>
            <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
          </div>

          <div className="space-y-3">
            <div>
              <Label className="text-sm text-muted-foreground">שם הדוח *</Label>
              <Input value={form.reportName} onChange={e => setForm(f => ({ ...f, reportName: e.target.value }))} className="bg-background/50 mt-1" placeholder="לדוגמה: דוח פיננסי חודשי" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm text-muted-foreground">סוג דוח</Label>
                <select value={form.reportType} onChange={e => setForm(f => ({ ...f, reportType: e.target.value }))} className="w-full mt-1 bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                  {REPORT_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">תדירות שליחה</Label>
                <select value={form.scheduleType} onChange={e => setForm(f => ({ ...f, scheduleType: e.target.value }))} className="w-full mt-1 bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                  {SCHEDULE_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>

            {form.scheduleType === "custom" && (
              <div>
                <Label className="text-sm text-muted-foreground">Cron Expression</Label>
                <Input value={form.cronExpression} onChange={e => setForm(f => ({ ...f, cronExpression: e.target.value }))} className="bg-background/50 mt-1 font-mono" placeholder="0 8 * * 1" />
              </div>
            )}

            <div>
              <Label className="text-sm text-muted-foreground">פורמט פלט</Label>
              <div className="flex gap-2 mt-1">
                {OUTPUT_FORMATS.map(f => (
                  <button key={f.value} onClick={() => setForm(fm => ({ ...fm, outputFormat: f.value }))} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-colors ${form.outputFormat === f.value ? "bg-primary/20 border-primary text-primary" : "border-border text-muted-foreground hover:border-border/80"}`}>
                    <f.icon className="w-3.5 h-3.5" />{f.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-sm text-muted-foreground">נמענים (כתובות אימייל, מופרדות בפסיק)</Label>
              <Input value={form.recipients} onChange={e => setForm(f => ({ ...f, recipients: e.target.value }))} className="bg-background/50 mt-1" placeholder="user@example.com, manager@example.com" />
            </div>

            <div>
              <Label className="text-sm text-muted-foreground">כותרת אימייל</Label>
              <Input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} className="bg-background/50 mt-1" placeholder={`דוח ${form.reportName || "..."}`} />
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" id="isActive" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="w-4 h-4 accent-primary" />
              <Label htmlFor="isActive" className="text-sm text-foreground">תזמון פעיל</Label>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button className="flex-1 bg-primary" onClick={handleSave}>שמור</Button>
            <Button variant="outline" onClick={onClose}>ביטול</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DeliveryHistoryModal({ schedule, onClose }: { schedule: any; onClose: () => void }) {
  const { data: details, isLoading } = useQuery({
    queryKey: ["schedule-details", schedule.id],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/bi/schedules/${schedule.id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("auth_token") || ""}` },
      });
      if (!r.ok) return null;
      return r.json();
    },
  });

  const logs = details?.deliveryLogs || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" dir="rtl">
      <Card className="w-full max-w-2xl bg-card border-border shadow-xl">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-foreground">היסטוריית שליחות</h2>
              <p className="text-sm text-muted-foreground">{schedule.reportName}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">טוען...</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <History className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p>אין היסטוריית שליחות עדיין</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-right p-2 text-muted-foreground font-medium">תאריך הרצה</th>
                    <th className="text-right p-2 text-muted-foreground font-medium">סטטוס</th>
                    <th className="text-right p-2 text-muted-foreground font-medium">פורמט</th>
                    <th className="text-right p-2 text-muted-foreground font-medium">נמענים</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log: any) => (
                    <tr key={log.id} className="border-b border-border/30 hover:bg-card/30">
                      <td className="p-2 text-foreground">{formatDate(log.runAt)}</td>
                      <td className="p-2">{statusBadge(log.status)}</td>
                      <td className="p-2 text-foreground uppercase text-xs font-mono">{log.outputFormat}</td>
                      <td className="p-2 text-foreground">{Array.isArray(log.recipients) ? log.recipients.length : 0} נמענים</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Button variant="outline" onClick={onClose} className="w-full">סגור</Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ScheduledReports() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<any>(null);
  const [historySchedule, setHistorySchedule] = useState<any>(null);
  const perPage = 20;

  const authToken = typeof window !== "undefined" ? localStorage.getItem("auth_token") || "" : "";
  const headers = { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" };

  const { data: schedules = [], isLoading, refetch } = useQuery({
    queryKey: ["bi-schedules"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/bi/schedules`, { headers });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetch(`${API_BASE}/bi/schedules`, { method: "POST", headers, body: JSON.stringify(data) });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["bi-schedules"] }); setShowModal(false); toast({ title: "תזמון נוצר בהצלחה" }); },
    onError: (e: any) => toast({ title: "שגיאה", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const r = await fetch(`${API_BASE}/bi/schedules/${id}`, { method: "PUT", headers, body: JSON.stringify(data) });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["bi-schedules"] }); setEditingSchedule(null); toast({ title: "תזמון עודכן בהצלחה" }); },
    onError: (e: any) => toast({ title: "שגיאה", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${API_BASE}/bi/schedules/${id}`, { method: "DELETE", headers });
      if (!r.ok) throw new Error(await r.text());
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["bi-schedules"] }); toast({ title: "תזמון נמחק" }); },
    onError: (e: any) => toast({ title: "שגיאה", description: e.message, variant: "destructive" }),
  });

  const runNowMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${API_BASE}/bi/schedules/${id}/run`, { method: "POST", headers });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["bi-schedules"] }); toast({ title: "הדוח הופעל בהצלחה" }); },
    onError: (e: any) => toast({ title: "שגיאה", description: e.message, variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    return (schedules as any[]).filter(s => {
      if (statusFilter === "active" && !s.isActive) return false;
      if (statusFilter === "inactive" && s.isActive) return false;
      if (search && !s.reportName?.includes(search) && !s.reportType?.includes(search)) return false;
      return true;
    });
  }, [schedules, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageData = filtered.slice((page - 1) * perPage, page * perPage);

  const activeCount = (schedules as any[]).filter(s => s.isActive).length;
  const successCount = (schedules as any[]).filter(s => s.lastRunStatus === "success").length;
  const errorCount = (schedules as any[]).filter(s => s.lastRunStatus === "error" || s.lastRunStatus === "failed").length;

  const handleSave = (data: any) => {
    if (editingSchedule) {
      updateMutation.mutate({ id: editingSchedule.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const openEdit = (s: any) => { setEditingSchedule(s); };
  const closeModal = () => { setShowModal(false); setEditingSchedule(null); };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {(showModal || editingSchedule) && (
        <ScheduleModal schedule={editingSchedule} onClose={closeModal} onSave={handleSave} />
      )}
      {historySchedule && (
        <DeliveryHistoryModal schedule={historySchedule} onClose={() => setHistorySchedule(null)} />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">דוחות מתוזמנים</h1>
          <p className="text-sm text-muted-foreground mt-1">הפקת דוחות אוטומטית ומשלוח בדוא"ל</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="w-4 h-4 ml-1" />רענן</Button>
          <Button size="sm" className="bg-primary" onClick={() => setShowModal(true)}><Plus className="w-4 h-4 ml-1" />תזמון חדש</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-foreground">{(schedules as any[]).length}</div>
            <div className="text-sm text-muted-foreground mt-1">סה"כ תזמונים</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-400">{activeCount}</div>
            <div className="text-sm text-muted-foreground mt-1">פעילים</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-400">{successCount}</div>
            <div className="text-sm text-muted-foreground mt-1">הצלחות אחרונות</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-red-400">{errorCount}</div>
            <div className="text-sm text-muted-foreground mt-1">שגיאות</div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="חיפוש..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pr-9 bg-background/50" />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
              <option value="all">כל הסטטוסים</option>
              <option value="active">פעיל</option>
              <option value="inactive">מושבת</option>
            </select>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">
              <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin opacity-50" />
              <p>טוען נתונים...</p>
            </div>
          ) : pageData.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <AlarmClock className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">אין תזמונים להצגה</p>
              <p className="text-sm mt-1">לחץ על "תזמון חדש" כדי להתחיל</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-right p-3 text-muted-foreground font-medium">שם הדוח</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">תדירות</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">פורמט</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">נמענים</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">הרצה אחרונה</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">הרצה הבאה</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">סטטוס</th>
                    <th className="text-center p-3 text-muted-foreground font-medium w-32">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {pageData.map((s: any) => (
                    <tr key={s.id} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                      <td className="p-3">
                        <div className="text-foreground font-medium">{s.reportName}</div>
                        <div className="text-xs text-muted-foreground">{REPORT_TYPES.find(r => r.value === s.reportType)?.label || s.reportType}</div>
                      </td>
                      <td className="p-3 text-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                          {SCHEDULE_TYPES.find(t => t.value === s.scheduleType)?.label || s.scheduleType}
                        </div>
                        {s.cronExpression && <div className="text-xs text-muted-foreground font-mono">{s.cronExpression}</div>}
                      </td>
                      <td className="p-3">
                        <Badge className="bg-blue-500/20 text-blue-300 uppercase text-xs">{s.outputFormat}</Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1 text-foreground">
                          <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                          {Array.isArray(s.recipients) ? s.recipients.length : 0}
                        </div>
                      </td>
                      <td className="p-3 text-foreground text-xs">{formatDate(s.lastRunAt)}</td>
                      <td className="p-3 text-foreground text-xs">{formatDate(s.nextRunAt)}</td>
                      <td className="p-3">
                        <div className="flex flex-col gap-1">
                          {statusBadge(s.lastRunStatus)}
                          <Badge className={s.isActive ? "bg-green-500/20 text-green-300" : "bg-gray-500/20 text-gray-300"}>
                            {s.isActive ? "פעיל" : "מושבת"}
                          </Badge>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="sm" title="הפעל עכשיו" onClick={() => runNowMutation.mutate(s.id)} disabled={runNowMutation.isPending}>
                            <Play className="w-3.5 h-3.5 text-green-400" />
                          </Button>
                          <Button variant="ghost" size="sm" title="היסטוריה" onClick={() => setHistorySchedule(s)}>
                            <History className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" title="עריכה" onClick={() => openEdit(s)}>
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" title="מחיקה" onClick={() => { if (confirm("למחוק את התזמון?")) deleteMutation.mutate(s.id); }}>
                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
            <span>מציג {filtered.length === 0 ? 0 : (page - 1) * perPage + 1}–{Math.min(filtered.length, page * perPage)} מתוך {filtered.length}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronRight className="w-4 h-4" /></Button>
              <span className="px-3 py-1">{page}/{totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronLeft className="w-4 h-4" /></Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

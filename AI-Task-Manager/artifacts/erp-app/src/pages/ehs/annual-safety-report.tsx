import { LoadingOverlay } from "@/components/ui/unified-states";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";
import { translateStatus } from "@/lib/status-labels";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import {
  FileText, Plus, Edit2, Eye, X, Save, AlertCircle,
  RefreshCw, Download, CheckCircle2, Clock
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);

const REPORT_STATUSES = ["טיוטה", "הוגש", "אושר", "נדחה"];
const REPORT_TYPES = ["דוח שנתי למשרד העבודה", "סקר בטיחות שנתי", "דוח סביבתי שנתי", "דוח ועדת בטיחות", "אחר"];

const SC: Record<string, string> = {
  "טיוטה": "bg-yellow-500/20 text-yellow-300",
  "הוגש": "bg-blue-500/20 text-blue-300",
  "אושר": "bg-green-500/20 text-green-300",
  "נדחה": "bg-red-500/20 text-red-300",
};

interface AnnualReport {
  id: number;
  report_year: number;
  report_type: string;
  submission_date: string;
  prepared_by: string;
  approved_by: string;
  total_incidents: number;
  lost_time_incidents: number;
  near_misses: number;
  total_lost_days: number;
  training_hours: number;
  status: string;
  notes: string;
  created_at: string;
}

const currentYear = new Date().getFullYear();
const EMPTY_FORM = {
  report_year: currentYear, report_type: "דוח שנתי למשרד העבודה",
  submission_date: "", prepared_by: "", approved_by: "",
  total_incidents: 0, lost_time_incidents: 0, near_misses: 0,
  total_lost_days: 0, training_hours: 0, status: "טיוטה", notes: ""
};

export default function AnnualSafetyReportPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<AnnualReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AnnualReport | null>(null);
  const [viewDetail, setViewDetail] = useState<AnnualReport | null>(null);
  const [form, setForm] = useState<any>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const pagination = useSmartPagination(20);

  const load = async () => {
    setLoading(true);
    try {
      const r = await authFetch(`${API}/hse-annual-reports?limit=100`);
      if (r.ok) { const d = safeArray(await r.json()); setItems(d); pagination.setTotalItems(d.length); }
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm({ ...EMPTY_FORM }); setShowForm(true); };
  const openEdit = (r: AnnualReport) => {
    setEditing(r);
    setForm({ report_year: r.report_year, report_type: r.report_type, submission_date: r.submission_date?.slice(0,10), prepared_by: r.prepared_by, approved_by: r.approved_by, total_incidents: r.total_incidents, lost_time_incidents: r.lost_time_incidents, near_misses: r.near_misses, total_lost_days: r.total_lost_days, training_hours: r.training_hours, status: r.status, notes: r.notes });
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/hse-annual-reports/${editing.id}` : `${API}/hse-annual-reports`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false); load();
    } catch {}
    setSaving(false);
  };

  const exportReport = (r: AnnualReport) => {
    const content = `
דוח בטיחות שנתי — ${r.report_year}
================================
סוג דוח: ${r.report_type}
תאריך הגשה: ${r.submission_date?.slice(0,10) || "—"}
הוכן על ידי: ${r.prepared_by || "—"}
אושר על ידי: ${r.approved_by || "—"}
סטטוס: ${r.status}

נתוני בטיחות:
--------------
סה"כ אירועים: ${r.total_incidents}
אירועי זמן אבוד: ${r.lost_time_incidents}
כמעט-תאונות: ${r.near_misses}
ימי היעדרות כולל: ${r.total_lost_days}
שעות הדרכה: ${r.training_hours}

LTIR = ${r.total_incidents > 0 ? ((r.lost_time_incidents * 200000) / 200000).toFixed(2) : "0.00"}
TRIR = ${r.total_incidents > 0 ? ((r.total_incidents * 200000) / 200000).toFixed(2) : "0.00"}

הערות:
${r.notes || "אין הערות"}

---
נוצר ע"י מערכת ה-ERP — ${new Date().toLocaleDateString("he-IL")}
    `.trim();

    const blob = new Blob(["\uFEFF" + content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `safety_report_${r.report_year}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="w-6 h-6 text-green-400" />
            דוח בטיחות שנתי — דיווח למשרד העבודה
          </h1>
          <p className="text-sm text-muted-foreground mt-1">הכנה, מעקב והגשת דוחות בטיחות שנתיים (דוח בטיחות שנתי) לרגולציה ישראלית</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={load} className="flex items-center gap-1 px-3 py-2 bg-card border border-border rounded-lg text-sm hover:bg-muted"><RefreshCw className="w-3.5 h-3.5" /></button>
          <button onClick={openCreate} className="flex items-center gap-2 bg-green-600 text-foreground px-4 py-2 rounded-xl hover:bg-green-700 text-sm font-medium"><Plus className="w-4 h-4" />צור דוח חדש</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50 border-border/50"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-foreground">{items.length}</p><p className="text-xs text-muted-foreground mt-1">סה"כ דוחות</p></CardContent></Card>
        <Card className="bg-card/50 border-border/50"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-green-400">{items.filter(r => r.status === "אושר").length}</p><p className="text-xs text-muted-foreground mt-1">אושרו</p></CardContent></Card>
        <Card className="bg-card/50 border-border/50"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-blue-400">{items.filter(r => r.status === "הוגש").length}</p><p className="text-xs text-muted-foreground mt-1">הוגשו</p></CardContent></Card>
        <Card className="bg-card/50 border-border/50"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-yellow-400">{items.filter(r => r.status === "טיוטה").length}</p><p className="text-xs text-muted-foreground mt-1">טיוטות</p></CardContent></Card>
      </div>

      {loading ? (
        <LoadingOverlay className="min-h-[100px]" />
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><FileText className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין דוחות שנתיים</p><p className="text-sm mt-1">לחץ "צור דוח חדש" להתחיל</p></div>
      ) : (
        <>
          <div className="grid gap-4">
            {pagination.paginate(items).map(r => (
              <Card key={r.id} className="bg-card/50 border-border/50">
                <CardContent className="p-5">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-bold text-foreground text-lg">{r.report_type} — {r.report_year}</h3>
                        <Badge className={`text-[10px] ${SC[r.status] || ""}`}>{translateStatus(r.status)}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">הוכן על ידי: {r.prepared_by || "—"} | אושר: {r.approved_by || "—"} | הוגש: {r.submission_date?.slice(0,10) || "טרם הוגש"}</p>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => exportReport(r)} className="p-1.5 hover:bg-muted rounded-lg" title="ייצוא לקובץ"><Download className="w-4 h-4 text-green-400" /></button>
                      <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                      <button onClick={async () => { if (await globalConfirm("למחוק דוח?")) { await authFetch(`${API}/hse-annual-reports/${r.id}`, { method: "DELETE" }); load(); } }} className="p-1.5 hover:bg-muted rounded-lg"><AlertCircle className="w-3.5 h-3.5 text-red-400" /></button>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 md:grid-cols-5 gap-3 text-sm">
                    <div className="text-center p-2 bg-muted/20 rounded-lg"><p className="text-lg font-bold text-foreground">{r.total_incidents}</p><p className="text-xs text-muted-foreground">אירועים</p></div>
                    <div className="text-center p-2 bg-muted/20 rounded-lg"><p className="text-lg font-bold text-red-400">{r.lost_time_incidents}</p><p className="text-xs text-muted-foreground">זמן אבוד</p></div>
                    <div className="text-center p-2 bg-muted/20 rounded-lg"><p className="text-lg font-bold text-purple-400">{r.near_misses}</p><p className="text-xs text-muted-foreground">כמעט תאונות</p></div>
                    <div className="text-center p-2 bg-muted/20 rounded-lg"><p className="text-lg font-bold text-orange-400">{r.total_lost_days}</p><p className="text-xs text-muted-foreground">ימי היעדרות</p></div>
                    <div className="text-center p-2 bg-muted/20 rounded-lg"><p className="text-lg font-bold text-blue-400">{r.training_hours}</p><p className="text-xs text-muted-foreground">שעות הדרכה</p></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <SmartPagination pagination={pagination} />
        </>
      )}

      {viewDetail && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">{viewDetail.report_type} — {viewDetail.report_year}</h2><button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
            <div className="p-5 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                {[["שנה", viewDetail.report_year], ["סטטוס", viewDetail.status], ["הוכן ע\"י", viewDetail.prepared_by], ["אושר ע\"י", viewDetail.approved_by], ["תאריך הגשה", viewDetail.submission_date?.slice(0,10)]].map(([l,v]) => (
                  <div key={l}><p className="text-xs text-muted-foreground mb-0.5">{l}</p><p className="font-medium text-foreground">{v || "—"}</p></div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[["אירועים כולל", viewDetail.total_incidents], ["זמן אבוד", viewDetail.lost_time_incidents], ["כמעט תאונות", viewDetail.near_misses], ["ימי היעדרות", viewDetail.total_lost_days], ["שעות הדרכה", viewDetail.training_hours]].map(([l,v]) => (
                  <div key={l} className="text-center p-2 bg-muted/20 rounded-lg"><p className="text-lg font-bold text-foreground">{v}</p><p className="text-xs text-muted-foreground">{l}</p></div>
                ))}
              </div>
              {viewDetail.notes && <div><p className="text-xs text-muted-foreground mb-0.5">הערות</p><p className="text-foreground">{viewDetail.notes}</p></div>}
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2">
              <button onClick={() => exportReport(viewDetail)} className="flex items-center gap-1 px-4 py-2 bg-green-500/20 text-green-400 rounded-lg text-sm hover:bg-green-500/30"><Download className="w-3.5 h-3.5" />ייצוא</button>
              <button onClick={() => { setViewDetail(null); openEdit(viewDetail); }} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30"><Edit2 className="w-3.5 h-3.5 inline ml-1" />עריכה</button>
              <button onClick={() => setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">{editing ? "עריכת דוח" : "יצירת דוח בטיחות שנתי"}</h2><button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
            <div className="p-5 grid grid-cols-2 gap-4">
              <div><label className="block text-xs text-muted-foreground mb-1.5">שנת דוח *</label><input type="number" value={form.report_year} onChange={e => setForm({...form, report_year: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">סוג דוח</label><select value={form.report_type} onChange={e => setForm({...form, report_type: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{REPORT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">הוכן ע"י</label><input value={form.prepared_by} onChange={e => setForm({...form, prepared_by: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">אושר ע"י</label><input value={form.approved_by} onChange={e => setForm({...form, approved_by: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">תאריך הגשה</label><input type="date" value={form.submission_date} onChange={e => setForm({...form, submission_date: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">סטטוס</label><select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{REPORT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">סה"כ אירועים</label><input type="number" value={form.total_incidents} onChange={e => setForm({...form, total_incidents: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">אירועי זמן אבוד</label><input type="number" value={form.lost_time_incidents} onChange={e => setForm({...form, lost_time_incidents: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">כמעט-תאונות</label><input type="number" value={form.near_misses} onChange={e => setForm({...form, near_misses: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">סה"כ ימי היעדרות</label><input type="number" value={form.total_lost_days} onChange={e => setForm({...form, total_lost_days: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">שעות הדרכה</label><input type="number" value={form.training_hours} onChange={e => setForm({...form, training_hours: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div className="col-span-2"><label className="block text-xs text-muted-foreground mb-1.5">הערות</label><textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
              <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-foreground rounded-lg text-sm hover:bg-green-700">
                {saving ? "שומר..." : <><Save className="w-3.5 h-3.5" />שמור</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

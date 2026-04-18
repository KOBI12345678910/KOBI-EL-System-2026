import { useState, useMemo, useEffect } from "react";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Download, Plus, MoreHorizontal, ChevronRight, ChevronLeft, X, Eye, Trash2, TrendingUp, ChevronsUpDown, Clock, AlertCircle, Loader2, HardDrive, Play, CheckCircle2, XCircle, RefreshCw } from "lucide-react";

const STATUS_LABELS: Record<string, string> = { completed: "הושלם", in_progress: "בתהליך", failed: "נכשל", pending: "ממתין" };
const SC: Record<string, string> = { completed: "bg-green-500/20 text-green-300", in_progress: "bg-blue-500/20 text-blue-300", failed: "bg-red-500/20 text-red-300", pending: "bg-yellow-500/20 text-yellow-300" };
const TYPE_LABELS: Record<string, string> = { full: "מלא", database: "מסד נתונים", configuration: "תצורה", incremental: "אינקרמנטלי", differential: "דיפרנציאלי", files: "קבצים" };

function formatSize(bytes: number): string {
  if (!bytes) return "—";
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function formatDuration(sec: number): string {
  if (!sec) return "—";
  if (sec >= 60) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${sec}s`;
}

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "פחות משעה";
  if (hours < 24) return `לפני ${hours} שעות`;
  const days = Math.floor(hours / 24);
  return `לפני ${days} ימים`;
}

interface Backup {
  id: number;
  backup_type: string;
  status: string;
  size_bytes: number;
  location: string;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number;
  notes: string | null;
  triggered_by: string;
  created_at: string;
}

export default function Backups() {
  const [data, setData] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [showDetail, setShowDetail] = useState<number | null>(null);

  const load = async () => {
    try {
      const res = await authFetch("/api/settings/backups");
      if (res.ok) {
        const j = await res.json();
        setData(Array.isArray(j) ? j : j.data || j.items || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const triggerBackup = async (backupType: string) => {
    setTriggering(true);
    setError(null);
    try {
      const res = await authFetch("/api/settings/backups/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backupType, triggeredBy: "admin" }),
      });
      if (!res.ok) throw new Error("שגיאה ביצירת גיבוי");
      setTimeout(() => load(), 4000);
      await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "שגיאה"); }
    setTriggering(false);
  };

  const filtered = useMemo(() => {
    let d = [...data];
    if (search) { const s = search.toLowerCase(); d = d.filter(r => String(r.id).includes(s) || r.backup_type.includes(s) || r.location.includes(s)); }
    if (statusFilter !== "all") d = d.filter(r => r.status === statusFilter);
    if (typeFilter !== "all") d = d.filter(r => r.backup_type === typeFilter);
    return d;
  }, [data, search, statusFilter, typeFilter]);

  const tp = Math.ceil(filtered.length / perPage);
  const pd = filtered.slice((page - 1) * perPage, page * perPage);
  const af = [statusFilter !== "all", typeFilter !== "all"].filter(Boolean).length;
  const dr = showDetail !== null ? data.find(r => r.id === showDetail) : null;

  const completedCount = data.filter(d => d.status === "completed").length;
  const failedCount = data.filter(d => d.status === "failed").length;
  const totalSize = data.reduce((s, d) => s + Number(d.size_bytes || 0), 0);
  const lastBackup = data.length > 0 ? data[0] : null;

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-teal-400" /></div>;
  }

  return (
    <div className="p-6 space-y-4" dir="rtl">
      {error && <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400"><AlertCircle className="h-4 w-4 flex-shrink-0" /><span className="text-sm">{error}</span><button onClick={() => setError(null)} className="mr-auto"><X className="h-4 w-4" /></button></div>}
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Download className="h-6 w-6 text-teal-400" />גיבויים</h1><p className="text-sm text-muted-foreground mt-1">ניהול גיבויים, שחזור ותכנון</p></div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => load()} className="border-border text-gray-300 gap-1"><RefreshCw className="h-4 w-4" />רענן</Button>
          <Button onClick={() => triggerBackup("database")} disabled={triggering} variant="outline" size="sm" className="border-border text-cyan-300 gap-1">{triggering ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}גיבוי DB</Button>
          <Button onClick={() => triggerBackup("full")} disabled={triggering} className="bg-blue-600 hover:bg-blue-700 gap-2">{triggering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}גיבוי מלא</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { l: "גיבויים", v: String(data.length), c: "text-teal-400", icon: Download },
          { l: "הושלמו", v: String(completedCount), c: "text-green-400", icon: CheckCircle2 },
          { l: "נפח כולל", v: formatSize(totalSize), c: "text-blue-400", icon: HardDrive },
          { l: "אחרון", v: lastBackup ? timeAgo(lastBackup.created_at) : "—", c: "text-cyan-400", icon: Clock },
          { l: "נכשלו", v: String(failedCount), c: "text-red-400", icon: XCircle },
          { l: "הצלחה", v: data.length > 0 ? `${Math.round((completedCount / data.length) * 100)}%` : "—", c: "text-purple-400", icon: TrendingUp },
        ].map((k, i) => (
          <Card key={i} className="bg-card/80 border-border hover:border-border transition-colors">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] text-muted-foreground">{k.l}</p>
                  <p className={`text-lg font-bold font-mono mt-1 ${k.c}`}>{k.v}</p>
                </div>
                <k.icon className={`h-4 w-4 ${k.c} opacity-50`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-card/60 border-border"><CardContent className="p-3"><div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="חיפוש..." className="pr-9 bg-input border-border text-foreground" /></div>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"><option value="all">כל הסטטוסים</option><option value="completed">הושלם</option><option value="in_progress">בתהליך</option><option value="failed">נכשל</option><option value="pending">ממתין</option></select>
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"><option value="all">כל הסוגים</option><option value="full">מלא</option><option value="database">מסד נתונים</option><option value="configuration">תצורה</option><option value="incremental">אינקרמנטלי</option></select>
        {af > 0 && <Button variant="ghost" size="sm" onClick={() => { setStatusFilter("all"); setTypeFilter("all"); setSearch(""); }} className="text-red-400 hover:text-red-300 gap-1"><X className="h-3 w-3" />נקה ({af})</Button>}
      </div></CardContent></Card>

      <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border bg-background/50">
        <th className="p-3 text-right text-muted-foreground font-medium">#</th>
        <th className="p-3 text-right text-muted-foreground font-medium">סוג</th>
        <th className="p-3 text-right text-muted-foreground font-medium">גודל</th>
        <th className="p-3 text-right text-muted-foreground font-medium">מיקום</th>
        <th className="p-3 text-right text-muted-foreground font-medium">משך</th>
        <th className="p-3 text-right text-muted-foreground font-medium">הופעל ע&quot;י</th>
        <th className="p-3 text-right text-muted-foreground font-medium">תאריך</th>
        <th className="p-3 text-right text-muted-foreground font-medium">סטטוס</th>
        <th className="p-3 text-center text-muted-foreground font-medium">פעולות</th>
      </tr></thead><tbody>
        {pd.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">אין גיבויים להצגה</td></tr>}
        {pd.map(row => (
          <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
            <td className="p-3 font-mono text-xs text-blue-400">#{row.id}</td>
            <td className="p-3"><Badge variant="outline" className="text-xs border-border">{TYPE_LABELS[row.backup_type] || row.backup_type}</Badge></td>
            <td className="p-3 font-mono text-foreground">{formatSize(Number(row.size_bytes))}</td>
            <td className="p-3 text-muted-foreground text-xs">{row.location}</td>
            <td className="p-3 text-muted-foreground text-xs">{formatDuration(Number(row.duration_seconds))}</td>
            <td className="p-3 text-muted-foreground text-xs">{row.triggered_by}</td>
            <td className="p-3 text-muted-foreground text-xs">{timeAgo(row.created_at)}</td>
            <td className="p-3"><Badge className={`${SC[row.status] || SC.pending} border-0 text-xs`}>{STATUS_LABELS[row.status] || row.status}</Badge></td>
            <td className="p-3 text-center">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setShowDetail(row.id)}><Eye className="h-4 w-4" /></Button>
            </td>
          </tr>
        ))}
      </tbody></table></div>
      <div className="flex items-center justify-between p-3 border-t border-border">
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><span>מציג {filtered.length === 0 ? 0 : ((page - 1) * perPage) + 1}-{Math.min(page * perPage, filtered.length)} מתוך {filtered.length}</span><select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }} className="bg-input border border-border rounded px-2 py-1 text-xs text-foreground">{[10, 25, 50].map(n => <option key={n} value={n}>{n} שורות</option>)}</select></div>
        <div className="flex items-center gap-1"><Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="h-8 w-8 p-0"><ChevronRight className="h-4 w-4" /></Button>{Array.from({ length: Math.min(5, tp) }, (_, i) => { const p = page <= 3 ? i + 1 : page + i - 2; if (p > tp || p < 1) return null; return <Button key={p} variant={p === page ? "default" : "ghost"} size="sm" onClick={() => setPage(p)} className={`h-8 w-8 p-0 ${p === page ? "bg-blue-600" : ""}`}>{p}</Button>; })}<Button variant="ghost" size="sm" disabled={page >= tp} onClick={() => setPage(p => p + 1)} className="h-8 w-8 p-0"><ChevronLeft className="h-4 w-4" /></Button></div>
      </div></CardContent></Card>

      {dr && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowDetail(null)}><div className="bg-card border border-border rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border"><div className="flex items-center gap-3"><h2 className="text-lg font-bold text-foreground">גיבוי #{dr.id}</h2><Badge className={`${SC[dr.status] || SC.pending} border-0`}>{STATUS_LABELS[dr.status] || dr.status}</Badge></div><Button variant="ghost" size="sm" onClick={() => setShowDetail(null)}><X className="h-4 w-4" /></Button></div>
        <div className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">סוג</p><p className="text-foreground mt-1 font-medium">{TYPE_LABELS[dr.backup_type] || dr.backup_type}</p></div>
            <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">גודל</p><p className="text-foreground mt-1 font-medium">{formatSize(Number(dr.size_bytes))}</p></div>
            <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">מיקום</p><p className="text-foreground mt-1 font-medium">{dr.location}</p></div>
            <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">משך</p><p className="text-foreground mt-1 font-medium">{formatDuration(Number(dr.duration_seconds))}</p></div>
            <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">הופעל ע&quot;י</p><p className="text-foreground mt-1 font-medium">{dr.triggered_by}</p></div>
            <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">תאריך יצירה</p><p className="text-foreground mt-1 font-medium">{new Date(dr.created_at).toLocaleString("he-IL")}</p></div>
            <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">התחלה</p><p className="text-foreground mt-1 font-medium">{new Date(dr.started_at).toLocaleString("he-IL")}</p></div>
            <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">סיום</p><p className="text-foreground mt-1 font-medium">{dr.completed_at ? new Date(dr.completed_at).toLocaleString("he-IL") : "—"}</p></div>
            <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">סטטוס</p><p className="text-foreground mt-1 font-medium">{STATUS_LABELS[dr.status] || dr.status}</p></div>
          </div>
          {dr.notes && <div className="bg-input rounded-lg p-3 mt-3"><p className="text-[11px] text-muted-foreground">הערות</p><p className="text-foreground mt-1">{dr.notes}</p></div>}
        </div>
        <div className="flex items-center gap-2 p-4 border-t border-border justify-end"><Button variant="outline" onClick={() => setShowDetail(null)} className="border-border">סגור</Button></div>
      </div></div>}
    </div>
  );
}

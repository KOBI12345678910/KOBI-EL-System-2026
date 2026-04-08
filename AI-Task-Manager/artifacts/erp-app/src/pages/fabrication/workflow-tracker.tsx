import { useState, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Search, ChevronRight, ChevronLeft, X, Eye, ChevronsUpDown, AlertCircle } from "lucide-react";
import { authFetch } from "@/lib/utils";

const STATUS_HE: Record<string, string> = { pending: "בתור", in_progress: "בביצוע", completed: "הושלם", blocked: "עצור" };
const SC: Record<string, string> = { pending: "bg-gray-500/20 text-gray-300", in_progress: "bg-yellow-500/20 text-yellow-300", completed: "bg-green-500/20 text-green-300", blocked: "bg-red-500/20 text-red-300" };
const STAGES = ["חיתוך", "ריתוך", "ציפוי", "הרכבה", "בדיקה", "אריזה"];

export default function WorkflowTrackerPage() {
  const [data, setData] = useState<any>({});
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authFetch("/api/fabrication-production/dashboard");
      if (res.ok) setData(await res.json());
    } catch (e: any) { setError(e.message); }
    setIsLoading(false);
  }, []);

  useEffect(() => { load(); const iv = setInterval(load, 30000); return () => clearInterval(iv); }, [load]);

  const sections = useMemo(() => {
    if (!data) return [];
    return [
      { name: "חיתוך", icon: "text-amber-400", total: data.cutting?.total || 0, active: data.cutting?.active || 0, pending: data.cutting?.pending || 0 },
      { name: "הרכבה", icon: "text-blue-400", total: data.assembly?.total || 0, active: data.assembly?.active || 0, pending: data.assembly?.pending || 0 },
      { name: "ריתוך", icon: "text-orange-400", total: data.welding?.total || 0, active: data.welding?.active || 0, pending: data.welding?.pending || 0 },
      { name: "ציפוי", icon: "text-purple-400", total: data.coating?.total || 0, active: data.coating?.active || 0, pending: data.coating?.pending || 0 },
      { name: "זיגוג", icon: "text-cyan-400", total: data.glazing?.total || 0, active: data.glazing?.active || 0, pending: data.glazing?.pending || 0 },
    ].filter(s => catFilter === "all" || s.name === catFilter);
  }, [data, catFilter]);

  const totalActive = sections.reduce((s, c) => s + Number(c.active), 0);
  const totalPending = sections.reduce((s, c) => s + Number(c.pending), 0);
  const totalAll = sections.reduce((s, c) => s + Number(c.total), 0);

  return (
    <div className="p-6 space-y-4" dir="rtl">
      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-2 text-red-400 text-sm"><AlertCircle className="h-4 w-4" />{error}<Button variant="ghost" size="sm" onClick={() => setError(null)}><X className="h-3 w-3" /></Button></div>}
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><TrendingUp className="h-6 w-6 text-emerald-400" />מעקב תהליכים</h1><p className="text-sm text-muted-foreground mt-1">סקירה כללית של שלבי הייצור במפעל — נתונים חיים</p></div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[{ l: "סה״כ הזמנות", v: totalAll, c: "text-emerald-400" }, { l: "פעילות", v: totalActive, c: "text-yellow-400" }, { l: "ממתינות", v: totalPending, c: "text-gray-400" }, { l: "שלבים", v: sections.length, c: "text-blue-400" }].map((k, i) => (
          <Card key={i} className="bg-card/80 border-border"><CardContent className="p-4">{isLoading ? <div className="space-y-2 animate-pulse"><div className="h-3 w-16 bg-muted rounded" /><div className="h-6 w-20 bg-muted rounded" /></div> : <div><p className="text-[11px] text-muted-foreground">{k.l}</p><p className={`text-lg font-bold font-mono mt-1 ${k.c}`}>{k.v}</p></div>}</CardContent></Card>
        ))}
      </div>

      <Card className="bg-card/60 border-border"><CardContent className="p-3"><div className="flex flex-wrap items-center gap-3">
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"><option value="all">כל השלבים</option>{["חיתוך", "הרכבה", "ריתוך", "ציפוי", "זיגוג"].map(o => <option key={o} value={o}>{o}</option>)}</select>
        {catFilter !== "all" && <Button variant="ghost" size="sm" onClick={() => setCatFilter("all")} className="text-red-400 hover:text-red-300 gap-1"><X className="h-3 w-3" />נקה</Button>}
      </div></CardContent></Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="bg-card/80 border-border"><CardContent className="p-6"><div className="space-y-3 animate-pulse"><div className="h-5 w-24 bg-muted rounded" /><div className="h-8 w-16 bg-muted rounded" /><div className="h-4 w-full bg-muted rounded" /></div></CardContent></Card>
        )) : sections.map((section, i) => {
          const completedPercent = section.total > 0 ? Math.round(((Number(section.total) - Number(section.active) - Number(section.pending)) / Number(section.total)) * 100) : 0;
          return (
            <Card key={i} className="bg-card/80 border-border hover:border-border transition-colors">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className={`text-lg font-bold ${section.icon}`}>{section.name}</h3>
                  <span className="text-2xl font-bold font-mono text-foreground">{section.total}</span>
                </div>
                <div className="w-full bg-input rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${completedPercent}%` }} />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>הושלם: {completedPercent}%</span>
                  <span>פעיל: {section.active} | ממתין: {section.pending}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-input rounded p-2"><p className="text-[10px] text-muted-foreground">סה״כ</p><p className="text-foreground font-bold font-mono">{section.total}</p></div>
                  <div className="bg-input rounded p-2"><p className="text-[10px] text-muted-foreground">פעילות</p><p className="text-yellow-400 font-bold font-mono">{section.active}</p></div>
                  <div className="bg-input rounded p-2"><p className="text-[10px] text-muted-foreground">ממתינות</p><p className="text-gray-400 font-bold font-mono">{section.pending}</p></div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

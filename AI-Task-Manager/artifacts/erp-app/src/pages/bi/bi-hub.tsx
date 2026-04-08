import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui-components";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Search, Download, Eye, Edit2, BarChart3, LayoutDashboard,
  FileText, TrendingUp, ChevronRight, ChevronLeft, RefreshCw, Target
} from "lucide-react";
import { useLocation } from "wouter";

const API_BASE = "/api";

const DISPLAY_TYPE_LABELS: Record<string, string> = {
  table: "טבלה",
  bar_chart: "עמודות",
  pie_chart: "עוגה",
  line_chart: "קו",
  area_chart: "שטח",
};

export default function BiHub() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "reports" | "dashboards">("all");
  const [page, setPage] = useState(1);
  const perPage = 20;
  const [, setLocation] = useLocation();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["bi-hub"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/bi/hub`);
      if (!r.ok) return { reports: [], dashboards: [] };
      return r.json();
    },
  });

  const reports = (data?.reports || []) as any[];
  const dashboards = (data?.dashboards || []) as any[];

  const combined = useMemo(() => {
    const items: any[] = [];
    if (typeFilter !== "dashboards") {
      items.push(...reports.map(r => ({ ...r, _kind: "report" })));
    }
    if (typeFilter !== "reports") {
      items.push(...dashboards.map(d => ({ ...d, _kind: "dashboard" })));
    }
    return items.filter(item =>
      !search || item.name?.toLowerCase().includes(search.toLowerCase()) || item.description?.toLowerCase().includes(search.toLowerCase())
    ).sort((a, b) => new Date(b.updated_at || b.updatedAt || 0).getTime() - new Date(a.updated_at || a.updatedAt || 0).getTime());
  }, [reports, dashboards, search, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(combined.length / perPage));
  const pageData = combined.slice((page - 1) * perPage, page * perPage);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">מרכז BI</h1>
          <p className="text-sm text-muted-foreground mt-1">כל הדוחות והדשבורדים במקום אחד</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="p-2 text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <Button variant="outline" size="sm" onClick={() => setLocation("/report-builder")}>
            <Plus className="w-4 h-4 ml-1" /> דוח חדש
          </Button>
          <Button size="sm" className="bg-primary" onClick={() => setLocation("/bi/custom-dashboards")}>
            <Plus className="w-4 h-4 ml-1" /> דשבורד חדש
          </Button>
        </div>
      </div>

      <button
        onClick={() => setLocation("/executive/scorecard")}
        className="w-full flex items-center justify-between p-4 rounded-xl border border-blue-500/30 bg-gradient-to-l from-blue-500/10 via-indigo-500/5 to-transparent hover:border-blue-500/50 hover:from-blue-500/15 transition-all group"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/20">
            <Target className="w-5 h-5 text-blue-400" />
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-foreground">כרטיס ניקוד מנכ"ל</p>
            <p className="text-xs text-muted-foreground">מבט כולל בריאות עסקית עם רמזורים ופריטי פעולה</p>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
      </button>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 text-center bg-blue-500/5 border-blue-500/20">
          <div className="text-2xl font-bold text-blue-400">{reports.length}</div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1"><FileText className="w-3 h-3" /> דוחות</div>
        </Card>
        <Card className="p-4 text-center bg-purple-500/5 border-purple-500/20">
          <div className="text-2xl font-bold text-purple-400">{dashboards.length}</div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1"><LayoutDashboard className="w-3 h-3" /> דשבורדים</div>
        </Card>
        <Card className="p-4 text-center bg-emerald-500/5 border-emerald-500/20">
          <div className="text-2xl font-bold text-emerald-400">{reports.filter((r: any) => r.is_active).length}</div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1"><TrendingUp className="w-3 h-3" /> דוחות פעילים</div>
        </Card>
        <Card className="p-4 text-center bg-amber-500/5 border-amber-500/20">
          <div className="text-2xl font-bold text-amber-400">{dashboards.filter((d: any) => d.isDefault || d.is_default).length}</div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1"><LayoutDashboard className="w-3 h-3" /> ברירות מחדל</div>
        </Card>
      </div>

      <Card className="bg-card/50 border-border/50">
        <div className="p-4 border-b border-border/30">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="חיפוש לפי שם..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pr-9 bg-background/50" />
            </div>
            <div className="flex rounded-lg border border-border overflow-hidden">
              {([["all", "הכל"], ["reports", "דוחות"], ["dashboards", "דשבורדים"]] as const).map(([val, label]) => (
                <button key={val} onClick={() => { setTypeFilter(val); setPage(1); }}
                  className={`px-3 py-2 text-sm transition-colors ${typeFilter === val ? "bg-primary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            טוען...
          </div>
        ) : pageData.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">אין תוצאות</p>
            <p className="text-sm mt-1">
              {search ? "נסה חיפוש אחר" : 'לחץ "דוח חדש" כדי להתחיל'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-muted/5">
                  <th className="text-right p-3 text-muted-foreground font-medium">שם</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">סוג</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">תיאור</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">עדכון</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">סטטוס</th>
                  <th className="text-center p-3 text-muted-foreground font-medium w-24">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {pageData.map((item, idx) => {
                  const isReport = item._kind === "report";
                  const Icon = isReport ? FileText : LayoutDashboard;
                  const updatedAt = item.updated_at || item.updatedAt;
                  const isActive = isReport ? item.is_active : item.status === "active";
                  const editPath = isReport ? "/report-builder" : "/bi/custom-dashboards";
                  return (
                    <tr key={idx} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className={`p-1.5 rounded-lg ${isReport ? "bg-blue-500/10" : "bg-purple-500/10"}`}>
                            <Icon className={`w-3.5 h-3.5 ${isReport ? "text-blue-400" : "text-purple-400"}`} />
                          </div>
                          <span className="font-medium text-foreground">{item.name}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge className={isReport ? "bg-blue-500/20 text-blue-300" : "bg-purple-500/20 text-purple-300"}>
                          {isReport ? DISPLAY_TYPE_LABELS[item.display_type] || item.display_type || "דוח" : "דשבורד"}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted-foreground text-xs max-w-[200px] truncate">{item.description || "—"}</td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {updatedAt ? new Date(updatedAt).toLocaleDateString("he-IL") : "—"}
                      </td>
                      <td className="p-3">
                        <Badge className={isActive ? "bg-green-500/20 text-green-300" : "bg-muted/20 text-muted-foreground"}>
                          {isActive ? "פעיל" : "לא פעיל"}
                        </Badge>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setLocation(editPath)} className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between p-4 text-sm text-muted-foreground border-t border-border/30">
          <span>מציג {combined.length === 0 ? 0 : (page - 1) * perPage + 1}–{Math.min(combined.length, page * perPage)} מתוך {combined.length}</span>
          <div className="flex gap-1 items-center">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <span className="px-3 py-1">{page}/{totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

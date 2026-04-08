import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search, Play, RefreshCw, Calendar, Package, AlertTriangle, ShoppingCart,
  ArrowUpDown, Filter, X, Download, Loader2, CheckCircle, TrendingUp,
  TrendingDown, ChevronsUpDown, Eye, Boxes, Factory, ArrowRightLeft
} from "lucide-react";
import { authFetch } from "@/lib/utils";

const API = "/api/production-sap";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const priorityMap: Record<string, { label: string; color: string }> = {
  critical: { label: "קריטי", color: "bg-red-500/20 text-red-400" },
  high: { label: "גבוהה", color: "bg-orange-500/20 text-orange-400" },
  medium: { label: "בינונית", color: "bg-yellow-500/20 text-yellow-400" },
  low: { label: "נמוכה", color: "bg-blue-500/20 text-blue-400" },
};

const actionMap: Record<string, { label: string; color: string; icon: any }> = {
  purchase: { label: "רכישה", color: "bg-blue-500/20 text-blue-400", icon: ShoppingCart },
  produce: { label: "ייצור", color: "bg-green-500/20 text-green-400", icon: Factory },
  transfer: { label: "העברה", color: "bg-purple-500/20 text-purple-400", icon: ArrowRightLeft },
};

const typeMap: Record<string, string> = {
  raw_material: "חומר גלם",
  semi_finished: "מוצר חצי מוגמר",
  finished: "מוצר מוגמר",
  packaging: "אריזה",
  consumable: "מתכלה",
};

export default function MrpPlanningPage() {
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterAction, setFilterAction] = useState("all");
  const [sortField, setSortField] = useState("priority");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [viewDetail, setViewDetail] = useState<any>(null);
  const perPage = 25;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [iRes, sRes] = await Promise.all([
        authFetch(`${API}/mrp-results`),
        authFetch(`${API}/mrp-stats`),
      ]);
      if (iRes.ok) setItems(safeArray(await iRes.json()));
      if (sRes.ok) setStats((await sRes.json()) || {});
    } catch (e: any) {
      setError(e.message || "שגיאה בטעינת נתונים");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const runMRP = async () => {
    setRunning(true);
    try {
      const res = await authFetch(`${API}/mrp-run`, { method: "POST" });
      if (res.ok) {
        await load();
      } else {
        setError("שגיאה בהרצת MRP");
      }
    } catch (e: any) {
      setError(e.message || "שגיאה בהרצת MRP");
    }
    setRunning(false);
  };

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const filtered = useMemo(() => {
    let data = items.filter(r =>
      (filterPriority === "all" || r.priority === filterPriority) &&
      (filterAction === "all" || r.recommended_action === filterAction) &&
      (!search || [r.material_name, r.material_code, r.type]
        .some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    data.sort((a: any, b: any) => {
      if (sortField === "priority") {
        const cmp = (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9);
        return sortDir === "asc" ? cmp : -cmp;
      }
      const va = a[sortField] ?? "";
      const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return data;
  }, [items, search, filterPriority, filterAction, sortField, sortDir]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice((page - 1) * perPage, page * perPage);
  const activeFilters = [filterPriority !== "all", filterAction !== "all"].filter(Boolean).length;

  const SI = () => <ChevronsUpDown className="h-3 w-3 opacity-40" />;

  const kpis = [
    { label: "הרצה אחרונה", value: stats.last_run_date || "לא בוצעה", color: "text-cyan-400", icon: Calendar },
    { label: "פריטים מתוכננים", value: fmt(stats.items_planned || items.length), color: "text-blue-400", icon: Package },
    { label: "חוסרים שנמצאו", value: fmt(stats.shortages_found || 0), color: "text-red-400", icon: AlertTriangle },
    { label: "הזמנות ליצירה", value: fmt(stats.orders_to_create || 0), color: "text-green-400", icon: ShoppingCart },
  ];

  return (
    <div className="p-6 space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Boxes className="h-6 w-6 text-blue-400" />
            תכנון דרישות חומרים (MRP)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">תכנון אוטומטי של רכישות, ייצור והעברות על בסיס דרישות</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="border-border text-gray-300 gap-1">
            <Download className="h-4 w-4" />ייצוא
          </Button>
          <Button
            onClick={runMRP}
            disabled={running}
            className="bg-blue-600 hover:bg-blue-700 gap-2"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? "מריץ MRP..." : "הרץ MRP"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />{error}
          <Button variant="ghost" size="sm" onClick={() => setError(null)} className="mr-auto text-red-400"><X className="h-3 w-3" /></Button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((k, i) => (
          <Card key={i} className="bg-card/80 border-border hover:border-border transition-colors">
            <CardContent className="p-4">
              {loading ? (
                <div className="space-y-2 animate-pulse">
                  <div className="h-3 w-16 bg-muted rounded" />
                  <div className="h-6 w-20 bg-muted rounded" />
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] text-muted-foreground">{k.label}</p>
                    <p className={`text-lg font-bold font-mono mt-1 ${k.color}`}>{k.value}</p>
                  </div>
                  <k.icon className={`h-5 w-5 ${k.color} opacity-50`} />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="bg-card/60 border-border">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="חיפוש חומר, קוד..."
                className="pr-9 bg-input border-border text-foreground"
              />
            </div>
            <select
              value={filterPriority}
              onChange={e => { setFilterPriority(e.target.value); setPage(1); }}
              className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"
            >
              <option value="all">כל העדיפויות</option>
              {Object.entries(priorityMap).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <select
              value={filterAction}
              onChange={e => { setFilterAction(e.target.value); setPage(1); }}
              className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"
            >
              <option value="all">כל הפעולות</option>
              {Object.entries(actionMap).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            {activeFilters > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setFilterPriority("all"); setFilterAction("all"); setSearch(""); }}
                className="text-red-400 hover:text-red-300 gap-1"
              >
                <X className="h-3 w-3" />נקה ({activeFilters})
              </Button>
            )}
            <span className="text-xs text-muted-foreground mr-auto">{filtered.length} תוצאות</span>
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card className="bg-card/80 border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background/50">
                  <th className="p-3 text-right text-muted-foreground font-medium">
                    <button className="flex items-center gap-1" onClick={() => toggleSort("material_name")}>שם חומר<SI /></button>
                  </th>
                  <th className="p-3 text-right text-muted-foreground font-medium">
                    <button className="flex items-center gap-1" onClick={() => toggleSort("type")}>סוג<SI /></button>
                  </th>
                  <th className="p-3 text-right text-muted-foreground font-medium">
                    <button className="flex items-center gap-1" onClick={() => toggleSort("current_stock")}>מלאי נוכחי<SI /></button>
                  </th>
                  <th className="p-3 text-right text-muted-foreground font-medium">
                    <button className="flex items-center gap-1" onClick={() => toggleSort("required_qty")}>נדרש<SI /></button>
                  </th>
                  <th className="p-3 text-right text-muted-foreground font-medium">
                    <button className="flex items-center gap-1" onClick={() => toggleSort("shortage")}>חוסר<SI /></button>
                  </th>
                  <th className="p-3 text-right text-muted-foreground font-medium">פעולה מומלצת</th>
                  <th className="p-3 text-right text-muted-foreground font-medium">
                    <button className="flex items-center gap-1" onClick={() => toggleSort("recommended_qty")}>כמות מומלצת<SI /></button>
                  </th>
                  <th className="p-3 text-right text-muted-foreground font-medium">
                    <button className="flex items-center gap-1" onClick={() => toggleSort("required_date")}>תאריך<SI /></button>
                  </th>
                  <th className="p-3 text-right text-muted-foreground font-medium">
                    <button className="flex items-center gap-1" onClick={() => toggleSort("priority")}>עדיפות<SI /></button>
                  </th>
                  <th className="p-3 text-right text-muted-foreground font-medium">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      {Array.from({ length: 10 }).map((_, j) => (
                        <td key={j} className="p-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                ) : paged.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-muted-foreground">
                      <Boxes className="h-10 w-10 mx-auto mb-2 opacity-30" />
                      <p>אין תוצאות MRP. הרץ תכנון חדש.</p>
                    </td>
                  </tr>
                ) : paged.map((r: any, i: number) => {
                  const action = actionMap[r.recommended_action] || { label: r.recommended_action, color: "bg-gray-500/20 text-gray-400", icon: Package };
                  const priority = priorityMap[r.priority] || { label: r.priority, color: "bg-gray-500/20 text-gray-400" };
                  const ActionIcon = action.icon;
                  return (
                    <tr key={r.id || i} className="border-b border-border/50 hover:bg-card/40 transition-colors">
                      <td className="p-3">
                        <div>
                          <span className="text-foreground font-medium">{r.material_name || "—"}</span>
                          {r.material_code && <span className="text-xs text-muted-foreground block">{r.material_code}</span>}
                        </div>
                      </td>
                      <td className="p-3 text-gray-300">{typeMap[r.type] || r.type || "—"}</td>
                      <td className="p-3 font-mono text-gray-300">{fmt(r.current_stock)}</td>
                      <td className="p-3 font-mono text-gray-300">{fmt(r.required_qty)}</td>
                      <td className="p-3">
                        <span className={`font-mono font-bold ${(r.shortage || 0) > 0 ? "text-red-400" : "text-green-400"}`}>
                          {fmt(r.shortage)}
                        </span>
                      </td>
                      <td className="p-3">
                        <Badge className={`${action.color} gap-1`}>
                          <ActionIcon className="h-3 w-3" />
                          {action.label}
                        </Badge>
                      </td>
                      <td className="p-3 font-mono text-foreground font-medium">{fmt(r.recommended_qty)}</td>
                      <td className="p-3 text-gray-300">{r.required_date || "—"}</td>
                      <td className="p-3">
                        <Badge className={priority.color}>{priority.label}</Badge>
                      </td>
                      <td className="p-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setViewDetail(r)}
                          className="text-gray-400 hover:text-foreground"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-3 border-t border-border">
              <span className="text-xs text-muted-foreground">
                מציג {(page - 1) * perPage + 1}-{Math.min(page * perPage, filtered.length)} מתוך {filtered.length}
              </span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)} className="border-border text-gray-300">הקודם</Button>
                <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="border-border text-gray-300">הבא</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Modal */}
      {viewDetail && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setViewDetail(null)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-lg p-6 space-y-4" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">פרטי חומר</h2>
              <Button variant="ghost" size="sm" onClick={() => setViewDetail(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "שם חומר", value: viewDetail.material_name },
                { label: "קוד", value: viewDetail.material_code },
                { label: "סוג", value: typeMap[viewDetail.type] || viewDetail.type },
                { label: "מלאי נוכחי", value: fmt(viewDetail.current_stock) },
                { label: "כמות נדרשת", value: fmt(viewDetail.required_qty) },
                { label: "חוסר", value: fmt(viewDetail.shortage) },
                { label: "כמות מומלצת", value: fmt(viewDetail.recommended_qty) },
                { label: "תאריך נדרש", value: viewDetail.required_date || "—" },
                { label: "ספק מומלץ", value: viewDetail.recommended_supplier || "—" },
                { label: "זמן אספקה", value: viewDetail.lead_time_days ? `${viewDetail.lead_time_days} ימים` : "—" },
              ].map((f, i) => (
                <div key={i}>
                  <p className="text-xs text-muted-foreground">{f.label}</p>
                  <p className="text-sm text-foreground mt-1">{f.value || "—"}</p>
                </div>
              ))}
            </div>
            {viewDetail.notes && (
              <div>
                <p className="text-xs text-muted-foreground">הערות</p>
                <p className="text-sm text-gray-300 mt-1">{viewDetail.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

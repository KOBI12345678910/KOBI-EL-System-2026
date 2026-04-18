import { useState, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Download, Eye, Edit2, ChevronRight, ChevronLeft, AlertCircle, RefreshCw, Loader2 } from "lucide-react";
import { authFetch } from "@/lib/utils";

const API = "/api";
const getHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("erp_token") || ""}` });

const STATUS_MAP: Record<string, string> = {
  pending: "ממתין",
  in_progress: "בביצוע",
  done: "הושלם",
  cancelled: "בוטל",
};
const SC: Record<string, string> = { "ממתין": "bg-green-500/20 text-green-300", "בביצוע": "bg-blue-500/20 text-blue-300", "הושלם": "bg-yellow-500/20 text-yellow-300", "בוטל": "bg-purple-500/20 text-purple-300" };
const STATUS_VALS = ["ממתין", "בביצוע", "הושלם", "בוטל"];
const COLS = [
  { key: "customer_name", label: "לקוח" },
  { key: "follow_up_date", label: "תאריך מעקב" },
  { key: "note", label: "הערה" },
  { key: "status_label", label: "סטטוס" },
  { key: "created_at", label: "נוצר" },
];

export default function AiFollowUp() {
  const [data, setData] = useState<Record<string, string>[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const perPage = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API}/sales/follow-ups`, { headers: getHeaders() });
      if (res.ok) {
        const rows = await res.json();
        const normalized = (Array.isArray(rows) ? rows : []).map((r: any) => ({
          ...r,
          status_label: STATUS_MAP[r.status] || r.status || "ממתין",
          follow_up_date: r.follow_up_date ? new Date(r.follow_up_date).toLocaleDateString("he-IL") : "",
          created_at: r.created_at ? new Date(r.created_at).toLocaleDateString("he-IL") : "",
        }));
        setData(normalized);
      }
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return data.filter(r => {
      if (statusFilter !== "all" && r.status_label !== statusFilter) return false;
      if (search && !Object.values(r).some(v => String(v).toLowerCase().includes(search.toLowerCase()))) return false;
      return true;
    });
  }, [data, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageData = filtered.slice((page - 1) * perPage, page * perPage);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { "ממתין": 0, "בביצוע": 0, "הושלם": 0, "בוטל": 0 };
    data.forEach(r => { if (counts[r.status_label] !== undefined) counts[r.status_label]++; });
    return counts;
  }, [data]);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">מעקב AI — תזכורות לקוחות</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <RefreshCw className="w-4 h-4 ml-1" />}רענון
          </Button>
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />יצוא</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {STATUS_VALS.map(s => (
          <Card key={s} className="bg-card/50 border-border/50">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-foreground">{statusCounts[s] || 0}</div>
              <Badge className={SC[s] + " mt-1"}>{s}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="חיפוש..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pr-9 bg-background/50" />
            </div>
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
              <option value="all">כל הסטטוסים</option>
              {STATUS_VALS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {loading ? (
            <div className="text-center py-16 text-muted-foreground">
              <Loader2 className="w-12 h-12 mx-auto mb-3 opacity-50 animate-spin" />
              <p className="text-lg font-medium">טוען נתונים...</p>
            </div>
          ) : pageData.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">אין נתונים להצגה</p>
              <p className="text-sm mt-1">הוסף מעקב ללקוח בדף ניהול לקוחות</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border/50">
                  {COLS.map(c => <th key={c.key} className="text-right p-3 text-muted-foreground font-medium">{c.label}</th>)}
                  <th className="text-center p-3 text-muted-foreground font-medium w-24">פעולות</th>
                </tr></thead>
                <tbody>{pageData.map((row, idx) => (
                  <tr key={idx} className="border-b border-border/30 hover:bg-card/30">
                    {COLS.map(c => <td key={c.key} className="p-3 text-foreground">{c.key === "status_label" ? <Badge className={SC[row[c.key]] || ""}>{row[c.key]}</Badge> : row[c.key]}</td>)}
                    <td className="p-3 text-center"><div className="flex items-center justify-center gap-1">
                      <Button variant="ghost" size="sm"><Eye className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="sm"><Edit2 className="w-3.5 h-3.5" /></Button>
                    </div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          {!loading && (
            <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
              <span>מציג {filtered.length === 0 ? 0 : Math.min(filtered.length,(page-1)*perPage+1)}-{Math.min(filtered.length,page*perPage)} מתוך {filtered.length}</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page<=1} onClick={() => setPage(p=>p-1)}><ChevronRight className="w-4 h-4" /></Button>
                <span className="px-3 py-1">{page}/{totalPages}</span>
                <Button variant="outline" size="sm" disabled={page>=totalPages} onClick={() => setPage(p=>p+1)}><ChevronLeft className="w-4 h-4" /></Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
